import { Body, Controller, Patch, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { LoadSeedPresetRequestDto } from './load-seed-preset.request.dto';
import { SeedCompaniesRequestDto } from './seed-companies.request.dto';
import { UpdateSimulationConfigDto } from './update-simulation-config.request.dto';
import {
  LoadSimulationSeedPresetCommand,
  SeedSimulationCompaniesCommand,
  UpdateSimulationConfigCommand,
} from '../../application/simulation/simulation.commands';

/**
 * Handles simulation mutating command endpoints.
 */
@Controller('simulation')
export class SimulationCommandHttpController {
  /**
   * Creates an instance of SimulationCommandHttpController.
   * @param commandBus Value for commandBus.
   */
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Executes updateConfig.
   * @param dto Value for dto.
   * @returns The updateConfig result.
   */
  @Patch('config')
  async updateConfig(@Body() dto: UpdateSimulationConfigDto) {
    return this.commandBus.execute(new UpdateSimulationConfigCommand(dto));
  }

  /**
   * Executes seedCompanies.
   * @param dto Value for dto.
   * @returns The seedCompanies result.
   */
  @Post('seed')
  async seedCompanies(@Body() dto: SeedCompaniesRequestDto) {
    return this.commandBus.execute(
      new SeedSimulationCompaniesCommand(dto.companies),
    );
  }

  /**
   * Executes loadSeedPreset.
   * @param dto Value for dto.
   * @returns The loadSeedPreset result.
   */
  @Post('seed/preset')
  async loadSeedPreset(@Body() dto: LoadSeedPresetRequestDto) {
    return this.commandBus.execute(
      new LoadSimulationSeedPresetCommand(dto.preset),
    );
  }
}
