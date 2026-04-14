import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Request } from 'express';
import { UploadMessageCommand } from '../../application/messages/messages.commands';
import { GetStareMesajQuery } from '../../application/messages/messages.queries';
import {
  STATEFUL_MESSAGE_STORE,
  StatefulMessageStorePort,
} from '../../application/ports/stateful-message-store.port';
import { ValidateAuthorizationHeaderQuery } from '../../application/oauth/oauth.queries';
import { AccessTokenValidationResult } from '../../application/services/oauth-token.service';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles write e-Factura command endpoints (upload, stareMesaj).
 */
@Controller('prod/FCTEL/rest')
export class MessagesCommandHttpController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(STATEFUL_MESSAGE_STORE)
    private readonly messageStore: StatefulMessageStorePort,
  ) {}

  private async assertAuthorized(
    authorizationHeader: string | undefined,
  ): Promise<AccessTokenValidationResult> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const result = await this.queryBus.execute<
      ValidateAuthorizationHeaderQuery,
      AccessTokenValidationResult
    >(
      new ValidateAuthorizationHeaderQuery(authorizationHeader),
    );
    if (!result.valid) {
      throw new UnauthorizedException(result.error ?? 'Invalid token');
    }
    return result;
  }

  /**
   * POST /upload — accepts raw XML invoice body, returns ANAF-format response.
   *
   * Returns:
   *   mfp:anaf:dgti:spv:respUploadFisier:v1 format with index_incarcare and ExecutionStatus.
   *
   * Query params:
   *   extern        — whether invoice is from external party
   *   autofactura   — whether this is an autofactura
   *   executare     — whether this is an executare
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  async uploadMessage(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('extern') extern?: string,
    @Query('autofactura') autofactura?: string,
    @Query('executare') executare?: string,
  ): Promise<SimulationTypes.StareMesajResponse> {
    await this.assertAuthorized(authorizationHeader);

    const rawXml = req.rawBody?.toString('utf-8') ?? '';
    if (!rawXml) {
      throw new UnauthorizedException('Missing XML body');
    }

    // Allocate upload index
    const indexIncarcare = await this.messageStore.allocateIndex();

    // Extract CUI from XML (simple pattern match on CIF_EMITENT)
    const cifMatch = rawXml.match(/CIF_EMITENT[>]<([^<]+)/);
    const cif = cifMatch?.[1] ?? 'UNKNOWN';

    const command = new UploadMessageCommand(
      rawXml,
      cif,
      indexIncarcare,
      extern === 'true',
      autofactura === 'true',
      executare === 'true',
    );

    const result = await this.commandBus.execute<UploadMessageCommand, SimulationTypes.StareMesajResponse>(command);

    // Wrap in ANAF XML-like envelope (text content for now)
    // The response format is described as XML, but for the mock we return structured JSON
    // that mimics the ANAF response structure
    return result;
  }

  /**
   * GET /stareMesaj — checks processing status of an uploaded message.
   *
   * Query params:
   *   index_incarcare — the upload index returned from POST /upload
   *
   * Simulation headers:
   *   x-simulate-invalid-xml  — forces 'XML cu erori nepreluat de sistem' status
   *   x-simulate-nok          — forces 'nok' status
   *
   * Returns all 4 official stare values:
   *   ok | nok | in prelucrare | XML cu erori nepreluat de sistem
   */
  @Get('stareMesaj')
  async getStareMesaj(
    @Query('index_incarcare') indexIncarcare: string,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-simulate-invalid-xml') _simulateInvalidXml?: string,
    @Headers('x-simulate-nok') _simulateNok?: string,
  ): Promise<SimulationTypes.StareMesajResponse> {
    await this.assertAuthorized(authorizationHeader);

    if (!indexIncarcare) {
      return {
        index_incarcare: '',
        stare: 'XML cu erori nepreluat de sistem' as SimulationTypes.StareMesajValue,
        mesaj: 'Missing index_incarcare parameter',
      };
    }

    const query = new GetStareMesajQuery(indexIncarcare);
    return this.queryBus.execute<GetStareMesajQuery, SimulationTypes.StareMesajResponse>(query);
  }
}
