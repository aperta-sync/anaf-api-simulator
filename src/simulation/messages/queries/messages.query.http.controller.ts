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
  ListaMesajePaginatieFacturaQueryDto,
  StareMesajQueryDto,
} from './messages.request.dto';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  GetEfacturaArchiveQuery,
  GetUploadStatusQuery,
  ListEfacturaMessagesQuery,
  ListMessagesPaginatedQuery,
} from '../../application/messages/messages.queries';
import { ValidateAuthorizationHeaderQuery } from '../../application/oauth/oauth.queries';
import { UploadStatusResult } from '../../application/messages/messages.handlers';
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

    this.assertDownloadAccess(auth, archiveResult.message);

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

  @Get('listaMesajePaginatieFactura')
  async listMessagesPaginated(
    @Query() query: ListaMesajePaginatieFacturaQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-wrong-certificate') wrongCertificateHeader?: string,
  ): Promise<SimulationTypes.MessageListPaginationResponse> {
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
      new ListMessagesPaginatedQuery(
        query.cif,
        query.startTime,
        query.endTime,
        query.pagina,
        query.filtru,
      ),
    );
  }

  @Get('stareMesaj')
  async getMessageState(
    @Query() query: StareMesajQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-invalid-xml') simulateInvalidXml?: string,
    @Headers('x-simulate-nok') simulateNok?: string,
    @Res() response?: Response,
  ): Promise<void> {
    await this.assertAuthorized(authorizationHeader);

    if (simulateInvalidXml?.toLowerCase() === 'true') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"',
        '  stare="XML cu erori nepreluat de sistem">',
        '  <Errors errorMessage="Simulated XML validation failure."/>',
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    if (simulateNok?.toLowerCase() === 'true') {
      // Real ANAF includes id_descarcare for nok (ZIP contains error details)
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"',
        `  stare="nok"`,
        `  id_descarcare="sim-nok-${Date.now()}">`,
        '  <Errors errorMessage="Simulated processing failure."/>',
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    const result: UploadStatusResult | undefined = await this.queryBus.execute(
      new GetUploadStatusQuery(query.id_incarcare),
    );

    if (!result) {
      // Real ANAF always returns HTTP 200 — status conveyed via XML stare attribute
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"\n' +
        '  stare="in prelucrare"/>',
      );
      return;
    }

    const errorsXml = result.errors.length > 0
      ? result.errors.map((e) => `  <Errors errorMessage="${this.escapeXmlAttr(e)}"/>`).join('\n') + '\n'
      : '';

    const idDescarcareAttr = result.idDescarcare
      ? `\n  id_descarcare="${result.idDescarcare}"`
      : '';

    const closingTag = errorsXml ? '>' : '/>';

    const xml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      `<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"`,
      `  stare="${result.stare}"${idDescarcareAttr}${closingTag}`,
      errorsXml ? `${errorsXml}</header>` : '',
    ].filter(Boolean).join('\n');

    response!.setHeader('Content-Type', 'application/xml');
    response!.status(200).send(xml);
  }

  private escapeXmlAttr(input: string): string {
    return input.replace(/[<>&"']/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return char;
      }
    });
  }

  /**
   * Enforces download access: user must own either the beneficiary or emitter CIF.
   */
  private assertDownloadAccess(
    auth: AccessTokenValidationResult,
    message: SimulationTypes.StoredInvoiceMessage,
  ): void {
    const strictMode =
      this.simulationEngine.getConfig().strictOwnershipValidation;
    if (!strictMode) {
      return;
    }

    const identityId = auth.identityId?.trim();
    if (!identityId) {
      const normalizedCif = this.simulationEngine.normalizeCui(message.cif_beneficiar).ro;
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: `User is not authorized to access data for CIF ${normalizedCif}.`,
      });
    }

    const beneficiaryCif = this.simulationEngine.normalizeCui(message.cif_beneficiar).ro;
    const emitterCif = this.simulationEngine.normalizeCui(message.cif_emitent).ro;

    const authorizedForBeneficiary = this.identityRegistry.isIdentityAuthorizedForCui(
      identityId,
      beneficiaryCif,
    );
    const authorizedForEmitter = this.identityRegistry.isIdentityAuthorizedForCui(
      identityId,
      emitterCif,
    );

    if (!authorizedForBeneficiary && !authorizedForEmitter) {
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: `User is not authorized to access data for CIF ${beneficiaryCif}.`,
      });
    }
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
