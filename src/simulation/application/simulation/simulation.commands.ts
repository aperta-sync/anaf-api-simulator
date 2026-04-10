import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Updates simulation runtime configuration.
 */
export class UpdateSimulationConfigCommand {
  /**
   * Creates an instance of UpdateSimulationConfigCommand.
   * @param update Value for update.
   */
  constructor(
    public readonly update: Partial<SimulationTypes.SimulationConfig>,
  ) {}
}

/**
 * Seeds explicit company profiles into the simulation registry.
 */
export class SeedSimulationCompaniesCommand {
  /**
   * Creates an instance of SeedSimulationCompaniesCommand.
   * @param companies Value for companies.
   */
  constructor(
    public readonly companies: SimulationTypes.SeedCompanyRequest[],
  ) {}
}

/**
 * Loads a predefined simulation seed preset (core or large dataset).
 */
export class LoadSimulationSeedPresetCommand {
  /**
   * Creates an instance of LoadSimulationSeedPresetCommand.
   * @param preset Value for preset.
   */
  constructor(public readonly preset: SimulationTypes.SeedPresetName) {}
}
