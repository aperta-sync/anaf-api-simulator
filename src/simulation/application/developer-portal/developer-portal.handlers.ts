import { Injectable } from '@nestjs/common';
import {
  CommandHandler,
  ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import {
  GetMockApplicationQuery,
  GetInvoiceNetworkGraphQuery,
  ListInternalCompaniesQuery,
  ListInternalMessagesQuery,
  ListMockIdentitiesQuery,
  ListMockApplicationsQuery,
} from './developer-portal.queries';
import {
  RegisterMockApplicationCommand,
  RemoveMockApplicationCommand,
  UpdateMockIdentityOwnershipCommand,
  UpdateMockApplicationCommand,
} from './developer-portal.commands';
import {
  MockApplicationRegistryService,
  MockIdentityRegistryService,
  SimulationEngineService,
  TrafficGeneratorService,
} from '../services';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * Handles registration of new mock OAuth applications.
 */
@CommandHandler(RegisterMockApplicationCommand)
@Injectable()
export class RegisterMockApplicationHandler implements ICommandHandler<
  RegisterMockApplicationCommand,
  SimulationTypes.RegisteredMockApplication
> {
  /**
   * Creates an instance of RegisterMockApplicationHandler.
   * @param appRegistry Value for appRegistry.
   */
  constructor(private readonly appRegistry: MockApplicationRegistryService) {}

  /**
   * Creates and stores a mock application with generated credentials.
   *
   * @param command Registration command payload.
   * @returns Newly registered application including secret.
   */
  async execute(
    command: RegisterMockApplicationCommand,
  ): Promise<SimulationTypes.RegisteredMockApplication> {
    return this.appRegistry.registerApplication(
      command.applicationName,
      command.redirectUris,
      command.source,
    );
  }
}

/**
 * Handles updates to registered mock OAuth applications.
 */
@CommandHandler(UpdateMockApplicationCommand)
@Injectable()
export class UpdateMockApplicationHandler implements ICommandHandler<
  UpdateMockApplicationCommand,
  SimulationTypes.RegisteredMockApplication | undefined
> {
  /**
   * Creates an instance of UpdateMockApplicationHandler.
   * @param appRegistry Value for appRegistry.
   */
  constructor(private readonly appRegistry: MockApplicationRegistryService) {}

  /**
   * Applies mutable updates to the requested application.
   *
   * @param command Update command payload.
   * @returns Updated application, or undefined when not found.
   */
  async execute(
    command: UpdateMockApplicationCommand,
  ): Promise<SimulationTypes.RegisteredMockApplication | undefined> {
    return this.appRegistry.updateApplication(command.clientId, command.update);
  }
}

/**
 * Handles deletion of registered mock applications.
 */
@CommandHandler(RemoveMockApplicationCommand)
@Injectable()
export class RemoveMockApplicationHandler implements ICommandHandler<
  RemoveMockApplicationCommand,
  boolean
> {
  /**
   * Creates an instance of RemoveMockApplicationHandler.
   * @param appRegistry Value for appRegistry.
   */
  constructor(private readonly appRegistry: MockApplicationRegistryService) {}

  /**
   * Removes an application from the registry.
   *
   * @param command Delete command payload.
   * @returns True when the application existed and was removed.
   */
  async execute(command: RemoveMockApplicationCommand): Promise<boolean> {
    return this.appRegistry.deleteApplication(command.clientId);
  }
}

/**
 * Handles runtime ownership overrides for mock signer identities.
 */
@CommandHandler(UpdateMockIdentityOwnershipCommand)
@Injectable()
export class UpdateMockIdentityOwnershipHandler implements ICommandHandler<
  UpdateMockIdentityOwnershipCommand,
  SimulationTypes.IdentityProfile | undefined
> {
  /**
   * Creates an instance of UpdateMockIdentityOwnershipHandler.
   * @param identityRegistry Value for identityRegistry.
   */
  constructor(private readonly identityRegistry: MockIdentityRegistryService) {}

  /**
   * Replaces one identity ownership mapping with the provided CIF list.
   */
  async execute(
    command: UpdateMockIdentityOwnershipCommand,
  ): Promise<SimulationTypes.IdentityProfile | undefined> {
    return this.identityRegistry.updateIdentityOwnership(
      command.identityId,
      command.authorizedCuis,
    );
  }
}

/**
 * Handles company listing for the developer portal inspector.
 */
@QueryHandler(ListInternalCompaniesQuery)
@Injectable()
export class ListInternalCompaniesHandler implements IQueryHandler<
  ListInternalCompaniesQuery,
  SimulationTypes.CompanyProfile[]
> {
  /**
   * Creates an instance of ListInternalCompaniesHandler.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(private readonly simulationEngine: SimulationEngineService) {}

  /**
   * Returns all currently known companies.
   *
   * @returns Company profiles available in simulation memory.
   */
  async execute(): Promise<SimulationTypes.CompanyProfile[]> {
    return this.simulationEngine.getKnownCompanies();
  }
}

/**
 * Handles global message listing for the developer portal inspector.
 */
@QueryHandler(ListInternalMessagesQuery)
@Injectable()
export class ListInternalMessagesHandler implements IQueryHandler<
  ListInternalMessagesQuery,
  SimulationTypes.StoredInvoiceMessage[]
> {
  /**
   * Creates an instance of ListInternalMessagesHandler.
   * @param trafficGenerator Value for trafficGenerator.
   */
  constructor(private readonly trafficGenerator: TrafficGeneratorService) {}

  /**
   * Returns all stored invoice messages.
   *
   * @returns Messages sorted by creation date from storage provider.
   */
  async execute(): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    return this.trafficGenerator.listAllMessages();
  }
}

/**
 * Handles listing of mock e-sign identities and CIF ownership mappings.
 */
@QueryHandler(ListMockIdentitiesQuery)
@Injectable()
export class ListMockIdentitiesHandler implements IQueryHandler<
  ListMockIdentitiesQuery,
  SimulationTypes.IdentityProfile[]
> {
  /**
   * Creates an instance of ListMockIdentitiesHandler.
   * @param identityRegistry Value for identityRegistry.
   */
  constructor(private readonly identityRegistry: MockIdentityRegistryService) {}

  /**
   * Returns all identity profiles with their authorized CIF list.
   */
  async execute(): Promise<SimulationTypes.IdentityProfile[]> {
    return this.identityRegistry.listIdentities();
  }
}

/**
 * Handles invoice traffic graph retrieval for the inspector network view.
 */
@QueryHandler(GetInvoiceNetworkGraphQuery)
@Injectable()
export class GetInvoiceNetworkGraphHandler implements IQueryHandler<
  GetInvoiceNetworkGraphQuery,
  SimulationTypes.InvoiceNetworkGraph
> {
  /**
   * Creates an instance of GetInvoiceNetworkGraphHandler.
   * @param trafficGenerator Value for trafficGenerator.
   */
  constructor(private readonly trafficGenerator: TrafficGeneratorService) {}

  /**
   * Aggregates message traffic into a directed graph view.
   *
   * @param query Query payload with lookback window.
   * @returns Aggregated graph model.
   */
  async execute(
    query: GetInvoiceNetworkGraphQuery,
  ): Promise<SimulationTypes.InvoiceNetworkGraph> {
    return this.trafficGenerator.buildInvoiceNetworkGraph(query.windowDays);
  }
}

/**
 * Handles listing mock applications with secrets for portal management.
 */
@QueryHandler(ListMockApplicationsQuery)
@Injectable()
export class ListMockApplicationsHandler implements IQueryHandler<
  ListMockApplicationsQuery,
  SimulationTypes.RegisteredMockApplication[]
> {
  /**
   * Creates an instance of ListMockApplicationsHandler.
   * @param appRegistry Value for appRegistry.
   */
  constructor(private readonly appRegistry: MockApplicationRegistryService) {}

  /**
   * Returns all applications sorted by creation time.
   *
   * @returns Registered applications including secrets.
   */
  async execute(): Promise<SimulationTypes.RegisteredMockApplication[]> {
    return this.appRegistry.listApplicationsWithSecrets();
  }
}

/**
 * Handles lookup of a single mock application by client id.
 */
@QueryHandler(GetMockApplicationQuery)
@Injectable()
export class GetMockApplicationHandler implements IQueryHandler<
  GetMockApplicationQuery,
  SimulationTypes.RegisteredMockApplication | undefined
> {
  /**
   * Creates an instance of GetMockApplicationHandler.
   * @param appRegistry Value for appRegistry.
   */
  constructor(private readonly appRegistry: MockApplicationRegistryService) {}

  /**
   * Resolves an application by client id.
   *
   * @param query Query payload with client identifier.
   * @returns Matching application or undefined.
   */
  async execute(
    query: GetMockApplicationQuery,
  ): Promise<SimulationTypes.RegisteredMockApplication | undefined> {
    return this.appRegistry.getApplication(query.clientId);
  }
}

export const DEVELOPER_PORTAL_CQRS_HANDLERS = [
  RegisterMockApplicationHandler,
  UpdateMockApplicationHandler,
  RemoveMockApplicationHandler,
  UpdateMockIdentityOwnershipHandler,
  ListInternalCompaniesHandler,
  ListInternalMessagesHandler,
  ListMockIdentitiesHandler,
  GetInvoiceNetworkGraphHandler,
  ListMockApplicationsHandler,
  GetMockApplicationHandler,
];
