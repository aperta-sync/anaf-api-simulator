import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TrafficGeneratorService, ZipArchiveService } from '../services';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  EfacturaArchiveResult,
  GetEfacturaArchiveQuery,
  ListEfacturaMessagesQuery,
} from './messages.queries';

/**
 * Handles list retrieval for e-Factura messages.
 */
@QueryHandler(ListEfacturaMessagesQuery)
@Injectable()
export class ListEfacturaMessagesHandler implements IQueryHandler<
  ListEfacturaMessagesQuery,
  SimulationTypes.MessageListResponse
> {
  /**
   * Creates an instance of ListEfacturaMessagesHandler.
   * @param trafficGenerator Value for trafficGenerator.
   */
  constructor(private readonly trafficGenerator: TrafficGeneratorService) {}

  /**
   * Produces ANAF-compatible message list response payload.
   *
   * @param query Query payload with beneficiary CIF and day window.
   * @returns Message list response shape expected by clients.
   */
  async execute(
    query: ListEfacturaMessagesQuery,
  ): Promise<SimulationTypes.MessageListResponse> {
    const mesaje = await this.trafficGenerator.listMessages(
      query.cif,
      query.zile,
      query.filtru,
    );

    return {
      cod: 200,
      message: 'SUCCESS',
      mesaje,
    };
  }
}

/**
 * Handles ZIP archive retrieval for a stored invoice message.
 */
@QueryHandler(GetEfacturaArchiveQuery)
@Injectable()
export class GetEfacturaArchiveHandler implements IQueryHandler<
  GetEfacturaArchiveQuery,
  EfacturaArchiveResult | undefined
> {
  /**
   * Creates an instance of GetEfacturaArchiveHandler.
   * @param trafficGenerator Value for trafficGenerator.
   * @param zipArchiveService Value for zipArchiveService.
   */
  constructor(
    private readonly trafficGenerator: TrafficGeneratorService,
    private readonly zipArchiveService: ZipArchiveService,
  ) {}

  /**
   * Loads a stored message and builds its archive payload when available.
   *
   * @param query Query payload with message identifier.
   * @returns Archive payload or undefined when message does not exist.
   */
  async execute(
    query: GetEfacturaArchiveQuery,
  ): Promise<EfacturaArchiveResult | undefined> {
    const message = await this.trafficGenerator.getStoredMessageById(
      query.messageId,
    );

    if (!message) {
      return undefined;
    }

    return {
      message,
      archive: this.zipArchiveService.buildInvoiceZip(message),
    };
  }
}

export const MESSAGE_CQRS_HANDLERS = [
  ListEfacturaMessagesHandler,
  GetEfacturaArchiveHandler,
];
