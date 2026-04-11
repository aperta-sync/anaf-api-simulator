import { SimulationTypes } from '../../domain/simulation.types';

export const UPLOAD_TRACKING_STORE = Symbol('UPLOAD_TRACKING_STORE');

/**
 * Persistence port for tracking uploaded invoice processing state.
 */
export interface UploadTrackingStorePort {
  /**
   * Allocates a new monotonic upload index.
   */
  allocateUploadIndex(): Promise<string>;

  /**
   * Persists an uploaded invoice record.
   */
  save(record: SimulationTypes.UploadedInvoiceRecord): Promise<void>;

  /**
   * Finds an upload record by its upload index.
   */
  findByUploadIndex(
    indexIncarcare: string,
  ): Promise<SimulationTypes.UploadedInvoiceRecord | undefined>;
}
