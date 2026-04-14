import { Injectable } from '@nestjs/common';
import {
  AnafRateLimitResult,
  AnafRateLimitStorePort,
} from '../../application/ports/anaf-rate-limit-store.port';

/**
 * In-memory implementation of ANAF daily rate limit tracking.
 * Counters reset automatically when the date portion of the key changes.
 */
@Injectable()
export class AnafRateLimitStoreService implements AnafRateLimitStorePort {
  private readonly counters = new Map<string, number>();

  async checkAndIncrement(
    key: string,
    limit: number,
  ): Promise<AnafRateLimitResult> {
    const current = this.counters.get(key) ?? 0;

    if (current >= limit) {
      return { allowed: false, currentCount: current, limit };
    }

    const next = current + 1;
    this.counters.set(key, next);
    return { allowed: true, currentCount: next, limit };
  }

  /**
   * Returns the current counter value for a key without incrementing it.
   * Used by monitoring/MCP tools that need a read-only view of quota usage.
   *
   * @param key Rate-limit key following the `{endpoint}:{discriminator}:{YYYY-MM-DD}` convention.
   * @returns Current count, or 0 if the key has never been hit today.
   */
  peekCount(key: string): number {
    return this.counters.get(key) ?? 0;
  }
}
