import { Body, Controller, Patch, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
@ApiTags('Simulation Control')
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
  @ApiOperation({
    summary: 'Update simulation configuration',
    description: 'Partially updates the mock server\'s runtime configuration. All fields are optional — only the provided keys are changed.',
  })
  @ApiResponse({ status: 200, description: 'Updated SimulationConfig object' })
  async updateConfig(@Body() dto: UpdateSimulationConfigDto) {
    return this.commandBus.execute(new UpdateSimulationConfigCommand(dto));
  }

  /**
   * Executes seedCompanies.
   * @param dto Value for dto.
   * @returns The seedCompanies result.
   */
  @Post('seed')
  @ApiOperation({
    summary: 'Seed custom companies',
    description: 'Registers one or more custom company profiles into the mock\'s in-memory company registry. Useful for loading specific CUIs for testing.',
  })
  @ApiResponse({ status: 201, description: 'Seed summary — number of companies added' })
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
  @ApiOperation({
    summary: 'Load a pre-built seed preset',
    description: 'Loads a named preset of Romanian companies and invoice messages into the mock registry. Available presets: `anaf-core` (small, fast) and `anaf-large` (comprehensive).',
  })
  @ApiResponse({ status: 201, description: 'Preset load summary' })
  async loadSeedPreset(@Body() dto: LoadSeedPresetRequestDto) {
    return this.commandBus.execute(
      new LoadSimulationSeedPresetCommand(dto.preset),
    );
  }
}
