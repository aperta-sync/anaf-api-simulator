import { beforeEach, describe, expect, it } from '@jest/globals';
import { SimulationTypes } from '../../domain/simulation.types';
import { UploadTrackingStoreService } from './upload-tracking-store.service';

function buildRecord(
  overrides?: Partial<SimulationTypes.UploadedInvoiceRecord>,
): SimulationTypes.UploadedInvoiceRecord {
  return {
    indexIncarcare: '1234567890001000000',
    cif: 'RO10000008',
    standard: 'UBL',
    xmlContent: '<Invoice/>',
    uploadedAt: new Date(),
    processingCompleteAt: new Date(Date.now() + 3000),
    messageId: null,
    status: 'in prelucrare',
    errors: [],
    ...overrides,
  };
}

describe('UploadTrackingStoreService', () => {
  let service: UploadTrackingStoreService;

  beforeEach(() => {
    service = new UploadTrackingStoreService();
  });

  it('allocates a unique string on each call', async () => {
    const first = await service.allocateUploadIndex();
    const second = await service.allocateUploadIndex();

    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
  });

  it('persists a record via save and retrieves it by upload index', async () => {
    const record = buildRecord();
    await service.save(record);

    const found = await service.findByUploadIndex(record.indexIncarcare);

    expect(found).toBeDefined();
    expect(found?.indexIncarcare).toBe(record.indexIncarcare);
    expect(found?.cif).toBe('RO10000008');
    expect(found?.standard).toBe('UBL');
    expect(found?.status).toBe('in prelucrare');
  });

  it('returns undefined for an unknown upload index', async () => {
    const found = await service.findByUploadIndex('nonexistent-index');

    expect(found).toBeUndefined();
  });
});
