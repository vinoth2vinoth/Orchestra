import { BaseAgent } from '../src/framework/agents/BaseAgent.ts';
import { Orchestrator, WorkflowConfig } from '../src/framework/orchestration/Orchestrator.ts';
import { MemoryMesh } from '../src/framework/memory/MemoryMesh.ts';
import { PluginRegistry } from '../src/framework/core/PluginRegistry.ts';
import { getExecutionContext } from '../src/framework/core/ExecutionContext.ts';

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
