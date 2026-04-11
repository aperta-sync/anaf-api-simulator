import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Data transfer object for UpdateSimulationConfigDto.
 *
 * @remarks Used by: src/simulation/simulation/commands/simulation.command.http.controller.ts.
 */
export class UpdateSimulationConfigDto {
  /**
   * The latencyMs value.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30_000)
  latencyMs?: number;

  /**
   * The processingDelayMs value.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60_000)
  processingDelayMs?: number;

  /**
   * The errorRate value.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  errorRate?: number;

  /**
   * The rateLimitTrigger value.
   */
  @IsOptional()
  @IsBoolean()
  rateLimitTrigger?: boolean;

  /**
   * The rateLimitMode value.
   */
  @IsOptional()
  @IsIn(['off', 'deterministic', 'windowed'])
  rateLimitMode?: 'off' | 'deterministic' | 'windowed';

  /**
   * The rateLimitWindowMs value.
   */
  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  rateLimitWindowMs?: number;

  /**
   * The rateLimitMaxRequests value.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  rateLimitMaxRequests?: number;

  /**
   * The autoGenerateTraffic value.
   */
  @IsOptional()
  @IsBoolean()
  autoGenerateTraffic?: boolean;

  /**
   * The strictVatLookup value.
   */
  @IsOptional()
  @IsBoolean()
  strictVatLookup?: boolean;

  /**
   * The strictOwnershipValidation value.
   */
  @IsOptional()
  @IsBoolean()
  strictOwnershipValidation?: boolean;

  /**
   * The trafficProbability value.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  trafficProbability?: number;
}
