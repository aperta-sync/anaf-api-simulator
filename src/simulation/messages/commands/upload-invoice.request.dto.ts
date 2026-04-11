import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Query parameter DTO for the upload endpoint.
 */
export class UploadInvoiceQueryDto {
  @IsString()
  @IsIn(['UBL', 'CII', 'CN', 'RASP'])
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
