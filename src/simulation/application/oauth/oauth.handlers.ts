import { Injectable } from '@nestjs/common';
import {
  CommandHandler,
  ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import { MockApplicationRegistryService } from '../services/mock-application-registry.service';
import { MockIdentityRegistryService } from '../services/mock-identity-registry.service';
import {
  AccessTokenValidationResult,
  OAuthTokenService,
} from '../services/oauth-token.service';
import {
  AuthorizeOAuthClientCommand,
  IssueOAuthTokenCommand,
  OAuthAuthorizeResult,
  OAuthTokenResult,
} from './oauth.commands';
import { ValidateAuthorizationHeaderQuery } from './oauth.queries';

/**
 * Handles ANAF-like OAuth authorize request validation and redirect creation.
 */
@CommandHandler(AuthorizeOAuthClientCommand)
@Injectable()
export class AuthorizeOAuthClientHandler implements ICommandHandler<
  AuthorizeOAuthClientCommand,
  OAuthAuthorizeResult
> {
  /**
   * Creates an instance of AuthorizeOAuthClientHandler.
   * @param appRegistry Value for appRegistry.
   * @param identityRegistry Value for identityRegistry.
   */
  constructor(
    private readonly appRegistry: MockApplicationRegistryService,
    private readonly identityRegistry: MockIdentityRegistryService,
  ) {}

  /**
   * Validates authorize inputs and returns either a redirect URL or OAuth error.
   *
   * @param command Authorize command payload.
   * @returns Redirect target or structured OAuth failure.
   */
  async execute(
    command: AuthorizeOAuthClientCommand,
  ): Promise<OAuthAuthorizeResult> {
    if (command.responseType !== 'code') {
      return {
        ok: false,
        statusCode: 400,
        error: 'unsupported_response_type',
        description: 'Only response_type=code is supported.',
      };
    }

    if (!this.appRegistry.hasClient(command.clientId)) {
      return {
        ok: false,
        statusCode: 401,
        error: 'invalid_client',
        description: 'Client authentication failed.',
        requiresBasicAuth: true,
      };
    }

    if (
      !this.appRegistry.isRedirectUriAllowed(
        command.clientId,
        command.redirectUri,
      )
    ) {
      return {
        ok: false,
        statusCode: 400,
        error: 'invalid_request',
        description: 'redirect_uri is not registered for this client_id.',
      };
    }

    const requestedIdentityId = command.identityId?.trim();
    if (
      requestedIdentityId &&
      !this.identityRegistry.getIdentity(requestedIdentityId)
    ) {
      return {
        ok: false,
        statusCode: 400,
        error: 'invalid_request',
        description: 'identity_id is unknown or not registered.',
      };
    }

    const identityId =
      requestedIdentityId || this.identityRegistry.getDefaultIdentityId();

    if (!identityId) {
      return {
        ok: false,
        statusCode: 500,
        error: 'server_error',
        description: 'No mock identities are available for e-sign simulation.',
      };
    }

    const authCode = this.appRegistry.issueAuthorizationCode(
      command.clientId,
      command.redirectUri,
      identityId,
    );

    const redirectTarget = new URL(command.redirectUri);
    redirectTarget.searchParams.set('code', authCode);
    if (command.state) {
      redirectTarget.searchParams.set('state', command.state);
    }

    return {
      ok: true,
      redirectUrl: redirectTarget.toString(),
    };
  }
}

/**
 * Handles OAuth token issuance for code and refresh grants.
 */
@CommandHandler(IssueOAuthTokenCommand)
@Injectable()
export class IssueOAuthTokenHandler implements ICommandHandler<
  IssueOAuthTokenCommand,
  OAuthTokenResult
> {
  /**
   * Creates an instance of IssueOAuthTokenHandler.
   * @param appRegistry Value for appRegistry.
   * @param identityRegistry Value for identityRegistry.
   * @param oauthTokenService Value for oauthTokenService.
   */
  constructor(
    private readonly appRegistry: MockApplicationRegistryService,
    private readonly identityRegistry: MockIdentityRegistryService,
    private readonly oauthTokenService: OAuthTokenService,
  ) {}

  /**
   * Validates client credentials and grant payload, then issues a token response.
   *
   * @param command Token grant command payload.
   * @returns OAuth token payload or structured OAuth failure.
   */
  async execute(command: IssueOAuthTokenCommand): Promise<OAuthTokenResult> {
    const credentials = this.extractClientCredentials(
      command.body,
      command.authorizationHeader,
    );

    if (!credentials.clientId || !credentials.clientSecret) {
      return {
        ok: false,
        statusCode: 401,
        error: 'invalid_client',
        description: 'Missing client credentials.',
        requiresBasicAuth: true,
      };
    }

    if (
      !this.appRegistry.validateCredentials(
        credentials.clientId,
        credentials.clientSecret,
      )
    ) {
      return {
        ok: false,
        statusCode: 401,
        error: 'invalid_client',
        description: 'Client authentication failed.',
        requiresBasicAuth: true,
      };
    }

    const grantType = String(command.body.grant_type ?? 'authorization_code');

    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      return {
        ok: false,
        statusCode: 400,
        error: 'unsupported_grant_type',
        description: 'Only authorization_code and refresh_token are supported.',
      };
    }

    if (grantType === 'authorization_code') {
      const code = String(command.body.code ?? '').trim();
      const redirectUri = String(command.body.redirect_uri ?? '').trim();

      if (!code || !redirectUri) {
        return {
          ok: false,
          statusCode: 400,
          error: 'invalid_request',
          description:
            'authorization_code grant requires code and redirect_uri.',
        };
      }

      const grant = this.appRegistry.consumeAuthorizationCode(
        code,
        credentials.clientId,
        redirectUri,
      );

      if (!grant) {
        return {
          ok: false,
          statusCode: 400,
          error: 'invalid_grant',
          description: 'Authorization code is invalid or expired.',
        };
      }

      const identityId =
        grant.identityId || this.identityRegistry.getDefaultIdentityId();
      if (!identityId) {
        return {
          ok: false,
          statusCode: 500,
          error: 'server_error',
          description: 'No mock identity available for token issuance.',
        };
      }

      return {
        ok: true,
        token: this.oauthTokenService.issueToken(
          credentials.clientId,
          identityId,
        ),
      };
    }

    const refreshToken = String(command.body.refresh_token ?? '').trim();
    if (!refreshToken) {
      return {
        ok: false,
        statusCode: 400,
        error: 'invalid_request',
        description: 'refresh_token grant requires refresh_token.',
      };
    }

    const refreshedToken = this.oauthTokenService.issueTokenFromRefreshToken(
      credentials.clientId,
      refreshToken,
    );

    if (!refreshedToken) {
      return {
        ok: false,
        statusCode: 400,
        error: 'invalid_grant',
        description: 'Refresh token is invalid or expired.',
      };
    }

    return {
      ok: true,
      token: refreshedToken,
    };
  }

  /**
   * Extracts client credentials from Basic auth header or request body.
   *
   * @param body Incoming token request body.
   * @param authorizationHeader Optional Authorization header.
   * @returns Parsed client identifier and secret.
   */
  private extractClientCredentials(
    body: Record<string, string | number | undefined>,
    authorizationHeader?: string,
  ): { clientId: string; clientSecret: string } {
    if (authorizationHeader?.startsWith('Basic ')) {
      const encoded = authorizationHeader.slice(6).trim();

      try {
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        const separatorIndex = decoded.indexOf(':');

        if (separatorIndex >= 0) {
          return {
            clientId: decoded.slice(0, separatorIndex).trim(),
            clientSecret: decoded.slice(separatorIndex + 1).trim(),
          };
        }
      } catch {
        return { clientId: '', clientSecret: '' };
      }
    }

    return {
      clientId: String(body.client_id ?? '').trim(),
      clientSecret: String(body.client_secret ?? '').trim(),
    };
  }
}

/**
 * Handles bearer authorization header validation for protected endpoints.
 */
@QueryHandler(ValidateAuthorizationHeaderQuery)
@Injectable()
export class ValidateAuthorizationHeaderHandler implements IQueryHandler<
  ValidateAuthorizationHeaderQuery,
  AccessTokenValidationResult
> {
  /**
   * Creates an instance of ValidateAuthorizationHeaderHandler.
   * @param oauthTokenService Value for oauthTokenService.
   */
  constructor(private readonly oauthTokenService: OAuthTokenService) {}

  /**
   * Validates the provided Authorization header against active OAuth sessions.
   *
   * @param query Query payload with raw Authorization header value.
   * @returns Validation result with ANAF-like OAuth error information.
   */
  async execute(
    query: ValidateAuthorizationHeaderQuery,
  ): Promise<AccessTokenValidationResult> {
    return this.oauthTokenService.validateAuthorizationHeader(
      query.authorizationHeader,
    );
  }
}

export const OAUTH_CQRS_HANDLERS = [
  AuthorizeOAuthClientHandler,
  IssueOAuthTokenHandler,
  ValidateAuthorizationHeaderHandler,
];
