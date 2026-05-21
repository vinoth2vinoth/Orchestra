import {
  AuditLog,
  BaseAgent,
  EventStore,
  LocalMessageBus,
  MemoryMesh,
  MemoryStateAdapter,
  Orchestrator,
  type LLMConfig,
  type WorkflowConfig
} from '../src/framework/index.ts';

class FlakyAuditAgent extends BaseAgent {
  public attempts = 0;

  constructor(id: string) {
    const memory = new MemoryMesh({ tenantId: 'audit-trail-proof', namespace: id });
    const llmConfig: LLMConfig = { apiKey: 'SIMULATION_ONLY', modelName: 'test-model' };
    super('FlakyAuditAgent', 'Fails once, then succeeds for audit trail proof.', 'MANAGER', memory, llmConfig, [], undefined, undefined, undefined, id);
  }

  async execute(): Promise<string> {
    this.attempts++;
    if (this.attempts === 1) {
      throw new Error('planned audit trail failure');
    }
    return 'audit trail recovered';
  }
}

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

async function testConcurrentAuditEntriesVerifyAsChainSegment() {
  const audit = new AuditLog();
  const fromTimestamp = Date.now();
  await Promise.all(Array.from({ length: 5 }, (_, index) =>
    audit.log('AUDIT_CHAIN_TEST', `agent-${index}`, 'TEST_ACTION', `entry ${index}`)
  ));

  const result = await audit.verify(new Date(), { fromTimestamp });
  if (!result.valid || result.entries < 5) {
    throw new Error(`Audit chain verification failed: ${JSON.stringify(result)}`);
  }
}

async function testConcurrentAuditInstancesShareWriteQueue() {
  const fromTimestamp = Date.now();
  const writes = Array.from({ length: 25 }, (_, index) => {
    const audit = new AuditLog();
    return audit.log('AUDIT_QUEUE_TEST', `queue-agent-${index}`, 'QUEUE_TEST_ACTION', `queued entry ${index}`);
  });

  await Promise.all(writes);
  const result = await new AuditLog().verify(new Date(), { fromTimestamp });
  if (!result.valid || result.entries < 25) {
    throw new Error(`Queued audit chain verification failed: ${JSON.stringify(result)}`);
  }
}

async function testWorkflowAuditTrailSurvivesEventReload() {
  const fromTimestamp = Date.now();
  const threadId = `AUDIT_TRAIL_PROOF_${Date.now()}`;
  const historyKey = `audit_trail_events_${threadId}`;
  const stateAdapter = new MemoryStateAdapter();
  const eventStore = new EventStore({
    stateAdapter,
    messageBus: new LocalMessageBus(),
    historyKey,
    topic: `AUDIT_TRAIL_EVENTS_${threadId}`
  });
  const auditLog = new AuditLog();
  const agent = new FlakyAuditAgent(`audit-agent-${Date.now()}`);
  const config: WorkflowConfig = {
    paradigm: 'HIERARCHICAL',
    agents: [agent],
    maxRetries: 1,
    runtime: { eventStore, auditLog },
    enableLearning: false
  };

  try {
    const result = await new Orchestrator({ eventStore, auditLog }).executeWorkflow('prove audit trail', config, threadId);
    if (result !== 'audit trail recovered') {
      throw new Error(`Workflow did not recover: ${JSON.stringify(result)}`);
    }

    await waitFor(async () => (await stateAdapter.getRange(historyKey, 0, -1)).length >= 5);

    const restoredStore = await EventStore.create({
      stateAdapter,
      messageBus: new LocalMessageBus(),
      historyKey,
      topic: `AUDIT_TRAIL_EVENTS_RESTORED_${threadId}`
    });
    const restoredEvents = restoredStore.getEventsByThread(threadId);
    const eventActions = restoredEvents.map(event => event.payload?.action || event.type);

    if (!eventActions.includes('AGENT_EXECUTION_COMPLETED')) {
      throw new Error(`Reloaded event history missed AI Agent completion: ${JSON.stringify(restoredEvents)}`);
    }
    if (!eventActions.includes('RETRY_INITIATED')) {
      throw new Error(`Reloaded event history missed workflow retry: ${JSON.stringify(restoredEvents)}`);
    }
    if (!restoredEvents.some(event => event.type === 'WORKFLOW_COMPLETED')) {
      throw new Error(`Reloaded event history missed workflow completion: ${JSON.stringify(restoredEvents)}`);
    }

    restoredStore.dispose();

    const auditEntries = await auditLog.readEntries(new Date(), { fromTimestamp, threadId });
    const auditActions = auditEntries.map(entry => entry.action);
    for (const expected of ['AGENT_EXECUTION_START', 'AGENT_EXECUTION_FAILED', 'AGENT_EXECUTION_SUCCESS']) {
      if (!auditActions.includes(expected)) {
        throw new Error(`Audit trail missed ${expected}: ${JSON.stringify(auditEntries)}`);
      }
    }

    const verification = await auditLog.verify(new Date(), { fromTimestamp });
    if (!verification.valid) {
      throw new Error(`Audit hash chain failed verification: ${JSON.stringify(verification)}`);
    }
  } finally {
    eventStore.dispose();
  }
}

const tests = [
  ['concurrent audit entries verify as chain segment', testConcurrentAuditEntriesVerifyAsChainSegment],
  ['concurrent audit instances share write queue', testConcurrentAuditInstancesShareWriteQueue],
  ['workflow audit trail survives event reload', testWorkflowAuditTrailSurvivesEventReload]
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
