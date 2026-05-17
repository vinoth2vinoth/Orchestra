# Custom Tools and Skills Development

Orchestra's `ToolRegistry` allows developers to endlessly expand the capabilities of agents. By leveraging **Zod** schema validation, the framework guarantees that the LLM sends requests in the exact shape your tool requires.

## How It Works

Agents are sandboxed by default. They can only execute tools explicitly granted to them in their workflow configuration.

### Building a Custom Tool

1. **Define the Schema:** Use `zod` to define the expected arguments.
2. **Implement the Logic:** Write the asynchronous execution block natively in TypeScript.
3. **Register:** Add it to the global `ToolRegistry` or bind it directly to an agent persona.

```typescript
import { z } from 'zod';

const myCustomTool = {
    name: 'fetch_stock_price',
    description: 'Retrieves the real-time stock price for a given ticker.',
    schema: z.object({
        ticker: z.string().describe('The stock ticker symbol, e.g., AAPL')
    }),
    execute: async (args: { ticker: string }) => {
        const response = await fetch(`https://api.stocks.example/?symbol=${args.ticker}`);
        return await response.json();
    }
}
```

### Tool Modalities
- **Native TypeScript Execution:** Directly execute code inside the Node environment.
- **MCP Client (Model Context Protocol):** Interface with remote external tool APIs and simulation environments using standard MCP protocols.
- **File System / OS Level:** For background `AutonomousDaemon` agents manipulating local repositories or building code.
