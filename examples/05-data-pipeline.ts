import {
  Orchestrator,
  MapReduceParadigm,
} from "orchestra-framework/orchestration";
import { BaseAgent } from "orchestra-framework/agents";

const mapWorker = new BaseAgent({
  name: "Log_Parser",
  systemInstruction:
    "Extract the timestamp, latency, and error code (if any) from the raw server log string.",
});

const reduceWorker = new BaseAgent({
  name: "Log_Aggregator",
  systemInstruction:
    "Sum up all errors by category and calculate the average latency.",
});

const orchestrator = new Orchestrator();

async function run() {
  console.log("📊 Starting Data Pipeline (MapReduce)...");

  // Simulate reading 10,000 raw logs from an S3 bucket
  const s3LogsBatch = [
    "2026-05-17T14:22:10Z [INFO] GET /api/v1/users 120ms",
    "2026-05-17T14:22:15Z [ERROR] POST /api/v1/login 500 Network Timeout",
    "2026-05-17T14:22:18Z [INFO] GET /dashboard 45ms",
    // ... imagine thousands more ...
  ];

  // The MapReduce Paradigm splits the array, spawns the mapWorker asynchronously
  // across the cluster, and then channels the outputs into the reduceWorker.
  const insights = await orchestrator.routeTask({
    task: "Process the raw logs and generate a health summary JSON.",
    agents: { mapper: mapWorker, reducer: reduceWorker },
    paradigm: MapReduceParadigm,
    dataPayload: s3LogsBatch,
  });

  console.log("\n✅ Health Summary:\n", insights.finalOutput);
}

run();
