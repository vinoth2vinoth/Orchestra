import { Orchestrator, SwarmParadigm } from "orchestra-framework/orchestration";
import { BaseAgent } from "orchestra-framework/agents";

// Initialize specialized agents
const researcher = new BaseAgent({
  name: "Researcher",
  systemInstruction: "Find factual information.",
});
const analyst = new BaseAgent({
  name: "Analyst",
  systemInstruction: "Analyze data and find trends.",
});
const writer = new BaseAgent({
  name: "Writer",
  systemInstruction: "Synthesize findings into a final report.",
});

// Boot the Orchestrator
const orchestrator = new Orchestrator();

async function run() {
  console.log("🚀 Spawning Swarm...");

  const result = await orchestrator.routeTask({
    task: "Research the impact of quantum computing on modern cryptography, analyze the timelines, and write a 2-paragraph executive summary.",
    agents: [researcher, analyst, writer],
    paradigm: SwarmParadigm,
  });

  console.log("\n✅ Final Aggregated Output:\n", result.finalOutput);
}

run();
