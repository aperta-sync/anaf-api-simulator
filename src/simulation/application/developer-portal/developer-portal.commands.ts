import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Registers a new mock OAuth application in the simulation registry.
 */
export class RegisterMockApplicationCommand {
  /**
   * Creates an instance of RegisterMockApplicationCommand.
   * @param applicationName Value for applicationName.
   * @param redirectUris Value for redirectUris.
   * @param source Value for source.
   */
  constructor(
    public readonly applicationName: string,
    public readonly redirectUris: string[],
    public readonly source: 'portal' | 'env' = 'portal',
  ) {}
}

/**
 * Updates mutable fields of an existing mock application.
 */
export class UpdateMockApplicationCommand {
  /**
   * Creates an instance of UpdateMockApplicationCommand.
   * @param clientId Value for clientId.
   * @param update Value for update.
   */
  constructor(
    public readonly clientId: string,
    public readonly update: {
      applicationName?: string;
      redirectUris?: string[];
    },
  ) {}
}

/**
 * Removes a mock application from the simulation registry.
 */
export class RemoveMockApplicationCommand {
  /**
   * Creates an instance of RemoveMockApplicationCommand.
   * @param clientId Value for clientId.
   */
  constructor(public readonly clientId: string) {}
}

/**
 * Replaces authorized CIF ownership for a mock signer identity.
 */
export class UpdateMockIdentityOwnershipCommand {
  /**
   * Creates an instance of UpdateMockIdentityOwnershipCommand.
   * @param identityId Value for identityId.
   * @param authorizedCuis Value for authorizedCuis.
   */
  constructor(
    public readonly identityId: string,
    public readonly authorizedCuis: string[],
  ) {}
}

export type DeveloperPortalCommandResult =
  | SimulationTypes.RegisteredMockApplication
  | SimulationTypes.RegisteredMockApplication
  | SimulationTypes.IdentityProfile
  | boolean;
