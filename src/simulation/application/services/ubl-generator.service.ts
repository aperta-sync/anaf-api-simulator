import { Injectable } from '@nestjs/common';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Builds UBL 2.1 invoice XML documents for synthetic e-Factura downloads.
 */
@Injectable()
export class UblGeneratorService {
  /**
   * Generates invoice XML from stored message metadata.
   *
   * @param message Stored invoice message.
   * @returns UBL-compliant invoice XML string.
   */
  generateInvoiceXml(message: SimulationTypes.StoredInvoiceMessage): string {
    const invoiceNumber = `INV-${message.id}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:anaf.ro:efactura:1.0</cbc:ProfileID>
  <cbc:ID>${this.escapeXml(invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${this.escapeXml(message.issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${this.escapeXml(
    message.currency,
  )}</cbc:DocumentCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(message.supplier.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escapeXml(message.supplier.cui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(
          message.supplier.address,
        )}</cbc:StreetName>
        <cbc:CityName>${this.escapeXml(message.supplier.city)}</cbc:CityName>
        <cbc:CountrySubentity>${this.escapeXml(
          message.supplier.county,
        )}</cbc:CountrySubentity>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(message.customer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escapeXml(message.customer.cui)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(
          message.customer.address,
        )}</cbc:StreetName>
        <cbc:CityName>${this.escapeXml(message.customer.city)}</cbc:CityName>
        <cbc:CountrySubentity>${this.escapeXml(
          message.customer.county,
        )}</cbc:CountrySubentity>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="${this.escapeXml(
      message.currency,
    )}">${message.payableAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${this.escapeXml(
      message.currency,
    )}">${message.payableAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${this.escapeXml(message.lineDescription)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${this.escapeXml(
        message.currency,
      )}">${message.payableAmount.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  }

  /**
   * Escapes XML-sensitive characters for safe interpolation.
   *
   * @param input Raw text value.
   * @returns XML-escaped text value.
   */
  private escapeXml(input: string): string {
    return input.replace(/[<>&'\"]/g, (char) => {
      switch (char) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case '"':
          return '&quot;';
        case "'":
          return '&apos;';
        default:
          return char;
      }
    });
  }
}
