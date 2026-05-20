import {
  QueueBroker,
  type QueueTaskRecord,
  type TaskPayload,
  type TaskResult
} from '../src/framework/index.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => Promise<T> | T, predicate: (value: T) => boolean, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  let lastValue: T;

  while (Date.now() - start < timeoutMs) {
    lastValue = await read();
    if (predicate(lastValue)) return lastValue;
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))
  ]);
}

function createTask(taskId: string): TaskPayload {
  return {
    taskId,
    threadId: `DURABILITY_${taskId}`,
    agentId: 'durable-agent',
    agentConfig: {},
    payload: { taskId },
    blackboard: {},
    maxAttempts: 3
  };
}

async function testDuplicatePublishIsIdempotentWhileInFlight() {
  const broker = new QueueBroker({ visibilityTimeoutMs: 5000, defaultMaxAttempts: 3 });
  try {
    await broker.resetForTests();

    let executions = 0;
    broker.subscribeToAllTasks(async payload => {
      executions++;
      await new Promise(resolve => setTimeout(resolve, 75));
      await broker.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { executions, payload: payload.payload },
        leaseId: payload.leaseId
      });
    }, 'idempotent-worker');

    const task = createTask(`idempotent-${Date.now()}`);
    const first = broker.publish(task);
    await waitFor(() => broker.getTaskRecord(task.taskId), record => record !== null);
    const duplicate = broker.publish(task);

    const [firstResult, duplicateResult] = await withTimeout(Promise.all([first, duplicate]), 3000);
    assert(firstResult.status === 'success', `Expected first publish success, got ${JSON.stringify(firstResult)}`);
    assert(duplicateResult.status === 'success', `Expected duplicate publish success, got ${JSON.stringify(duplicateResult)}`);
    assert(firstResult.result?.executions === 1, `Expected first result from one execution, got ${JSON.stringify(firstResult)}`);
    assert(duplicateResult.result?.executions === 1, `Expected duplicate result from same execution, got ${JSON.stringify(duplicateResult)}`);
    assert(executions === 1, `Expected duplicate publish not to re-execute task, got ${executions} executions`);

    const replay = await broker.publish(task);
    assert(replay.status === 'success' && replay.result?.executions === 1, `Expected completed task replay to return stored result, got ${JSON.stringify(replay)}`);

    const record = await broker.getTaskRecord(task.taskId);
    assert(record?.attempts === 1, `Expected one leased attempt, got ${record?.attempts}`);
  } finally {
    broker.dispose();
  }
}

async function testFreshBrokerRecoversExpiredLeaseAfterRestart() {
  const brokerBeforeRestart = new QueueBroker({ visibilityTimeoutMs: 100, defaultMaxAttempts: 3 });
  let brokerAfterRestart: QueueBroker | undefined;
  try {
    await brokerBeforeRestart.resetForTests();

    let preRestartExecutions = 0;
    brokerBeforeRestart.subscribeToAllTasks(async () => {
      preRestartExecutions++;
      // Simulate process loss after lease. No ACK/NACK/result is published.
    }, 'pre-restart-worker');

    const task = createTask(`restart-${Date.now()}`);
    void brokerBeforeRestart.publish(task);

    const leased = await waitFor(
      () => brokerBeforeRestart.getTaskRecord(task.taskId),
      (record): record is QueueTaskRecord => record?.status === 'LEASED',
      2000
    );
    assert(leased.attempts === 1, `Expected first broker to lease once, got ${leased.attempts}`);

    brokerBeforeRestart.dispose();
    await new Promise(resolve => setTimeout(resolve, 150));

    brokerAfterRestart = new QueueBroker({ visibilityTimeoutMs: 100, defaultMaxAttempts: 3 });
    let postRestartExecutions = 0;
    brokerAfterRestart.subscribeToAllTasks(async payload => {
      postRestartExecutions++;
      await brokerAfterRestart!.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { recoveredByFreshBroker: true, postRestartExecutions },
        leaseId: payload.leaseId
      });
    }, 'post-restart-worker');

    const recoveredResult = await withTimeout(brokerAfterRestart.publish(task), 4000);
    assert(recoveredResult.status === 'success', `Expected fresh broker recovery success, got ${JSON.stringify(recoveredResult)}`);
    assert(recoveredResult.result?.recoveredByFreshBroker === true, `Expected recovery marker, got ${JSON.stringify(recoveredResult)}`);
    assert(preRestartExecutions === 1, `Expected one pre-restart execution, got ${preRestartExecutions}`);
    assert(postRestartExecutions === 1, `Expected one post-restart execution, got ${postRestartExecutions}`);

    const finalRecord = await brokerAfterRestart.getTaskRecord(task.taskId);
    assert(finalRecord?.status === 'SUCCEEDED', `Expected final record succeeded, got ${finalRecord?.status}`);
    assert(finalRecord?.attempts === 2, `Expected second attempt after restart recovery, got ${finalRecord?.attempts}`);
  } finally {
    brokerBeforeRestart.dispose();
    brokerAfterRestart?.dispose();
  }
}

async function testStaleLeaseResultCannotWinCurrentLease() {
  const broker = new QueueBroker({ visibilityTimeoutMs: 250, defaultMaxAttempts: 3 });
  try {
    await broker.resetForTests();

    let attempts = 0;
    broker.subscribeToAllTasks(async payload => {
      attempts++;
      if (attempts === 1) {
        const staleLeaseId = payload.leaseId;
        void (async () => {
          await waitFor(
            () => broker.getTaskRecord(payload.taskId),
            record => Boolean(record && record.attempts >= 2 && record.leaseId !== staleLeaseId),
            3000
          );
          await broker.publishResult({
            taskId: payload.taskId,
            status: 'success',
            result: { staleLeaseWon: true },
            leaseId: staleLeaseId
          });
        })().catch(err => {
          console.error(`Failed to publish stale lease result in durability test: ${err.message}`);
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
      await broker.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { currentLeaseWon: true, attempts },
        leaseId: payload.leaseId
      });
    }, 'stale-lease-worker');

    const result = await withTimeout(broker.publish(createTask(`stale-${Date.now()}`)), 4000);
    assert(result.status === 'success', `Expected eventual success, got ${JSON.stringify(result)}`);
    assert(result.result?.currentLeaseWon === true, `Expected current lease result to win, got ${JSON.stringify(result)}`);
    assert(result.result?.staleLeaseWon !== true, `Stale lease result should not win, got ${JSON.stringify(result)}`);
  } finally {
    broker.dispose();
  }
}

const tests = [
  ['duplicate publish is idempotent while in flight', testDuplicatePublishIsIdempotentWhileInFlight],
  ['fresh broker recovers expired lease after restart', testFreshBrokerRecoversExpiredLeaseAfterRestart],
  ['stale lease result cannot win current lease', testStaleLeaseResultCannotWinCurrentLease]
] as const;

const results: Array<{ name: string; ok: boolean; ms: number; error?: string; stack?: string }> = [];
for (const [name, run] of tests) {
  const start = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - start });
  } catch (err: any) {
    results.push({ name, ok: false, error: err.message, stack: err.stack, ms: Date.now() - start });
  }
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some(result => !result.ok) ? 1 : 0);
