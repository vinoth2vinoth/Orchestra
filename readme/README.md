# 📚 Orchestra Documentation Map

Welcome to the official architectural documentation for **Orchestra v2.4**. This suite provides a deep-dive into the "Agentic Grid" and the five pillars of our enterprise multi-agent framework.

## 🧠 Core Strategy & Intelligence
| Guide | Description |
| :--- | :--- |
| [Core Orchestration](./core-orchestration.md) | How the central "Stateless Brain" manages agent lifecycles. |
| [Coordination Paradigms](./PARADIGMS.md) | Deep-dive into Swarm, Hierarchical, Consensus, and Debate models. |
| [Memory Mesh](./memory-layer.md) | Our multi-tiered approach to short-term, episodic, and long-term RAG memory. |
| [Agent Personas](./agent-personas.md) | Engineering specialized workers with deterministic behavior. |

## 🛡️ Security, Governance & Compliance
| Guide | Description |
| :--- | :--- |
| [Security Architecture](./SECURITY.md) | AES-256-GCM encryption, sterile wrapping, and hallucination circuit breakers. |
| [Identity & Tenancy](./IAM_AND_TENANCY.md) | Isolation, sub-organization boundaries, and the IAMInterceptor. |
| [Governance & DLP](./GOVERNANCE_AND_DLP.md) | PII protection, token budgeting, and FinOps chargeback. |
| [Governance Engine](./GOVERNANCE.md) | RBAC, Audit Trails, and Policy Enforcement Points (PEPs). |
| [Human-in-the-Loop](./human-in-the-loop.md) | The suspension, adjudication, and rehydration lifecycle. |

## 🏗️ Infrastructure & Distributed Eventing
| Guide | Description |
| :--- | :--- |
| [Message Bus](./message-bus.md) | Pub/Sub topology, topic routing, and asynchronous tasking. |
| [Worker Nodes & Daemons](./worker-nodes.md) | Horizontal scaling, self-healing workers, and proactive daemons. |
| [Resilience & Recovery](./resilience-recovery.md) | State checkpointing and the StorageMesh self-healing VFS. |
| [Custom Tools & Skills](./custom-tools-and-skills.md) | Securely expanding agent capabilities with Zod and ToolGuards. |
| [Extending with Plugins](./EXTENDING_WITH_PLUGINS.md) | Building life-cycle hooks and custom middleware. |
| [Plugins Quick-Reference](./ORCHESTRA_PLUGINS_MAP.md) | A map of 20+ specialized enterprise plugins. |

## 📈 Observability & Optimization
| Guide | Description |
| :--- | :--- |
| [Enterprise Telemetry](./enterprise-telemetry.md) | OpenTelemetry (OTel) spans, traces, and the Telemetry Studio. |
| [Event Sourcing](./event-sourcing-and-tracing.md) | The immutable EventStore and time-travel debugging. |
| [Token & Cost Optimization](./token-optimization.md) | Adaptive truncation, cache-control, and financial circuit breakers. |

---

### Getting Started
If you are new to the framework, start with the [Core Orchestration](./core-orchestration.md) guide to understand how agents are dispatched across the grid.
