# Event Sourcing & Distributed Tracing

Orchestra's execution models are fully asynchronous and incredibly complex. A single user prompt ("fix the login bug") might trigger 4 agents executing 50 tool calls over 5 minutes across 3 distributed Worker Nodes.

If you solely rely on raw `console.log` statements in a production swarm setup, debugging AI failures or hallucination loops becomes mathematically impossible. To solve this, Orchestra implements strict **Event Sourcing** combined with **OpenTelemetry (OTel)** tracing.

## Immutable Event Sourcing

Instead of merely mutating a database row locally, every significant state transition inside Orchestra emits a hardened, immutable Zod-validated Event payload to the `EventStore`.

### Common Emitted Events:

- `TASK_DISPATCHED`: The Orchestrator assigns a thread to a Swarm queue.
- `AGENT_THOUGHT_PROCESSED`: The raw LLM reasoning chain (string) is parsed and saved natively.
- `TOOL_EXECUTION_REQUESTED`: An agent natively outputs a strict JSON tool request boundary.
- `TOOL_EXECUTION_FAILED`: Jailed error stack tracing containing the rejection reason (e.g. "Network Timeout" or "RBAC Denied").
- `AGENT_CONSENSUS_REACHED`: In a specific debate paradigm, agents formally lock in their final synthesized JSON payload.

Because these logs are immutable, developers can build a "Time-Travel Debugger." You can theoretically scrub backwards through an entire multi-agent swarm execution loop to specifically witness _exactly_ which system prompt injection or context failure originally led to a downstream hallucination.

## OpenTelemetry (OTel) Integration

To provide deep, enterprise-grade application performance monitoring (APM), Orchestra natively wraps the `EventStore` inside an OpenTelemetry Tracer instance out of the box.

### Tracking "The Trace"

Every core Objective submitted by a user generates a root `TraceId`. As the Orchestrator natively delegates sub-tasks across the entire pub/sub Worker Pool (via the Distributed Message Bus), this unique `TraceId` is propagated safely within the metadata headers.

- This ensures that if Worker Node 3 crashes executing a specific Python script validation hook, the APM platform correctly ties that crash trace directly to the overarching parent Orchestrator root request.
- Using the `.env` variable `OTLP_ENDPOINT`, you can instantly stream these complex multi-node traces out to modern aggregators like Jaeger, Datadog, or Grafana Tempo without writing any custom tracking glue logic natively.
- **Budget Tracking Matrix:** The tracing spans automatically tag specific attributes natively, notably `llm.token.prompt_count` and `llm.token.completion_count`. This enables massive organizational cost-analytics natively. Engineering teams can visualize precisely which highly-specific Worker Personas mathematically consume the most AI generation billing budgets.
