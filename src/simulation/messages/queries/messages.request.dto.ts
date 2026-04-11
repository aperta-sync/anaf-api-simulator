import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Data transfer object for ListaMesajeFacturaQueryDto.
 *
 * @remarks Used by: src/simulation/dto/message-endpoints.dto.ts, src/simulation/messages/queries/messages.query.http.controller.ts.
 */
export class ListaMesajeFacturaQueryDto {
  /**
   * The cif value.
   */
  @IsString()
  cif!: string;

  /**
   * The zile value.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  zile?: number;

  /**
   * The filtru value.
   */
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['P', 'T', 'E', 'R'])
  @IsString()
  filtru?: string;
}

/**
 * Data transfer object for DescarcareQueryDto.
 *
 * @remarks Used by: src/simulation/dto/message-endpoints.dto.ts, src/simulation/messages/queries/messages.query.http.controller.ts.
 */
export class DescarcareQueryDto {
  /**
   * The id value.
   */
  @IsString()
  id!: string;
}

export class StareMesajQueryDto {
  @IsString()
  id_incarcare!: string;
}
