import {
  Controller,
  Headers,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UploadInvoiceQueryDto } from './upload-invoice.request.dto';
import { UploadEfacturaInvoiceCommand } from '../../application/messages/messages.commands';
import {
  UploadInvoiceResult,
} from '../../application/messages/messages.handlers';
import { ValidateAuthorizationHeaderQuery } from '../../application/oauth/oauth.queries';
import {
  MockIdentityRegistryService,
  SimulationEngineService,
} from '../../application/services';
import { AnafRateLimitService } from '../../application/services/anaf-rate-limit.service';

const UPLOAD_NS = 'mfp:anaf:dgti:spv:respUploadFisier:v1';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const VALID_STANDARDS = ['UBL', 'CII', 'CN', 'RASP'];

/**
 * Handles e-Factura invoice upload command endpoints.
 */
@ApiTags('e-Factura / Upload')
@ApiBearerAuth('bearer')
@Controller('prod/FCTEL/rest')
export class MessagesCommandHttpController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly simulationEngine: SimulationEngineService,
    private readonly identityRegistry: MockIdentityRegistryService,
    private readonly rateLimitService: AnafRateLimitService,
  ) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload e-Factura XML invoice (B2B)',
    description:
      'Accepts a UBL/CII/CN/RASP XML body and registers it as an e-invoice. ' +
      'Returns an XML response with `ExecutionStatus="0"` (success) or `ExecutionStatus="1"` (error) — ' +
      'always HTTP 200 except for an empty body (HTTP 400).\n\n' +
      '**Production URL:** `POST https://api.anaf.ro/prod/FCTEL/rest/upload`',
  })
  @ApiQuery({ name: 'standard', description: 'Invoice XML standard. Accepted values: UBL, CII, CN, RASP', example: 'UBL' })
  @ApiQuery({ name: 'cif', description: 'Fiscal identification code of the sender (numeric or RO-prefixed)', example: '1234567' })
  @ApiQuery({ name: 'extern', required: false, description: 'Set to "DA" to mark the invoice as from an external (non-RO) counterpart' })
  @ApiQuery({ name: 'autofactura', required: false, description: 'Set to "DA" for self-billed invoices' })
  @ApiQuery({ name: 'executare', required: false, description: 'Set to "DA" for judicial enforcement invoices' })
  @ApiBody({ description: 'Raw UBL / CII / CN / RASP XML content', schema: { type: 'string', format: 'binary' } })
  @ApiHeader({ name: 'x-simulate-upload-error', required: false, description: 'Set to "true" to force a generic upload validation error (ExecutionStatus=1)' })
  @ApiHeader({ name: 'x-simulate-technical-error', required: false, description: 'Set to "true" to force a technical server error response (Returns HTTP 200 with XML ExecutionStatus=1, not a 500)' })
  @ApiHeader({ name: 'x-simulate-xml-validation-error', required: false, description: 'Set to "true" to simulate an XML schema validation failure (SAXParseException)' })
  @ApiHeader({ name: 'x-simulate-executare-registry', required: false, description: 'Set to "true" to simulate CIF not registered in the judicial enforcement registry' })
  @ApiResponse({ status: 200, description: 'XML response — ExecutionStatus="0" (success, includes index_incarcare) or ExecutionStatus="1" (error, includes error message)' })
  @ApiResponse({ status: 400, description: 'Bad Request — empty request body (JSON)' })
  async upload(
    @Query() query: UploadInvoiceQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-upload-error') simulateError: string | undefined,
    @Headers('x-simulate-technical-error') simulateTechnicalError: string | undefined,
    @Headers('x-simulate-xml-validation-error') simulateXmlValidation: string | undefined,
    @Headers('x-simulate-executare-registry') simulateExecutareRegistry: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.handleUpload(
      query, authorizationHeader, simulateError,
      simulateTechnicalError, simulateXmlValidation, simulateExecutareRegistry,
      req, res,
    );
  }

  @Post('uploadb2c')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Upload e-Factura XML invoice (B2C)',
    description:
      'Business-to-consumer variant of the upload endpoint. Identical validation rules and response shapes apply.\n\n' +
      '**Production URL:** `POST https://api.anaf.ro/prod/FCTEL/rest/uploadb2c`',
  })
  @ApiQuery({ name: 'standard', description: 'Invoice XML standard. Accepted values: UBL, CII, CN, RASP', example: 'UBL' })
  @ApiQuery({ name: 'cif', description: 'Fiscal identification code of the sender (numeric or RO-prefixed)', example: '1234567' })
  @ApiQuery({ name: 'extern', required: false, description: 'Set to "DA" to mark the invoice as from an external (non-RO) counterpart' })
  @ApiQuery({ name: 'autofactura', required: false, description: 'Set to "DA" for self-billed invoices' })
  @ApiQuery({ name: 'executare', required: false, description: 'Set to "DA" for judicial enforcement invoices' })
  @ApiBody({ description: 'Raw UBL / CII / CN / RASP XML content', schema: { type: 'string', format: 'binary' } })
  @ApiHeader({ name: 'x-simulate-upload-error', required: false, description: 'Set to "true" to force a generic upload validation error (ExecutionStatus=1)' })
  @ApiHeader({ name: 'x-simulate-technical-error', required: false, description: 'Set to "true" to force a technical server error response (Returns HTTP 200 with XML ExecutionStatus=1, not a 500)' })
  @ApiHeader({ name: 'x-simulate-xml-validation-error', required: false, description: 'Set to "true" to simulate an XML schema validation failure (SAXParseException)' })
  @ApiHeader({ name: 'x-simulate-executare-registry', required: false, description: 'Set to "true" to simulate CIF not registered in the judicial enforcement registry' })
  @ApiResponse({ status: 200, description: 'XML response — ExecutionStatus="0" (success) or ExecutionStatus="1" (error)' })
  @ApiResponse({ status: 400, description: 'Bad Request — empty request body (JSON)' })
  async uploadB2c(
    @Query() query: UploadInvoiceQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-upload-error') simulateError: string | undefined,
    @Headers('x-simulate-technical-error') simulateTechnicalError: string | undefined,
    @Headers('x-simulate-xml-validation-error') simulateXmlValidation: string | undefined,
    @Headers('x-simulate-executare-registry') simulateExecutareRegistry: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.handleUpload(
      query, authorizationHeader, simulateError,
      simulateTechnicalError, simulateXmlValidation, simulateExecutareRegistry,
      req, res,
    );
  }

  private async handleUpload(
    query: UploadInvoiceQueryDto,
    authorizationHeader: string | undefined,
    simulateError: string | undefined,
    simulateTechnicalError: string | undefined,
    simulateXmlValidation: string | undefined,
    simulateExecutareRegistry: string | undefined,
    req: Request,
    res: Response,
  ): Promise<void> {
    const now = new Date();

    // Auth check — ANAF returns XML 200 on auth failure, not HTTP 401/403
    const validation = await this.queryBus.execute(
      new ValidateAuthorizationHeaderQuery(authorizationHeader),
    );

    if (!validation.isValid) {
      this.sendUploadError(res, now, 'Nu exista niciun CIF pentru care sa aveti drept in SPV');
      return;
    }

    // Non-numeric CIF — ANAF returns XML 200: "CIF introdus= X nu este un numar"
    const numericCif = query.cif.replace(/^RO/i, '');
    if (!/^\d+$/.test(numericCif)) {
      this.sendUploadError(res, now, `CIF introdus= ${query.cif} nu este un numar`);
      return;
    }

    // Invalid standard — ANAF returns XML 200 with allowed values list
    if (!VALID_STANDARDS.includes(query.standard.toUpperCase())) {
      this.sendUploadError(res, now, 'Valorile acceptate pentru parametrul standard sunt UBL, CN, CII sau RASP');
      return;
    }

    // Ownership check — ANAF returns XML 200 with specific error message
    const ownershipError = this.checkOwnershipAccess(validation, query.cif);
    if (ownershipError) {
      this.sendUploadError(res, now, ownershipError);
      return;
    }

    // Rate limit: 1000 RASP uploads/day/CUI
    if (query.standard.toUpperCase() === 'RASP') {
      const rl = await this.rateLimitService.checkUploadRasp(query.cif);
      if (!rl.allowed) {
        this.sendUploadError(
          res,
          now,
          `S-au incarcat deja ${rl.limit} de mesaje de tip RASP pentru cui=${query.cif} in cursul zilei`,
        );
        return;
      }
    }

    // Validate optional params: extern, autofactura, executare must be "DA" if present
    if (query.extern && query.extern.toUpperCase() !== 'DA') {
      this.sendUploadError(res, now, 'Daca parametrul extern trebuie completat, valoarea acceptata este DA');
      return;
    }
    if (query.autofactura && query.autofactura.toUpperCase() !== 'DA') {
      this.sendUploadError(res, now, 'Daca parametrul autofacturare trebuie completat, valoarea acceptata este DA');
      return;
    }
    if (query.executare && query.executare.toUpperCase() !== 'DA') {
      this.sendUploadError(res, now, 'Daca parametrul executare trebuie completat, valoarea acceptata este DA');
      return;
    }

    // Simulation header: executare registry check
    if (simulateExecutareRegistry?.toLowerCase() === 'true') {
      this.sendUploadError(
        res,
        now,
        `CIF introdus= ${query.cif} nu este inregistrat in Registrul RO e-Factura executari silite`,
      );
      return;
    }

    // Simulation header: generic upload error
    if (simulateError?.toLowerCase() === 'true') {
      this.sendUploadError(res, now, 'Simulated upload validation error.');
      return;
    }

    // Simulation header: technical error
    if (simulateTechnicalError?.toLowerCase() === 'true') {
      this.sendUploadError(res, now, 'A aparut o eroare tehnica. Cod: SIM-001');
      return;
    }

    const xmlContent = await this.readRawBody(req);

    // Empty body — ANAF returns HTTP 400 JSON, not XML
    if (xmlContent.trim().length === 0) {
      res.status(400).json({
        timestamp: this.formatAnafTimestamp(now),
        status: 400,
        error: 'Bad Request',
        message: 'Trebuie sa aveti atasat in request un fisier de tip xml',
      });
      return;
    }

    if (Buffer.byteLength(xmlContent, 'utf-8') > MAX_UPLOAD_BYTES) {
      this.sendUploadError(res, now, 'Marime fisier transmis mai mare de 10 MB.');
      return;
    }

    // Simulation header: XML validation failure
    if (simulateXmlValidation?.toLowerCase() === 'true') {
      this.sendUploadError(
        res,
        now,
        'Fisierul transmis nu este valid. org.xml.sax.SAXParseException; lineNumber: 1; columnNumber: 1; cvc-elt.1.a: Cannot find the declaration of element \'Invoice1\'.',
      );
      return;
    }

    const result = await this.commandBus.execute<
      UploadEfacturaInvoiceCommand,
      UploadInvoiceResult
    >(new UploadEfacturaInvoiceCommand(query.cif, query.standard, xmlContent));

    const successXml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      `<header xmlns="${UPLOAD_NS}"`,
      `  dateResponse="${result.dateResponse}"`,
      '  ExecutionStatus="0"',
      `  index_incarcare="${result.indexIncarcare}"/>`,
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(successXml);
  }

  /**
   * Sends an ANAF-format upload error XML (HTTP 200, ExecutionStatus="1").
   */
  private sendUploadError(res: Response, date: Date, errorMessage: string): void {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      `<header xmlns="${UPLOAD_NS}"`,
      `  dateResponse="${this.formatAnafDate(date)}"`,
      '  ExecutionStatus="1">',
      `  <Errors errorMessage="${this.escapeXmlAttr(errorMessage)}"/>`,
      '</header>',
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(xml);
  }

  /**
   * Checks CIF ownership when strict mode is enabled.
   * Returns an error message string if denied, or null if access is allowed.
   */
  private checkOwnershipAccess(
    auth: { identityId?: string },
    requestedCif: string,
  ): string | null {
    const strictMode =
      this.simulationEngine.getConfig().strictOwnershipValidation;
    if (!strictMode) {
      return null;
    }

    const normalizedCif = this.simulationEngine.normalizeCui(requestedCif).ro;
    const identityId = auth.identityId?.trim();

    if (!identityId) {
      return `Nu aveti drept in SPV pentru CIF=${normalizedCif}`;
    }

    const authorized = this.identityRegistry.isIdentityAuthorizedForCui(
      identityId,
      normalizedCif,
    );

    if (!authorized) {
      return `Nu aveti drept in SPV pentru CIF=${normalizedCif}`;
    }

    return null;
  }

  private readRawBody(req: Request): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes <= MAX_UPLOAD_BYTES + 1) {
          chunks.push(chunk);
        }
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  private formatAnafDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}` +
      `${pad(date.getMonth() + 1)}` +
      `${pad(date.getDate())}` +
      `${pad(date.getHours())}` +
      `${pad(date.getMinutes())}`
    );
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

  private formatAnafTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }
}
