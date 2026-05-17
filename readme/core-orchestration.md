# Core Orchestration

The `Orchestrator` is the central brain of the framework. It manages the lifecycle of multi-agent paradigms like **SWARM** and **HIERARCHICAL** executions. 

## Responsibilities
- Maps tasks to the correct specialized agents.
- Handles iterative loops until a consensus or maximum iteration limit is reached.
- Provides context windows and unifies results from multiple distributed outputs.
- Interacts closely with the `QueueBroker` to issue commands across worker pools.
