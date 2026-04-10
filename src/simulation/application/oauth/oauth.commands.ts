import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Shared OAuth command error shape used by command handlers.
 */
export interface OAuthCommandFailure {
  ok: false;
  statusCode: number;
  error: string;
  description: string;
  requiresBasicAuth?: boolean;
}

/**
 * Successful authorize command result.
 */
export interface OAuthAuthorizeSuccess {
  ok: true;
  redirectUrl: string;
}

/**
 * Successful token command result.
 */
export interface OAuthTokenSuccess {
  ok: true;
  token: SimulationTypes.OAuthTokenResponse;
}

/**
 * Result contract for authorize flow command.
 */
export type OAuthAuthorizeResult = OAuthAuthorizeSuccess | OAuthCommandFailure;

/**
 * Result contract for token issuance command.
 */
export type OAuthTokenResult = OAuthTokenSuccess | OAuthCommandFailure;

/**
 * Validates an OAuth authorize request and builds the redirect URL.
 */
export class AuthorizeOAuthClientCommand {
  /**
   * Creates an instance of AuthorizeOAuthClientCommand.
   * @param responseType Value for responseType.
   * @param clientId Value for clientId.
   * @param redirectUri Value for redirectUri.
   * @param state Value for state.
   * @param identityId Value for identityId.
   */
  constructor(
    public readonly responseType: string,
    public readonly clientId: string,
    public readonly redirectUri: string,
    public readonly state?: string,
    public readonly identityId?: string,
  ) {}
}

/**
 * Issues an OAuth access token from code or refresh token grants.
 */
export class IssueOAuthTokenCommand {
  /**
   * Creates an instance of IssueOAuthTokenCommand.
   * @param body Value for body.
   * @param authorizationHeader Value for authorizationHeader.
   */
  constructor(
    public readonly body: Record<string, string | number | undefined>,
    public readonly authorizationHeader?: string,
  ) {}
}
