# 🪵 Event Sourcing & Distributed Tracing

Orchestra's execution models are fully asynchronous. A single user prompt might trigger dozens of agents and hundreds of events. To manage this complexity, we use an immutable `EventStore` combined with OpenTelemetry.

## 1. The Immutable Event Store

The `EventStore` (Dimension 04) is the authoritative ledger of every action within the framework. It handles the lifecycle of events from emission to distributed persistence.

### Security-First Logging (Dimension 10)
Before an event is appended to the store, it passes through an automated **Scrubbing Pipeline**.
- **Secret Redaction:** The `Sanitizer.scrubSecrets` utility identifies high-entropy strings (API keys, JWTs) and replaces them with `[REDACTED]`.
- **Recursive Sanitization:** Nested payloads (LLM reasoning, tool outputs) are recursively scanned to ensure no PII leaks into the primary audit logs.

### Distributed synchronization
The `EventStore` is not local to a single node. It uses the `StateAdapter` and `MessageBus` to synchronize history.
- **`StateAdapter` Persistence:** Events are pushed to a central shared list, ensuring new nodes can "Rehydrate" their local event cache on startup.
- **`FRAMEWORK_EVENTS` Pub/Sub:** Real-time events are broadcast over the message bus, allowing the Dashboard and other workers to react instantly.

## 2. High-Performance Event Indexing

To maintain low latency as event volume grows, the `EventStore` implements sophisticated indexing and memory management:
- **Thread-Based Indexing:** Events are indexed by `threadId` for $O(1)$ retrieval of conversation history.
- **Memory Tail Limits (Dimension 04):** To prevent memory exhaustion, the store only keeps the latest **1,000 global events** and **100 events per thread** in RAM. Older events are accessible via the persistent `StateAdapter` backend.
- **Snapshots:** Developers can request a `getSnapshotAtTimestamp` to see the exact state of a thread at any historical point.

## 3. OpenTelemetry (OTel) Propagation

Orchestra natively wraps the orchestration logic in OTel context. Every task initiation generates a `TraceId` that is propagated across all distributed boundaries.

### Correlation Headers
When the `Orchestrator` publishes a task to the `QueueBroker`, the current OTel context is attached to the message metadata. When a `WorkerNode` consumes the task, it extracts this context, ensuring that the worker's child spans are correctly nested under the original parent trace.

- **Cost Tagging:** Spans include `llm.usage.cost` and `llm.usage.tokens` attributes, enabling granular financial analysis in tools like Jaeger or Honeycomb.
- **Error Attribution:** Fatal exceptions in worker nodes are caught and attached to the trace with the `error` flag, providing a clear visualization of where a distributed failure originated.
