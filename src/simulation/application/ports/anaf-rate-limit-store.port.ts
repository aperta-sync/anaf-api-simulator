export const ANAF_RATE_LIMIT_STORE = Symbol('ANAF_RATE_LIMIT_STORE');

export interface AnafRateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
}

/**
 * Persistence port for tracking ANAF-specific per-endpoint daily rate limits.
 *
 * Keys follow the convention: `{endpoint}:{discriminator}:{YYYY-MM-DD}`
 * Examples:
 *   - `upload:rasp:12345678:2026-04-14` (1000/day/CUI for RASP uploads)
 *   - `stare:5001120362:2026-04-14` (100/day per specific message)
 *   - `lista:12345678:2026-04-14` (1500/day/CUI for simple list)
 *   - `lista_paginata:12345678:2026-04-14` (100000/day/CUI for paginated list)
 *   - `descarcare:3001474425:2026-04-14` (10/day per specific message)
 */
export interface AnafRateLimitStorePort {
  /**
   * Atomically checks and increments a daily counter.
   * Returns whether the request is allowed and the current count.
   */
  checkAndIncrement(key: string, limit: number): Promise<AnafRateLimitResult>;
}
