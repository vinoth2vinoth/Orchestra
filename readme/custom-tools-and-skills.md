# 🛠️ Custom Tools & Skills

Tools are the "hands" of an agent. In Orchestra, tools are not just functions; they are securely wrapped, strictly typed, and governed units of capability.

## 1. Tool Architectural Governance

Every tool in the framework is managed by the `ToolRegistry` and protected by the `ToolGuard` middleware.

### Strict Schema Enforcement
Orchestra uses **Zod** for definitive structural validation.
- **Fail-Fast:** If an agent attempts to call a tool with incorrect arguments, the `ToolGuard` rejects the call before it hits the production logic, returning a `fixSuggestion` to the agent.
- **DDoS Prevention:** A hard **100KB payload limit** is enforced on all tool arguments to prevent "Token Flooding" attacks where an agent is tricked into passing massive chunks of data through a tool.

### High-Risk Permission Gates
Tools can be registered with a `highRisk: true` flag (Dimension 05).
- **Human-in-the-Loop:** High-risk tools (e.g., `deployToProduction`, `deleteUserAccount`) trigger an `EscalationEvent`. Execution suspends until a human supervisor approves the payload via the Dashboard.

## 2. Security & Isolation

Tools execute within a hardened multi-tenant boundary.

- **IAM Injection:** The `IAMInterceptor` automatically injects `tenantId` and `userContext` into tool arguments at runtime. This prevents "Cross-Tenant Data Leakage" by ensuring the tool logic only accesses data belonging to the authorized user.
- **Output Scrubbing:** All tool results (strings or objects) are recursively scanned by the `Sanitizer`. High-entropy secrets or PII discovered in a tool's output are redacted before the agent ever sees them.
- **Capability-Based RBAC:** Agents only have access to tools that match their assigned `capabilities` (e.g., `web_search`, `api_integration`).

## 3. The Tool Execution Lifecycle

When an agent invokes a tool, the following pipeline is executed:

1. **STRUCTURAL CHECK:** Zod parses and validates arguments.
2. **SECURITY CHECK:** IAM headers are injected; risk status is evaluated.
3. **PRE-EXECUTION HOOK:** Plugins can modify the arguments or block the call.
4. **EXECUTION:** The core logic runs in a sterile context.
5. **POST-EXECUTION HOOK:** Results are captured for telemetry.
6. **SCRUBBING:** Secrets are redacted from the final result.

## 4. Implementation Example

```typescript
globalToolRegistry.register(
    'executeApiCall',
    'Invoke an external API endpoint',
    z.object({ 
        endpoint: z.string().url(),
        method: z.enum(['GET', 'POST']),
        payload: z.string().optional()
    }),
    async ({ endpoint, method, payload }) => {
        // Logic here...
    },
    { capabilities: ['api_integration'] }
);
```
