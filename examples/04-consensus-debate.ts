import {
  Orchestrator,
  ConsensusParadigm,
} from "orchestra-framework/orchestration";
import { BaseAgent } from "orchestra-framework/agents";

// Define agents with radically different perspectives
const riskAggressive = new BaseAgent({
  name: "Growth_Lead",
  systemInstruction:
    "You push for speed and feature velocity. Tolerate minor risks.",
});

const riskConservative = new BaseAgent({
  name: "Security_Auditor",
  systemInstruction:
    "You are highly paranoid. Look for any excuse to deny the release based on security.",
});

const neutralJudge = new BaseAgent({
  name: "Neutral_Arbiter",
  systemInstruction:
    "You mediate between Growth and Security, deciding objectively.",
});

const orchestrator = new Orchestrator();

async function run() {
  console.log("⚖️ Launching Consensus Tribunal...");

  // The Orchestrator forces these 3 agents into a blind evaluation,
  // loops their outputs into a shared blackboard, and prompts them to debate
  // until they reach 100% agreement or hit the timeout.
  const decision = await orchestrator.routeTask({
    agents: [riskAggressive, riskConservative, neutralJudge],
    task: "Review the attached architectural proposal for removing the Redis cache and replacing it with SQLite. Should we proceed?",
    paradigm: ConsensusParadigm,
    consensusConfig: { maxIterations: 3, timeoutAction: "VOTE_AGGREGATION" },
    contextPayload: { proposalId: "ARCH-1049" },
  });

  console.log("\n✅ Formal Tribunal Decision:\n", decision.finalOutput);
}

run();
