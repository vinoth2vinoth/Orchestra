import { Orchestrator, SwarmParadigm } from "orchestra-framework/orchestration";
import { BaseAgent } from "orchestra-framework/agents";
import { z } from "zod";

// Define a high-risk tool that requires human approval
const deployToProductionTool = {
  name: "deploy_to_production",
  description: "Deploys a specified repository to the production server.",
  schema: z.object({
    repoName: z.string(),
    commitHash: z.string(),
  }),
  requires_approval: true, // 🛑 This flag pauses execution!
};

const devOpsAgent = new BaseAgent({
  name: "DevOps_Lead",
  systemInstruction:
    "You handle deployments. When requested, use deploy_to_production tool.",
  tools: [deployToProductionTool],
});

const orchestrator = new Orchestrator({ stateCheckpointing: true });

async function run() {
  console.log("🚀 Simulating deployment request...");

  // The task will pause entirely when the agent attempts to call `deploy_to_production`
  const deploymentTask = await orchestrator.routeTask({
    agent: devOpsAgent,
    task: "Deploy the backend-api repository, commit hash 8f9b2A to production.",
    paradigm: SwarmParadigm,
  });

  console.log("⏸️ Status:", deploymentTask.status); // "AWAITING_HUMAN"
  console.log(
    "Trace ID mapped for Dashboard approval:",
    deploymentTask.traceId,
  );
}

run();
