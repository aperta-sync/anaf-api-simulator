import { Injectable } from '@nestjs/common';
import {
  CommandHandler,
  ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import { SimulationEngineService } from '../services/simulation-engine.service';
import { TrafficGeneratorService } from '../services/traffic-generator.service';
import {
  LoadSimulationSeedPresetCommand,
  SeedSimulationCompaniesCommand,
  UpdateSimulationConfigCommand,
} from './simulation.commands';
import { GetSimulationConfigQuery } from './simulation.queries';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles retrieval of simulation runtime configuration.
 */
@QueryHandler(GetSimulationConfigQuery)
@Injectable()
export class GetSimulationConfigHandler implements IQueryHandler<
  GetSimulationConfigQuery,
  {
    config: SimulationTypes.SimulationConfig;
    requestCount: number;
  }
> {
  /**
   * Creates an instance of GetSimulationConfigHandler.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Returns current runtime config and total processed request count.
   *
   * @returns Runtime config snapshot and request counter.
   */
  async execute(): Promise<{
    config: SimulationTypes.SimulationConfig;
    requestCount: number;
  }> {
    return {
      config: this.simulationEngine.getConfig(),
      requestCount: this.simulationEngine.getRequestCount(),
    };
  }
}

/**
 * Handles simulation runtime configuration updates.
 */
@CommandHandler(UpdateSimulationConfigCommand)
@Injectable()
export class UpdateSimulationConfigHandler implements ICommandHandler<
  UpdateSimulationConfigCommand,
  {
    config: SimulationTypes.SimulationConfig;
    requestCount: number;
  }
> {
  /**
   * Creates an instance of UpdateSimulationConfigHandler.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Applies validated config updates and returns resulting state.
   *
   * @param command Config update payload.
   * @returns Updated config and current request count.
   */
  async execute(command: UpdateSimulationConfigCommand): Promise<{
    config: SimulationTypes.SimulationConfig;
    requestCount: number;
  }> {
    return {
      config: this.simulationEngine.updateConfig(command.update),
      requestCount: this.simulationEngine.getRequestCount(),
    };
  }
}

/**
 * Handles runtime company seeding.
 */
@CommandHandler(SeedSimulationCompaniesCommand)
@Injectable()
export class SeedSimulationCompaniesHandler implements ICommandHandler<
  SeedSimulationCompaniesCommand,
  {
    seeded: SimulationTypes.CompanyProfile[];
    totalKnownCompanies: number;
  }
> {
  /**
   * Creates an instance of SeedSimulationCompaniesHandler.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Seeds companies and returns a summary of changes.
   *
   * @param command Company seed payload.
   * @returns Seeded entities and current total known companies.
   */
  async execute(command: SeedSimulationCompaniesCommand): Promise<{
    seeded: SimulationTypes.CompanyProfile[];
    totalKnownCompanies: number;
  }> {
    const seeded = this.simulationEngine.seedCompanies(command.companies);

    return {
      seeded,
      totalKnownCompanies: this.simulationEngine.getKnownCompanies().length,
    };
  }
}

/**
 * Handles loading predefined seed presets for companies and traffic history.
 */
@CommandHandler(LoadSimulationSeedPresetCommand)
@Injectable()
export class LoadSimulationSeedPresetHandler implements ICommandHandler<
  LoadSimulationSeedPresetCommand,
  SimulationTypes.SeedPresetSummary
> {
  /**
   * Creates an instance of LoadSimulationSeedPresetHandler.
   * @param simulationEngine Value for simulationEngine.
   * @param trafficGenerator Value for trafficGenerator.
   */
  constructor(
    private readonly simulationEngine: SimulationEngineService,
    private readonly trafficGenerator: TrafficGeneratorService,
  ) {}

  /**
   * Loads one preset and returns company/message totals after import.
   *
   * @param command Preset load command payload.
   * @returns Summary with inserted and total entities.
   */
  async execute(
    command: LoadSimulationSeedPresetCommand,
  ): Promise<SimulationTypes.SeedPresetSummary> {
    const seededCompanies = this.simulationEngine.loadSeedPreset(
      command.preset,
    );
    const seededMessages = await this.trafficGenerator.seedPresetMessages(
      command.preset,
    );
    const totalMessages = (await this.trafficGenerator.listAllMessages())
      .length;

    return {
      preset: command.preset,
      seededCompanies: seededCompanies.length,
      totalKnownCompanies: this.simulationEngine.getKnownCompanies().length,
      seededMessages,
      totalMessages,
    };
  }
}

export const SIMULATION_CQRS_HANDLERS = [
  GetSimulationConfigHandler,
  UpdateSimulationConfigHandler,
  SeedSimulationCompaniesHandler,
  LoadSimulationSeedPresetHandler,
];
