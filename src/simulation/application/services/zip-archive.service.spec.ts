import { describe, expect, it, jest } from '@jest/globals';
import AdmZip from 'adm-zip';
import { SimulationTypes } from '../../domain/simulation.types';
import { UblGeneratorService } from './ubl-generator.service';
import { ZipArchiveService } from './zip-archive.service';

function buildMessage(id: string): SimulationTypes.StoredInvoiceMessage {
  const supplier: SimulationTypes.CompanyProfile = {
    cui: 'RO10079193',
    numericCui: '10079193',
    name: 'Supplier & Co <SRL>',
    city: 'Cluj-Napoca',
    county: 'Cluj',
    address: 'Str. Memorandumului 1 "Etaj"',
    countryCode: 'RO',
    vatPayer: true,
  };

  const customer: SimulationTypes.CompanyProfile = {
    cui: 'RO10000008',
    numericCui: '10000008',
    name: "Customer 'Main' SRL",
    city: 'Bucuresti',
    county: 'Bucuresti',
    address: 'Bd. Unirii 5 & 7',
    countryCode: 'RO',
    vatPayer: true,
  };

  return {
    id,
    data_creare: '2026-04-10T10:00:00.000Z',
    creation_date: '2026-04-10T10:00:00.000Z',
    cif_emitent: supplier.numericCui,
    cif_beneficiar: customer.numericCui,
    cif: supplier.numericCui,
    id_solicitare: id,
    tip: 'FACTURA PRIMITA',
    detalii: 'Factura de test',
    suma: 120.5,
    currency: 'RON',
    issueDate: '2026-04-09',
    payableAmount: 120.5,
    supplier,
    customer,
    lineDescription: 'Servicii <IT> & suport "premium"',
    createdAt: new Date('2026-04-10T10:00:00.000Z'),
  };
}

describe('ZipArchiveService', () => {
  it('builds zip containing factura.xml and semnatura.xml', () => {
    const message = buildMessage('SIM-42');
    const ublGenerator = {
      generateInvoiceXml: jest
        .fn<(_message: SimulationTypes.StoredInvoiceMessage) => string>()
        .mockReturnValue('<Invoice><ID>SIM-42</ID></Invoice>'),
    } as unknown as UblGeneratorService;

    const service = new ZipArchiveService(ublGenerator);
    const zipBuffer = service.buildInvoiceZip(message);

    const zip = new AdmZip(zipBuffer);
    const entries = zip
      .getEntries()
      .map((entry) => entry.entryName)
      .sort((left, right) => left.localeCompare(right));

    expect(entries).toEqual(['factura.xml', 'semnatura.xml']);
    expect(zip.readAsText('factura.xml')).toContain('<ID>SIM-42</ID>');
    expect(zip.readAsText('semnatura.xml')).toContain(
      '<Serial>SIM-SIM-42</Serial>',
    );
    expect(
      (
        ublGenerator.generateInvoiceXml as jest.Mock<
          (_message: SimulationTypes.StoredInvoiceMessage) => string
        >
      ).mock.calls[0][0].id,
    ).toBe('SIM-42');
  });

  it('integrates with UBL generator and preserves escaped XML output', () => {
    const message = buildMessage('SIM-100');
    const service = new ZipArchiveService(new UblGeneratorService());

    const zip = new AdmZip(service.buildInvoiceZip(message));
    const factura = zip.readAsText('factura.xml');
    const semnatura = zip.readAsText('semnatura.xml');

    expect(factura).toContain('Supplier &amp; Co &lt;SRL&gt;');
    expect(factura).toContain('Customer &apos;Main&apos; SRL');
    expect(factura).toContain(
      'Servicii &lt;IT&gt; &amp; suport &quot;premium&quot;',
    );
    expect(semnatura).toContain('<Issuer>Ministerul Finantelor</Issuer>');
    expect(semnatura).toContain('<Status>VALID</Status>');
  });
});
