import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SimulationTypes } from '../../domain/simulation.types';
import { RedisControlStateStoreService } from '../../infrastructure/persistence/redis-control-state-store.service';

interface OAuthTokenSession {
  clientId: string;
  identityId: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAtUnixMs: number;
}

interface OAuthTokenState {
  sessions: OAuthTokenSession[];
}

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

  private readonly expiresInSeconds = 3600;
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
  ) {}

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

    const session = this.createSession(clientId, identityId);
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

    return this.issueToken(clientId, existing.identityId);
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
    if (!session) {
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
  ): OAuthTokenSession {
    const issuedAtUnixMs = Date.now();
    const expiresAtUnixMs = issuedAtUnixMs + this.expiresInSeconds * 1000;
    const normalizedClientId = clientId.trim();
    const normalizedIdentityId = identityId.trim();

    return {
      clientId: normalizedClientId,
      identityId: normalizedIdentityId,
      accessToken: this.createJwtAccessToken(
        normalizedClientId,
        normalizedIdentityId,
        issuedAtUnixMs,
        expiresAtUnixMs,
      ),
      refreshToken: `refresh_${randomBytes(24).toString('base64url')}`,
      scope: this.defaultScope,
      expiresAtUnixMs,
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

    for (const session of sessions) {
      this.accessTokenSessions.set(session.accessToken, session);
      this.refreshTokenSessions.set(session.refreshToken, session);
    }

    await this.purgeExpiredSessions();
  }

  /**
   * Persists all active sessions when Redis control-state persistence is enabled.
   */
  private async persistState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    const state: OAuthTokenState = {
      sessions: Array.from(this.accessTokenSessions.values()),
    };

    await this.controlStateStore.writeJson(this.redisStateKey, state);
  }

  /**
   * Purges expired access and refresh sessions.
   */
  private async purgeExpiredSessions(): Promise<void> {
    const now = Date.now();
    let removed = false;

    for (const [accessToken, session] of this.accessTokenSessions.entries()) {
      if (session.expiresAtUnixMs <= now) {
        this.accessTokenSessions.delete(accessToken);
        this.refreshTokenSessions.delete(session.refreshToken);
        removed = true;
      }
    }

    if (removed) {
      await this.persistState();
    }
  }
}
