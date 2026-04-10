import { Injectable } from '@nestjs/common';
import { StatefulMessageStorePort } from '../../application/ports/stateful-message-store.port';
import { SimulationTypes } from '../../domain/simulation.types';

/**
 * In-memory implementation of the stateful message store port.
 */
@Injectable()
export class StatefulMessageStoreService implements StatefulMessageStorePort {
  private readonly byId = new Map<
    string,
    SimulationTypes.StoredInvoiceMessage
  >();
  private readonly byBeneficiary = new Map<
    string,
    SimulationTypes.StoredInvoiceMessage[]
  >();
  private sequence = 1;

  /**
   * Allocates a monotonic synthetic message id.
   *
   * @returns New message identifier.
   */
  async allocateId(): Promise<string> {
    const id = `SIM-${Date.now()}-${String(this.sequence).padStart(5, '0')}`;
    this.sequence += 1;
    return id;
  }

  /**
   * Persists one message in both id and beneficiary indexes.
   *
   * @param message Message entity to persist.
   */
  async save(message: SimulationTypes.StoredInvoiceMessage): Promise<void> {
    this.byId.set(message.id, message);

    const existing = this.byBeneficiary.get(message.cif_beneficiar) ?? [];
    existing.push(message);
    this.byBeneficiary.set(message.cif_beneficiar, existing);
  }

  /**
   * Persists a collection of messages.
   *
   * @param messages Message entities.
   */
  async saveMany(
    messages: SimulationTypes.StoredInvoiceMessage[],
  ): Promise<void> {
    await Promise.all(messages.map((message) => this.save(message)));
  }

  /**
   * Finds a message by id.
   *
   * @param id Message identifier.
   * @returns Stored message when present.
   */
  async findById(
    id: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage | undefined> {
    return this.byId.get(id);
  }

  /**
   * Lists messages for one beneficiary CUI.
   *
   * @param cifBeneficiar Beneficiary numeric CUI.
   * @returns Messages for the beneficiary.
   */
  async listForBeneficiary(
    cifBeneficiar: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    return [...(this.byBeneficiary.get(cifBeneficiar) ?? [])];
  }

  /**
   * Lists all stored messages sorted by newest first.
   *
   * @returns Sorted message list.
   */
  async listAll(): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    return [...this.byId.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
}
