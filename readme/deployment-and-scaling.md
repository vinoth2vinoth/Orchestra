# Deployment and Scaling Guidelines

Orchestra is designed for **Enterprise Multi-Agent deployment environments**.

## Preparing for Production

1. **Environment Variables:** Ensure all API keys (`GEMINI_API_KEY`) and telemetry endpoints are injected securely via your cloud provider's Secret Manager.
2. **Persistent Storage:** The `.orchestra/` checkpointer and local memory files currently write to the local file system. In production deployments (like Kubernetes or Cloud Run), you should mount a persistent volume, or adapt the checkpointer to write to a cloud database class (e.g., PostgreSQL, Redis, or Firestore).

## Scaling the Swarm

Orchestra uses a simulated distributed queue (`WorkerPool`) by default. To scale this across multiple physical containers:

1. **Externalize the Queue:** Replace the local `QueueBroker` with Redis, RabbitMQ, or AWS SQS.
2. **Horizontal Pod Autoscaling:** Spin up instances of `WorkerNode` as independent microservices. They will seamlessly connect to the message broker and pull down `SWARM` or `HIERARCHICAL` tasks published by the main Orchestrator.
3. **Daemon Sandboxing:** Isolate `AutonomousDaemon` instances so they process background CI/CD or project-management tasks without impacting user-facing API performance.
