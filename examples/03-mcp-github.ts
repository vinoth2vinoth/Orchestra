import {
  Orchestrator,
  DaemonParadigm,
} from "orchestra-framework/orchestration";
import { BaseAgent } from "orchestra-framework/agents";

// This MCP string points to a standard GitHub Model Context Protocol server.
// No custom fetch requests needed. The tool registry natively pulls all Github schemas!
const gitHubMCPServer = "mcp://community.github/v1";

const prReviewer = new BaseAgent({
  name: "Senior_PR_Reviewer",
  systemInstruction:
    "You act as an autonomous background daemon. Review incoming pull requests for security vulnerabilities. Comment on the PR directly if you find an issue.",
  tools: [gitHubMCPServer], // 🔌 Dynamic discovery of GitHub capabilities
});

const orchestrator = new Orchestrator();

async function run() {
  console.log("👻 Launching GitHub Reviewer Daemon...");

  // Instead of a one-time task, this sets up the agent as a background worker
  // polling the queue or responding to webhook events over the Message Bus.
  await orchestrator.registerDaemon({
    agent: prReviewer,
    eventTrigger: "GITHUB_WEBHOOK_PR_OPENED",
    paradigm: DaemonParadigm,
  });

  console.log("✅ Daemon listening to Message Bus for PR events...");
}

run();
