import { MemoryMesh } from '../src/framework/memory/MemoryMesh.ts';
import { MemoryStateAdapter } from '../src/framework/core/StateAdapter.ts';

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function testPersistedSemanticMemoryReloadsByTenantAndNamespace() {
  const state = new MemoryStateAdapter();
  const namespace = `memory-test-${Date.now()}`;

  const writer = new MemoryMesh({
    namespace,
    tenantId: 'tenant-a',
    persist: true,
    stateAdapter: state
  });
  await writer.addSemanticMemory('orchestra durable memory marker alpha', ['orchestra', 'durable']);

  const reader = new MemoryMesh({
    namespace,
    tenantId: 'tenant-a',
    persist: true,
    stateAdapter: state
  });
  await wait(25);

  const results = await reader.searchSimilarMemories('durable memory marker', 3);
  if (!results.some(result => String(result.content).includes('alpha'))) {
    throw new Error(`Persisted memory was not reloaded: ${JSON.stringify(results)}`);
  }

  const otherTenant = new MemoryMesh({
    namespace,
    tenantId: 'tenant-b',
    persist: true,
    stateAdapter: state
  });
  await wait(25);
  const isolatedResults = await otherTenant.searchSimilarMemories('durable memory marker', 3);
  if (isolatedResults.length !== 0) {
    throw new Error(`Tenant-b saw tenant-a memories: ${JSON.stringify(isolatedResults)}`);
  }
}

async function testDefaultTenantSearchDoesNotLeakExplicitTenantMemories() {
  const memory = new MemoryMesh({
    namespace: `memory-default-tenant-${Date.now()}`,
    tenantId: 'tenant-a'
  });

  await memory.addSemanticMemory('tenant alpha private release plan', ['release']);
  await memory.addSemanticMemory('tenant beta private payroll plan', ['payroll'], 'tenant-b');

  const defaultTenantResults = await memory.searchSimilarMemories('private payroll plan', 5);
  if (defaultTenantResults.some(result => result.tenantId === 'tenant-b')) {
    throw new Error(`Default tenant search leaked tenant-b memory: ${JSON.stringify(defaultTenantResults)}`);
  }

  const tenantBResults = await memory.searchSimilarMemories('private payroll plan', 5, 'tenant-b');
  if (!tenantBResults.some(result => String(result.content).includes('payroll'))) {
    throw new Error(`Explicit tenant-b search did not find its own memory: ${JSON.stringify(tenantBResults)}`);
  }
}

async function testMemorySearchCacheInvalidatesAfterWrite() {
  const memory = new MemoryMesh({
    namespace: `memory-cache-${Date.now()}`,
    tenantId: 'tenant-cache'
  });

  const firstResults = await memory.searchSimilarMemories('new cache marker', 3);
  if (firstResults.length !== 0) {
    throw new Error(`Expected empty initial search, got ${JSON.stringify(firstResults)}`);
  }

  await memory.addSemanticMemory('brand new cache marker appears after first search', ['cache']);
  const secondResults = await memory.searchSimilarMemories('new cache marker', 3);
  if (!secondResults.some(result => String(result.content).includes('appears after first search'))) {
    throw new Error(`Search cache returned stale results after write: ${JSON.stringify(secondResults)}`);
  }
}

async function testRetrieveContextRespectsDefaultTenant() {
  const memory = new MemoryMesh({
    namespace: `memory-context-${Date.now()}`,
    tenantId: 'tenant-a'
  });

  await memory.addWorkingMemory('shared-thread', 'agent-a', { marker: 'tenant-a-visible' });
  await memory.addWorkingMemory('shared-thread', 'agent-b', { marker: 'tenant-b-hidden' }, 'tenant-b');

  const defaultTenantContext = memory.retrieveContext('WORKING', { threadId: 'shared-thread' });
  if (defaultTenantContext.some(entry => JSON.stringify(entry.content).includes('tenant-b-hidden'))) {
    throw new Error(`retrieveContext leaked tenant-b working memory: ${JSON.stringify(defaultTenantContext)}`);
  }

  const tenantBContext = memory.retrieveContext('WORKING', { threadId: 'shared-thread' }, 'tenant-b');
  if (!tenantBContext.some(entry => JSON.stringify(entry.content).includes('tenant-b-hidden'))) {
    throw new Error(`retrieveContext did not return tenant-b memory when requested: ${JSON.stringify(tenantBContext)}`);
  }
}

const tests = [
  ['persisted semantic memory reloads by tenant namespace', testPersistedSemanticMemoryReloadsByTenantAndNamespace],
  ['default tenant search does not leak explicit tenant memories', testDefaultTenantSearchDoesNotLeakExplicitTenantMemories],
  ['memory search cache invalidates after write', testMemorySearchCacheInvalidatesAfterWrite],
  ['retrieve context respects default tenant', testRetrieveContextRespectsDefaultTenant]
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
