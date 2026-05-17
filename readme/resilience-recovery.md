# Resilience & Recovery

Relying on external LLM APIs and dynamic filesystems is inherently flaky. 

- **Checkpointers:** Workflows serialize their state to local disk `(.orchestra/checkpoints)` after every successful iteration loop.
- **Crash Recovery:** If the application crashes, the orchestrator can read the suspended serialized JSON blobs and resume the exact operation without re-querying the entire task sequence.
- **Automated Health Monitoring:** The worker pool monitors heartbeat pings. Unresponsive worker nodes are automatically detected, halted, and restarted.
