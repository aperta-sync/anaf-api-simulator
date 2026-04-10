import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
} from '@nestjs/common';
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
