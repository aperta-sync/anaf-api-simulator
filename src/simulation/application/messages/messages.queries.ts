import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Requests e-Factura messages for a beneficiary CUI and lookback period.
 */
export class ListEfacturaMessagesQuery {
  /**
   * Creates an instance of ListEfacturaMessagesQuery.
   * @param cif Value for cif.
   * @param zile Value for zile.
   * @param filtru Value for filtru.
   */
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
  /**
   * Creates an instance of GetEfacturaArchiveQuery.
   * @param messageId Value for messageId.
   */
  constructor(public readonly messageId: string) {}
}

/**
 * Archive query result containing both message metadata and ZIP bytes.
 */
export interface EfacturaArchiveResult {
  message: SimulationTypes.StoredInvoiceMessage;
  archive: Buffer;
}

/**
 * Retrieves the processing status of an uploaded invoice.
 */
export class GetUploadStatusQuery {
  constructor(public readonly idIncarcare: string) {}
}
