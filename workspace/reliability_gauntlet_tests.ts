import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from '../src/framework/agents/BaseAgent.ts';
import { EventStore, globalEventStore } from '../src/framework/core/EventStore.ts';
import { MemoryMesh } from '../src/framework/memory/MemoryMesh.ts';
import { QueueBroker, TaskPayload } from '../src/framework/orchestration/QueueBroker.ts';
import { globalCheckpointer } from '../src/framework/orchestration/Checkpointer.ts';
import { Orchestrator, WorkflowConfig } from '../src/framework/orchestration/Orchestrator.ts';
import type { LLMConfig } from '../src/framework/llm/ProviderRegistry.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function checkpointPath(threadId: string) {
  return path.join(process.cwd(), 'orchestra_workspace', '.orchestra', 'checkpoints', `${threadId}.enc`);
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
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

function task(id: string, maxAttempts = 3): TaskPayload {
  return {
    taskId: id,
    threadId: `RELIABILITY_QUEUE_${id}`,
    agentId: 'agent',
    agentConfig: {},
    payload: { id },
    blackboard: {},
    maxAttempts
  };
}

class RecordingAgent extends BaseAgent {
  public calls: any[] = [];

  constructor(id: string, name: string, private readonly answer: string) {
    const memory = new MemoryMesh({ tenantId: 'reliability-gauntlet', namespace: id });
    const llmConfig: LLMConfig = { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' };
    super(name, `Reliability test agent ${name}.`, 'WORKER', memory, llmConfig, [], undefined, undefined, undefined, id);
  }

  public async execute(task: any): Promise<any> {
    this.calls.push(task);
    return this.answer;
  }
}

async function testCheckpointRoundTripAndClear() {
  const threadId = `gauntlet-checkpoint-${Date.now()}`;
  await globalCheckpointer.clearCheckpoint(threadId);

  await globalCheckpointer.saveCheckpoint(threadId, 'step-a', {
    nested: { value: 42 },
    items: ['alpha', 'beta']
  });

  const filePath = checkpointPath(threadId);
  assert(fs.existsSync(filePath), `Expected checkpoint file at ${filePath}`);

  const raw = fs.readFileSync(filePath, 'utf8');
  assert(!raw.includes('alpha') && !raw.includes('nested'), 'Checkpoint file should not contain plaintext state');

  const checkpoint = await globalCheckpointer.getLatestCheckpoint(threadId);
  assert(checkpoint?.threadId === threadId, 'Checkpoint threadId did not round-trip');
  assert(checkpoint?.stepId === 'step-a', 'Checkpoint stepId did not round-trip');
  assert(checkpoint?.state?.nested?.value === 42, 'Checkpoint state did not round-trip');

  await globalCheckpointer.clearCheckpoint(threadId);
  const cleared = await globalCheckpointer.getLatestCheckpoint(threadId);
  assert(cleared === null, 'Checkpoint should be absent after clear');
}

async function testCheckpointTamperSelfHeals() {
  const threadId = `gauntlet-tamper-${Date.now()}`;
  await globalCheckpointer.clearCheckpoint(threadId);
  await globalCheckpointer.saveCheckpoint(threadId, 'step-a', { safe: true });

  fs.writeFileSync(checkpointPath(threadId), 'tampered-checkpoint');
  const checkpoint = await globalCheckpointer.getLatestCheckpoint(threadId);
  assert(checkpoint?.state?.safe === true, 'Tampered checkpoint should restore the last valid snapshot');
  assert(fs.readFileSync(checkpointPath(threadId), 'utf8') !== 'tampered-checkpoint', 'Tampered checkpoint bytes should be replaced during self-heal');

  await globalCheckpointer.clearCheckpoint(threadId);
}

async function testEventStoreReloadsPersistedHistory() {
  const threadId = `GAUNTLET_EVENT_${Date.now()}`;
  const marker = `marker-${crypto.randomUUID()}`;

  globalEventStore.append({
    type: 'SYSTEM_HOOK',
    sourceAgentId: 'GAUNTLET',
    threadId,
    payload: { marker }
  });

  const freshStore = new EventStore();
  await waitFor(() => freshStore.getEventsByThread(threadId).some(event => event.payload?.marker === marker), 1500);

  const events = freshStore.getEventsByThread(threadId).filter(event => event.payload?.marker === marker);
  assert(events.length === 1, `Expected one reloaded event for marker ${marker}, got ${events.length}`);
}

async function testQueueLeaseRecoveryAfterWorkerCrash() {
  const broker = new QueueBroker({ visibilityTimeoutMs: 100, defaultMaxAttempts: 3 });
  try {
    await broker.resetForTests();

    let attempts = 0;
    broker.subscribeToAllTasks(async (payload) => {
      attempts++;
      if (attempts === 1) {
        return; // Simulate a worker crash after lease and before ACK/NACK.
      }
      await broker.publishResult({
        taskId: payload.taskId,
        status: 'success',
        result: { recovered: true, attempts },
        leaseId: payload.leaseId
      });
    }, 'gauntlet-lease-worker');

    const result = await withTimeout(broker.publish(task(`lease-${Date.now()}`)), 3000);
    assert(result.status === 'success', `Expected recovered task success, got ${JSON.stringify(result)}`);
    assert(result.result?.recovered === true && result.result?.attempts === 2, `Expected second-attempt lease recovery, got ${JSON.stringify(result)}`);
  } finally {
    broker.dispose();
  }
}

async function testGraphResumeSkipsCompletedAgents() {
  const threadId = `GAUNTLET_GRAPH_${Date.now()}`;
  const agentA = new RecordingAgent('gauntlet-a', 'A', 'A_DONE');
  const agentB = new RecordingAgent('gauntlet-b', 'B', 'B_DONE');

  await globalCheckpointer.clearCheckpoint(threadId);
  await globalCheckpointer.saveCheckpoint(threadId, 'graph_step_gauntlet-a', {
    currentState: 'A_DONE',
    executed: ['gauntlet-a'],
    results: { 'gauntlet-a': 'A_DONE' },
    blackboard: { resumed: true }
  });

  const config: WorkflowConfig = {
    paradigm: 'GRAPH',
    agents: [agentA, agentB],
    edges: [{ from: 'gauntlet-a', to: 'gauntlet-b' }],
    maxRetries: 0,
    enableLearning: false,
    blackboard: {}
  };

  const result = await new Orchestrator().executeWorkflow('start', config, threadId);

  assert(agentA.calls.length === 0, `Completed agent should not rerun during resume, got ${agentA.calls.length} calls`);
  assert(agentB.calls.length === 1, `Downstream agent should run once during resume, got ${agentB.calls.length} calls`);
  assert(JSON.stringify(agentB.calls[0]).includes('A_DONE'), 'Downstream task should receive upstream checkpoint result');
  assert(result?.graphCompleted === true && result.results?.['gauntlet-a'] === 'A_DONE' && result.results?.['gauntlet-b'] === 'B_DONE', `Unexpected graph resume result: ${JSON.stringify(result)}`);

  const cleared = await globalCheckpointer.getLatestCheckpoint(threadId);
  assert(cleared === null, 'Successful workflow should clear checkpoint after resume');
}

const tests = [
  ['checkpoint round-trip and clear', testCheckpointRoundTripAndClear],
  ['checkpoint tamper self-heals', testCheckpointTamperSelfHeals],
  ['event store reloads persisted history', testEventStoreReloadsPersistedHistory],
  ['queue lease recovery after worker crash', testQueueLeaseRecoveryAfterWorkerCrash],
  ['graph resume skips completed agents', testGraphResumeSkipsCompletedAgents]
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
process.exit(results.some(result => !result.ok) ? 1 : 0);
