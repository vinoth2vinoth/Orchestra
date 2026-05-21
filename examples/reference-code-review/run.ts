type ConsoleMethod = 'log' | 'warn' | 'error' | 'info' | 'debug';

async function runQuietly<T>(operation: () => Promise<T>): Promise<T> {
  const originals: Record<ConsoleMethod, typeof console.log> = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  for (const method of Object.keys(originals) as ConsoleMethod[]) {
    console[method] = () => undefined;
  }

  try {
    return await operation();
  } finally {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
    console.info = originals.info;
    console.debug = originals.debug;
  }
}

const { runCodeReviewReference } = await runQuietly(async () => import('./workflow.ts'));
const result = await runQuietly(() => runCodeReviewReference());

if (process.env.ORCHESTRA_DEMO_JSON === 'true') {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log('\nOrchestra Reference Code Review Demo');
console.log('====================================');
console.log(`Repository: ${result.repository}#${result.pullRequestNumber}`);
console.log(`Change: ${result.title}`);
console.log(`Final release gate: ${result.releaseGate}`);
console.log(`Risk: ${result.risk}`);
console.log(`Human approval: ${result.needsHumanApproval ? 'required' : 'not required'}`);
console.log('\nAI Agents');
for (const agent of result.auditTrailSummary.participatingAgents) {
  console.log(`- ${agent}`);
}

console.log('\nFindings');
console.table(result.findings.map(finding => ({
  severity: finding.severity,
  aiAgent: finding.reviewer,
  category: finding.category,
  finding: finding.title
})));

console.log('\nRequired actions');
result.requiredActions.forEach((action, index) => {
  console.log(`${index + 1}. ${action}`);
});

console.log('\nProof');
console.log(JSON.stringify({
  graphCompleted: result.auditTrailSummary.graphCompleted,
  participatingAgents: result.auditTrailSummary.participatingAgents.length,
  eventCount: result.auditTrailSummary.eventCount,
  noPaidApiKeysRequired: true,
  threadId: result.auditTrailSummary.threadId
}, null, 2));
