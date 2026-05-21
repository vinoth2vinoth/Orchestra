# Reliability Contract

This document describes what Orchestra currently guarantees for local and distributed-oriented execution. It is intentionally concrete: each supported claim should map to a regression test or a documented operational requirement.

## Scope

Orchestra is still early-stage infrastructure. The current reliability model is strongest for deterministic framework behavior, checkpointed graph workflows, local process recovery simulations, and key-value-backed state contracts. Multi-process production deployments should use a durable `StateAdapter`, stable process supervision, and explicit tool idempotency.

## Core Guarantees

| Area | Current Behavior | Validation |
| --- | --- | --- |
| Queue leases | Tasks move from `PENDING` to `LEASED` with a visibility timeout. Expired leases are requeued. | `npm run test:durability`, `npm run test:reliability` |
| Queue ACK/NACK | Successful results mark tasks `SUCCEEDED`; failed attempts retry until max attempts, then move to DLQ. | `npm run test:architecture` |
| Duplicate publish | Publishing the same `taskId` while pending/leased attaches to the existing task instead of creating a second execution. Completed task IDs replay the stored result. | `npm run test:durability` |
| Broker restart simulation | A fresh `QueueBroker` can recover an expired lease created by a previous broker instance and complete the task. | `npm run test:durability` |
| Stale lease results | Worker results include a lease token. A result from an expired lease cannot complete a task that has already been re-leased. | `npm run test:durability` |
| Checkpoints | Graph workflow checkpoints are encrypted at rest and cleared after successful completion. | `npm run test:reliability` |
| Checkpoint tamper handling | Corrupted checkpoint bytes are detected through the storage mesh and restored from the last valid snapshot when available. | `npm run test:reliability` |
| Graph resume | Completed graph nodes are not rerun after checkpoint resume; downstream nodes receive checkpointed upstream results. | `npm run test:reliability` |
| Event history reload | A fresh `EventStore` instance reloads persisted framework events from the shared state adapter. | `npm run test:reliability` |
| Audit hash chain | Concurrent audit entries can be verified as a hash-chain segment. | `npm run test:architecture` |
| State concurrency | Atomic mutations and increments avoid lost updates under concurrent writes. | `npm run test:security`, `npm run test:sdk` |

## Failure Matrix

| Failure Mode | Status | Expected Behavior |
| --- | --- | --- |
| Crash before task is leased | Supported | Pending task remains discoverable and can be dispatched by another broker. |
| Crash during task execution | Supported for queue-managed tasks | Lease expires and the task is retried by another available worker. |
| Crash after task result before publisher resolves | Supported | Stored `SUCCEEDED` records resolve waiting duplicate publishers and replay later publishes. |
| Duplicate task dispatch with same `taskId` | Supported | Existing task record is reused; work is not enqueued twice. |
| Late result from an expired lease | Supported | Result is ignored when its lease token no longer matches the current task record. |
| Worker returns repeated failures | Supported | Task retries until `maxAttempts`, then moves to the dead-letter queue. |
| Process restarts during graph workflow | Partially supported | Graph checkpoints can resume completed nodes; the caller must supply compatible agent definitions. |
| Checkpoint file corruption | Supported when a snapshot exists | Storage mesh restores the last valid snapshot; otherwise checkpoint load returns `null`. |
| Event bus fanout drop | Supported with a distributed message bus | Origin node appends locally and persists to state before bus fanout. Cross-node live delivery is validated with the Redis-compatible message bus; local mode remains single-process. |
| External tool side effect retried after crash | Requires application idempotency | Use deterministic idempotency keys at the tool boundary; the framework only deduplicates queue task IDs. |
| Multi-region split brain | Planned | Requires a stronger distributed lock/consensus backend than the local development adapter. |

## Durable State Requirements

For production-like reliability, configure:

```env
ORCHESTRA_STATE_ADAPTER=keyvalue
ORCHESTRA_STATE_URL=redis://localhost:6379
ORCHESTRA_MESSAGE_BUS=keyvalue
ORCHESTRA_ENCRYPTION_KEY=replace-with-a-strong-secret
```

The key-value adapter and distributed message bus use the Redis-compatible protocol and are tested with Valkey in CI. Application code should depend on `StateAdapter` and `IMessageBus`, not a specific backend brand.

## Idempotency Rules

Queue reliability depends on stable task identity:

- Use deterministic `taskId` values for work that may be retried or submitted again.
- Treat `taskId` as the idempotency key for queue-managed work.
- Preserve the `leaseId` delivered in `TaskPayload` when publishing worker results.
- Keep external side effects behind explicit tool-level idempotency keys.
- Avoid generating a new `taskId` for the same high-risk operation after a timeout until the old task record is checked.

## Validation Commands

```bash
npm run test:durability
npm run test:reliability
npm run test:architecture
npm run test:security
npm run check
```

`npm run test:durability` focuses on duplicate task publish behavior and fresh-broker lease recovery. `npm run test:reliability` covers checkpointing, event reload, queue crash recovery, and graph resume.
