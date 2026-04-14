import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Response } from 'express';
import { OAuthAuthorizeQueryDto } from './oauth-authorize.request.dto';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  AuthorizeOAuthClientCommand,
  IssueOAuthTokenCommand,
} from '../../application/oauth/oauth.commands';

interface SimulatedEsignFailure {
  oauthError: string;
  description: string;
}

/**
 * Handles ANAF-like OAuth command endpoints.
 */
@ApiTags('OAuth 2.0')
@Controller('anaf-oauth2/v1')
export class OAuthCommandHttpController {
  private static readonly ESIGN_FAILURE_PRESETS: Record<
    string,
    SimulatedEsignFailure
  > = {
    incorrect_credentials: {
      oauthError: 'access_denied',
      description:
        'Digital certificate authentication failed. Check certificate and PIN.',
    },
    network_issue: {
      oauthError: 'temporarily_unavailable',
      description:
        'Authorization service is temporarily unreachable. Please retry.',
    },
    server_error: {
      oauthError: 'server_error',
      description:
        'Authorization service encountered an unexpected server-side error.',
    },
  };

  /**
   * Creates an instance of OAuthCommandHttpController.
   * @param commandBus Value for commandBus.
   */
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Executes authorize.
   * @param query Value for query.
   * @param response Value for response.
   */
  @Get('authorize')
  @ApiOperation({
    summary: 'OAuth2 authorization endpoint',
    description:
      'Redirects the resource owner to the consent page and then back to the `redirect_uri` with an authorization code. ' +
      'Use `simulate_esign` to force eSign failure scenarios without a real digital certificate.\n\n' +
      '**Production URL:** `GET https://api.anaf.ro/anaf-oauth2/v1/authorize`',
  })
  @ApiQuery({ name: 'response_type', description: 'Must be "code"', example: 'code' })
  @ApiQuery({ name: 'client_id', description: 'OAuth client identifier registered in the portal', example: 'my-app-client-id' })
  @ApiQuery({ name: 'redirect_uri', description: 'Registered callback URL', example: 'http://localhost:3000/callback' })
  @ApiQuery({ name: 'state', required: false, description: 'Opaque value for CSRF protection, echoed back in the redirect' })
  @ApiQuery({ name: 'identity_id', required: false, description: 'Mock-only: pin the authorization to a specific signer identity ID' })
  @ApiQuery({ name: 'token_content_type', required: false, description: 'Mock-only: token format hint' })
  @ApiQuery({ name: 'simulate_esign', required: false, description: 'Mock-only: force an eSign failure. Values: ok (default), incorrect_credentials, network_issue, server_error' })
  @ApiResponse({ status: 302, description: 'Redirect to redirect_uri with code and state, or error and error_description' })
  @ApiResponse({ status: 400, description: 'Bad Request — invalid client or redirect_uri' })
  authorize(
    @Query() query: OAuthAuthorizeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    return this.authorizeInternal(query, response);
  }

  /**
   * Executes issueToken.
   * @param body Value for body.
   * @param authorizationHeader Value for authorizationHeader.
   * @param response Value for response.
   */
  @Post('token')
  @ApiOperation({
    summary: 'OAuth2 token endpoint',
    description:
      'Exchanges an authorization code (or refresh token) for an access token. ' +
      'Accepts `application/x-www-form-urlencoded` or JSON. Supports `grant_type`: `authorization_code` and `refresh_token`.\n\n' +
      '**Production URL:** `POST https://api.anaf.ro/anaf-oauth2/v1/token`',
  })
  @ApiHeader({ name: 'Authorization', required: false, description: 'Basic auth with client_id:client_secret, OR pass credentials in the body' })
  @ApiBody({
    description: 'Token request parameters',
    schema: {
      type: 'object',
      properties: {
        grant_type: { type: 'string', example: 'authorization_code', description: 'authorization_code or refresh_token' },
        code: { type: 'string', description: 'Authorization code from the /authorize redirect (required for authorization_code grant)' },
        redirect_uri: { type: 'string', description: 'Must match the redirect_uri used in /authorize' },
        refresh_token: { type: 'string', description: 'Refresh token (required for refresh_token grant)' },
        client_id: { type: 'string', description: 'Client ID (if not using Basic auth)' },
        client_secret: { type: 'string', description: 'Client secret (if not using Basic auth)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Token response — {access_token, refresh_token, token_type, expires_in, scope}' })
  @ApiResponse({ status: 400, description: 'Bad Request — invalid grant or missing parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid client credentials' })
  issueToken(
    @Body() body: Record<string, string | number | undefined>,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    return this.issueTokenInternal(body, authorizationHeader, response);
  }

  /**
   * Executes authorizeInternal.
   * @param query Value for query.
   * @param response Value for response.
   */
  private async authorizeInternal(
    query: OAuthAuthorizeQueryDto,
    response: Response,
  ): Promise<void> {
    const result = await this.commandBus.execute(
      new AuthorizeOAuthClientCommand(
        query.response_type,
        query.client_id,
        query.redirect_uri,
        query.state,
        query.identity_id,
      ),
    );

    if (!result.ok) {
      this.sendOAuthError(
        response,
        result.statusCode,
        result.error,
        result.description,
      );
      return;
    }

    const simulatedFailure = this.resolveSimulatedEsignFailure(
      query.simulate_esign,
    );
    if (simulatedFailure) {
      this.redirectWithOAuthError(
        response,
        query.redirect_uri,
        query.state,
        simulatedFailure.oauthError,
        simulatedFailure.description,
      );
      return;
    }

    response.redirect(302, result.redirectUrl);
  }

  /**
   * Executes issueTokenInternal.
   * @param body Value for body.
   * @param authorizationHeader Value for authorizationHeader.
   * @param response Value for response.
   */
  private async issueTokenInternal(
    body: Record<string, string | number | undefined>,
    authorizationHeader: string | undefined,
    response: Response,
  ): Promise<void> {
    const result = await this.commandBus.execute(
      new IssueOAuthTokenCommand(body, authorizationHeader),
    );

    if (!result.ok) {
      this.sendOAuthError(
        response,
        result.statusCode,
        result.error,
        result.description,
      );
      return;
    }

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.status(200).json(result.token);
  }

  /**
   * Executes sendOAuthError.
   * @param response Value for response.
   * @param statusCode Value for statusCode.
   * @param error Value for error.
   * @param description Value for description.
   */
  private sendOAuthError(
    response: Response,
    statusCode: number,
    error: string,
    description: string,
  ): void {
    if (statusCode === 401) {
      response.setHeader('WWW-Authenticate', 'Basic realm="ANAF OAuth2"');
    }

    const payload: SimulationTypes.OAuthErrorResponse = {
      error,
      error_description: description,
    };

    response.status(statusCode).json(payload);
  }

  /**
   * Executes resolveSimulatedEsignFailure.
   * @param mode Value for mode.
   * @returns The resolveSimulatedEsignFailure result.
   */
  private resolveSimulatedEsignFailure(
    mode?: string,
  ): SimulatedEsignFailure | undefined {
    const normalized = (mode ?? 'ok').trim().toLowerCase();
    if (!normalized || normalized === 'ok') {
      return undefined;
    }

    return OAuthCommandHttpController.ESIGN_FAILURE_PRESETS[normalized];
  }

  /**
   * Executes redirectWithOAuthError.
   * @param response Value for response.
   * @param redirectUri Value for redirectUri.
   * @param state Value for state.
   * @param error Value for error.
   * @param description Value for description.
   */
  private redirectWithOAuthError(
    response: Response,
    redirectUri: string,
    state: string | undefined,
    error: string,
    description: string,
  ): void {
    const redirectTarget = new URL(redirectUri);
    redirectTarget.searchParams.set('error', error);
    redirectTarget.searchParams.set('error_description', description);

    if (state) {
      redirectTarget.searchParams.set('state', state);
    }

    response.redirect(302, redirectTarget.toString());
  }
}
