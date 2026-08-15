import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SimulationTypes } from '../../domain/simulation.types';
import { RedisControlStateStoreService } from '../../infrastructure/persistence/redis-control-state-store.service';
import { readTtlSeconds } from './ttl-config';

interface OAuthTokenSession {
  clientId: string;
  identityId: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  accessTokenExpiresAtUnixMs: number;
  refreshTokenExpiresAtUnixMs: number;
}

/**
 * Session shape persisted by versions that tracked a single expiry timestamp.
 * Retained so Redis state written before the access/refresh split still hydrates.
 */
interface LegacyOAuthTokenSession
  extends Omit<
    OAuthTokenSession,
    'accessTokenExpiresAtUnixMs' | 'refreshTokenExpiresAtUnixMs'
  > {
  expiresAtUnixMs?: number;
  accessTokenExpiresAtUnixMs?: number;
  refreshTokenExpiresAtUnixMs?: number;
}

interface OAuthTokenState {
  sessions: LegacyOAuthTokenSession[];
}

/**
 * Controls whether rotating a refresh token restarts its lifetime.
 *
 * `reset` mirrors ANAF, which issues a brand new refresh token JWT on every refresh
 * call, each valid for a further 365 days. `inherit` instead pins the deadline to the
 * original authorization so that the forced re-authentication path can be exercised.
 */
type RefreshTokenRotationMode = 'inherit' | 'reset';

/**
 * Token lifetimes published by ANAF in "Procedura de inregistrare aplicatii portal ANAF":
 * "ACCES TOKEN JWT: 129600 minute = 90 zile. REFRESH TOKEN JWT: 525600 minute = 365 zile".
 */
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface AccessTokenValidationResult {
  isValid: boolean;
  error?: string;
  errorDescription?: string;
  clientId?: string;
  identityId?: string;
}

/**
 * Issues and validates OAuth access and refresh token sessions.
 *
 * Sessions are always cached in memory for fast lookup. When Redis mode is enabled,
 * sessions are also persisted via control-state storage so tokens survive restarts.
 */
@Injectable()
export class OAuthTokenService {
  private readonly accessTokenSessions = new Map<string, OAuthTokenSession>();
  private readonly refreshTokenSessions = new Map<string, OAuthTokenSession>();

  private readonly expiresInSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly refreshTokenRotationMode: RefreshTokenRotationMode;
  private readonly defaultScope = 'efactura vat';
  private readonly redisStateKey = 'anaf:mock:oauth:token-sessions';
  private stateHydrated = false;

  /**
   * Creates an instance of OAuthTokenService.
   *
   * @param controlStateStore Optional Redis-backed state store.
   */
  constructor(
    @Optional()
    private readonly controlStateStore?: RedisControlStateStoreService,
  ) {
    this.expiresInSeconds = readTtlSeconds(
      process.env.ANAF_MOCK_ACCESS_TOKEN_TTL_SECONDS,
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    );
    this.refreshTokenTtlSeconds = readTtlSeconds(
      process.env.ANAF_MOCK_REFRESH_TOKEN_TTL_SECONDS,
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );
    this.refreshTokenRotationMode =
      (process.env.ANAF_MOCK_REFRESH_TOKEN_ROTATION ?? '')
        .trim()
        .toLowerCase() === 'inherit'
        ? 'inherit'
        : 'reset';
  }

  /**
   * Creates a fresh access and refresh token pair for a client.
   *
   * @param clientId OAuth client identifier.
   * @param identityId Selected mock e-sign identity identifier.
   * @returns OAuth token response payload.
   */
  async issueToken(
    clientId: string,
    identityId: string,
  ): Promise<SimulationTypes.OAuthTokenResponse> {
    await this.ensureHydrated();
    await this.purgeExpiredSessions();

    return this.createAndStoreSession(clientId, identityId);
  }

  /**
   * Builds, stores and persists a new token session.
   *
   * @param clientId OAuth client identifier.
   * @param identityId Selected mock e-sign identity identifier.
   * @param inheritedRefreshExpiryUnixMs Refresh expiry carried over from a rotated session.
   * @returns OAuth token response payload.
   */
  private async createAndStoreSession(
    clientId: string,
    identityId: string,
    inheritedRefreshExpiryUnixMs?: number,
  ): Promise<SimulationTypes.OAuthTokenResponse> {
    const session = this.createSession(
      clientId,
      identityId,
      inheritedRefreshExpiryUnixMs,
    );
    this.accessTokenSessions.set(session.accessToken, session);
    this.refreshTokenSessions.set(session.refreshToken, session);

    await this.persistState();

    return this.toResponse(session);
  }

  /**
   * Exchanges a valid refresh token for a new access token session.
   *
   * @param clientId OAuth client identifier.
   * @param refreshToken Refresh token presented by the client.
   * @returns New OAuth token response or undefined when invalid.
   */
  async issueTokenFromRefreshToken(
    clientId: string,
    refreshToken: string,
  ): Promise<SimulationTypes.OAuthTokenResponse | undefined> {
    await this.ensureHydrated();
    await this.purgeExpiredSessions();

    const existing = this.refreshTokenSessions.get(refreshToken.trim());
    if (!existing || existing.clientId !== clientId.trim()) {
      return undefined;
    }

    this.accessTokenSessions.delete(existing.accessToken);
    this.refreshTokenSessions.delete(existing.refreshToken);

    // ANAF issues a fresh 365 day refresh token JWT on every refresh call, so the
    // deadline restarts unless the simulator is pinned to the original authorization.
    const inheritedRefreshExpiryUnixMs =
      this.refreshTokenRotationMode === 'inherit'
        ? existing.refreshTokenExpiresAtUnixMs
        : undefined;

    return this.createAndStoreSession(
      clientId,
      existing.identityId,
      inheritedRefreshExpiryUnixMs,
    );
  }

  /**
   * Validates raw Authorization header input using bearer semantics.
   *
   * @param authorizationHeader Raw Authorization header value.
   * @returns Validation outcome with ANAF-style OAuth error details.
   */
  async validateAuthorizationHeader(
    authorizationHeader: string | undefined,
  ): Promise<AccessTokenValidationResult> {
    await this.ensureHydrated();

    if (!authorizationHeader) {
      return {
        isValid: false,
        error: 'invalid_token',
        errorDescription: 'Missing Authorization header.',
      };
    }

    const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      return {
        isValid: false,
        error: 'invalid_token',
        errorDescription: 'Authorization header must use Bearer token format.',
      };
    }

    return this.validateAccessToken(token);
  }

  /**
   * Validates a concrete access token against active sessions.
   *
   * @param token Bearer token value.
   * @returns Validation result with optional client identifier.
   */
  private async validateAccessToken(
    token: string,
  ): Promise<AccessTokenValidationResult> {
    await this.purgeExpiredSessions();

    const normalizedToken = token.trim();
    const session = this.accessTokenSessions.get(normalizedToken);

    // Sessions outlive their access token so the refresh token stays usable, which
    // makes this explicit expiry check — not the purge sweep — the authority on
    // whether a bearer token is still accepted.
    if (!session || session.accessTokenExpiresAtUnixMs <= Date.now()) {
      return {
        isValid: false,
        error: 'invalid_token',
        errorDescription: 'The access token is invalid or expired.',
      };
    }

    const tokenClaims = this.extractTokenClaims(normalizedToken);
    if (
      !tokenClaims ||
      tokenClaims.clientId !== session.clientId ||
      tokenClaims.identityId !== session.identityId
    ) {
      return {
        isValid: false,
        error: 'invalid_token',
        errorDescription: 'The access token payload is invalid.',
      };
    }

    return {
      isValid: true,
      clientId: session.clientId,
      identityId: tokenClaims.identityId,
    };
  }

  /**
   * Builds a new in-memory token session record.
   *
   * @param clientId OAuth client identifier.
   * @param identityId Selected mock e-sign identity identifier.
   * @returns Session entity with access and refresh tokens.
   */
  private createSession(
    clientId: string,
    identityId: string,
    inheritedRefreshExpiryUnixMs?: number,
  ): OAuthTokenSession {
    const issuedAtUnixMs = Date.now();
    const accessTokenExpiresAtUnixMs =
      issuedAtUnixMs + this.expiresInSeconds * 1000;
    const refreshTokenExpiresAtUnixMs =
      inheritedRefreshExpiryUnixMs ??
      issuedAtUnixMs + this.refreshTokenTtlSeconds * 1000;
    const normalizedClientId = clientId.trim();
    const normalizedIdentityId = identityId.trim();

    return {
      clientId: normalizedClientId,
      identityId: normalizedIdentityId,
      accessToken: this.createJwtAccessToken(
        normalizedClientId,
        normalizedIdentityId,
        issuedAtUnixMs,
        accessTokenExpiresAtUnixMs,
      ),
      refreshToken: `refresh_${randomBytes(24).toString('base64url')}`,
      scope: this.defaultScope,
      accessTokenExpiresAtUnixMs,
      refreshTokenExpiresAtUnixMs,
    };
  }

  /**
   * Creates a compact JWT-like access token embedding identity ownership claims.
   */
  private createJwtAccessToken(
    clientId: string,
    identityId: string,
    issuedAtUnixMs: number,
    expiresAtUnixMs: number,
  ): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const payload = {
      sub: clientId,
      client_id: clientId,
      identity_id: identityId,
      scope: this.defaultScope,
      iat: Math.floor(issuedAtUnixMs / 1000),
      exp: Math.floor(expiresAtUnixMs / 1000),
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = randomBytes(32).toString('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Parses client and identity claims from a JWT-like access token payload.
   */
  private extractTokenClaims(
    token: string,
  ): { clientId: string; identityId: string } | undefined {
    const segments = token.split('.');
    if (segments.length < 2) {
      return undefined;
    }

    try {
      const payloadRaw = Buffer.from(segments[1], 'base64url').toString(
        'utf-8',
      );
      const payload = JSON.parse(payloadRaw) as {
        client_id?: unknown;
        identity_id?: unknown;
      };

      const clientId = String(payload.client_id ?? '').trim();
      const identityId = String(payload.identity_id ?? '').trim();

      if (!clientId || !identityId) {
        return undefined;
      }

      return { clientId, identityId };
    } catch {
      return undefined;
    }
  }

  /**
   * Maps internal session state to OAuth token response format.
   *
   * @param session Token session.
   * @returns OAuth response payload.
   */
  private toResponse(
    session: OAuthTokenSession,
  ): SimulationTypes.OAuthTokenResponse {
    return {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: 'Bearer',
      expires_in: this.expiresInSeconds,
      scope: session.scope,
    };
  }

  /**
   * Loads persisted sessions from Redis-backed control-state store once.
   */
  private async ensureHydrated(): Promise<void> {
    if (this.stateHydrated) {
      return;
    }

    this.stateHydrated = true;

    if (!this.controlStateStore) {
      return;
    }

    const state = await this.controlStateStore.readJson<OAuthTokenState>(
      this.redisStateKey,
    );
    const sessions = state?.sessions ?? [];

    for (const persisted of sessions) {
      const session = this.migratePersistedSession(persisted);
      this.accessTokenSessions.set(session.accessToken, session);
      this.refreshTokenSessions.set(session.refreshToken, session);
    }

    await this.purgeExpiredSessions();
  }

  /**
   * Upgrades a persisted session to the split access/refresh expiry model.
   *
   * Sessions written before the split carry a single `expiresAtUnixMs` describing the
   * access token. Their refresh token is granted a full refresh TTL from now so that
   * restarts do not silently invalidate credentials issued by an earlier version.
   *
   * @param persisted Session as read from control-state storage.
   * @returns Session using the current expiry fields.
   */
  private migratePersistedSession(
    persisted: LegacyOAuthTokenSession,
  ): OAuthTokenSession {
    const accessTokenExpiresAtUnixMs =
      persisted.accessTokenExpiresAtUnixMs ??
      persisted.expiresAtUnixMs ??
      Date.now();
    const refreshTokenExpiresAtUnixMs =
      persisted.refreshTokenExpiresAtUnixMs ??
      Date.now() + this.refreshTokenTtlSeconds * 1000;

    return {
      clientId: persisted.clientId,
      identityId: persisted.identityId,
      accessToken: persisted.accessToken,
      refreshToken: persisted.refreshToken,
      scope: persisted.scope,
      accessTokenExpiresAtUnixMs,
      refreshTokenExpiresAtUnixMs,
    };
  }

  /**
   * Persists all active sessions when Redis control-state persistence is enabled.
   */
  private async persistState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    // A session whose access token has already been purged must still be persisted
    // while its refresh token lives, so both maps contribute to the stored state.
    const sessions = new Map<string, OAuthTokenSession>();
    for (const session of [
      ...this.accessTokenSessions.values(),
      ...this.refreshTokenSessions.values(),
    ]) {
      sessions.set(session.refreshToken, session);
    }

    const state: OAuthTokenState = {
      sessions: Array.from(sessions.values()),
    };

    await this.controlStateStore.writeJson(this.redisStateKey, state);
  }

  /**
   * Purges access and refresh tokens once their independent lifetimes elapse.
   */
  private async purgeExpiredSessions(): Promise<void> {
    const now = Date.now();
    let removed = false;

    for (const [accessToken, session] of this.accessTokenSessions.entries()) {
      if (session.accessTokenExpiresAtUnixMs <= now) {
        this.accessTokenSessions.delete(accessToken);
        removed = true;
      }
    }

    for (const [refreshToken, session] of this.refreshTokenSessions.entries()) {
      if (session.refreshTokenExpiresAtUnixMs <= now) {
        this.refreshTokenSessions.delete(refreshToken);
        removed = true;
      }
    }

    if (removed) {
      await this.persistState();
    }
  }
}
