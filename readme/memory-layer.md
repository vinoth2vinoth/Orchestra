# Memory Layer

The `MemoryMesh` layer stores agent experiences in segregated stores.

- **Short-term Memory:** Tied strictly to the current `threadId`. This gives the agent a tight operational window of the task at hand.
- **Long-term Memory:** A persistent metadata layer that can be queried when an agent spawns, giving it historical context of actions taken previously (e.g. knowing a previous attempt to run a command failed).
