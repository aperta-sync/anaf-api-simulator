/**
 * Command to upload a raw e-Factura XML invoice body to ANAF.
 */
export class UploadMessageCommand {
  /**
   * Creates an instance of UploadMessageCommand.
   * @param xmlBody Raw XML invoice body from the client
   * @param cif The CUI of the uploading entity
   * @param indexIncarcare The assigned upload index (index_incarcare)
   * @param extern Whether the invoice is from an external party
   * @param autofactura Whether this is an autofactura
   * @param executare Whether this is an executare
   */
  constructor(
    public readonly xmlBody: string,
    public readonly cif: string,
    public readonly indexIncarcare: string,
    public readonly extern: boolean,
    public readonly autofactura: boolean,
    public readonly executare: boolean,
  ) {}
}
