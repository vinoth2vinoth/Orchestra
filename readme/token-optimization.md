# Token Optimization

LLM contexts can easily explode rapidly. Given that complex tasks may bounce between 5-10 agents continuously, tokens multiply exponentially.

## How we address this

1. **Semantic Compression:** We hook into the memory mesh to condense old message chains into summarized semantic strings rather than full verbatim history.
2. **Context Sliding Windows:** We discard generic system responses and focus primarily on action-execution outputs automatically in the LLM wrapper (`ProviderRegistry.ts`).
3. **Execution Budgets:** Driven via the `security/` modules to impose caps preventing infinite recursive LLM API invocation strings from faulty tools.
