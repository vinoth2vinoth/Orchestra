# Skill Management

The framework unifies tool usage through the `ToolRegistry`, allowing standard, sandboxed execution of complex scripts, remote API calls, or native function invocations.

## Key Concepts
- **Zod Schema Validation:** Every tool clearly defines its schema ensuring the LLM inherently understands the limits and requirements of arguments.
- **External & Internal Tools:** Support for HTTP API stubs (`MCPClient.ts`), filesystem manipulators, and complex simulation logic.
- **Extensibility:** Register custom tool objects dynamically depending on the active paradigm.
