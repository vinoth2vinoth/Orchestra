# 🎨 Multi-Paradigm Coordination Strategies

Orchestra supports a wide array of coordination paradigms (implemented in `src/framework/orchestration/paradigms/`). Each paradigm is a specialized `ParadigmStrategy` that dictates how agents interact and reached conclusions.

## Strategy Implementations

### 1. HIERARCHICAL (`HierarchicalStrategy.ts`)
- **Logic**: Implements a strict "Manager-to-Worker" delegation loop.
- **State**: The `blackboard` is used by the Manager to track sub-task completion states.
- **Best For**: Multi-step engineering or legal workflows where one agent must enforce quality at each gate.

### 2. CONSENSUS (`ConsensusStrategy.ts`)
- **Logic**: Workers execute in parallel. The strategy uses a **Weighted Voting Mechanism** to reconcile diverse outputs.
- **Adjudication**: If weights are equal or below the threshold, it escalates to a `JUDGE` agent for final arbitration.
- **Best For**: Sensitive financial or compliance checks.

### 3. SWARM (`SwarmStrategy.ts`)
- **Logic**: A "Leaderless" parallel fan-out. All workers receive segments of the task simultaneously via the `MessageBus`.
- **Merging**: A final synthesis pass combines the parallel buffers into a coherent artifact via a `SynthesizerCard`.

### 4. MAP_REDUCE (`MapReduceStrategy.ts`)
- **Logic**: Recursively divides tasks into a tree structure. 
- **Reduce Phase**: Results are "Reduced" (merged) pairwise or in batches as child nodes complete.
- **Best For**: Massive data ingestion or codebase refactoring.

### 5. MOA - Mixture of Agents (`MOAStrategy.ts`)
- **Logic**: Expert agents all see the same task and produce independent drafts. 
- **Ensemble**: A meta-agent (Aggregator) consumes these drafts to produce a single response that captures the best of all worlds.

### 6. GRAPH (`GraphStrategy.ts`)
- **Logic**: Executes a static state machine defined in the `WorkflowConfig.edges` property.
- **Transitions**: Each agent output is evaluated to determine the next node in the graph, supporting complex loops and conditional branching.

### 7. EVENT_DRIVEN (`EventDrivenStrategy.ts`)
- **Logic**: Agents are registered to `events` (e.g., `GITHUB_PUSH`). 
- **Trigger**: The strategy publishes the event to the bus and orchestrates the reactive agents designated for that specific trigger.

### 8. DEBATE (`DebateStrategy.ts`)
- **Logic**: Two agents (Proposer and Opponent) cycle through $N$ rounds of critique. 
- **Resolution**: The complete dialogue history is presented to a third-party `JUDGE` for the final verdict.

## Tracing & Observability

Every strategy execution is wrapped in an **OTel Span** (OpenTelemetry). Traces are hierarchically nested:
1. `workflow_execution`
2. `paradigm_strategy_run`
3. `agent_execution` (via `executeAgentTask`)

This allows developers to see exactly where a "Debate" loop stalled or which worker in a "MapReduce" tree took the longest.
