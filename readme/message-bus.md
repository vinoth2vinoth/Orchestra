# Internal Message Bus & Pub/Sub

At the core of Orchestra's distributed nature is the **Message Bus** architecture. To decouple process execution from the user interface and allow horizontal scaling, we rely on a global publish/subscribe pattern.

## Architecture

Instead of directly invoking agent functions, the framework utilizes `QueueBroker` and `globalMessageBus` to route messages.

- **Topic Subscriptions:** Components subscribe to relevant topics (e.g., `WORKER_HEARTBEATS`, `TASK_ASSIGNED`).
- **Asynchronous Execution:** When an orchestrator routes a task, it publishes the payload to the message queue. A free `WorkerNode` consumes the message, processes it via its LLM agent, and publishes the result back.
- **Heartbeat Monitoring:** Worker agents emit regular `HEARTBEAT` pings over the bus. The `WorkerPool` daemon listens to these across the system, enabling self-healing. If a worker goes quiet, it's restarted.

## Why a Message Bus?

1. **Decoupling:** Front-end interfaces never block waiting for an LLM response.
2. **Scalability:** You can spin up infinite worker nodes listening to the same queue.
3. **Resilience:** If a node crashes during execution, the unacknowledged message can be picked up by another node or processed on restart.
