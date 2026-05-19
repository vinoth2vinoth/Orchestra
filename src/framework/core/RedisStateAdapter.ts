import { KeyValueStateAdapter } from './KeyValueStateAdapter.ts';

/**
 * Backward-compatible alias for older imports.
 * Prefer KeyValueStateAdapter for new code to avoid backend brand lock-in.
 */
export class RedisStateAdapter extends KeyValueStateAdapter {}
