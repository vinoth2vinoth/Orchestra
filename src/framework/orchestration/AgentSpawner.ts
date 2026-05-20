import { BaseAgent } from '../agents/BaseAgent.ts';
import { WorkerAgent } from '../agents/WorkerAgent.ts';
import { MemoryMesh } from '../memory/MemoryMesh.ts';
import { LLMConfig } from '../llm/ProviderRegistry.ts';
import { RuntimeContextOptions, createRuntimeContext } from '../core/RuntimeContext.ts';

export class AgentSpawner {
    public static spawnSpecialist(
        name: string,
        expertise: string,
        memory: MemoryMesh,
        llmConfig: LLMConfig,
        parentId: string,
        capabilitiesOrRuntime?: string[] | RuntimeContextOptions,
        runtime?: RuntimeContextOptions
    ): BaseAgent {
        const description = `You are a specialist dynamically spawned to handle a sub-task. Your expertise is in: ${expertise}`;
        const capabilities = Array.isArray(capabilitiesOrRuntime) ? capabilitiesOrRuntime : undefined;
        const effectiveRuntime = Array.isArray(capabilitiesOrRuntime) ? runtime : capabilitiesOrRuntime;
        const resolvedCapabilities = capabilities ?? [
            expertise.toLowerCase().includes('search') ? 'web_search' : 'general'
        ];
        
        const newAgent = new WorkerAgent(
            name,
            description,
            'WORKER',
            memory,
            llmConfig,
            resolvedCapabilities,
            parentId,
            undefined,
            undefined,
            undefined,
            effectiveRuntime
        );

        return newAgent;
    }

    public static terminate(agentId: string, runtime?: RuntimeContextOptions) {
        const services = createRuntimeContext(runtime);
        services.agentRegistry.unregister(agentId);
        services.eventStore.append({
            type: 'AGENT_TERMINATED',
            sourceAgentId: 'ORCHESTRATOR',
            targetAgentId: agentId,
            threadId: 'SYSTEM',
            payload: { message: 'Agent explicitly terminated to free resources.' }
        });
        // In a more complex memory-managed language, we'd dispose of resources here.
    }
}
