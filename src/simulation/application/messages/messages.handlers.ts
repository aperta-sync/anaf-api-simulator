import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TrafficGeneratorService, ZipArchiveService } from '../services';
import { SimulationEngineService } from '../services';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  EfacturaArchiveResult,
  GetEfacturaArchiveQuery,
  ListEfacturaMessagesQuery,
} from './messages.queries';
import {
  UPLOAD_TRACKING_STORE,
  UploadTrackingStorePort,
} from '../ports/upload-tracking-store.port';
import { UploadEfacturaInvoiceCommand } from './messages.commands';

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

/**
 * Result of an upload command execution.
 */
export interface UploadInvoiceResult {
  indexIncarcare: string;
  dateResponse: string;
}

/**
 * Handles invoice upload by storing tracking record and returning upload index.
 */
@CommandHandler(UploadEfacturaInvoiceCommand)
@Injectable()
export class UploadEfacturaInvoiceHandler implements ICommandHandler<
  UploadEfacturaInvoiceCommand,
  UploadInvoiceResult
> {
  /**
   * Creates an instance of UploadEfacturaInvoiceHandler.
   * @param uploadStore Value for uploadStore.
   * @param simulationEngine Value for simulationEngine.
   */
  constructor(
    @Inject(UPLOAD_TRACKING_STORE)
    private readonly uploadStore: UploadTrackingStorePort,
    private readonly simulationEngine: SimulationEngineService,
  ) {}

  /**
   * Stores the uploaded invoice and returns the allocated upload index.
   *
   * @param command Command payload with CIF, standard, and XML content.
   * @returns Upload index and formatted ANAF date response.
   */
  async execute(
    command: UploadEfacturaInvoiceCommand,
  ): Promise<UploadInvoiceResult> {
    const indexIncarcare = await this.uploadStore.allocateUploadIndex();
    const now = new Date();
    const delayMs = this.simulationEngine.getConfig().processingDelayMs;

    const record: SimulationTypes.UploadedInvoiceRecord = {
      indexIncarcare,
      cif: command.cif,
      standard: command.standard as SimulationTypes.UploadStandard,
      xmlContent: command.xmlContent,
      uploadedAt: now,
      processingCompleteAt: new Date(now.getTime() + delayMs),
      messageId: null,
      status: 'in prelucrare',
      errors: [],
    };

    await this.uploadStore.save(record);

    return {
      indexIncarcare,
      dateResponse: this.formatAnafDate(now),
    };
  }

  /**
   * Formats a date as YYYYMMDDHHmm for ANAF response headers.
   * @param date Value for date.
   * @returns The formatted date string.
   */
  private formatAnafDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}` +
      `${pad(date.getMonth() + 1)}` +
      `${pad(date.getDate())}` +
      `${pad(date.getHours())}` +
      `${pad(date.getMinutes())}`
    );
  }
}

export const MESSAGE_CQRS_HANDLERS = [
  ListEfacturaMessagesHandler,
  GetEfacturaArchiveHandler,
  UploadEfacturaInvoiceHandler,
];
