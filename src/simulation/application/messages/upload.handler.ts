import { Injectable } from '@nestjs/common';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { CommandBus } from '@nestjs/cqrs';
import { UploadMessageCommand } from './messages.commands';
import { SimulationTypes } from '../../domain/simulation.types';
import {
  STATEFUL_MESSAGE_STORE,
  StatefulMessageStorePort,
} from '../ports/stateful-message-store.port';
import { SimulationEngineService } from '../services';
import { ZipArchiveService } from '../services';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handles POST /upload — stores raw XML and returns ANAF-format response.
 */
@CommandHandler(UploadMessageCommand)
@Injectable()
export class UploadMessageHandler implements ICommandHandler<UploadMessageCommand, SimulationTypes.StareMesajResponse> {
  constructor(
    @Inject(STATEFUL_MESSAGE_STORE)
    private readonly messageStore: StatefulMessageStorePort,
    private readonly simulationEngine: SimulationEngineService,
  ) {}

  async execute(
    command: UploadMessageCommand,
  ): Promise<SimulationTypes.StareMesajResponse> {
    const { xmlBody, cif, indexIncarcare, extern, autofactura, executare } = command;

    // Determine processing delay from simulation config (default 3000ms)
    const config = this.simulationEngine.getConfig();
    const processingDelayMs = config.processingDelayMs ?? 3000;

    // Simulate lazy processing: store as "in prelucrare" initially
    const trackingRecord: SimulationTypes.UploadTrackingRecord = {
      index_incarcare: indexIncarcare,
      createdAt: new Date(),
      cif,
      status: 'in prelucrare',
      xml_content: xmlBody,
      extern,
      autofactura,
      executare,
    };
    await this.messageStore.saveUpload(trackingRecord);

    // Build ANAF-format response (mfp:anaf:dgti:spv:respUploadFisier:v1)
    // In a real ANAF scenario, the response would be XML.
    // Here we return the structured response format:
    return {
      index_incarcare: indexIncarcare,
      stare: 'in prelucrare',
      mesaj: `Upload accepted. Processing will complete in ~${processingDelayMs}ms.`,
    } as SimulationTypes.StareMesajResponse;
  }
}
