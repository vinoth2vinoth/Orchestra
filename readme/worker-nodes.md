# 🛠️ Worker Nodes & Autonomous Daemons

Modern AI agents often execute processes that are heavily I/O bound. To prevent application stalls and ensure high availability, Orchestra segregates the User Interface from agent execution using **Worker Nodes**.

## The Worker Pool Architecture

Instead of running operations sequentially on the main server thread, Orchestra maintains a `WorkerPool`. This is a collection of decoupled, parallelized worker instances that poll a central task queue, similar to Celery (Python) or BullMQ (Node.js).

### Worker Node Lifecycle
1. **Instantiation:** Upon start, the `WorkerPool` daemon spawns a set of isolated worker processes.
2. **Subscription:** Nodes subscribe to specific topics (e.g., `TASKS.SCRAPER` or `TASKS.DEVELOPER`) based on their specialized toolsets.
3. **Execution Context:** When a task is consumed, the worker initializes a sterile `ExecutionContext` with thread-local variables and security tokens.
4. **LLM Loop:** The worker enters a ReAct (Reason + Act) loop, calling tools and analyzing results until the objective is met.
5. **Finalization:** Results are published back to the `Orchestrator` via the Message Bus, and the worker process clears its local memory to prevent context leakage.

## Built-In Self Healing & Reliability

Distributed agentic systems encounter unique failure modes: LLM timeouts, rate limits, and network partitions. Orchestra handles these via a robust health system:

- **Pulse Heartbeats:** Every worker emits a `HEARTBEAT` event every 2 seconds.
- **Zombie Recovery:** If a worker stops pulsing for >10 seconds, the `GuardianDaemon` kills the process, rolls back any partial tool-state, and requeues the task for a fresh worker.
- **Budget Protection:** If a worker exceeds its assigned `TokenBudget` or `MaxIterations`, it is automatically suspended by the framework to prevent runaway costs.

## Autonomous Daemons: Proactive Intelligence

While Worker Nodes are reactive, **Daemons** are proactive background entities that scan for work without human intervention.

| Daemon Type | Responsibility |
| :--- | :--- |
| **Watcher Daemon** | Monitors external APIs (GitHub, Jira, AWS) and spawns workers when events occur. |
| **Cleaner Daemon** | Prunes expired conversation context and optimizes long-term vector memory. |
| **Safety Daemon** | Scans audit logs for policy violations or anomalous agent behavior patterns. |

### Scaling in Production
In a production environment (Kubernetes/AWS), Worker Nodes can be containerized separately from the Control Plane. This allows for:
- **Elastic Scaling:** Use KEDA to scale worker pods based on the `TaskQueue` depth.
- **Resource Isolation:** Give high-reasoning workers more RAM/vCPU than simple task-routing workers.
- **Geographic Distribution:** Place workers closer to the tools or data they need to access.
