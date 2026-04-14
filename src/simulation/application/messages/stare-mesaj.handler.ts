import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStareMesajQuery } from './messages.queries';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  STATEFUL_MESSAGE_STORE,
  StatefulMessageStorePort,
} from '../ports/stateful-message-store.port';

/**
 * Handles GET /stareMesaj — checks processing status of an uploaded message.
 *
 * Returns all 4 official stare values:
 *   - ok           (processed successfully)
 *   - nok          (processed with errors)
 *   - in prelucrare (still processing)
 *   - XML cu erori nepreluat de sistem (XML has errors not taken by system)
 *
 * Includes id_descarcare for both ok and nok (per ANAF spec — the ZIP
 * contains either the signed invoice or error details).
 */
@QueryHandler(GetStareMesajQuery)
@Injectable()
export class GetStareMesajHandler
  implements IQueryHandler<GetStareMesajQuery, SimulationTypes.StareMesajResponse>
{
  constructor(
    @Inject(STATEFUL_MESSAGE_STORE)
    private readonly messageStore: StatefulMessageStorePort,
  ) {}

  async execute(
    query: GetStareMesajQuery,
  ): Promise<SimulationTypes.StareMesajResponse> {
    const record = await this.messageStore.getUploadRecord(query.indexIncarcare);

    // ANAF spec: always returns HTTP 200 (no 404 for unknown index)
    if (!record) {
      return {
        index_incarcare: query.indexIncarcare,
        stare: 'XML cu erori nepreluat de sistem' as SimulationTypes.StareMesajValue,
        mesaj: `Unknown index: ${query.indexIncarcare}`,
      };
    }

    const response: SimulationTypes.StareMesajResponse = {
      index_incarcare: record.index_incarcare,
      stare: record.status,
    };

    // id_descarcare present for both ok and nok
    if (record.id_descarcare) {
      response.id_descarcare = record.id_descarcare;
    }

    return response;
  }
}
