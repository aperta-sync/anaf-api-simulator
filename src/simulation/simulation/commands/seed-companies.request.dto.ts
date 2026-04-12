import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * Data transfer object for SeedCompanyDto.
 *
 * @remarks Used by: this module.
 */
export class SeedCompanyDto {
  /**
   * The cui value.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^(RO)?\d+$/i, {
    message: 'cui must be numeric or RO-prefixed numeric',
  })
  cui!: string;

  /**
   * The name value.
   */
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * The city value.
   */
  @IsString()
  @IsNotEmpty()
  city!: string;

  /**
   * The county value.
   */
  @IsString()
  @IsNotEmpty()
  county!: string;

  /**
   * The address value.
   */
  @IsString()
  @IsNotEmpty()
  address!: string;

  /**
   * The countryCode value.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  /**
   * The vatPayer value.
   */
  @IsOptional()
  @IsBoolean()
  vatPayer?: boolean;

  /**
   * Trade register number (e.g. "J2022001847044"). Auto-generated if not provided.
   */
  @IsOptional()
  @IsString()
  nrRegCom?: string;

  /**
   * Street name for adresa_sediu_social (e.g. "NICOLAE TONITZA").
   */
  @IsOptional()
  @IsString()
  streetName?: string;

  /**
   * Street number for adresa_sediu_social (e.g. "97").
   */
  @IsOptional()
  @IsString()
  streetNumber?: string;

  /**
   * Locality name for adresa_sediu_social (e.g. "Sat Scorțeni Com. Scorțeni").
   */
  @IsOptional()
  @IsString()
  locality?: string;

  /**
   * County auto code for adresa_sediu_social (e.g. "BC"). Auto-derived from county if not provided.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countyCode?: string;
}

/**
 * Data transfer object for SeedCompaniesRequestDto.
 *
 * @remarks Used by: src/simulation/simulation/commands/simulation.command.http.controller.ts.
 */
export class SeedCompaniesRequestDto {
  /**
   * The companies value.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeedCompanyDto)
  companies!: SeedCompanyDto[];
}
