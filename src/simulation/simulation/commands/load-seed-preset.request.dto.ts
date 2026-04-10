import { IsIn } from 'class-validator';

/**
 * Data transfer object for LoadSeedPresetRequestDto.
 *
 * @remarks Used by: src/simulation/simulation/commands/simulation.command.http.controller.ts.
 */
export class LoadSeedPresetRequestDto {
  /**
   * The preset value.
   */
  @IsIn(['anaf-core', 'anaf-large'])
  preset!: 'anaf-core' | 'anaf-large';
}
