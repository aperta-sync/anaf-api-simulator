import { describe, expect, it } from '@jest/globals';
import { ZipArchiveService as ServiceExport } from './zip-archive.service';
import { ZipArchiveService as ApplicationServiceExport } from './application/services/zip-archive.service';

describe('zip-archive.service compatibility shim', () => {
  it('re-exports the application ZipArchiveService class', () => {
    expect(ServiceExport).toBe(ApplicationServiceExport);
  });
});
