import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { AnafRateLimitService } from '../../application/services/anaf-rate-limit.service';

const STARE_MESAJ_NS = 'mfp:anaf:dgti:efactura:stareMesajFactura:v1';
const VALID_FILTERS = ['P', 'T', 'E', 'R'];

/**
 * Handles read-only e-Factura message query endpoints.
 */
@ApiTags('e-Factura / Messages')
@ApiBearerAuth('bearer')
@Controller('prod/FCTEL/rest')
export class MessagesQueryHttpController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly simulationEngine: SimulationEngineService,
    private readonly identityRegistry: MockIdentityRegistryService,
    private readonly rateLimitService: AnafRateLimitService,
  ) {}

  // ====================================================================
  // GET /listaMesajeFactura
  // ====================================================================

  @Get('listaMesajeFactura')
  @ApiOperation({
    summary: 'List e-Factura messages (simple)',
    description:
      'Returns up to 500 messages for the given CIF within a rolling window of 1–60 days. ' +
      'When more than 500 messages exist, ANAF instructs the caller to use the paginated endpoint.\n\n' +
      '**Rate limit:** 1 500 requests / day / CUI\n\n' +
      '**Production URL:** `GET https://api.anaf.ro/prod/FCTEL/rest/listaMesajeFactura`',
  })
  @ApiQuery({ name: 'cif', description: 'Company fiscal identification code (numeric or RO-prefixed)', example: '1234567' })
  @ApiQuery({ name: 'zile', description: 'Number of days to look back (1–60)', example: '30' })
  @ApiQuery({ name: 'filtru', required: false, description: 'Message type filter. Accepted values: P (received), T (transmitted), E (errors), R (corrections)' })
  @ApiHeader({ name: 'x-simulate-no-spv', required: false, description: 'Set to "true" to simulate the identity having no SPV rights' })
  @ApiHeader({ name: 'x-simulate-wrong-certificate', required: false, description: 'Set to "true" to simulate a certificate/CIF mismatch (403 ANAF_CUI_MISMATCH)' })
  @ApiResponse({ status: 200, description: 'JSON — message array or {eroare, titlu} error object' })
  @ApiResponse({ status: 400, description: 'Bad Request — missing required parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid bearer token' })
  async listMessages(
    @Query() query: ListaMesajeFacturaQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-wrong-certificate') wrongCertificateHeader?: string,
    @Headers('x-simulate-no-spv') simulateNoSpv?: string,
    @Res() response?: Response,
  ): Promise<void> {
    // Missing mandatory params → HTTP 400 JSON
    if (!query.cif || !query.zile) {
      response!.status(400).json({
        timestamp: this.formatAnafTimestamp(new Date()),
        status: 400,
        error: 'Bad Request',
        message: 'Parametrii zile si cif sunt obligatorii',
      });
      return;
    }

    // Auth
    const auth = await this.assertAuthorized(authorizationHeader);

    // Simulation header: no SPV rights at all
    if (simulateNoSpv?.toLowerCase() === 'true') {
      response!.status(200).json({
        eroare: 'Nu exista niciun CIF pentru care sa aveti drept in SPV',
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric CIF (RO prefix is allowed)
    const numericCif = query.cif.replace(/^RO/i, '');
    if (!/^\d+$/.test(numericCif)) {
      response!.status(200).json({
        eroare: `CIF introdus= ${query.cif} nu este un numar`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric zile
    if (!/^\d+$/.test(query.zile)) {
      response!.status(200).json({
        eroare: `Numarul de zile introdus= ${query.zile} nu este un numar intreg`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    const zile = parseInt(query.zile, 10);

    // zile out of range
    if (zile < 1 || zile > 60) {
      response!.status(200).json({
        eroare: 'Numarul de zile trebuie sa fie intre 1 si 60',
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Invalid filtru
    if (query.filtru !== undefined && query.filtru !== '') {
      const normalizedFiltru = query.filtru.trim().toUpperCase();
      if (!VALID_FILTERS.includes(normalizedFiltru)) {
        response!.status(200).json({
          eroare: 'Valorile acceptate pentru parametrul filtru sunt E, T, P sau R',
          titlu: 'Lista Mesaje',
        });
        return;
      }
      query.filtru = normalizedFiltru;
    }

    this.assertOwnershipAccess(auth, query.cif);

    if (wrongCertificateHeader?.toLowerCase() === 'true') {
      throw new ForbiddenException({
        code: 'ANAF_CUI_MISMATCH',
        message:
          'ANAF_CUI_MISMATCH: The digital certificate does not match the requested CIF.',
      });
    }

    // Rate limit: 1500 queries/day/CUI for simple list
    const rl = await this.rateLimitService.checkListaSimple(query.cif);
    if (!rl.allowed) {
      response!.status(200).json({
        eroare: `S-au facut deja ${rl.limit} interogari de lista mesaje de catre utilizator in cursul zilei`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    const result: SimulationTypes.MessageListResponse = await this.queryBus.execute(
      new ListEfacturaMessagesQuery(query.cif, zile, query.filtru),
    );

    // No messages → ANAF returns specific error
    if (!result.mesaje || result.mesaje.length === 0) {
      response!.status(200).json({
        eroare: `Nu exista mesaje in ultimele ${zile} zile`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Over 500 messages → ANAF tells user to use paginated endpoint
    if (result.mesaje.length > 500) {
      response!.status(200).json({
        eroare: 'Lista de mesaje este mai mare decat numarul de 500 elemente permise in pagina. Folositi endpoint-ul cu paginatie.',
        titlu: 'Lista Mesaje',
      });
      return;
    }

    response!.status(200).json(result);
  }

  // ====================================================================
  // GET /descarcare
  // ====================================================================

  @Get('descarcare')
  @ApiOperation({
    summary: 'Download invoice ZIP archive',
    description:
      'Downloads the ZIP archive for a previously uploaded invoice identified by its `id` (the `index_incarcare` value). ' +
      'Returns the binary ZIP file on success.\n\n' +
      '**Rate limit:** 10 downloads / day / message ID\n\n' +
      '**Production URL:** `GET https://api.anaf.ro/prod/FCTEL/rest/descarcare`',
  })
  @ApiQuery({ name: 'id', description: 'The upload index (index_incarcare) returned by the /upload endpoint', example: '5000000001' })
  @ApiHeader({ name: 'x-simulate-no-download-rights', required: false, description: 'Set to "true" to simulate the identity lacking download rights for this invoice' })
  @ApiResponse({ status: 200, description: 'Success — application/zip binary archive, or JSON {eroare, titlu} on error' })
  @ApiResponse({ status: 400, description: 'Bad Request — missing id parameter' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid bearer token' })
  async download(
    @Query() query: DescarcareQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-no-download-rights') simulateNoDownloadRights?: string,
    @Res() response?: Response,
  ): Promise<void> {
    // Missing mandatory param → HTTP 400
    if (!query.id) {
      response!.status(400).json({
        timestamp: this.formatAnafTimestamp(new Date()),
        status: 400,
        error: 'Bad Request',
        message: 'Parametrul id este obligatoriu',
      });
      return;
    }

    const auth = await this.assertAuthorized(authorizationHeader);

    // Simulation header: non-numeric id (ANAF rejects non-numeric, but our mock uses SIM-xxx IDs)
    if (!/^\d+$/.test(query.id) && !/^SIM-/.test(query.id)) {
      response!.status(200).json({
        eroare: `Id descarcare introdus= ${query.id} nu este un numar intreg`,
        titlu: 'Descarcare mesaj',
      });
      return;
    }

    // Simulation header: no download rights
    if (simulateNoDownloadRights?.toLowerCase() === 'true') {
      response!.status(200).json({
        eroare: 'Nu aveti dreptul sa descarcati acesta factura',
        titlu: 'Descarcare mesaj',
      });
      return;
    }

    // Rate limit: 10 downloads/day per specific message id
    const rl = await this.rateLimitService.checkDescarcare(query.id);
    if (!rl.allowed) {
      response!.status(200).json({
        eroare: `S-au facut deja ${rl.limit} descarcari de mesaj in cursul zilei`,
        titlu: 'Descarcare mesaj',
      });
      return;
    }

    const archiveResult = await this.queryBus.execute(
      new GetEfacturaArchiveQuery(query.id),
    );

    if (!archiveResult) {
      response!.status(200).json({
        eroare: `Pentru id=${query.id} nu exista inregistrata nici o factura`,
        titlu: 'Descarcare mesaj',
      } satisfies SimulationTypes.DescarcareErrorResponse);
      return;
    }

    this.assertDownloadAccess(auth, archiveResult.message);

    response!.setHeader('Content-Type', 'application/zip');
    response!.setHeader(
      'Content-Disposition',
      `attachment; filename="anaf-${archiveResult.message.id}.zip"`,
    );
    response!.status(200).send(archiveResult.archive);
  }

  // ====================================================================
  // GET /listaMesajePaginatieFactura
  // ====================================================================

  @Get('listaMesajePaginatieFactura')
  @ApiOperation({
    summary: 'List e-Factura messages (paginated)',
    description:
      'Returns messages for the given CIF within a Unix-millisecond timestamp range, with page-based pagination. ' +
      'The `startTime` must not be older than 60 days from the current moment.\n\n' +
      '**Rate limit:** 100 000 requests / day / CUI\n\n' +
      '**Production URL:** `GET https://api.anaf.ro/prod/FCTEL/rest/listaMesajePaginatieFactura`',
  })
  @ApiQuery({ name: 'cif', description: 'Company fiscal identification code (numeric or RO-prefixed)', example: '1234567' })
  @ApiQuery({ name: 'startTime', description: 'Start of the time range as a Unix timestamp in milliseconds. Must not be older than 60 days.', example: '1700000000000' })
  @ApiQuery({ name: 'endTime', description: 'End of the time range as a Unix timestamp in milliseconds. Must be after startTime and not in the future.', example: '1700086400000' })
  @ApiQuery({ name: 'pagina', description: 'Page number (1-based)', example: '1' })
  @ApiQuery({ name: 'filtru', required: false, description: 'Message type filter. Accepted values: P, T, E, R' })
  @ApiHeader({ name: 'x-simulate-no-spv', required: false, description: 'Set to "true" to simulate no SPV rights' })
  @ApiHeader({ name: 'x-simulate-wrong-certificate', required: false, description: 'Set to "true" to simulate certificate/CIF mismatch (403)' })
  @ApiResponse({ status: 200, description: 'JSON — paginated message list or {eroare, titlu} error object' })
  @ApiResponse({ status: 400, description: 'Bad Request — missing required parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid bearer token' })
  async listMessagesPaginated(
    @Query() query: ListaMesajePaginatieFacturaQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-wrong-certificate') wrongCertificateHeader?: string,
    @Headers('x-simulate-no-spv') simulateNoSpv?: string,
    @Res() response?: Response,
  ): Promise<void> {
    // Missing mandatory params → HTTP 400
    if (!query.cif || !query.startTime || !query.endTime || !query.pagina) {
      response!.status(400).json({
        timestamp: this.formatAnafTimestamp(new Date()),
        status: 400,
        error: 'Bad Request',
        message: 'Parametrii startTime, endTime, cif si pagina sunt obligatorii',
      });
      return;
    }

    const auth = await this.assertAuthorized(authorizationHeader);

    // Simulation header: no SPV rights at all
    if (simulateNoSpv?.toLowerCase() === 'true') {
      response!.status(200).json({
        eroare: 'Nu exista niciun CIF pentru care sa aveti drept in SPV',
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric CIF (RO prefix is allowed)
    const numericCifPag = query.cif.replace(/^RO/i, '');
    if (!/^\d+$/.test(numericCifPag)) {
      response!.status(200).json({
        eroare: `CIF introdus= ${query.cif} nu este un numar sau nu are o valoare acceptata de sistem`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric startTime
    if (!/^\d+$/.test(query.startTime)) {
      response!.status(200).json({
        eroare: `startTime = ${query.startTime} nu este un numar sau nu are o valoare acceptata de sistem`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric endTime
    if (!/^\d+$/.test(query.endTime)) {
      response!.status(200).json({
        eroare: `endTime = ${query.endTime} nu este un numar sau nu are o valoare acceptata de sistem`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Non-numeric pagina
    if (!/^\d+$/.test(query.pagina)) {
      response!.status(200).json({
        eroare: `pagina = ${query.pagina} nu este un numar sau nu are o valoare acceptata de sistem`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    const startTime = parseInt(query.startTime, 10);
    const endTime = parseInt(query.endTime, 10);
    const pagina = parseInt(query.pagina, 10);

    // Invalid filtru
    if (query.filtru !== undefined && query.filtru !== '') {
      const normalizedFiltru = query.filtru.trim().toUpperCase();
      if (!VALID_FILTERS.includes(normalizedFiltru)) {
        response!.status(200).json({
          eroare: 'Valorile acceptate pentru parametrul filtru sunt E, T, P sau R',
          titlu: 'Lista Mesaje',
        });
        return;
      }
      query.filtru = normalizedFiltru;
    }

    this.assertOwnershipAccess(auth, query.cif);

    if (wrongCertificateHeader?.toLowerCase() === 'true') {
      throw new ForbiddenException({
        code: 'ANAF_CUI_MISMATCH',
        message:
          'ANAF_CUI_MISMATCH: The digital certificate does not match the requested CIF.',
      });
    }

    // Rate limit: 100,000 queries/day/CUI for paginated list
    const rl = await this.rateLimitService.checkListaPaginated(query.cif);
    if (!rl.allowed) {
      response!.status(200).json({
        eroare: `S-au facut deja ${rl.limit} interogari de lista mesaje de catre utilizator in cursul zilei`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Validate 60-day startTime constraint
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    if (startTime < sixtyDaysAgo) {
      const formatted = this.formatAnafDateFromTimestamp(startTime);
      response!.status(200).json({
        eroare: `startTime = ${formatted} nu poate fi mai vechi de 60 de zile fata de momentul requestului`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Validate endTime not before startTime
    if (endTime <= startTime) {
      response!.status(200).json({
        eroare: `endTime = ${this.formatAnafDateFromTimestamp(endTime)} nu poate fi <= startTime = ${this.formatAnafDateFromTimestamp(startTime)}`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // Validate endTime not in the future
    if (endTime > Date.now()) {
      response!.status(200).json({
        eroare: `endTime = ${this.formatAnafDateFromTimestamp(endTime)} nu poate in viitor fata de momentul requestului`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    const result: SimulationTypes.MessageListPaginationResponse = await this.queryBus.execute(
      new ListMessagesPaginatedQuery(
        query.cif,
        startTime,
        endTime,
        pagina,
        query.filtru,
      ),
    );

    // Page exceeds total pages
    if (pagina > result.numar_total_pagini && result.numar_total_pagini > 0) {
      response!.status(200).json({
        eroare: `Pagina solicitata ${pagina} este mai mare decat numarul toatal de pagini ${result.numar_total_pagini}`,
        titlu: 'Lista Mesaje',
      });
      return;
    }

    // No messages in interval
    if (!result.mesaje || result.mesaje.length === 0) {
      response!.status(200).json({
        eroare: 'Nu exista mesaje in intervalul selectat',
        titlu: 'Lista Mesaje',
      });
      return;
    }

    response!.status(200).json(result);
  }

  // ====================================================================
  // GET /stareMesaj
  // ====================================================================

  @Get('stareMesaj')
  @ApiOperation({
    summary: 'Get upload status (stare mesaj)',
    description:
      'Returns an XML response with the current processing state (`stare`) of a previously uploaded invoice. ' +
      'Possible `stare` values: `ok`, `nok`, `in prelucrare`, `XML cu erori nepreluat de sistem`.\n\n' +
      '**Rate limit:** 100 requests / day / id_incarcare\n\n' +
      '**Production URL:** `GET https://api.anaf.ro/prod/FCTEL/rest/stareMesaj`',
  })
  @ApiQuery({ name: 'id_incarcare', description: 'The upload index returned by the /upload endpoint', example: '5000000001' })
  @ApiHeader({ name: 'x-simulate-invalid-xml', required: false, description: 'Set to "true" to simulate the invoice being in "XML cu erori nepreluat de sistem" state' })
  @ApiHeader({ name: 'x-simulate-nok', required: false, description: 'Set to "true" to simulate a "nok" (processing failure) state' })
  @ApiHeader({ name: 'x-simulate-no-spv', required: false, description: 'Set to "true" to simulate the identity having no SPV rights' })
  @ApiHeader({ name: 'x-simulate-no-query-rights', required: false, description: 'Set to "true" to simulate the identity lacking query rights for this id_incarcare' })
  @ApiResponse({ status: 200, description: 'XML — <header> with stare attribute and optional id_descarcare or <Errors> element' })
  @ApiResponse({ status: 400, description: 'Bad Request — missing id_incarcare parameter' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid bearer token' })
  async getMessageState(
    @Query() query: StareMesajQueryDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-invalid-xml') simulateInvalidXml?: string,
    @Headers('x-simulate-nok') simulateNok?: string,
    @Headers('x-simulate-no-spv') simulateNoSpv?: string,
    @Headers('x-simulate-no-query-rights') simulateNoQueryRights?: string,
    @Res() response?: Response,
  ): Promise<void> {
    // Missing mandatory param → HTTP 400 JSON
    if (!query.id_incarcare) {
      response!.status(400).json({
        timestamp: this.formatAnafTimestamp(new Date()),
        status: 400,
        error: 'Bad Request',
        message: 'Parametrul id_incarcare este obligatoriu',
      });
      return;
    }

    await this.assertAuthorized(authorizationHeader);

    // Simulation header: no SPV rights at all
    if (simulateNoSpv?.toLowerCase() === 'true') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}">`,
        '  <Errors errorMessage="Nu exista niciun CIF petru care sa aveti drept"/>',
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    // Non-numeric id_incarcare → XML 200 error
    if (!/^\d+$/.test(query.id_incarcare)) {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}">`,
        `  <Errors errorMessage="Id_incarcare introdus= ${this.escapeXmlAttr(query.id_incarcare)} nu este un numar intreg"/>`,
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    // Simulation header: no query rights for this specific id
    if (simulateNoQueryRights?.toLowerCase() === 'true') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}">`,
        `  <Errors errorMessage="Nu aveti dreptul de inteorgare pentru id_incarcare= ${query.id_incarcare}"/>`,
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    // Rate limit: 100 queries/day per specific id_incarcare
    const rl = await this.rateLimitService.checkStare(query.id_incarcare);
    if (!rl.allowed) {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}">`,
        `  <Errors errorMessage="S-au facut deja ${rl.limit} descarcari de mesaj in cursul zilei"/>`,
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    if (simulateInvalidXml?.toLowerCase() === 'true') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}"`,
        '  stare="XML cu erori nepreluat de sistem">',
        '  <Errors errorMessage="Simulated XML validation failure."/>',
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
      return;
    }

    if (simulateNok?.toLowerCase() === 'true') {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}"`,
        '  stare="nok">',
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

    // Not found → ANAF returns HTTP 200 with <Errors> element
    if (!result) {
      const xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<header xmlns="${STARE_MESAJ_NS}">`,
        `  <Errors errorMessage="Nu exista factura cu id_incarcare= ${this.escapeXmlAttr(query.id_incarcare)}"/>`,
        '</header>',
      ].join('\n');
      response!.setHeader('Content-Type', 'application/xml');
      response!.status(200).send(xml);
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
      `<header xmlns="${STARE_MESAJ_NS}"`,
      `  stare="${result.stare}"${idDescarcareAttr}${closingTag}`,
      errorsXml ? `${errorsXml}</header>` : '',
    ].filter(Boolean).join('\n');

    response!.setHeader('Content-Type', 'application/xml');
    response!.status(200).send(xml);
  }

  // ====================================================================
  // Private helpers
  // ====================================================================

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

  private formatAnafDateFromTimestamp(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

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
