import { PluginRegistry } from '../src/framework/core/PluginRegistry.ts';
import { globalPluginRegistry } from '../src/framework/core/PluginRegistry.ts';
import { registerEnterpriseFeatures, SecretManagerPlugin } from '../src/framework/plugins/EnterpriseFeatures.ts';
import { createRuntimeContext, SecretVault } from '../src/framework/index.ts';

async function testPluginRegistryIsIdempotent() {
  const registry = new PluginRegistry();
  const plugin = { name: 'DuplicateGuardPlugin', version: '1.0.0' };

  registry.register(plugin);
  registry.register(plugin);

  const matches = registry.listPlugins().filter(item => item.name === plugin.name);
  if (matches.length !== 1) {
    throw new Error(`Expected one plugin registration, got ${matches.length}`);
  }
}

async function testStubGroundednessIsNotDefault() {
  delete process.env.ORCHESTRA_ENABLE_STUB_GROUNDEDNESS;
  delete process.env.ORCHESTRA_ENABLE_SECRET_MANAGER_PLUGIN;

  registerEnterpriseFeatures();

  const names = globalPluginRegistry.listPlugins().map(plugin => plugin.name);
  if (names.includes('GroundednessEvaluatorPlugin')) {
    throw new Error('GroundednessEvaluatorPlugin is a stub and must not be registered by default.');
  }
  if (names.includes('SecretManagerPlugin')) {
    throw new Error('SecretManagerPlugin must not be registered by default because it mutates tool payloads.');
  }
}

async function testSecretManagerUsesRuntimeSecretStore() {
  const secretVault = new SecretVault();
  secretVault.setSecret('tenant-secret-plugin', 'apiKey', 'SCOPED_PLUGIN_SECRET');
  const runtime = createRuntimeContext({ tenantId: 'tenant-secret-plugin', secretVault });
  const plugin = new SecretManagerPlugin();

  const result = await plugin.beforeToolInvoke(
    'agent-a',
    'searchTool',
    { headers: { Authorization: 'Bearer {{apiKey}}' }, query: '{{missingSecret}}' },
    'thread-a',
    runtime
  );

  if (!result?.args?.headers?.Authorization?.includes('SCOPED_PLUGIN_SECRET')) {
    throw new Error('Expected SecretManagerPlugin to resolve secrets from runtime secret store.');
  }
  if (result.args.query !== '{{missingSecret}}') {
    throw new Error('Expected unresolved secret placeholders to stay unresolved.');
  }
}

const tests = [
  ['plugin registry is idempotent', testPluginRegistryIsIdempotent],
  ['stub and payload-mutating plugins are not default', testStubGroundednessIsNotDefault],
  ['secret manager uses runtime secret store', testSecretManagerUsesRuntimeSecretStore]
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
