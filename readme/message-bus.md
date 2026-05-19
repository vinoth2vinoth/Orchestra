# 🚌 Message Bus & Distributed Eventing

At the core of Orchestra's distributed nature is the **Message Bus** (implemented in `src/framework/core/MessageBus.ts`). To decouple process execution from the user interface and allow horizontal scaling, we rely on a global publish/subscribe (Pub/Sub) pattern.

```mermaid
C4Context
    title Orchestra Message Bus Topology
    
    Person(user, "End User", "Dashboard")
    
    System_Boundary(cp, "Control Plane") {
        System(orchestrator, "Orchestrator", "Task Management")
    }
    
    System_Boundary(bus, "Message Bus") {
        System(local, "LocalMessageBus", "In-process (Memory)")
        System(keyvalue, "Redis-compatible MessageBus", "Cross-process key-value Pub/Sub")
    }
    
    System_Boundary(wp, "Worker Plane") {
        System(worker, "WorkerNodes", "LLM Consumers")
    }

    Rel(user, cp, "API/WS")
    Rel(cp, bus, "Publish")
    Rel(bus, wp, "Subscribe")
```

## Architecture Detail

The framework supports multiple bus adapters via the `IMessageBus` interface:

### 1. LocalMessageBus
Used for small-scale deployments and development.
- **In-Memory**: Uses a `Map<string, handler[]>` to manage subscriptions.
- **Async Simulation**: Uses `setTimeout(() => handler(), 0)` to maintain asynchronous behavior even within a single thread.

### 2. Redis-compatible MessageBus (src/framework/core/RedisMessageBus.ts)
Used for production clusters to coordinate across multiple containers/pods.
- **Concurrency**: Leverages Redis-compatible Pub/Sub for high-throughput event fanning.
- **Scalability**: Allows any number of worker nodes to connect to the same bus.

### 3. Resilience Features
- **Circuit Breaker (Event Storm Guard)**: The `LocalMessageBus` tracks `eventCount` per second. If it exceeds the `rateLimit` (e.g., 1000 events/sec), it trips a circuit breaker to prevent cascading system failure.
- **Topic-Based Routing**:
  - `LLM_GENERATION_STARTED`: Notifies UI to show typing indicators.
  - `AGENT_STEP_COMPLETED`: Individual thought units for the Inspector.
  - `SYSTEM_HOOK`: Middleware signals from plugins.

## Implementation Example
```typescript
import { globalMessageBus } from '../core/MessageBus.ts';

// Subscribing to telemetry
const unsubscribe = await globalMessageBus.subscribe('SYSTEM_HOOK', (msg) => {
    console.log(`Plugin Hook: ${msg.payload.action}`);
});

// Publishing an event
await globalMessageBus.publish('LLM_GENERATION_STARTED', {
    threadId: 't-123',
    agentId: 'a-456'
});
```
