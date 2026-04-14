import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetSimulationConfigQuery } from '../../application/simulation/simulation.queries';

/**
 * Handles simulation read/query endpoints.
 */
@ApiTags('Simulation Control')
@Controller('simulation')
export class SimulationQueryHttpController {
  /**
   * Creates an instance of SimulationQueryHttpController.
   * @param queryBus Value for queryBus.
   */
  constructor(private readonly queryBus: QueryBus) {}

  /**
   * Executes getConfig.
   * @returns The getConfig result.
   */
  @Get('config')
  @ApiOperation({ summary: 'Get current simulation configuration' })
  @ApiResponse({ status: 200, description: 'Current SimulationConfig object' })
  async getConfig() {
    return this.queryBus.execute(new GetSimulationConfigQuery());
  }
}
