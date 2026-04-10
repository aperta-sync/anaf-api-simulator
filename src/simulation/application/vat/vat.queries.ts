import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Requests VAT lookup evaluation for one or more CUIs.
 */
export class LookupVatQuery {
  /**
   * Creates an instance of LookupVatQuery.
   * @param requests Value for requests.
   * @param forcedNotFound Value for forcedNotFound.
   */
  constructor(
    public readonly requests: SimulationTypes.VatLookupRequest[],
    public readonly forcedNotFound: boolean,
  ) {}
}

/**
 * Encapsulates VAT lookup payload with explicit HTTP status code.
 */
export interface VatLookupExecutionResult {
  statusCode: number;
  payload: SimulationTypes.VatLookupResponse;
}
