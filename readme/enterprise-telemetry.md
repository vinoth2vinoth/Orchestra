# Enterprise Telemetry

Every system call, agent LLM request, tool execution, and orchestration step is hooked into an `EventStore`.

- **Audit Trails:** Immutable event-driven architectures mean you can backtrack an agent's logic flow perfectly.
- **OpenTelemetry Integrations:** Basic hooks to inject spans and traces mapping to major APM providers.
- **Diagnostics:** The `globalEventStore` provides deep context debugging across distributed asynchronous worker nodes for real-time dashboards.
