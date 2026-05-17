# Core Orchestration Engine

The `Orchestrator` acts as the central brain of the Orchestra framework. Unlike traditional single-agent chat scripts that simply loop a prompt and a response, the Orchestrator manages the entire lifecycle of complex, multi-agent paradigms. It is designed to handle asynchronous distributed systems where agents might be sleeping, processing, or waiting on human input over long periods.

## Advanced Orchestration Paradigms

Orchestra supports multiple execution strategies depending on the complexity of the objective:

### 1. Swarm Execution

In the SWARM paradigm, the Orchestrator breaks a large parent task into independent, parallel sub-tasks. It then publishes these sub-tasks to the Message Bus. Any available Worker Node can pick up a task of its corresponding type.

- **Use Case:** Web scraping multiple URLs simultaneously, unit-testing 10 different files in parallel, or batch-generating assets.
- **Mechanism:** The Orchestrator sets up a synchronized tracking matrix. It waits for all child events to emit a `COMPLETED` action. It then automatically aggregates the distributed results and feeds them into a 'Synthesizer' agent that writes the final output, reducing task times exponentially.

### 2. Hierarchical Execution

For tasks requiring sequential reasoning and review, the Orchestrator employs a strict graph-based hierarchy. A `ManagerAgent` is summoned first to plan the structural steps.

- **Use Case:** Developing a full-stack feature where the database schema must be written and approved before the API is built, followed by the frontend UI.
- **Mechanism:** The Manager agent breaks the task into a DAG (Directed Acyclic Graph). The Orchestrator routes the first node to a Worker. Once the worker finishes, the Orchestrator updates the Manager with the result. The Manager validates the output and unlocks the next node in the graph, returning work to the worker pool if revisions are needed.

### 3. Consensus & Debate Execution

For high-stakes decisions (e.g., merging a pull request or deploying code to production), multiple agents with different specialized prompts (e.g., `SecurityAuditor`, `PerformanceEngineer`, `FeatureReviewer`) are invoked entirely in parallel.

- **Mechanism:** They independently review the target context. The Orchestrator aggregates their votes. If there is a disparity, it automatically initiates a debate loop up to a configurable `maxIterations`, forcing the agents to read each other's critiques and align on a final decision.

## The Execution Lifecycle Flow

1. **Task Ingestion:** An objective is submitted via the UI, API, or an Autonomous Daemon.
2. **Context Assembly:** The Orchestrator requests the `MemoryMesh` to fetch relevant long-term memories, environment variables, and ongoing thread contexts.
3. **Agent Mapping:** The Orchestrator references the `AgentRegistry` to assign the best-suited agent persona (e.g., bypassing a heavy reasoning model for a simple API fetch task to save costs).
4. **Queue Dispatch:** The formulated task payload is serialized and sent to the `globalMessageBus` along with unique trace tracking IDs.
5. **State Monitoring:** The Orchestrator transitions the task state in the database to `IN_PROGRESS` and starts a local timeout polling mechanism to prevent indefinite hangs.
6. **Result Handling:** Once a worker publishes a `SUCCESS` or `FAILED` event, the Orchestrator catches it natively. It handles errors by either retrying the task with an adjusted prompt, delegating to a dedicated fixer agent, or finalizing the complete artifact.
