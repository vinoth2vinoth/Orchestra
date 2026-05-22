import { FrameworkEvent } from './types.ts';
import { IMessageBus, globalMessageBus } from './MessageBus.ts';
import { StateAdapter, globalStateAdapter } from './StateAdapter.ts';
import { Sanitizer } from '../security/Sanitizer.ts';

export interface EventStoreOptions {
    stateAdapter?: StateAdapter;
    messageBus?: IMessageBus;
    historyKey?: string;
    topic?: string;
}

/**
 * EventStore manages the append-only event log for the entire system.
 * Now refactored to support distributed persistence via StateAdapter.
 */
export class EventStore {
    private events: FrameworkEvent[] = [];
    private eventIds: Set<string> = new Set();
    private threadIndex: Map<string, FrameworkEvent[]> = new Map();
    private listeners: ((event: FrameworkEvent) => void)[] = [];
    private readonly stateAdapter: StateAdapter;
    private readonly messageBus: IMessageBus;
    private readonly historyKey: string;
    private readonly topic: string;
    private unsubscribeFromBus?: () => void;
    private disposed = false;
    private totalDroppedEvents = 0;
    public readonly ready: Promise<void>;

    constructor(options: EventStoreOptions = {}) {
        this.stateAdapter = options.stateAdapter || globalStateAdapter;
        this.messageBus = options.messageBus || globalMessageBus;
        this.historyKey = options.historyKey || 'framework_events';
        this.topic = options.topic || 'FRAMEWORK_EVENTS';

        // Subscribe to the event stream to keep local cache in sync across nodes.
        this.messageBus.subscribe(this.topic, (event: FrameworkEvent) => {
            this.internalAppend(event);
        }).then(unsubscribe => {
            if (this.disposed) {
                unsubscribe();
            } else {
                this.unsubscribeFromBus = unsubscribe;
            }
        }).catch(err => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[EventStore] MESSAGE BUS WARNING: Failed to subscribe to ${this.topic}: ${message}`);
        });
        
        // Seed history from shared state. Callers that need restored history before
        // reads can await `ready` or use EventStore.create().
        this.ready = this.loadHistory();
    }

    public static async create(options: EventStoreOptions = {}): Promise<EventStore> {
        const store = new EventStore(options);
        await store.ready;
        return store;
    }

    private async loadHistory() {
        try {
            const history = await this.stateAdapter.getRange(this.historyKey, 0, -1);
            history.forEach(event => this.internalAppend(event));
        } catch (err) {
            console.error('Failed to load event history from StateAdapter:', err);
        }
    }

    public subscribe(listener: (event: FrameworkEvent) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private internalAppend(event: FrameworkEvent) {
        // Prevent duplicate local appending
        if (this.eventIds.has(event.id)) return;

        this.events.push(event);
        this.eventIds.add(event.id);
        
        // Update thread index
        if (!this.threadIndex.has(event.threadId)) {
            this.threadIndex.set(event.threadId, []);
        }
        const threadTail = this.threadIndex.get(event.threadId)!;
        threadTail.push(event);

        // --- PERFORMANCE: Per-thread Tail Limit (Dimension 04) ---
        // Keep only last 100 events per thread in memory for active context
        if (threadTail.length > 100) {
            this.threadIndex.set(event.threadId, threadTail.slice(-100));
        }
        
        // --- PERFORMANCE: Global Tail Limit (Dimension 04) ---
        // Keep only latest 1000 events in memory overall
        if (this.events.length > 1000) {
            const dropped = this.events.length - 500;
            this.totalDroppedEvents += dropped;
            console.warn(`[EventStore] In-memory event tail exceeded 1000 events. Dropping ${dropped} oldest cached events; durable history remains in StateAdapter.`);
            this.events = this.events.slice(-500);
            this.rebuildIndexes();
        }

        // Dispatch to local UI/SSE listeners
        this.listeners.forEach(l => l(event));
    }

    public append(event: Omit<FrameworkEvent, 'id' | 'timestamp'>): FrameworkEvent {
        // --- SECURITY: Log Scrubbing (Dimension 10) ---
        const sanitizedPayload = this.recursiveScrub(event.payload || {});
        
        const fullEvent: FrameworkEvent = {
            ...event,
            payload: sanitizedPayload,
            id: crypto.randomUUID(),
            timestamp: Date.now()
        };
        
        // 1. Persist to shared state. append() remains sync for callers, but
        // persistence failures must be visible instead of disappearing silently.
        this.stateAdapter.pushToList(this.historyKey, fullEvent).catch(err => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[EventStore] DURABILITY WARNING: Failed to persist event ${fullEvent.id} to StateAdapter: ${message}`);
            this.internalAppend({
                type: 'ERROR_THROWN',
                sourceAgentId: 'EVENT_STORE',
                threadId: 'SYSTEM',
                payload: { action: 'PERSISTENCE_FAILURE', eventId: fullEvent.id, message },
                id: crypto.randomUUID(),
                timestamp: Date.now()
            });
        });

        // 2. Append locally immediately. The bus may throttle cross-node fanout,
        // but the origin node must not lose its own audit/event record.
        this.internalAppend(fullEvent);

        // 3. Publish to distributed bus - duplicate local delivery is ignored by ID
        this.messageBus.publish(this.topic, fullEvent).catch(err => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[EventStore] MESSAGE BUS WARNING: Failed to publish event ${fullEvent.id} to ${this.topic}: ${message}`);
            this.internalAppend({
                type: 'ERROR_THROWN',
                sourceAgentId: 'EVENT_STORE',
                threadId: 'SYSTEM',
                payload: { action: 'MESSAGE_BUS_PUBLISH_FAILURE', eventId: fullEvent.id, message },
                id: crypto.randomUUID(),
                timestamp: Date.now()
            });
        });
        
        return fullEvent;
    }

    public dispose() {
        this.disposed = true;
        this.unsubscribeFromBus?.();
        this.listeners = [];
    }

    public clear() {
        this.events = [];
        this.eventIds.clear();
        this.threadIndex.clear();
    }

    public getEventsByThread(threadId: string): FrameworkEvent[] {
        return [...(this.threadIndex.get(threadId) || [])].map(e => Object.freeze({ ...e }));
    }

    public getLogs(): FrameworkEvent[] {
        return [...this.events].map(e => Object.freeze({ ...e }));
    }

    public getDiagnostics() {
        return {
            cachedEvents: this.events.length,
            indexedThreads: this.threadIndex.size,
            totalDroppedEvents: this.totalDroppedEvents,
            historyKey: this.historyKey,
            topic: this.topic
        };
    }

    public getSnapshotAtTimestamp(threadId: string, timestamp: number): FrameworkEvent[] {
        const threadEvents = this.threadIndex.get(threadId) || [];
        return threadEvents.filter(e => e.timestamp <= timestamp);
    }

    private recursiveScrub(obj: any): any {
        if (!obj) return obj;
        if (typeof obj === 'string') return Sanitizer.scrubSecrets(obj);
        if (Array.isArray(obj)) return obj.map(item => this.recursiveScrub(item));
        if (typeof obj === 'object') {
            const scrubbed: any = {};
            for (const key in obj) {
                scrubbed[key] = this.recursiveScrub(obj[key]);
            }
            return scrubbed;
        }
        return obj;
    }

    private rebuildIndexes() {
        this.threadIndex.clear();
        this.eventIds.clear();
        for (const event of this.events) {
            this.eventIds.add(event.id);
            if (!this.threadIndex.has(event.threadId)) {
                this.threadIndex.set(event.threadId, []);
            }
            this.threadIndex.get(event.threadId)!.push(event);
        }
    }
}

export const globalEventStore = new EventStore();
