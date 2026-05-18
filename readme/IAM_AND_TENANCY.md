# 🔐 Identity & Multi-Tenancy

In an enterprise environment, Orchestra ensures that agents operate within a "Boundary of Trust." We use a Multi-Tenant architecture that prevents data cross-talk and ensures strict resource isolation.

## 1. The Multi-Tenant Boundary

Every request and task in the system is tagged with a `tenantId`. This ID is propagated through the entire lifecycle:
- **API -> Orchestrator -> Message Bus -> Worker -> Tool**

### Data Isolation
All persistent storage adapters (Firestore, Vector DB, Local Disk) are automatically scoped by the `tenantId`.
- **Memory Mesh:** Agents in Tenant A cannot retrieve long-term memories or context from Tenant B.
- **Checkpoints:** State rehydration is only possible if the `tenantId` of the current process matches the `tenantId` of the checkpoint.

## 2. The IAMInterceptor (The Security Proxy)

The `IAMInterceptor` is a middleware that sits between the **Worker Node** and the **Tool Registry**.

### Workflow:
1. **Task Arrival:** A worker receives a task.
2. **Context Binding:** The worker binds the user's `IdentityContext` (JWT claims, user roles, tenantId).
3. **Tool Invocation:** When the agent calls a tool (e.g., `list_private_files`), the `IAMInterceptor` intercepts the call.
4. **Header Injection:** It automatically injects the `tenantId` into the tool's internal parameters.
5. **Enforcement:** If a tool logic attempts to access a path or resource outside its `tenantId` scope, the underlying storage layer throws an `AccessDeniedException`.

## 3. Capability-Based RBAC

Orchestra uses **Capabilities** instead of simple Roles to manage agent permissions.

- **Workers:** Assigned specific capabilities (e.g., `cap:web_access`, `cap:file_write`).
- **Tools:** Require certain capabilities to be invoked.
- **Verification:** The `ToolGuard` verifies that the `actingAgent` possesses the required capability before the `IAMInterceptor` even processes the call.

## 4. Sub-Organization Boundaries (Dimension 05)

For larger enterprises, Orchestra supports **Nested Organizations**.
- **Root Org:** Global policies and audit oversight.
- **Department Sub-Org:** Isolated workers and toolsets.
- **Project Boundary:** Transient, per-thread isolation for specific initiatives.

## 5. Summary of Protection
| Threat | Mitigation |
| :--- | :--- |
| **Cross-Tenant Leakage** | `tenantId` injection and storage scoping. |
| **Agent Impersonation** | Cryptographic signing of `AgentIdentity` tokens. |
| **Unauthorized Escalation** | Capability-based guards and `highRisk` HITL checks. |
| **Secret Exposure** | Entropy-based redaction in logs and memory. |
