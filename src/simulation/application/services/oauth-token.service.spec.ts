import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { OAuthTokenService } from './oauth-token.service';

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

const ENV_KEYS = [
  'ANAF_MOCK_ACCESS_TOKEN_TTL_SECONDS',
  'ANAF_MOCK_REFRESH_TOKEN_TTL_SECONDS',
  'ANAF_MOCK_REFRESH_TOKEN_ROTATION',
] as const;

const originalEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

/** Minimal in-memory stand-in for the Redis-backed control-state store. */
function createFakeStore(seed?: unknown) {
  const documents = new Map<string, unknown>();
  if (seed !== undefined) {
    documents.set('anaf:mock:oauth:token-sessions', seed);
  }

  return {
    documents,
    readJson: jest.fn(async (key: string) => documents.get(key)),
    writeJson: jest.fn(async (key: string, value: unknown) => {
      documents.set(key, value);
    }),
  };
}

describe('OAuthTokenService', () => {
  let nowUnixMs: number;

  beforeEach(() => {
    restoreEnv();
    nowUnixMs = Date.parse('2026-01-01T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => nowUnixMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  function advance(deltaMs: number): void {
    nowUnixMs += deltaMs;
  }

  describe('refresh token lifetime', () => {
    it('keeps the refresh token usable long after the access token expires', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(HOUR_MS + SECOND_MS);

      const refreshed = await service.issueTokenFromRefreshToken(
        'client-1',
        issued.refresh_token,
      );

      expect(refreshed).toBeDefined();
      expect(refreshed?.access_token).not.toBe(issued.access_token);
    });

    it('still accepts the refresh token just before the 365 day default expiry', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(365 * DAY_MS - SECOND_MS);

      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeDefined();
    });

    it('rejects the refresh token once its own TTL elapses', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(365 * DAY_MS + SECOND_MS);

      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeUndefined();
    });

    it('rejects a refresh token presented by a different client', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      await expect(
        service.issueTokenFromRefreshToken('client-2', issued.refresh_token),
      ).resolves.toBeUndefined();
    });

    it('rejects a refresh token that was already rotated away', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      await service.issueTokenFromRefreshToken('client-1', issued.refresh_token);

      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeUndefined();
    });
  });

  describe('access token lifetime', () => {
    it('accepts a freshly issued access token', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      const result = await service.validateAuthorizationHeader(
        `Bearer ${issued.access_token}`,
      );

      expect(result.isValid).toBe(true);
      expect(result.clientId).toBe('client-1');
      expect(result.identityId).toBe('identity-1');
    });

    it('rejects the access token once its TTL elapses, even though the session survives for the refresh token', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(HOUR_MS + SECOND_MS);

      const result = await service.validateAuthorizationHeader(
        `Bearer ${issued.access_token}`,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('invalid_token');

      // The session must still be alive for refresh purposes.
      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeDefined();
    });

    it('reports the configured access TTL as expires_in', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      expect(issued.expires_in).toBe(3600);
    });
  });

  describe('refresh token rotation', () => {
    it('inherits the original refresh expiry across rotations by default', async () => {
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      // Rotate repeatedly across most of the refresh lifetime.
      let current = issued.refresh_token;
      for (let day = 0; day < 5; day += 1) {
        advance(60 * DAY_MS);
        const rotated = await service.issueTokenFromRefreshToken(
          'client-1',
          current,
        );
        expect(rotated).toBeDefined();
        current = rotated!.refresh_token;
      }

      // 300 days elapsed; still inside the original 365 day window.
      advance(60 * DAY_MS);
      const stillValid = await service.issueTokenFromRefreshToken(
        'client-1',
        current,
      );
      expect(stillValid).toBeDefined();

      // Past the original authorization + 365 days, re-authentication is required.
      advance(10 * DAY_MS);
      await expect(
        service.issueTokenFromRefreshToken(
          'client-1',
          stillValid!.refresh_token,
        ),
      ).resolves.toBeUndefined();
    });

    it('resets the refresh expiry on rotation when configured to do so', async () => {
      process.env.ANAF_MOCK_REFRESH_TOKEN_ROTATION = 'reset';
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(360 * DAY_MS);
      const rotated = await service.issueTokenFromRefreshToken(
        'client-1',
        issued.refresh_token,
      );
      expect(rotated).toBeDefined();

      // Well past the original window, but the reset clock keeps it alive.
      advance(100 * DAY_MS);
      await expect(
        service.issueTokenFromRefreshToken('client-1', rotated!.refresh_token),
      ).resolves.toBeDefined();
    });
  });

  describe('configuration', () => {
    it('honours a custom access token TTL', async () => {
      process.env.ANAF_MOCK_ACCESS_TOKEN_TTL_SECONDS = '60';
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      expect(issued.expires_in).toBe(60);

      advance(61 * SECOND_MS);
      const result = await service.validateAuthorizationHeader(
        `Bearer ${issued.access_token}`,
      );
      expect(result.isValid).toBe(false);
    });

    it('honours a custom refresh token TTL', async () => {
      process.env.ANAF_MOCK_REFRESH_TOKEN_TTL_SECONDS = '120';
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(121 * SECOND_MS);
      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeUndefined();
    });

    it('falls back to defaults when the configured TTL is not a positive number', async () => {
      process.env.ANAF_MOCK_ACCESS_TOKEN_TTL_SECONDS = 'not-a-number';
      process.env.ANAF_MOCK_REFRESH_TOKEN_TTL_SECONDS = '-5';
      const service = new OAuthTokenService();
      const issued = await service.issueToken('client-1', 'identity-1');

      expect(issued.expires_in).toBe(3600);

      advance(200 * DAY_MS);
      await expect(
        service.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeDefined();
    });
  });

  describe('redis-backed persistence', () => {
    it('persists sessions whose access token has expired but whose refresh token is still valid', async () => {
      const store = createFakeStore();
      const service = new OAuthTokenService(store as never);
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(HOUR_MS + SECOND_MS);

      // Force a purge cycle so the expired access token is dropped.
      await service.validateAuthorizationHeader(`Bearer ${issued.access_token}`);

      // A brand new instance rehydrates from the same store, as after a restart.
      const restarted = new OAuthTokenService(store as never);
      await expect(
        restarted.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeDefined();
    });

    it('drops sessions from storage once the refresh token has also expired', async () => {
      const store = createFakeStore();
      const service = new OAuthTokenService(store as never);
      const issued = await service.issueToken('client-1', 'identity-1');

      advance(365 * DAY_MS + SECOND_MS);
      await service.validateAuthorizationHeader(`Bearer ${issued.access_token}`);

      const restarted = new OAuthTokenService(store as never);
      await expect(
        restarted.issueTokenFromRefreshToken('client-1', issued.refresh_token),
      ).resolves.toBeUndefined();
    });

    it('migrates legacy persisted sessions that only carry expiresAtUnixMs', async () => {
      const legacyAccessToken = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
          'base64url',
        ),
        Buffer.from(
          JSON.stringify({
            sub: 'client-1',
            client_id: 'client-1',
            identity_id: 'identity-1',
            scope: 'efactura vat',
          }),
        ).toString('base64url'),
        'legacy-signature',
      ].join('.');

      const store = createFakeStore({
        sessions: [
          {
            clientId: 'client-1',
            identityId: 'identity-1',
            accessToken: legacyAccessToken,
            refreshToken: 'refresh_legacy',
            scope: 'efactura vat',
            expiresAtUnixMs: nowUnixMs + HOUR_MS,
          },
        ],
      });

      const service = new OAuthTokenService(store as never);

      // The legacy access token keeps its original expiry.
      await expect(
        service.validateAuthorizationHeader(`Bearer ${legacyAccessToken}`),
      ).resolves.toMatchObject({ isValid: true });

      // The refresh token is granted a full refresh TTL rather than dying with the access token.
      advance(HOUR_MS + SECOND_MS);
      await expect(
        service.issueTokenFromRefreshToken('client-1', 'refresh_legacy'),
      ).resolves.toBeDefined();
    });
  });
});
