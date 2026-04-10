const TOKEN_KEYS = {
  access: 'anaf_at',
  refresh: 'anaf_rt',
};

const ACTIVE_APP_KEY = 'anafActiveId';

/**
 * Executes getStoredAccessToken.
 * @returns The getStoredAccessToken result.
 */
export function getStoredAccessToken(): string {
  return localStorage.getItem(TOKEN_KEYS.access) || '';
}

/**
 * Executes getStoredRefreshToken.
 * @returns The getStoredRefreshToken result.
 */
export function getStoredRefreshToken(): string {
  return localStorage.getItem(TOKEN_KEYS.refresh) || '';
}

/**
 * Executes setStoredTokens.
 * @param accessToken Value for accessToken.
 * @param refreshToken Value for refreshToken.
 */
export function setStoredTokens(
  accessToken: string,
  refreshToken: string,
): void {
  localStorage.setItem(TOKEN_KEYS.access, accessToken);
  localStorage.setItem(TOKEN_KEYS.refresh, refreshToken || '');
}

/**
 * Executes clearStoredTokens.
 */
export function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
}

/**
 * Executes getStoredActiveAppId.
 * @returns The getStoredActiveAppId result.
 */
export function getStoredActiveAppId(): string {
  return localStorage.getItem(ACTIVE_APP_KEY) || '';
}

/**
 * Executes setStoredActiveAppId.
 * @param clientId Value for clientId.
 */
export function setStoredActiveAppId(clientId: string): void {
  if (clientId) {
    localStorage.setItem(ACTIVE_APP_KEY, clientId);
    return;
  }

  localStorage.removeItem(ACTIVE_APP_KEY);
}
