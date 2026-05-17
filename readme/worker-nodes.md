# Worker Nodes & Daemons

To scale beyond a single Node process blocking the main thread, the framework operates via message passing to a simulated distributed queue.

- **WorkerPool:** Pre-spawns a pool of `WorkerNode` instances that listen to internal queues.
- **AutonomousDaemon:** A self-running loop that periodically inspects backend state (e.g., checking for unassigned tickets or flagged events) and spawns an ephemeral worker agent dynamically to take independent background action without user intervention.
