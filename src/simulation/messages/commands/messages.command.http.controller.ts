import {
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Request, Response } from 'express';
import { UploadInvoiceQueryDto } from './upload-invoice.request.dto';
import { UploadEfacturaInvoiceCommand } from '../../application/messages/messages.commands';
import {
  UploadInvoiceResult,
} from '../../application/messages/messages.handlers';
import { ValidateAuthorizationHeaderQuery } from '../../application/oauth/oauth.queries';
import { AccessTokenValidationResult } from '../../application/services/oauth-token.service';
import {
  MockIdentityRegistryService,
  SimulationEngineService,
} from '../../application/services';

/**
 * Handles e-Factura invoice upload command endpoints.
 */
@Controller('prod/FCTEL/rest')
export class MessagesCommandHttpController {
  /**
   * Creates an instance of MessagesCommandHttpController.
   * @param commandBus Value for commandBus.
   * @param queryBus Value for queryBus.
   * @param simulationEngine Value for simulationEngine.
   * @param identityRegistry Value for identityRegistry.
   */
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly simulationEngine: SimulationEngineService,
    private readonly identityRegistry: MockIdentityRegistryService,
  ) {}

  /**
   * Accepts a raw XML invoice upload and returns an ANAF-format XML response.
   * @param query Value for query.
   * @param authorizationHeader Value for authorizationHeader.
   * @param simulateError Value for simulateError.
   * @param req Value for req.
   * @param res Value for res.
   */
  @Post('upload')
  async upload(
    @Query() query: UploadInvoiceQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-upload-error') simulateError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const auth = await this.assertAuthorized(authorizationHeader);

    this.assertOwnershipAccess(auth, query.cif);

    if (simulateError?.toLowerCase() === 'true') {
      const errorXml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1"',
        '  ExecutionStatus="1">',
        '  <Errors errorMessage="Simulated upload validation error."/>',
        '</header>',
      ].join('\n');

      res.setHeader('Content-Type', 'application/xml');
      res.status(200).send(errorXml);
      return;
    }

    const xmlContent = await this.readRawBody(req);

    const result = await this.commandBus.execute<
      UploadEfacturaInvoiceCommand,
      UploadInvoiceResult
    >(new UploadEfacturaInvoiceCommand(query.cif, query.standard, xmlContent));

    const successXml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1"',
      `  dateResponse="${result.dateResponse}"`,
      '  ExecutionStatus="0"',
      `  index_incarcare="${result.indexIncarcare}"/>`,
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(successXml);
  }

  /**
   * Validates the authorization header and returns the token validation result.
   * @param authorizationHeader Value for authorizationHeader.
   * @returns The token validation result.
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

  /**
   * Reads the raw request body as a UTF-8 string.
   * @param req Value for req.
   * @returns The raw body content.
   */
  private readRawBody(req: Request): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}
