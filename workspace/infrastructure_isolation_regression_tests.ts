import { EventStore } from '../src/framework/core/EventStore.ts';
import { LocalMessageBus } from '../src/framework/core/MessageBus.ts';
import { MemoryStateAdapter } from '../src/framework/core/StateAdapter.ts';
import { MemoryMesh } from '../src/framework/memory/MemoryMesh.ts';
import { QueueBroker, TaskPayload } from '../src/framework/orchestration/QueueBroker.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function task(taskId: string, agentId: string): TaskPayload {
  return {
    taskId,
    threadId: `INFRA_ISO_${taskId}`,
    agentId,
    agentConfig: {},
    payload: { taskId, agentId },
    blackboard: {},
    maxAttempts: 1
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))
  ]);
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function testQueueBrokersUseScopedStateAndMessageBus() {
  const stateA = new MemoryStateAdapter();
  const stateB = new MemoryStateAdapter();
  const brokerA = new QueueBroker({
    namespace: 'tenant-a-queue',
    stateAdapter: stateA,
    messageBus: new LocalMessageBus(),
    visibilityTimeoutMs: 100,
    defaultMaxAttempts: 1
  });
  const brokerB = new QueueBroker({
    namespace: 'tenant-b-queue',
    stateAdapter: stateB,
    messageBus: new LocalMessageBus(),
    visibilityTimeoutMs: 100,
    defaultMaxAttempts: 1
  });

  try {
    brokerA.subscribeToAllTasks(async payload => {
      await brokerA.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { handledBy: 'tenant-a-worker' },
        leaseId: payload.leaseId
      });
    }, 'tenant-a-worker');

    brokerB.subscribeToAllTasks(async payload => {
      await brokerB.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { handledBy: 'tenant-b-worker' },
        leaseId: payload.leaseId
      });
    }, 'tenant-b-worker');

    const sharedTaskId = `same-task-id-${Date.now()}`;
    const [resultA, resultB] = await Promise.all([
      withTimeout(brokerA.publish(task(sharedTaskId, 'agent-a')), 2000),
      withTimeout(brokerB.publish(task(sharedTaskId, 'agent-b')), 2000)
    ]);

    assert(resultA.result?.handledBy === 'tenant-a-worker', `Broker A got wrong result: ${JSON.stringify(resultA)}`);
    assert(resultB.result?.handledBy === 'tenant-b-worker', `Broker B got wrong result: ${JSON.stringify(resultB)}`);

    const recordA = await brokerA.getTaskRecord(sharedTaskId);
    const recordB = await brokerB.getTaskRecord(sharedTaskId);
    assert(recordA?.task.agentId === 'agent-a', `Broker A task record was polluted: ${JSON.stringify(recordA)}`);
    assert(recordB?.task.agentId === 'agent-b', `Broker B task record was polluted: ${JSON.stringify(recordB)}`);
  } finally {
    brokerA.dispose();
    brokerB.dispose();
  }
}

async function testEventStoresUseScopedStateAndMessageBus() {
  const eventStoreA = new EventStore({
    stateAdapter: new MemoryStateAdapter(),
    messageBus: new LocalMessageBus(),
    historyKey: 'tenant-a-events',
    topic: 'TENANT_A_EVENTS'
  });
  const eventStoreB = new EventStore({
    stateAdapter: new MemoryStateAdapter(),
    messageBus: new LocalMessageBus(),
    historyKey: 'tenant-b-events',
    topic: 'TENANT_B_EVENTS'
  });

  try {
    const threadId = `same-thread-${Date.now()}`;
    eventStoreA.append({
      type: 'SYSTEM_HOOK',
      sourceAgentId: 'tenant-a',
      threadId,
      payload: { marker: 'tenant-a-only' }
    });
    eventStoreB.append({
      type: 'SYSTEM_HOOK',
      sourceAgentId: 'tenant-b',
      threadId,
      payload: { marker: 'tenant-b-only' }
    });
    await wait(10);

    const eventsA = eventStoreA.getEventsByThread(threadId);
    const eventsB = eventStoreB.getEventsByThread(threadId);
    assert(eventsA.length === 1 && eventsA[0].payload.marker === 'tenant-a-only', `Event store A leaked or lost events: ${JSON.stringify(eventsA)}`);
    assert(eventsB.length === 1 && eventsB[0].payload.marker === 'tenant-b-only', `Event store B leaked or lost events: ${JSON.stringify(eventsB)}`);
  } finally {
    eventStoreA.dispose();
    eventStoreB.dispose();
  }
}

async function testMemoryMeshUsesScopedEventStore() {
  const eventStoreA = new EventStore({
    stateAdapter: new MemoryStateAdapter(),
    messageBus: new LocalMessageBus(),
    historyKey: 'tenant-a-memory-events',
    topic: 'TENANT_A_MEMORY_EVENTS'
  });
  const eventStoreB = new EventStore({
    stateAdapter: new MemoryStateAdapter(),
    messageBus: new LocalMessageBus(),
    historyKey: 'tenant-b-memory-events',
    topic: 'TENANT_B_MEMORY_EVENTS'
  });
  const memoryA = new MemoryMesh({
    tenantId: 'tenant-a',
    namespace: 'memory-a',
    eventStore: eventStoreA
  });
  const memoryB = new MemoryMesh({
    tenantId: 'tenant-b',
    namespace: 'memory-b',
    eventStore: eventStoreB
  });

  try {
    memoryA.updateCoreMemory('same-context', 'human', 'tenant-a private profile');
    memoryB.updateCoreMemory('same-context', 'human', 'tenant-b private profile');

    const eventsA = eventStoreA.getEventsByThread('same-context');
    const eventsB = eventStoreB.getEventsByThread('same-context');
    assert(eventsA.length === 1 && eventsA[0].payload.content.includes('tenant-a'), `Memory A logged to wrong event store: ${JSON.stringify(eventsA)}`);
    assert(eventsB.length === 1 && eventsB[0].payload.content.includes('tenant-b'), `Memory B logged to wrong event store: ${JSON.stringify(eventsB)}`);
  } finally {
    eventStoreA.dispose();
    eventStoreB.dispose();
  }
}

const tests = [
  ['queue brokers use scoped state and message bus', testQueueBrokersUseScopedStateAndMessageBus],
  ['event stores use scoped state and message bus', testEventStoresUseScopedStateAndMessageBus],
  ['memory mesh uses scoped event store', testMemoryMeshUsesScopedEventStore]
] as const;

const results = [];
for (const [name, run] of tests) {
  const start = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - start });
  } catch (err: any) {
    results.push({ name, ok: false, error: err.message, ms: Date.now() - start });
  }
}

console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.ok)) process.exit(1);
