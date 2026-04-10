/**
 * Requests all known simulation companies.
 */
export class ListInternalCompaniesQuery {}

/**
 * Requests all stored invoice messages from the simulation store.
 */
export class ListInternalMessagesQuery {}

/**
 * Requests all mock e-sign identity profiles and CIF ownership.
 */
export class ListMockIdentitiesQuery {}

/**
 * Requests the aggregated invoice traffic graph for inspector visualization.
 */
export class GetInvoiceNetworkGraphQuery {
  /**
   * Creates an instance of GetInvoiceNetworkGraphQuery.
   * @param windowDays Value for windowDays.
   */
  constructor(public readonly windowDays: number) {}
}

/**
 * Requests all registered mock applications.
 */
export class ListMockApplicationsQuery {}

/**
 * Requests one mock application by client id.
 */
export class GetMockApplicationQuery {
  /**
   * Creates an instance of GetMockApplicationQuery.
   * @param clientId Value for clientId.
   */
  constructor(public readonly clientId: string) {}
}
