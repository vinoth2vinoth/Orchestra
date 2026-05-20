import { BaseAgent } from '../src/framework/agents/BaseAgent.ts';
import { Orchestrator, WorkflowConfig } from '../src/framework/orchestration/Orchestrator.ts';
import { MemoryMesh } from '../src/framework/memory/MemoryMesh.ts';
import { PluginRegistry } from '../src/framework/core/PluginRegistry.ts';
import { getExecutionContext } from '../src/framework/core/ExecutionContext.ts';
import { StateStore, globalStateStore } from '../src/framework/orchestration/StateStore.ts';
import { WorkflowSuspendedError } from '../src/framework/orchestration/WorkflowSuspendedError.ts';
import type { CheckpointData } from '../src/framework/orchestration/Checkpointer.ts';

class EchoManagerAgent extends BaseAgent {
  async execute(task: any, threadId: string): Promise<any> {
    const ctx = getExecutionContext();
    return {
      task,
      threadId,
      tenantId: ctx.tenantId,
      agentId: ctx.agentId
    };
  }
}

class BlackboardEchoAgent extends BaseAgent {
  async execute(task: any): Promise<any> {
    return {
      marker: task.blackboard?.marker,
      originalTaskMutated: Object.prototype.hasOwnProperty.call(task, 'blackboard')
    };
  }
}

class RecordingGraphAgent extends BaseAgent {
  public calls: any[] = [];

  constructor(id: string, private readonly answer: string) {
    super(
      id,
      `Records graph calls for ${id}.`,
      'WORKER',
      new MemoryMesh(),
      { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' },
      [],
      undefined,
      undefined,
      undefined,
      id
    );
  }

  async execute(task: any): Promise<any> {
    this.calls.push(task);
    return this.answer;
  }
}

class SuspendingAgent extends BaseAgent {
  constructor(id: string, private readonly approvalId: string) {
    super(
      id,
      `Suspends workflow for ${id}.`,
      'MANAGER',
      new MemoryMesh(),
      { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' },
      [],
      undefined,
      undefined,
      undefined,
      id
    );
  }

  async execute(): Promise<any> {
    throw new WorkflowSuspendedError(this.approvalId, { reason: 'runtime-state-store-test' });
  }
}

class InMemoryCheckpointer {
  private checkpoints = new Map<string, CheckpointData>();

  async saveCheckpoint(threadId: string, stepId: string, state: any): Promise<void> {
    this.checkpoints.set(threadId, {
      threadId,
      stepId,
      state: JSON.parse(JSON.stringify(state)),
      timestamp: Date.now()
    });
  }

  async getLatestCheckpoint(threadId: string): Promise<CheckpointData | null> {
    return this.checkpoints.get(threadId) || null;
  }

  async clearCheckpoint(threadId: string): Promise<void> {
    this.checkpoints.delete(threadId);
  }
}

async function testRuntimePluginAndTenantScope() {
  const pluginRegistry = new PluginRegistry();
  pluginRegistry.register({
    name: 'RuntimeScopeTestPlugin',
    version: '1.0.0',
    async beforeAgentExecute(agentId, task) {
      return `${task} :: scoped-plugin`;
    }
  });

  const manager = new EchoManagerAgent(
    'ScopedManager',
    'Echoes task and runtime context.',
    'MANAGER',
    new MemoryMesh(),
    { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' },
    [],
    undefined,
    undefined,
    undefined,
    'scoped-manager'
  );

  const config: WorkflowConfig = {
    paradigm: 'HIERARCHICAL',
    agents: [manager],
    maxRetries: 0
  };

  const result = await new Orchestrator({
    tenantId: 'tenant-runtime-test',
    pluginRegistry
  }).executeWorkflow('original-task', config, `RUNTIME_CTX_${Date.now()}`);

  if (typeof result.task !== 'string' || !result.task.includes('original-task') || !result.task.endsWith(':: scoped-plugin')) {
    throw new Error(`Runtime plugin did not modify task: ${JSON.stringify(result)}`);
  }
  if (result.tenantId !== 'tenant-runtime-test') {
    throw new Error(`Execution context tenant was not scoped: ${JSON.stringify(result)}`);
  }
}

async function testRuntimeCheckpointerScope() {
  const threadId = `RUNTIME_CHECKPOINT_SHARED_${Date.now()}`;
  const scopedCheckpointerA = new InMemoryCheckpointer();
  const scopedCheckpointerB = new InMemoryCheckpointer();

  await scopedCheckpointerA.saveCheckpoint(threadId, 'graph_step_graph-a', {
    currentState: 'A_DONE_FROM_SCOPED_CHECKPOINT',
    executed: ['graph-a'],
    results: { 'graph-a': 'A_DONE_FROM_SCOPED_CHECKPOINT' },
    blackboard: { fromCheckpoint: true }
  });

  const agentAForRuntimeA = new RecordingGraphAgent('graph-a', 'A_SHOULD_NOT_RUN');
  const agentBForRuntimeA = new RecordingGraphAgent('graph-b', 'B_DONE_RUNTIME_A');
  const resultA = await new Orchestrator({ checkpointer: scopedCheckpointerA as any }).executeWorkflow(
    'start',
    {
      paradigm: 'GRAPH',
      agents: [agentAForRuntimeA, agentBForRuntimeA],
      edges: [{ from: 'graph-a', to: 'graph-b' }],
      maxRetries: 0,
      blackboard: {}
    } as WorkflowConfig,
    threadId
  );

  if (agentAForRuntimeA.calls.length !== 0) {
    throw new Error(`Runtime A should have resumed from scoped checkpoint without rerunning graph-a, got ${agentAForRuntimeA.calls.length}`);
  }
  if (resultA.results?.['graph-a'] !== 'A_DONE_FROM_SCOPED_CHECKPOINT') {
    throw new Error(`Runtime A did not use scoped checkpoint: ${JSON.stringify(resultA)}`);
  }

  const agentAForRuntimeB = new RecordingGraphAgent('graph-a', 'A_DONE_RUNTIME_B');
  const agentBForRuntimeB = new RecordingGraphAgent('graph-b', 'B_DONE_RUNTIME_B');
  const resultB = await new Orchestrator({ checkpointer: scopedCheckpointerB as any }).executeWorkflow(
    'start',
    {
      paradigm: 'GRAPH',
      agents: [agentAForRuntimeB, agentBForRuntimeB],
      edges: [{ from: 'graph-a', to: 'graph-b' }],
      maxRetries: 0,
      blackboard: {}
    } as WorkflowConfig,
    threadId
  );

  if (agentAForRuntimeB.calls.length !== 1) {
    throw new Error(`Runtime B should not see Runtime A checkpoint, got ${agentAForRuntimeB.calls.length} graph-a calls`);
  }
  if (resultB.results?.['graph-a'] !== 'A_DONE_RUNTIME_B') {
    throw new Error(`Runtime B used the wrong checkpoint state: ${JSON.stringify(resultB)}`);
  }
}

async function testRuntimeStateStoreScopeForSuspendedWorkflow() {
  const approvalId = `approval-runtime-${Date.now()}`;
  const scopedStore = new StateStore();
  await globalStateStore.deleteState(approvalId);

  const result = await new Orchestrator({ stateStore: scopedStore as any }).executeWorkflow(
    'needs approval',
    {
      paradigm: 'HIERARCHICAL',
      agents: [new SuspendingAgent('scoped-suspender', approvalId)],
      maxRetries: 0
    },
    `RUNTIME_STATE_STORE_${Date.now()}`
  );

  if (result.status !== 'SUSPENDED' || result.approvalId !== approvalId) {
    throw new Error(`Expected suspended workflow, got ${JSON.stringify(result)}`);
  }

  const scopedState = await scopedStore.getState(approvalId);
  if (!scopedState) {
    throw new Error('Scoped runtime state store did not receive suspended workflow state');
  }

  const globalState = await globalStateStore.getState(approvalId);
  if (globalState) {
    throw new Error(`Suspended workflow leaked into global state store: ${JSON.stringify(globalState)}`);
  }
}

async function testConcurrentWorkflowsDoNotMutateSharedTaskObject() {
  const pluginRegistry = new PluginRegistry();
  pluginRegistry.register({
    name: 'ConcurrentTaskDelayPlugin',
    version: '1.0.0',
    async beforeAgentExecute(_agentId, task) {
      if (task?.requestId === 'shared-task') {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
  });

  const sharedTask = { requestId: 'shared-task' };
  const agentA = new BlackboardEchoAgent(
    'TenantAManager',
    'Echoes tenant A blackboard.',
    'MANAGER',
    new MemoryMesh(),
    { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' },
    [],
    undefined,
    undefined,
    undefined,
    'tenant-a-manager'
  );
  const agentB = new BlackboardEchoAgent(
    'TenantBManager',
    'Echoes tenant B blackboard.',
    'MANAGER',
    new MemoryMesh(),
    { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' },
    [],
    undefined,
    undefined,
    undefined,
    'tenant-b-manager'
  );

  const configA: WorkflowConfig = {
    paradigm: 'HIERARCHICAL',
    agents: [agentA],
    maxRetries: 0,
    blackboard: { marker: 'tenant-a-only' },
    runtime: { pluginRegistry, tenantId: 'tenant-a' }
  };
  const configB: WorkflowConfig = {
    paradigm: 'HIERARCHICAL',
    agents: [agentB],
    maxRetries: 0,
    blackboard: { marker: 'tenant-b-only' },
    runtime: { pluginRegistry, tenantId: 'tenant-b' }
  };

  const [resultA, resultB] = await Promise.all([
    new Orchestrator().executeWorkflow(sharedTask, configA, `RUNTIME_ISO_A_${Date.now()}`),
    new Orchestrator().executeWorkflow(sharedTask, configB, `RUNTIME_ISO_B_${Date.now()}`)
  ]);

  if (resultA.marker !== 'tenant-a-only') {
    throw new Error(`Tenant A saw the wrong blackboard: ${JSON.stringify(resultA)}`);
  }
  if (resultB.marker !== 'tenant-b-only') {
    throw new Error(`Tenant B saw the wrong blackboard: ${JSON.stringify(resultB)}`);
  }
  if (Object.prototype.hasOwnProperty.call(sharedTask, 'blackboard')) {
    throw new Error(`Shared task object was mutated: ${JSON.stringify(sharedTask)}`);
  }
}

const tests = [
  ['runtime plugin and tenant scope', testRuntimePluginAndTenantScope],
  ['runtime checkpointer scope', testRuntimeCheckpointerScope],
  ['runtime state store scope for suspended workflow', testRuntimeStateStoreScopeForSuspendedWorkflow],
  ['concurrent workflows do not mutate shared task object', testConcurrentWorkflowsDoNotMutateSharedTaskObject]
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
if (results.some(r => !r.ok)) process.exit(1);
