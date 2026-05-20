import { PluginRegistry, globalPluginRegistry } from './PluginRegistry.ts';
import { WorkerPool, globalWorkerPool } from './WorkerPool.ts';
import { globalCircuitBreakers, CircuitBreakerRegistry } from '../resilience/CircuitBreaker.ts';
import { QueueBroker, globalQueueBroker } from '../orchestration/QueueBroker.ts';
import { PolicyEngine, globalPolicyEngine } from '../governance/PolicyEngine.ts';
import { AuditLog, globalAuditLog } from '../governance/AuditLog.ts';
import { StateAdapter, globalStateAdapter } from './StateAdapter.ts';
import { AgentRegistry, globalRegistry } from '../agents/AgentRegistry.ts';
import { EventStore, globalEventStore } from './EventStore.ts';

export interface RuntimeServices {
    tenantId: string;
    stateAdapter: StateAdapter;
    pluginRegistry: PluginRegistry;
    circuitBreakers: CircuitBreakerRegistry;
    queueBroker: QueueBroker;
    workerPool: WorkerPool;
    policyEngine: PolicyEngine;
    auditLog: AuditLog;
    agentRegistry: AgentRegistry;
    eventStore: EventStore;
}

export type RuntimeContextOptions = Partial<RuntimeServices> & {
    tenantId?: string;
};

export function createRuntimeContext(options: RuntimeContextOptions = {}): RuntimeServices {
    return {
        tenantId: options.tenantId || 'GLOBAL',
        stateAdapter: options.stateAdapter || globalStateAdapter,
        pluginRegistry: options.pluginRegistry || globalPluginRegistry,
        circuitBreakers: options.circuitBreakers || globalCircuitBreakers,
        queueBroker: options.queueBroker || globalQueueBroker,
        workerPool: options.workerPool || globalWorkerPool,
        policyEngine: options.policyEngine || globalPolicyEngine,
        auditLog: options.auditLog || globalAuditLog,
        agentRegistry: options.agentRegistry || globalRegistry,
        eventStore: options.eventStore || globalEventStore
    };
}

export const globalRuntimeContext = createRuntimeContext();
