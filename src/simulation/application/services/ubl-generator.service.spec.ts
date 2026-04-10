import { describe, expect, it } from '@jest/globals';
import { SimulationTypes } from '../../domain/simulation.types';
import { UblGeneratorService } from './ubl-generator.service';

function buildMessage(): SimulationTypes.StoredInvoiceMessage {
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
    id: 'SIM-777',
    data_creare: '2026-04-10T10:00:00.000Z',
    creation_date: '2026-04-10T10:00:00.000Z',
    cif_emitent: supplier.numericCui,
    cif_beneficiar: customer.numericCui,
    cif: supplier.numericCui,
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

describe('UblGeneratorService', () => {
  it('generates invoice XML with required UBL fields', () => {
    const service = new UblGeneratorService();
    const message = buildMessage();

    const xml = service.generateInvoiceXml(message);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<cbc:ID>INV-SIM-777</cbc:ID>');
    expect(xml).toContain('<cbc:IssueDate>2026-04-09</cbc:IssueDate>');
    expect(xml).toContain(
      '<cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>',
    );
    expect(xml).toContain(
      '<cbc:PayableAmount currencyID="RON">120.50</cbc:PayableAmount>',
    );
  });

  it('escapes XML-sensitive values across supplier, customer and line fields', () => {
    const service = new UblGeneratorService();
    const xml = service.generateInvoiceXml(buildMessage());

    expect(xml).toContain('Supplier &amp; Co &lt;SRL&gt;');
    expect(xml).toContain('Customer &apos;Main&apos; SRL');
    expect(xml).toContain('Str. Memorandumului 1 &quot;Etaj&quot;');
    expect(xml).toContain('Bd. Unirii 5 &amp; 7');
    expect(xml).toContain(
      'Servicii &lt;IT&gt; &amp; suport &quot;premium&quot;',
    );
  });
});
