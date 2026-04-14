import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { LookupVatQuery } from '../../application/vat/vat.queries';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles VAT registry read/query endpoints.
 */
@ApiTags('VAT Registry')
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
  @ApiOperation({
    summary: 'Batch VAT payer lookup',
    description:
      'Checks whether each given CUI is a registered VAT payer on a specific date. ' +
      'Returns the full company profile and VAT registration details for each entry in the request array.\n\n' +
      '**Production URL:** `POST https://api.anaf.ro/api/PlatitorTvaRest/v9/tva`',
  })
  @ApiBody({
    description: 'Array of CUI + date pairs to look up',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cui: { type: 'string', example: '1234567', description: 'Company fiscal code (numeric or string)' },
          data: { type: 'string', example: '2024-01-15', description: 'Reference date in YYYY-MM-DD format' },
        },
        required: ['cui', 'data'],
      },
    },
  })
  @ApiHeader({ name: 'x-simulate-cui-notfound', required: false, description: 'Set to "true" to force all lookups to return "not found"' })
  @ApiResponse({ status: 200, description: 'JSON — array of VAT lookup results' })
  @ApiResponse({ status: 400, description: 'Bad Request — malformed request body' })
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
