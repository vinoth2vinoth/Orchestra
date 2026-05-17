import { FrameworkTestSuite } from './TestSuite.ts';

async function runTests() {
    const suite = new FrameworkTestSuite();
    
    const results = await Promise.all([
        suite.runTest({
            name: 'Basic Hierarchical Test',
            task: 'Say hello',
            config: {
                paradigm: 'HIERARCHICAL',
                agents: [
                    FrameworkTestSuite.createMockAgent('mgr', 'Manager', 'MANAGER', 'Hello from Manager')
                ]
            },
            expectedSubstrings: ['Hello from Manager']
        }),
        suite.runTest({
            name: 'Consensus Adjudication Test',
            task: 'Solve the impossible',
            config: {
                paradigm: 'CONSENSUS',
                agents: [
                    FrameworkTestSuite.createMockAgent('v1', 'Voter 1', 'WORKER', 'Action A'),
                    FrameworkTestSuite.createMockAgent('v2', 'Voter 2', 'WORKER', 'Action B'),
                    FrameworkTestSuite.createMockAgent('judge', 'Judge', 'JUDGE', 'Judge Resolution')
                ]
            },
            validator: (res) => res.wasAdjudicated === true && res.finalAnswer === 'Judge Resolution'
        })
    ]);

    console.log('=== TEST RESULTS ===');
    results.forEach((r, i) => {
        console.log(`Test ${i + 1}: ${r.success ? 'PASSED' : 'FAILED: ' + r.error}`);
    });
    
    if (results.some(r => !r.success)) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
