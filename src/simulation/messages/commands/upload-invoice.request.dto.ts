import { IsOptional, IsString } from 'class-validator';

/**
 * Query parameter DTO for the upload endpoint.
 *
 * Validation is intentionally relaxed here — ANAF returns XML 200 errors
 * for invalid `standard` and non-numeric `cif`, not HTTP 400.  The
 * controller performs those checks so the mock can replicate the exact
 * ANAF error shapes.
 */
export class UploadInvoiceQueryDto {
  @IsString()
  standard!: string;

  @IsString()
  cif!: string;

  @IsOptional()
  @IsString()
  extern?: string;

  @IsOptional()
  @IsString()
  autofactura?: string;

  @IsOptional()
  @IsString()
  executare?: string;
}
