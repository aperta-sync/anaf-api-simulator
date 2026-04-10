import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Response } from 'express';
import {
  DescarcareQueryDto,
  ListaMesajeFacturaQueryDto,
} from './messages.request.dto';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  GetEfacturaArchiveQuery,
  ListEfacturaMessagesQuery,
} from '../../application/messages/messages.queries';
import { ValidateAuthorizationHeaderQuery } from '../../application/oauth/oauth.queries';
import { AccessTokenValidationResult } from '../../application/services/oauth-token.service';
import {
  MockIdentityRegistryService,
  SimulationEngineService,
} from '../../application/services';

/**
 * Handles read-only e-Factura message query endpoints.
 */
@Controller('prod/FCTEL/rest')
export class MessagesQueryHttpController {
  /**
   * Creates an instance of MessagesQueryHttpController.
   * @param queryBus Value for queryBus.
   * @param simulationEngine Value for simulationEngine.
   * @param identityRegistry Value for identityRegistry.
   */
  constructor(
    private readonly queryBus: QueryBus,
    private readonly simulationEngine: SimulationEngineService,
    private readonly identityRegistry: MockIdentityRegistryService,
  ) {}

  /**
   * Executes listMessages.
   * @param query Value for query.
   * @param authorizationHeader Value for authorizationHeader.
   * @param wrongCertificateHeader Value for wrongCertificateHeader.
   * @returns The listMessages result.
   */
  @Get('listaMesajeFactura')
  async listMessages(
    @Query() query: ListaMesajeFacturaQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-wrong-certificate') wrongCertificateHeader?: string,
  ): Promise<SimulationTypes.MessageListResponse> {
    const auth = await this.assertAuthorized(authorizationHeader);

    this.assertOwnershipAccess(auth, query.cif);

    if (wrongCertificateHeader?.toLowerCase() === 'true') {
      throw new ForbiddenException({
        code: 'ANAF_CUI_MISMATCH',
        message:
          'ANAF_CUI_MISMATCH: The digital certificate does not match the requested CIF.',
      });
    }

    return this.queryBus.execute(
      new ListEfacturaMessagesQuery(query.cif, query.zile ?? 7, query.filtru),
    );
  }

  /**
   * Executes download.
   * @param query Value for query.
   * @param authorizationHeader Value for authorizationHeader.
   * @param response Value for response.
   */
  @Get('descarcare')
  async download(
    @Query() query: DescarcareQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const auth = await this.assertAuthorized(authorizationHeader);

    const archiveResult = await this.queryBus.execute(
      new GetEfacturaArchiveQuery(query.id),
    );

    if (!archiveResult) {
      throw new NotFoundException({
        cod: 404,
        message: `No ANAF message found for id ${query.id}`,
      });
    }

    this.assertOwnershipAccess(auth, archiveResult.message.cif_beneficiar);

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="anaf-${archiveResult.message.id}.zip"`,
    );
    response.status(200).send(archiveResult.archive);
  }

  /**
   * Executes assertAuthorized.
   * @param authorizationHeader Value for authorizationHeader.
   * @returns The assertAuthorized result.
   */
  private async assertAuthorized(
    authorizationHeader: string | undefined,
  ): Promise<AccessTokenValidationResult> {
    const validation = await this.queryBus.execute(
      new ValidateAuthorizationHeaderQuery(authorizationHeader),
    );

    if (!validation.isValid) {
      throw new UnauthorizedException({
        error: validation.error,
        error_description: validation.errorDescription,
      });
    }

    return validation;
  }

  /**
   * Enforces CIF ownership checks when strict ownership validation is enabled.
   */
  private assertOwnershipAccess(
    auth: AccessTokenValidationResult,
    requestedCif: string,
  ): void {
    const strictMode =
      this.simulationEngine.getConfig().strictOwnershipValidation;
    if (!strictMode) {
      return;
    }

    const normalizedCif = this.simulationEngine.normalizeCui(requestedCif).ro;

    const identityId = auth.identityId?.trim();
    if (!identityId) {
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: `User is not authorized to access data for CIF ${normalizedCif}.`,
      });
    }

    const authorized = this.identityRegistry.isIdentityAuthorizedForCui(
      identityId,
      normalizedCif,
    );

    if (!authorized) {
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: `User is not authorized to access data for CIF ${normalizedCif}.`,
      });
    }
  }
}
