import { Orchestrator, WorkflowConfig } from '../orchestration/Orchestrator.ts';
import { BaseAgent } from '../agents/BaseAgent.ts';
import { MemoryMesh } from '../memory/MemoryMesh.ts';
import { SimulationManager } from '../core/SimulationManager.ts';

export interface TestCase {
    name: string;
    task: any;
    config: WorkflowConfig;
    expectedSubstrings?: string[];
    validator?: (result: any) => boolean | Promise<boolean>;
}

export class FrameworkTestSuite {
    private orchestrator = new Orchestrator();

    public async runTest(test: TestCase): Promise<{ success: boolean; error?: string; result?: any }> {
        console.log(`[TestSuite] Running test: ${test.name}`);
        const threadId = `TEST_${Date.now()}`;
        
        SimulationManager.enable();
        try {
            const result = await this.orchestrator.executeWorkflow(test.task, test.config, threadId);
            
            // Validate substrings
            if (test.expectedSubstrings) {
                const serializedResult = JSON.stringify(result);
                for (const sub of test.expectedSubstrings) {
                    if (!serializedResult.includes(sub)) {
                        return { success: false, error: `Expected result to contain "${sub}"`, result };
                    }
                }
            }

            // Custom validator
            if (test.validator) {
                const isValid = await test.validator(result);
                if (!isValid) {
                    return { success: false, error: `Custom validator failed`, result };
                }
            }

            return { success: true, result };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public static createMockAgent(id: string, name: string, role: BaseAgent['card']['role'], response: string): BaseAgent {
        const mockAgent = new (class extends BaseAgent {
            async execute() {
                return response;
            }
        })(name, 'Mock Agent', role, new MemoryMesh(), { modelName: 'gpt-4o' });
        mockAgent.card.id = id;
        return mockAgent;
    }
}
