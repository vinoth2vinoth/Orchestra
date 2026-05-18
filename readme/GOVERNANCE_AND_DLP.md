# 🏛️ Governance, DLP & Cost Control

Enterprise AI requires guardrails that go beyond standard prompt instructions. Orchestra implements a "Hard-Walled" governance layer via specialized plugins.

## 1. Data Loss Prevention (DLP)

The `DataLossPreventionPlugin` acts as a real-time regex-based firewall for sensitive information.
- **Redaction:** Automatically scrubs **Emails, Credit Card Numbers, and SSNs** from both agent inputs and outputs.
- **Sterile Contexts:** Even if an agent hallucinates a user's PII, it is redacted before it hits the `EventStore` or the UI.

## 2. Financial Governance (Token Budgeting)

To prevent "Denial of Wallet" attacks or runaway autonomous loops, Orchestra enforces strict fiscal caps via the `TokenBudgetPlugin`.

- **Thread-Level Quotas:** Every thread is assigned a max token budget (default: 250k).
- **Graceful Halting:** The system triggers a warning at 90% usage.
- **Hard Cap:** If 100% is reached, the thread is instantly suspended and a `GOVERNANCE_QUOTA_EXCEEDED` event is logged.

## 3. FinOps & Chargeback

The `FinOpsChargebackPlugin` provides granular accounting for distributed workloads.
- **Departmental Tagging:** Costs are attributed to departments (e.g., `Engineering`, `Sales`) based on the `tenantId` or metadata.
- **Real-Time Accrual:** Monitors total spend in USD across fanned-out swarm tasks.

## 4. Zero-Trust RBAC

Instead of trusting the agent's "intent," the `ZeroTrustRBACPlugin` enforces policy at the **Tool Execution Point**.
- **Role Verification:** A tool like `refund_customer` is gated by the `support_tier_2` role.
- **Policy Enforcement:** If an agent attempts an unauthorized tool call, the plugin throws an error, and the "Access Denied" event is captured in the audit log for compliance review.

## 5. Regulatory Compliance (Immutable Audit)

For regulated industries (Finance, Healthcare), the `AuditTrailPlugin` generates a cryptographically linked ledger of actions.
- **Chained Hashes:** Every tool call is hashed and linked to the previous action's hash, creating an immutable "Logic Chain."
- **Integrity Check:** If any past action is modified in the logs, the hash chain breaks, alerting security teams to data tampering.
