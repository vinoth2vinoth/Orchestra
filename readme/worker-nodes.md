# Worker Nodes & Autonomous Daemons

Modern AI agents often execute processes that are heavily I/O bound. If an autonomous agent is executing a data-mining task that requires navigating twenty web pages, making database calls, extracting text, and writing large output files, the operation can take anywhere from 30 seconds to multiple minutes. To prevent application stalls and ensure a highly available system, Orchestra completely segregates User Interface and API boundaries from actual agent execution contexts using **Worker Nodes**.

## The Worker Pool Architecture

Instead of running operations sequentially on a single Node.js thread, Orchestra maintains natively a `WorkerPool`. This acts as a collection of decoupled, parallelized worker instances that poll a central task queue, identical to enterprise background processing architectures like Celery or BullMQ.

### Worker Node Lifecycle

1. **Instantiation:** Upon system start, a predefined number of `WorkerNode` instances (e.g., `node_1`, `node_2`, `node_10`) are rapidly spawned into memory.
2. **Listening:** Nodes subscribe to specific target topics on the global message bus (e.g., `TASKS.SCRAPER` or `TASKS.GENERAL_DEV`).
3. **Execution:** When a task arrives on the broker, an idle worker instantly locks the trace, changes its internal heartbeat state to `BUSY`, and invokes its assigned LLM configuration to process the tool execution loops safely.
4. **Result Publication:** Once the agent successfully achieves its goal (or hits an unrecoverable budget scale limit), the Worker cleanly packages the structured JSON output and publishes it back onto the message bus before wiping local thread memory and returning to `IDLE`.

### Built-In Self Healing & Heartbeats

Distributed microservice systems inherently suffer from silent execution failures. If an LLM API network connection hangs indefinitely, or a Node sandbox runs out of allocated heap memory, the orchestration workflow must not freeze permanently.

- **Heartbeat Pings:** Every 2 seconds, active `WorkerNode` instances execute a fast telemetry pulse to the overarching Message Bus.
- **The Watchdog Monitor:** The `WorkerPool` daemon continuously scans for stale workers across the mesh. If a node fails to emit a heartbeat within 8 seconds, the Watchdog marks it as `DEAD`. It then explicitly force-terminates the stuck container/process, requeues the dropped task perfectly safely, and spawns a fully fresh Worker Node to take its place. This enables true enterprise-level robustness.

## Autonomous Daemons: Working While You Sleep

While routine Worker Nodes react solely to explicit, prompted tasks, **Daemons** are entirely proactive background entities running inside Orchestra.

An `AutonomousDaemon` is an infinite-looping scanner that looks for "work to be done" without any human prompting.

- **Tick-Event Loop:** A Daemon wakes up continuously on a cron or interval schedule (e.g., every 60 seconds).
- **Environment Scanning:** It might natively query a software project's Jira board API, scan a GitHub Pull Request queue, or monitor an AWS S3 bucket for new uploaded assets.
- **Dynamic Worker Summoning:** If the Daemon detects a new Jira ticket labeled `high-priority-bug`, it temporarily acts as a hyper-manager. It parses the ticket, formulates an execution plan, and instantly dispatches an ephemeral, single-use `BugFixer Worker Node` loaded exclusively with codebase-search and code-editing tools. The worker investigates the bug, writes a patch, tests it, and opens a PR—all autonomously down the pipeline.
- **Zero Interface Blocking:** Because this entire intelligence loop occurs purely in the backend queueing system, the end-user (or front-end application) never experiences CPU consumption or interface latency.

Deploying and scaling this architecture is natively seamless. In a production Kubernetes or AWS ECS cluster environment, `WorkerNodes` can be containerized entirely separately from the main REST orchestrator layer. This allows cloud engineering teams to auto-scale up to hundreds of parallel agent workers specifically scaling against the message queue depth levels (e.g., via tools like KEDA).
