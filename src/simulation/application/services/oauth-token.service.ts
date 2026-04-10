import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SimulationTypes } from '../../domain/simulation.types';

interface OAuthTokenSession {
  clientId: string;
  identityId: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAtUnixMs: number;
}

export interface AccessTokenValidationResult {
  isValid: boolean;
  error?: string;
  errorDescription?: string;
  clientId?: string;
  identityId?: string;
}

/**
 * Issues and validates in-memory OAuth access and refresh token sessions.
 */
@Injectable()
export class OAuthTokenService {
  private readonly accessTokenSessions = new Map<string, OAuthTokenSession>();
  private readonly refreshTokenSessions = new Map<string, OAuthTokenSession>();

  private readonly expiresInSeconds = 3600;
  private readonly defaultScope = 'efactura vat';

  /**
   * Creates a fresh access and refresh token pair for a client.
   *
   * @param clientId OAuth client identifier.
   * @param identityId Selected mock e-sign identity identifier.
   * @returns OAuth token response payload.
   */
  issueToken(
    clientId: string,
    identityId: string,
  ): SimulationTypes.OAuthTokenResponse {
    this.purgeExpiredSessions();

    const session = this.createSession(clientId, identityId);
    this.accessTokenSessions.set(session.accessToken, session);
    this.refreshTokenSessions.set(session.refreshToken, session);

    return this.toResponse(session);
  }

  /**
   * Exchanges a valid refresh token for a new access token session.
   *
   * @param clientId OAuth client identifier.
   * @param refreshToken Refresh token presented by the client.
   * @returns New OAuth token response or undefined when invalid.
   */
  issueTokenFromRefreshToken(
    clientId: string,
    refreshToken: string,
  ): SimulationTypes.OAuthTokenResponse | undefined {
    this.purgeExpiredSessions();

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
  validateAuthorizationHeader(
    authorizationHeader: string | undefined,
  ): AccessTokenValidationResult {
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
  private validateAccessToken(token: string): AccessTokenValidationResult {
    this.purgeExpiredSessions();

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
   * Purges expired access and refresh sessions.
   */
  private purgeExpiredSessions(): void {
    const now = Date.now();

    for (const [accessToken, session] of this.accessTokenSessions.entries()) {
      if (session.expiresAtUnixMs <= now) {
        this.accessTokenSessions.delete(accessToken);
        this.refreshTokenSessions.delete(session.refreshToken);
      }
    }
  }
}
