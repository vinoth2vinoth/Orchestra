# 🪙 Token Optimization & Cost Control

In high-density multi-agent systems, context management is the single most important factor for both **Stability** and **Cost**. Orchestra implements a multi-layer optimization pipeline to ensure agents stay within context windows and budgets.

## 1. Context Optimization Pipeline

The `ContextOptimizer` (Dimension 04) manages the message payload before it is dispatched to the LLM Provider.

### Adaptive Truncation
- **Tool Output Limit:** By default, tool outputs (e.g., large file reads or web search results) are truncated at **2,000 tokens**. This prevents a single large document from "poisoning" the context window.
- **Recursive Summarization:** When a thread reaches **20 messages**, Orchestra triggers a "Long-Term Memory Summary." The middle portion of the conversation is compressed into a dense semantic summary, preserving the `System Instruction` and `Initial Objective`.
- **Heuristic Token Counting:** Orchestra uses a specialized 4:1 character-to-token heuristic (`Math.ceil(text.length / 4)`) for rapid, low-latency pre-flight checks.

### Cache Control Management
For supported providers (like Anthropic), Orchestra automatically injects `cacheControl: { type: "ephemeral" }` into the static "Instruction Zone" (the first 1-3 system messages). This reduces costs for long-running threads by reusing the prompt prefix.

## 2. Real-Time Cost Tracking

The `ModelTracker` maintains a live knowledge base of pricing for 20+ frontier models.

| Model ID | Input Cost (per 1M) | Output Cost (per 1M) | Context Window |
| :--- | :--- | :--- | :--- |
| `gemini-2.5-flash` | $0.075 | $0.30 | 1,000,000 |
| `claude-3-7-sonnet` | $3.00 | $15.00 | 200,000 |
| `gpt-4o` | $2.50 | $10.00 | 128,000 |
| `o1` | $15.00 | $60.00 | 200,000 |

### Cost Calculation Formula
Orchestra calculates cost using the following logic:
```typescript
cost = (inputTokens / 1M * INPUT_RATE) + (outputTokens / 1M * OUTPUT_RATE) + (toolsUsed ? PREMIUM : 0)
```
*Note: A small premium is applied for tool-use invocations to model the overhead of multiple reasoning loops.*

## 3. The "Denial of Wallet" Circuit Breaker

To prevent runaway loops, Orchestra implements strict budget gates:
1. **Thread Budget:** A thread is automatically suspended if the total cost exceeds $5.00 (configurable).
2. **Iteration Limit:** Workers are forcefully terminated if they exceed 10 tool-calling iterations without reaching a conclusion.
3. **Context Pre-flight:** If the estimated context size exceeds the `ModelKnowledgeBase` limit, the request is blocked before reaching the API, saving on failed request latency.
