import '../src/framework/tools/ExternalTools.ts';
import { globalToolRegistry } from '../src/framework/tools/ToolRegistry.ts';
import { globalIAMInterceptor } from '../src/framework/security/IAMInterceptor.ts';
import { IAMInterceptor } from '../src/framework/security/IAMInterceptor.ts';
import { runWithContext } from '../src/framework/core/ExecutionContext.ts';
import { createRuntimeContext } from '../src/framework/core/RuntimeContext.ts';
import { ToolProviderRegistry } from '../src/framework/tools/ToolProviders.ts';

globalIAMInterceptor.registerPolicy({
  tenantId: 'GLOBAL',
  allowedTools: ['fetchUrl', 'httpRequest', 'executeCodeSandbox', 'webSearch', 'databaseQuery', 'ragSearch'],
  requiredSecrets: {}
});

async function testMockModeIsExplicit() {
  process.env.ORCHESTRA_TOOL_FETCHURL_MODE = 'mock';
  const result = await globalToolRegistry.getAllTools().fetchUrl.execute({ url: 'https://example.com' });
  if (!String(result).startsWith('[MOCK Content')) {
    throw new Error(`Expected explicit mock fetch result, got ${result}`);
  }
}

async function testDisabledModeBlocksTool() {
  process.env.ORCHESTRA_TOOL_HTTPREQUEST_MODE = 'disabled';
  try {
    await globalToolRegistry.getAllTools().httpRequest.execute({ method: 'GET', url: 'https://example.com' });
  } catch (err: any) {
    if (!err.message.includes('disabled')) throw err;
    return;
  } finally {
    delete process.env.ORCHESTRA_TOOL_HTTPREQUEST_MODE;
  }
  throw new Error('Expected disabled httpRequest tool to throw.');
}

async function testLiveModeStillBlocksLocalUrls() {
  process.env.ORCHESTRA_TOOL_HTTPREQUEST_MODE = 'live';
  try {
    await globalToolRegistry.getAllTools().httpRequest.execute({ method: 'GET', url: 'http://127.0.0.1:3000' });
  } catch (err: any) {
    if (!err.message.includes('internal/locally-hosted')) throw err;
    return;
  } finally {
    delete process.env.ORCHESTRA_TOOL_HTTPREQUEST_MODE;
  }
  throw new Error('Expected live httpRequest to block local URL.');
}

async function testCodeSandboxDisabledByDefault() {
  delete process.env.ORCHESTRA_ENABLE_CODE_SANDBOX;
  try {
    await globalToolRegistry.getAllTools().executeCodeSandbox.execute({ language: 'javascript', code: '1 + 1' });
  } catch (err: any) {
    if (!err.message.includes('disabled by default')) throw err;
    return;
  }
  throw new Error('Expected executeCodeSandbox to be disabled by default.');
}

async function testLiveModeRequiresProvider() {
  process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE = 'live';
  try {
    await globalToolRegistry.getAllTools().webSearch.execute({ query: 'orchestra', numResults: 1 });
  } catch (err: any) {
    if (!err.message.includes('registered WebSearchProvider')) throw err;
    return;
  } finally {
    delete process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE;
  }
  throw new Error('Expected live webSearch to require a provider.');
}

async function testCustomToolProvidersWorkInLiveMode() {
  const tenantId = `tool-provider-${Date.now()}`;
  const iam = new IAMInterceptor();
  iam.registerPolicy({
    tenantId,
    allowedTools: ['webSearch', 'databaseQuery', 'ragSearch'],
    requiredSecrets: {}
  });

  const providers = new ToolProviderRegistry();
  providers.registerWebSearchProvider({
    async search(query, options, context) {
      return [{ title: `${context.tenantId}:${query}`, url: 'https://example.com/search', snippet: `limit=${options.numResults}` }];
    }
  });
  providers.registerDatabaseQueryProvider({
    async query(query, context) {
      return { tenantId: context.tenantId, rows: [{ query }] };
    }
  });
  providers.registerRagSearchProvider({
    async search(contextQuery, options, context) {
      return [{ content: `${context.threadId}:${contextQuery}`, source: options.namespace, score: 0.91 }];
    }
  });

  const runtime = createRuntimeContext({ tenantId, iamInterceptor: iam, toolProviders: providers });
  process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE = 'live';
  process.env.ORCHESTRA_TOOL_DATABASEQUERY_MODE = 'live';
  process.env.ORCHESTRA_TOOL_RAGSEARCH_MODE = 'live';
  try {
    const result = await runWithContext({
      tenantId,
      agentId: 'tool-provider-agent',
      threadId: 'tool-provider-thread',
      capabilities: ['ALL'],
      runtime
    }, async () => {
      const tools = globalToolRegistry.getAllTools();
      const web = await tools.webSearch.execute({ query: 'portable tools', numResults: 1 });
      const db = await tools.databaseQuery.execute({ query: 'select * from safe_table' });
      const rag = await tools.ragSearch.execute({ contextQuery: 'framework guarantees', namespace: 'docs' });
      return { web, db, rag };
    });

    if (!String(result.web).includes(`${tenantId}:portable tools`)) throw new Error(`Unexpected web provider result: ${result.web}`);
    if (!String(result.db).includes(`"tenantId":"${tenantId}"`)) throw new Error(`Unexpected database provider result: ${result.db}`);
    if (!String(result.rag).includes('tool-provider-thread:framework guarantees')) throw new Error(`Unexpected RAG provider result: ${result.rag}`);
  } finally {
    delete process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE;
    delete process.env.ORCHESTRA_TOOL_DATABASEQUERY_MODE;
    delete process.env.ORCHESTRA_TOOL_RAGSEARCH_MODE;
  }
}

async function testToolProvidersAreRuntimeScoped() {
  const tools = globalToolRegistry.getAllTools();
  const createScopedRuntime = (tenantId: string, title: string) => {
    const iam = new IAMInterceptor();
    iam.registerPolicy({ tenantId, allowedTools: ['webSearch'], requiredSecrets: {} });
    const providers = new ToolProviderRegistry({
      webSearch: {
        async search(query) {
          return [{ title: `${title}:${query}`, url: `https://example.com/${title}`, snippet: tenantId }];
        }
      }
    });
    return createRuntimeContext({ tenantId, iamInterceptor: iam, toolProviders: providers });
  };

  const runtimeA = createScopedRuntime('tenant-tool-a', 'A');
  const runtimeB = createScopedRuntime('tenant-tool-b', 'B');
  process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE = 'live';
  try {
    const [resultA, resultB] = await Promise.all([
      runWithContext({ tenantId: 'tenant-tool-a', agentId: 'agent-a', threadId: 'thread-a', capabilities: ['ALL'], runtime: runtimeA }, () => tools.webSearch.execute({ query: 'same', numResults: 1 })),
      runWithContext({ tenantId: 'tenant-tool-b', agentId: 'agent-b', threadId: 'thread-b', capabilities: ['ALL'], runtime: runtimeB }, () => tools.webSearch.execute({ query: 'same', numResults: 1 }))
    ]);

    if (!String(resultA).includes('A:same') || String(resultA).includes('B:same')) {
      throw new Error(`Runtime A received wrong provider result: ${resultA}`);
    }
    if (!String(resultB).includes('B:same') || String(resultB).includes('A:same')) {
      throw new Error(`Runtime B received wrong provider result: ${resultB}`);
    }
  } finally {
    delete process.env.ORCHESTRA_TOOL_WEBSEARCH_MODE;
  }
}

const tests = [
  ['mock mode is explicit', testMockModeIsExplicit],
  ['disabled mode blocks tool', testDisabledModeBlocksTool],
  ['live mode blocks local URLs', testLiveModeStillBlocksLocalUrls],
  ['code sandbox disabled by default', testCodeSandboxDisabledByDefault],
  ['live mode requires provider', testLiveModeRequiresProvider],
  ['custom tool providers work in live mode', testCustomToolProvidersWorkInLiveMode],
  ['tool providers are runtime scoped', testToolProvidersAreRuntimeScoped]
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
