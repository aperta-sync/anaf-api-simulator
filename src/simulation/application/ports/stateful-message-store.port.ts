import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Port for the e-Factura message persistence layer.
 * Implementations: in-memory (default), Redis (production).
 */
export interface StatefulMessageStorePort {
  /**
   * Lists all messages for a beneficiary CUI.
   */
  listForBeneficiary(cuiNumeric: string): Promise<SimulationTypes.StoredInvoiceMessage[]>;

  /**
   * Lists all stored messages.
   */
  listAll(): Promise<SimulationTypes.StoredInvoiceMessage[]>;

  /**
   * Finds a message by its identifier.
   */
  findById(id: string): Promise<SimulationTypes.StoredInvoiceMessage | undefined>;

  /**
   * Saves a new or updated invoice message.
   */
  save(message: SimulationTypes.StoredInvoiceMessage): Promise<void>;

  /**
   * Allocates the next monotonic upload index (index_incarcare).
   * @returns Monotonically increasing string index (e.g. "000001")
   */
  allocateIndex(): Promise<string>;

  /**
   * Saves an upload tracking record for POST /upload.
   * @param record Upload tracking record with status and metadata
   */
  saveUpload(record: SimulationTypes.UploadTrackingRecord): Promise<void>;

  /**
   * Retrieves an upload tracking record by index_incarcare.
   * @param index Upload index returned from POST /upload
   */
  getUploadRecord(index: string): Promise<SimulationTypes.UploadTrackingRecord | undefined>;

  /**
   * Updates an upload tracking record status (for async processing simulation).
   */
  updateUploadStatus(
    index: string,
    status: SimulationTypes.StareMesajValue,
    idDescarcare?: string,
  ): Promise<void>;
}
