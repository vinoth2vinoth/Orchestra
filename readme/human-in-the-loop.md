# 👥 Human-in-the-Loop (HITL)

As multi-agent swarms take on increasingly complex and high-stakes workflows—such as merging code or deploying financial transactions—leaving them entirely autonomous presents critical risks. Orchestra explicitly addresses this by integrating a native **Human-in-the-Loop (HITL)** architecture.

## 1. Triggers for Human Intervention

In Orchestra, execution suspension occurs through three primary mechanisms:

### A. The `request_human_help` Tool
Agents are explicitly programmed to call this tool if they encounter ambiguity or need high-stakes authorization.
- **Agent Instruction:** "If the user context is vague, invoke `request_human_help` with your justification."
- **Payload:** Contains a `justification` for the pause and a `contextualSummary` of the current blocker.

### B. High-Risk Tool Guardrails
When a tool is registered in the `ToolRegistry` with the `highRisk: true` flag, the `globalEscalationManager` automatically intercepts the call.
- **Examples:** `deployBuild`, `deleteDatabase`, `transferFunds`.
- **Action:** The system pauses *before* the tool logic is executed, presenting the tool's intended arguments to a human for verification.

### C. Systemic Escalation Policy
The `EscalationManager` can automatically trip the circuit breaker and suspend a thread if:
- **Failure Threshold:** An agent fails the same task node more than 3 consecutive times.
- **Policy Violation:** The `PolicyEngine` flags a `MANDATORY` audit rule.
- **Budget Capping:** The thread cost exceeds a predefined limit.

## 2. The Suspension & Rehydration Loop

Orchestra does not "block" threads during HITL. It uses an asynchronous **Freeze-Dry** pattern.

1. **State Capture:** The `Checkpointer` (Dimension 07) captures the entire active `MemoryMesh` and blackboard state.
2. **Serialization:** The state is encrypted via AES-256-GCM and persisted to the `.orchestra/checkpoints/` directory.
3. **Queue Eviction:** The current Worker Node is released to handle other tasks, ensuring zero compute waste during human wait times.
4. **Notification:** A `HUMAN_INTERVENTION_REQUIRED` event is emitted via the `MessageBus` to the Dashboard.

## 3. Adjudication & Resumption

When a human interacts with a suspended task in the Dashboard:

- **Resolution Modalities:**
    - **APPROVE:** Unlocks the trace and allows the tool/agent to proceed with the exact original parameters.
    - **REJECT:** Forces a `PEER_REVIEW_REJECTION` error back into the agent's context, requiring it to find an alternative strategy.
    - **MODIFY / INJECT:** The human provides new text input or overrides tool parameters.

- **Feedback Injection:** Human feedback is injected as an immutable `PEER_REVIEW` event at the tail of the message history. Upon resumption, the agent is prompted to treat this input as a "Strategic Directive" from its supervisor.

## 4. Governance & Accountability

All HITL interactions are cryptographically signed and logged in the **Immutable Audit Log**.
- **Audit Fields:** `humanId`, `resolution`, `feedbackDelta`, `timestamp`.
- **OTel Tracing:** Trace spans reflect "Human Wait Time" as a specialized dormant state, providing visibility into organizational bottlenecks.
