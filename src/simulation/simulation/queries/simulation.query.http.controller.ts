import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetSimulationConfigQuery } from '../../application/simulation/simulation.queries';

/**
 * Handles simulation read/query endpoints.
 */
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
  async getConfig() {
    return this.queryBus.execute(new GetSimulationConfigQuery());
  }
}
