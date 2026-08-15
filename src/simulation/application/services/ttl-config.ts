/**
 * Reads a positive TTL from configuration, falling back when unset or invalid.
 *
 * Shared by the OAuth services so that every `ANAF_MOCK_*_TTL_SECONDS` variable is
 * validated identically. Non-numeric, zero, negative and infinite values all fall back
 * rather than producing a token or code that expires immediately or never.
 *
 * @param rawValue Raw environment variable value.
 * @param fallbackSeconds Default applied when the value is missing or not positive.
 * @returns Effective TTL in seconds.
 */
export function readTtlSeconds(
  rawValue: string | undefined,
  fallbackSeconds: number,
): number {
  const parsed = Number(rawValue);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSeconds;
}
