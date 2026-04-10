/**
 * Executes stringifyJson.
 * @param value Value for value.
 * @returns The stringifyJson result.
 */
export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{"error":"Unable to stringify payload."}';
  }
}

/**
 * Executes normalizeCuiList.
 * @param raw Value for raw.
 * @returns The normalizeCuiList result.
 */
export function normalizeCuiList(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Executes parseRedirectUris.
 * @param raw Value for raw.
 * @returns The parseRedirectUris result.
 */
export function parseRedirectUris(raw: string): string[] {
  return raw
    .split(/\n|,/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
