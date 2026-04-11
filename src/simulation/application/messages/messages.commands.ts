/**
 * Uploads an e-Factura invoice XML for simulated ANAF processing.
 */
export class UploadEfacturaInvoiceCommand {
  constructor(
    public readonly cif: string,
    public readonly standard: string,
    public readonly xmlContent: string,
  ) {}
}
