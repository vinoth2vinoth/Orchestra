# Human-in-the-Loop (HITL) Execution

As multi-agent swarms take on increasingly complex and high-stakes workflows—such as executing production database migrations, merging code, or deploying financial transactions—leaving them entirely autonomous presents critical risks. Even with robust System Prompts and rigorous consensus algorithms, edge cases arise where human judgment is non-negotiable.

Orchestra explicitly addresses this by integrating a native **Human-in-the-Loop (HITL)** architecture. Rather than treating human intervention as a bolt-on workaround, HITL is fundamentally built into Orchestra's deployment state machine, allowing workflows to pause seamlessly, await human action, and resume deterministically.

## 1. The Core Principles of HITL in Orchestra

ImplementingHITL securely requires a system that treats pausing a live application just as safely as letting it run. When an agent requests human insight, Orchestra does not block the Node.js thread or hold TCP connections open. Instead, it relies on its immutable EventStore and Checkpoint architecture to effectively freeze the execution context.

### Why Native HITL?

- **Financial Risk Mitigation:** Agents cannot spend massive cloud budgets or distribute funds without explicit cryptographic or tokenized sign-off.
- **Safety and Compliance:** Production rollouts, especially in healthcare or infrastructure, fundamentally require a verified sysadmin's approval.
- **Decision Disambiguation:** When a task is vaguely defined, a manager agent might spawn multiple proposed paths. Rather than guessing, it suspends execution and requests the user to pick the best path.

## 2. Dynamic Pausing and Checkpoint Locking

When a `WorkerNode` hits an execution blocker requiring human input, the system performs a localized checkpoint lock:

1. **Tool-Level Triggers:** Specific Zod tools can be tagged with `requires_approval: true`. When an agent attempts to invoke `execute_production_deployment`, the `ToolRegistry` catches it.
2. **State Suspension:** If intercepted, the Orchestrator instantly writes the entire active `MemoryMesh` thread out to the local `.orchestra/checkpoints/` disk database.
3. **Queue Eviction:** The current Worker Node formally unsubscribes from that task trace securely, purging the local memory from its node heap and marking itself `IDLE` to pick up other background duties without wasting compute.
4. **Notification Pub/Sub:** The Orchestrator fires an `AWAITING_HUMAN` event onto the global `MessageBus`. The UI dashboard or a Slack integration listens for this event and notifies the corresponding human.

## 3. Human Approval workflows

Orchestra supports varying tiers of HITL integration based on the urgency and complexity of the workflow.

### A. The "Gatekeeper" Pattern

This is a standard binary Yes/No checkpoint.

- The agent proposes: "I intend to run `DELETE FROM users WHERE last_login < 2020`."
- The Orchestrator halts.
- A human views the trace on the GUI React dashboard.
- If the human clicks **Reject**, the Orchestrator forces a programmatic `ToolExecutionFailed` exception back into the agent's context, telling the LLM precisely why the human blocked it. The LLM must rethink its strategy and try another approach.
- If the human clicks **Approve**, the task trace unlocks and rehydrates on a Worker Node to execute the drop command safely.

### B. The "Guidance" Pattern

Sometimes the agent isn't blocked by permission, but by ambiguity.

- The agent hits a wall debugging a complex compiler error: "I have tried 4 different fixes for standard library mismatch, none worked."
- The agent invokes `request_human_guidance(query)`.
- The human reads the summary and provides a text response: "Downgrade the specific library version to 1.4.2, it's a known incompatibility."
- The UI injects this human insight back into the blackboard context. The state rehydrates, and the agent continues.

## 4. Telemetry and Audit Trails

From a corporate governance perspective, simply allowing humans to override agents is not enough if it isn't tracked.

- Every time a human interacts with a stalled task trace—whether approving, denying, or injecting context—the exact timestamp, user ID, and diff map is explicitly logged permanently within the Orchestrator's `EventStore`.
- OpenTelemetry spans reflect this wait time. A trace might show "45ms Agent Planning", "12 hours Human Wait", "90ms Tool Execution." This allows enterprise platform teams to mathematically analyze where organizational approvals are creating massive sluggishness within autonomous processes.

## 5. Security of the Loop

A compromised dashboard or insecure API endpoint could theoretically impersonate a human approval, bypassing the firewall.
To counter this, Orchestra allows for cryptographic signing of approvals. When the primary Orchestrator API receives a `RESUME` instruction, the HTTP payload must contain a valid, actively verified JWT or session cookie uniquely mapping back to an authorized persona possessing the strict `admin` or `system_supervisor` RBAC policy mapping. If a standard user attempts to approve a production drop, the system politely, but firmly, ignores the network request.
