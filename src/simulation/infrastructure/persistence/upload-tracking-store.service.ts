import { Injectable } from '@nestjs/common';
import { UploadTrackingStorePort } from '../../application/ports/upload-tracking-store.port';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * In-memory implementation of the upload tracking store port.
 */
@Injectable()
export class UploadTrackingStoreService implements UploadTrackingStorePort {
  private readonly byIndex = new Map<
    string,
    SimulationTypes.UploadedInvoiceRecord
  >();
  private sequence = 1000000;

  async allocateUploadIndex(): Promise<string> {
    const index = `${Date.now()}${String(this.sequence).padStart(4, '0')}`;
    this.sequence += 1;
    return index;
  }

  async save(record: SimulationTypes.UploadedInvoiceRecord): Promise<void> {
    this.byIndex.set(record.indexIncarcare, record);
  }

  async findByUploadIndex(
    indexIncarcare: string,
  ): Promise<SimulationTypes.UploadedInvoiceRecord | undefined> {
    return this.byIndex.get(indexIncarcare);
  }
}
