import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { SimulationTypes } from '../../domain/simulation.types';
import { UblGeneratorService } from './ubl-generator.service';

/**
 * Produces ZIP payloads for e-Factura download endpoint responses.
 */
@Injectable()
export class ZipArchiveService {
  /**
   * Creates an instance of ZipArchiveService.
   * @param ublGenerator Value for ublGenerator.
   */
  constructor(private readonly ublGenerator: UblGeneratorService) {}

  /**
   * Builds an invoice archive containing factura.xml and semnatura.xml.
   *
   * @param message Stored invoice message.
   * @returns Binary ZIP payload.
   */
  buildInvoiceZip(message: SimulationTypes.StoredInvoiceMessage): Buffer {
    const zip = new AdmZip();
    const facturaXml = this.ublGenerator.generateInvoiceXml(message);

    zip.addFile('factura.xml', Buffer.from(facturaXml, 'utf-8'));
    zip.addFile(
      'semnatura.xml',
      Buffer.from(
        `<Semnatura><Issuer>Ministerul Finantelor</Issuer><Serial>SIM-${message.id}</Serial><Status>VALID</Status></Semnatura>`,
        'utf-8',
      ),
    );

    return zip.toBuffer();
  }
}
