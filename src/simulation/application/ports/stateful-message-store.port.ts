import { SimulationTypes } from '../../domain/simulation.types';

export const STATEFUL_MESSAGE_STORE = Symbol('STATEFUL_MESSAGE_STORE');

/**
 * Persistence port for invoice messages used by traffic generation and downloads.
 */
export interface StatefulMessageStorePort {
  /**
   * Allocates a new message identifier.
   */
  allocateId(): Promise<string>;

  /**
   * Persists a single stored invoice message.
   */
  save(message: SimulationTypes.StoredInvoiceMessage): Promise<void>;

  /**
   * Persists multiple stored invoice messages.
   */
  saveMany(messages: SimulationTypes.StoredInvoiceMessage[]): Promise<void>;

  /**
   * Finds one message by id.
   */
  findById(
    id: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage | undefined>;

  /**
   * Lists messages for one beneficiary CUI.
   */
  listForBeneficiary(
    cifBeneficiar: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage[]>;

  /**
   * Lists all stored messages.
   */
  listAll(): Promise<SimulationTypes.StoredInvoiceMessage[]>;
}
