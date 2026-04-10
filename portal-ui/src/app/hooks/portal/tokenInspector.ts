import { TokenInspectorData } from '../../types';

/**
 * Decodes a JWT-like access token payload and projects selected OAuth claims
 * into a view model used by the token inspector panel.
 */
export function inspectAccessToken(accessToken: string): TokenInspectorData {
  const raw = accessToken.trim();
  if (!raw) {
    return {
      identityId: '-',
      clientId: '-',
      scope: '-',
      issuedAt: '-',
      expiresAt: '-',
      parseError: 'No access token stored.',
    };
  }

  const segments = raw.split('.');
  if (segments.length < 2) {
    return {
      identityId: '-',
      clientId: '-',
      scope: '-',
      issuedAt: '-',
      expiresAt: '-',
      parseError: 'Access token is not in JWT format.',
    };
  }

  try {
    const payloadText = decodeBase64Url(segments[1]);
    const payload = JSON.parse(payloadText) as {
      identity_id?: unknown;
      client_id?: unknown;
      sub?: unknown;
      scope?: unknown;
      iat?: unknown;
      exp?: unknown;
    };

    return {
      identityId: stringOrDash(payload.identity_id),
      clientId: stringOrDash(payload.client_id ?? payload.sub),
      scope: stringOrDash(payload.scope),
      issuedAt: formatUnixSeconds(payload.iat),
      expiresAt: formatUnixSeconds(payload.exp),
    };
  } catch {
    return {
      identityId: '-',
      clientId: '-',
      scope: '-',
      issuedAt: '-',
      expiresAt: '-',
      parseError: 'Unable to decode token payload.',
    };
  }
}

/**
 * Decodes a base64url-encoded JWT segment to plain text.
 */
function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return window.atob(padded);
}

/**
 * Normalizes unknown values to a trimmed string fallback used by inspector rows.
 */
function stringOrDash(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || '-';
}

/**
 * Formats unix timestamp seconds into a locale string for display.
 */
function formatUnixSeconds(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }

  return new Date(numeric * 1000).toLocaleString();
}
