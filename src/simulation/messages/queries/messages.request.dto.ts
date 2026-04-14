import { IsOptional, IsString } from 'class-validator';

/**
 * Query DTO for /listaMesajeFactura.
 *
 * Validation is intentionally relaxed — ANAF returns JSON 200 errors with
 * `{eroare, titlu}` for non-numeric values, out-of-range zile, and invalid
 * filtru.  The controller performs those checks.
 */
export class ListaMesajeFacturaQueryDto {
  @IsOptional()
  @IsString()
  cif?: string;

  @IsOptional()
  @IsString()
  zile?: string;

  @IsOptional()
  @IsString()
  filtru?: string;
}

export class DescarcareQueryDto {
  @IsOptional()
  @IsString()
  id?: string;
}

export class StareMesajQueryDto {
  @IsOptional()
  @IsString()
  id_incarcare?: string;
}

/**
 * Query DTO for /listaMesajePaginatieFactura.
 *
 * All parameters are received as raw strings so the controller can return
 * ANAF-spec error shapes for non-numeric or missing values.
 */
export class ListaMesajePaginatieFacturaQueryDto {
  @IsOptional()
  @IsString()
  cif?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  pagina?: string;

  @IsOptional()
  @IsString()
  filtru?: string;
}
