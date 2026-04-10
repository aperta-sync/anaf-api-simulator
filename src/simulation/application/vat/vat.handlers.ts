import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SimulationEngineService } from '../services/simulation-engine.service';
import { LookupVatQuery, VatLookupExecutionResult } from './vat.queries';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles ANAF v9 VAT lookup evaluation.
 */
@QueryHandler(LookupVatQuery)
@Injectable()
export class LookupVatHandler implements IQueryHandler<
  LookupVatQuery,
  VatLookupExecutionResult
> {
  /**
   * Creates an instance of LookupVatHandler.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Resolves found and not-found CUIs and computes ANAF-compatible status semantics.
   *
   * @param query Lookup query payload.
   * @returns Response payload and explicit HTTP status code.
   */
  async execute(query: LookupVatQuery): Promise<VatLookupExecutionResult> {
    const requests = Array.isArray(query.requests) ? query.requests : [];
    const found: SimulationTypes.VatFoundRecord[] = [];
    const notFound: string[] = [];

    for (const entry of requests) {
      const lookupKey = String(entry.cui);
      if (query.forcedNotFound) {
        notFound.push(lookupKey);
        continue;
      }

      const company = this.simulationEngine.getCompany(entry.cui);
      if (!company) {
        notFound.push(lookupKey);
        continue;
      }

      const requestDate = entry.data || new Date().toISOString().slice(0, 10);
      found.push(this.simulationEngine.buildVatRecord(company, requestDate));
    }

    const shouldReturnNotFound = found.length === 0 && notFound.length > 0;
    const statusCode = shouldReturnNotFound ? 404 : 200;

    return {
      statusCode,
      payload: {
        cod: statusCode,
        message: shouldReturnNotFound ? 'NOT_FOUND' : 'SUCCESS',
        found,
        notFound,
      },
    };
  }
}

export const VAT_CQRS_HANDLERS = [LookupVatHandler];
