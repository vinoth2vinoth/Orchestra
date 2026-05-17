# Agent Personas & Hierarchies

Rather than having a single "Agent", Orchestra implements a **multi-agent tier system** where different personas have specialized configurations.

## Architecture Tiers

### 1. Manager Agents

- **Role:** High-level execution, delegating tasks, reviewing submissions.
- **Traits:** High token limits, ability to spawn sub-agents, global context awareness.
- **Tools:** `delegate_task`, `report_status`, `analyze_results`.

### 2. Worker Agents

- **Role:** Specific, narrow task execution (e.g., "Code Writer", "Data Analyst").
- **Traits:** Optimized prompts, limited external API access to prevent scope creep, shorter time-to-live (TTL).
- **Tools:** Direct execution handlers (e.g., `execute_sql`, `edit_file`).

### 3. Background Daemons

- **Role:** Autonomously scanning queues and resolving background tasks without human intervention.
- **Traits:** Fully headless. Operates on loops. Reports status directly to the `EventStore`.

By isolating contexts, Orchestra ensures that no single LLM request suffers from token explosion and hallucination due to conflicting system instructions.
