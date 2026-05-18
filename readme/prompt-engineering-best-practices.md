# 🖋️ Prompt Engineering & System Alignment

In a multi-agent swarm, a vague prompt is a systemic liability. Orchestra treats System Instructions not as "casual chat" but as **Compiled Software Boundaries**.

## 1. The Principle of Least Privilege
A major anti-pattern in agentic frameworks is "Prompt Bloat"—stuffing a single agent with 50 paragraphs of global context. This leads to **Context Dilution**, where the model misses critical constraints.

### Best Practices:
- **Narrow Personas:** A `DatabaseGuard` agent should not know how the React frontend is styled.
- **Zod-Driven Tooling:** Do not explain tools in plain text. Rely on **Zod schemas** in the `ToolRegistry`. Orchestra automatically translates these into hyper-precise JSON schemas that models understand better than prose.

## 2. Structural Encapsulation (Sterile Tags)
Orchestra mandates the use of **XML-style tags** to demarcate instructions from data. This is proven to reduce instruction-override hallucinations.

```xml
<IDENTITY>
You are an expert Security Auditor.
</IDENTITY>

<CONSTRAINTS>
1. Never suggest 'chmod 777'.
2. If you see a hardcoded secret, invoke 'redact_secret'.
</CONSTRAINTS>

<CONTEXT_ZONE>
{{rag_injected_code}}
</CONTEXT_ZONE>
```

## 3. Defensive Logic & Circuit Breakers
Agents must be prompted to handle failures deterministically.

- **Explicit Exit Criteria:** "If the API returns a 429 twice, invoke `request_human_help` immediately. Do not retry a third time."
- **Chain-of-Thought (CoT) Enforcement:** Mandate that agents output their reasoning to the `EventStore` *before* calling a destructive tool. This allows the `GovernanceEngine` to intercept flawed logic early.

## 4. Dynamic Prompt Hydration (RAG)
Orchestra's `MemoryMesh` allows for "Just-in-Time Prompting." We don't hardcode API specs; we inject them based on retrieved relevance.

- **The Injection Pattern:** `"You are currently using the GitHub API. Here is the documentation for the specific endpoint you requested: {mcp_hydration_payload}"`

## 5. Persona Iteration Loop
Use the **Telemetry Studio** to identify "Stuck Points":
1. **Analyze:** Find threads where the agent hit the `MaxIterations` limit.
2. **Refine:** Identify which constraint was too vague (e.g., "be efficient" vs "complete the task in under 3 tool calls").
3. **Benchmarking:** Deploy two worker nodes with different prompts and use the `ConsensusStrategy` to let them "debate" which approach is most robust.

