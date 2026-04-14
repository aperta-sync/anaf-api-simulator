import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListEfacturaMessagesPaginatieQuery } from './messages.queries';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  STATEFUL_MESSAGE_STORE,
  StatefulMessageStorePort,
} from '../ports/stateful-message-store.port';

/**
 * Handles GET /listaMesajePaginatieFactura — time-range filtered, paginated message list.
 *
 * ANAF-standard response envelope: titlu / serial / cui / mesaje / count.
 */
@QueryHandler(ListEfacturaMessagesPaginatieQuery)
@Injectable()
export class ListEfacturaMessagesPaginatieHandler
  implements IQueryHandler<ListEfacturaMessagesPaginatieQuery, SimulationTypes.PaginatieMesajeResponse>
{
  constructor(
    @Inject(STATEFUL_MESSAGE_STORE)
    private readonly messageStore: StatefulMessageStorePort,
  ) {}

  async execute(
    query: ListEfacturaMessagesPaginatieQuery,
  ): Promise<SimulationTypes.PaginatieMesajeResponse> {
    const { startTimeMs, endTimeMs, page, perPage, filtru } = query;

    const startDate = new Date(startTimeMs);
    const endDate = new Date(endTimeMs);

    // Fetch all messages and filter by time range
    const allMessages = await this.messageStore.listAll();
    const filtered = allMessages
      .filter((m) => m.createdAt >= startDate && m.createdAt <= endDate)
      .filter((m) => {
        if (!filtru) return true;
        // P = received (beneficiary), T = sent (issuer), E = error, R = response
        if (filtru === 'P') return m.tip === 'P';
        if (filtru === 'T') return m.tip === 'T';
        if (filtru === 'E') return m.tip === 'E';
        if (filtru === 'R') return m.tip === 'R';
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const startIdx = (page - 1) * perPage;
    const pageItems = filtered.slice(startIdx, startIdx + perPage);

    // Map to ANAF-standard 6-field MessageListEntry
    const mesaje: SimulationTypes.MessageListEntry[] = pageItems.map((m) => ({
      id: m.id,
      data_creare: m.data_creare,
      cif: m.cif,
      tip: m.tip,
      id_solicitare: m.id_solicitare,
      detalii: m.detalii,
    }));

    return {
      mesaje,
      count: total,
      page,
      per_page: perPage,
      filtru,
    };
  }
}
