import { LocalMessageBus, type IMessageBus } from './MessageBus.ts';
import { RedisMessageBus } from './RedisMessageBus.ts';
import { getKeyValueStateUrl } from './KeyValueStateAdapter.ts';

export type MessageBusKind = 'local' | 'keyvalue' | 'redis-compatible' | 'redis' | 'valkey';

export function createMessageBus(env: NodeJS.ProcessEnv = process.env): IMessageBus {
    const requested = (env.ORCHESTRA_MESSAGE_BUS || '').toLowerCase();
    const stateUrl = getKeyValueStateUrl(env);
    const keyValueAliases = new Set(['keyvalue', 'redis-compatible', 'redis', 'valkey']);

    if (keyValueAliases.has(requested)) {
        if (!stateUrl) {
            throw new Error('ORCHESTRA_MESSAGE_BUS=keyvalue requires ORCHESTRA_STATE_URL, VALKEY_URL, or legacy REDIS_URL.');
        }
        return new RedisMessageBus(stateUrl);
    }

    if (!requested || requested === 'local') {
        return new LocalMessageBus();
    }

    throw new Error(`Invalid ORCHESTRA_MESSAGE_BUS="${requested}". Use local or keyvalue.`);
}
