import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Response } from 'express';
import { LookupVatQuery } from '../../application/vat/vat.queries';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles VAT registry read/query endpoints.
 */
@Controller('api/PlatitorTvaRest/v9')
export class VatQueryHttpController {
  /**
   * Creates an instance of VatQueryHttpController.
   * @param queryBus Value for queryBus.
   */
  constructor(private readonly queryBus: QueryBus) {}

  /**
   * Executes lookupVat.
   * @param body Value for body.
   * @param response Value for response.
   * @param forcedNotFoundHeader Value for forcedNotFoundHeader.
   */
  @Post('tva')
  lookupVat(
    @Body() body: SimulationTypes.VatLookupRequest[],
    @Res() response: Response,
    @Headers('x-simulate-cui-notfound') forcedNotFoundHeader?: string,
  ): Promise<void> {
    return this.lookupVatInternal(body, response, forcedNotFoundHeader);
  }

  /**
   * Executes lookupVatInternal.
   * @param body Value for body.
   * @param response Value for response.
   * @param forcedNotFoundHeader Value for forcedNotFoundHeader.
   */
  private async lookupVatInternal(
    body: SimulationTypes.VatLookupRequest[],
    response: Response,
    forcedNotFoundHeader?: string,
  ): Promise<void> {
    const forcedNotFound = forcedNotFoundHeader?.toLowerCase() === 'true';

    const result = await this.queryBus.execute(
      new LookupVatQuery(body, forcedNotFound),
    );
    response.status(result.statusCode).json(result.payload);
  }
}
