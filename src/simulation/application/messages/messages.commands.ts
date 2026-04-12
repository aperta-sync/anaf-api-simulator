/**
 * Uploads an e-Factura invoice XML for simulated ANAF processing.
 *
 * Optional flags follow real ANAF semantics:
 * - `extern`: "DA" for invoices to foreign buyers (non-Romanian CIF)
 * - `autofactura`: "DA" for self-invoices
 * - `executare`: "DA" for enforcement invoices
 */
export class UploadEfacturaInvoiceCommand {
  constructor(
    public readonly cif: string,
    public readonly standard: string,
    public readonly xmlContent: string,
    public readonly extern?: string,
    public readonly autofactura?: string,
    public readonly executare?: string,
  ) {}
}
