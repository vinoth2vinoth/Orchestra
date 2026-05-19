import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BaseAgent,
  MemoryMesh,
  MemoryStateAdapter,
  Orchestrator,
  PluginRegistry,
  type AgenticPlugin,
  type LLMConfig,
  type StateAdapter,
  type WorkflowConfig
} from '../src/framework/index.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const llmConfig: LLMConfig = {
  apiKey: 'SIMULATION_ONLY',
  modelName: 'sdk-contract-deterministic'
};

class EchoAgent extends BaseAgent {
  constructor(id: string, role: 'MANAGER' | 'WORKER' = 'WORKER') {
    super(id, `SDK contract ${role.toLowerCase()} agent`, role, new MemoryMesh({ tenantId: 'sdk-contract', namespace: id }), llmConfig, [], undefined, undefined, undefined, id);
  }

  public async execute(task: any): Promise<any> {
    return { agentId: this.card.id, task };
  }
}

async function testPublicWorkflowConstruction() {
  const manager = new EchoAgent('sdk-contract-manager', 'MANAGER');
  const config: WorkflowConfig = {
    paradigm: 'HIERARCHICAL',
    agents: [manager],
    enableLearning: false,
    enableReflection: false,
    runtime: {
      tenantId: 'sdk-contract-public-workflow',
      pluginRegistry: new PluginRegistry()
    }
  };

  const result = await new Orchestrator().executeWorkflow({ objective: 'verify public SDK workflow' }, config, `SDK_WORKFLOW_${Date.now()}`);
  assert(result.agentId === 'sdk-contract-manager', 'Expected manager result from public SDK workflow');
  assert(result.task.objective === 'verify public SDK workflow', 'Expected original task to reach manager');
}

async function testStateAdapterContract() {
  const adapter: StateAdapter = new MemoryStateAdapter();
  await adapter.set('sdk:value', { ok: true });
  assert((await adapter.get<{ ok: boolean }>('sdk:value'))?.ok === true, 'Expected set/get to round-trip');

  await Promise.all(Array.from({ length: 100 }, () => adapter.increment('sdk:counter')));
  assert(await adapter.get<number>('sdk:counter') === 100, 'Expected atomic increment to preserve all updates');

  assert(await adapter.compareAndSwap('sdk:value', { ok: true }, { ok: false }), 'Expected matching compare-and-swap to succeed');
  assert(!(await adapter.compareAndSwap('sdk:value', { ok: true }, { ok: 'stale' })), 'Expected stale compare-and-swap to fail');

  assert(await adapter.pushToList('sdk:list', 'a') === 1, 'Expected first list push length');
  await adapter.pushToList('sdk:list', 'b');
  assert((await adapter.getRange('sdk:list', 0, -1)).join(',') === 'a,b', 'Expected list range to preserve order');

  assert(await adapter.acquireLock('sdk:lock', 1000), 'Expected first lock acquisition');
  assert(!(await adapter.acquireLock('sdk:lock', 1000)), 'Expected second lock acquisition to fail');
  await adapter.releaseLock('sdk:lock');
  assert(await adapter.acquireLock('sdk:lock', 1000), 'Expected released lock to be acquirable');
}

async function testMemoryMeshContract() {
  const adapter = new MemoryStateAdapter();
  const memory = new MemoryMesh({
    tenantId: 'sdk-contract-tenant',
    namespace: 'memory-contract',
    stateAdapter: adapter
  });

  await memory.addSemanticMemory('Orchestra coordinates graph workflows with governed release gates.', ['orchestra', 'graph'], 'sdk-contract-tenant');
  const results = await memory.searchSimilarMemories('graph release governance', 3, 'sdk-contract-tenant');
  assert(results.some(result => String(result.content).includes('release gates')), 'Expected semantic memory search to return inserted fact');
}

async function testRuntimePluginContract() {
  const plugin: AgenticPlugin = {
    name: 'SDKContractPlugin',
    version: '1.0.0',
    async beforeAgentExecute(_agentId, task) {
      return { ...task, pluginTouched: true };
    },
    async afterAgentExecute(_agentId, _task, result) {
      return { ...result, pluginConfirmed: true };
    }
  };

  const pluginRegistry = new PluginRegistry();
  pluginRegistry.register(plugin);

  const manager = new EchoAgent('sdk-plugin-manager', 'MANAGER');
  const result = await new Orchestrator({ tenantId: 'sdk-plugin-runtime', pluginRegistry }).executeWorkflow(
    { objective: 'verify runtime plugin injection' },
    {
      paradigm: 'HIERARCHICAL',
      agents: [manager],
      enableLearning: false,
      enableReflection: false
    },
    `SDK_PLUGIN_${Date.now()}`
  );

  assert(result.task.pluginTouched === true, 'Expected beforeAgentExecute plugin to modify task');
  assert(result.pluginConfirmed === true, 'Expected afterAgentExecute plugin to modify result');
}

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function testExamplesUsePublicSdkOnly() {
  const examplesDir = path.resolve('examples');
  const files = await listTypeScriptFiles(examplesDir);
  const offenders: string[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const importMatches = content.matchAll(/from\s+['"]([^'"]*src\/framework[^'"]*)['"]/g);
    for (const match of importMatches) {
      if (!match[1].endsWith('/index.ts')) {
        offenders.push(`${path.relative(process.cwd(), file)} -> ${match[1]}`);
      }
    }
  }

  assert(offenders.length === 0, `Examples must import through src/framework/index.ts only:\n${offenders.join('\n')}`);
}

const tests = [
  ['public workflow construction', testPublicWorkflowConstruction],
  ['state adapter public contract', testStateAdapterContract],
  ['memory mesh public contract', testMemoryMeshContract],
  ['runtime plugin public contract', testRuntimePluginContract],
  ['examples use public SDK only', testExamplesUsePublicSdkOnly]
] as const;

const results = [];
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
