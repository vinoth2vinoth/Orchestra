# 🗺️ Orchestra Plugins Quick-Reference

Orchestra v2.4 ships with 20+ specialized plugins in the `EnterpriseFeatures.ts` suite. This map provides a rapid overview of their capabilities.

## 🛡️ Security & Privacy
| Plugin | Capability |
| :--- | :--- |
| `DataLossPrevention` | Scrub PII (Emails, SSNs, CCs) from inputs/outputs. |
| `JailbreakDefense` | Pattern-match against prompt injection and instructions-override. |
| `ZeroTrustRBAC` | Gate high-risk tools behind human roles (e.g., Admin only). |
| `SecretManagerInjection` | Resolve `{{VAULT_SECRET}}` placeholders into real keys at runtime. |

## 💰 Cost & Resource Management
| Plugin | Capability |
| :--- | :--- |
| `TokenBudget` | Hard-cap token usage per thread to prevent runaway spend. |
| `FinOpsChargeback` | Attribute USD costs to specific departments or tenants. |
| `ContextCompression` | Auto-summarize long threads to stay within context windows. |
| `SemanticCache` | Store and reuse identical agent outputs using high-speed hashing. |

## 📈 Quality & Reliability
| Plugin | Capability |
| :--- | :--- |
| `SelfHealingRetry` | Catch agent failures and trigger "Reflexion" loops for recovery. |
| `CircuitBreaker` | Stop failing tasks and rerate to fallback models (e.g., Flash). |
| `GroundednessEvaluator` | Detect hallucinations and flag them in real-time. |
| `StructuredOutputEnforcer` | Force LLM responses into strict JSON schema formats. |

## 🏗️ Performance & Tracing
| Plugin | Capability |
| :--- | :--- |
| `OpenTelemetryTracing` | Generate OTel spans for agents, tools, and LLM calls. |
| `MetricsExport` | Export real-time stats (latency, throughput) to Prometheus. |
| `ShadowMode` | Parallelize execution to test new prompts/models in "Read-Only." |
| `ModelRouter` | Heuristically route tasks between Pro and Flash models for speed. |

## 📜 Compliance & Knowledge
| Plugin | Capability |
| :--- | :--- |
| `AuditTrail` | Create an immutable, cryptographically hashed audit ledger. |
| `BlockchainSignatures` | Sign agent decisions on a hash-chain for verification. |
| `ContinuousAlignment` | Export successful trajectories for DPO/RLHF fine-tuning. |
| `ExplainableAI` | Attach source attributions and confidence scores to output. |
| `DataSovereignty` | Force model execution into specific geographic regions (GDPR). |
| `MultimodalIngestion` | OCR and embed visual attachments into the reasoning context. |
