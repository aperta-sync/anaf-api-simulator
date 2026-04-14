import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Requests the processing status of an uploaded e-Factura message.
 */
export class GetStareMesajQuery {
  /**
   * Creates an instance of GetStareMesajQuery.
   * @param indexIncarcare The upload index returned from POST /upload
   */
  constructor(public readonly indexIncarcare: string) {}
}

/**
 * Requests a paginated list of e-Factura messages with time-range filtering.
 */
export class ListEfacturaMessagesPaginatieQuery {
  /**
   * Creates an instance of ListEfacturaMessagesPaginatieQuery.
   * @param startTimeMs Start of time range in milliseconds since epoch
   * @param endTimeMs End of time range in milliseconds since epoch
   * @param page Page number (1-based)
   * @param perPage Number of results per page
   * @param filtru Optional ANAF filter (P/T/E/R)
   */
  constructor(
    public readonly startTimeMs: number,
    public readonly endTimeMs: number,
    public readonly page: number,
    public readonly perPage: number,
    public readonly filtru?: string,
  ) {}
}

/**
 * Requests e-Factura messages for a beneficiary CUI and lookback period.
 */
export class ListEfacturaMessagesQuery {
  constructor(
    public readonly cif: string,
    public readonly zile: number,
    public readonly filtru?: string,
  ) {}
}

/**
 * Requests a ZIP archive payload for a stored e-Factura message id.
 */
export class GetEfacturaArchiveQuery {
  constructor(public readonly messageId: string) {}
}

/**
 * Archive query result containing both message metadata and ZIP bytes.
 */
export interface EfacturaArchiveResult {
  message: SimulationTypes.StoredInvoiceMessage;
  archive: Buffer;
}
