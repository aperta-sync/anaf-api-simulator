import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { SimulationTypes } from '../../domain/simulation.types';
import { StatefulMessageStoreService } from '../../infrastructure/persistence/stateful-message-store.service';
import { RomanianCompanyNameGenerator } from './romanian-company-name.generator';
import { SimulationEngineService } from './simulation-engine.service';
import { TrafficGeneratorService } from './traffic-generator.service';

const ENV_KEYS = ['ANAF_MOCK_BOOTSTRAP_PRESET'] as const;

const originalEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

function buildStoredMessage(
  id: string,
  supplier: SimulationTypes.CompanyProfile,
  customer: SimulationTypes.CompanyProfile,
  amount: number,
  createdAt: Date,
  tip = 'FACTURA PRIMITA',
): SimulationTypes.StoredInvoiceMessage {
  return {
    id,
    data_creare: createdAt.toISOString(),
    id_solicitare: id ?? 'SIM-777',
    cif_emitent: supplier.numericCui,
    cif_beneficiar: customer.numericCui,
    cif: supplier.numericCui,
    tip,
    detalii: `Factura de la ${supplier.name} catre ${customer.name}`,
    suma: amount,
    currency: 'RON',
    issueDate: createdAt.toISOString().slice(0, 10),
    payableAmount: amount,
    supplier,
    customer,
    lineDescription: 'Fixture line',
    createdAt,
  };
}

describe('TrafficGeneratorService', () => {
  let simulationEngine: SimulationEngineService;
  let messageStore: StatefulMessageStoreService;
  let service: TrafficGeneratorService;

  beforeEach(async () => {
    restoreEnv();
    process.env.ANAF_MOCK_BOOTSTRAP_PRESET = 'none';

    simulationEngine = new SimulationEngineService(
      new RomanianCompanyNameGenerator(),
    );
    await simulationEngine.onModuleInit();

    messageStore = new StatefulMessageStoreService();
    service = new TrafficGeneratorService(simulationEngine, messageStore);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  it('seeds deterministic core messages once and keeps insertion idempotent', async () => {
    const firstInsertCount = await service.seedPresetMessages('anaf-core');
    const secondInsertCount = await service.seedPresetMessages('anaf-core');

    expect(firstInsertCount).toBeGreaterThan(0);
    expect(secondInsertCount).toBe(0);
  });

  it('applies ANAF filter semantics for incoming, outgoing, error and response views', async () => {
    await service.seedPresetMessages('anaf-core');

    const incoming = await service.listMessages('RO10000008', 40, 'P');
    expect(incoming.length).toBeGreaterThan(0);
    // P filter returns invoices where the queried CIF is the beneficiary.
    // The ANAF `cif` field is the emitter, so it should NOT be the queried CIF.
    expect(incoming.every((m) => m.cif !== '10000008')).toBe(true);

    const outgoing = await service.listMessages('RO10000008', 40, 'T');
    expect(outgoing.length).toBeGreaterThan(0);
    // T filter returns invoices where the queried CIF is the emitter (cif field).
    expect(outgoing.every((m) => m.cif === '10000008')).toBe(true);

    const errorMessages = await service.listMessages('RO10000008', 40, 'E');
    expect(errorMessages.length).toBeGreaterThan(0);
    expect(
      errorMessages.every((message) =>
        /(ERORI|ERROR|INVALID|RESPINS)/i.test(message.tip),
      ),
    ).toBe(true);

    const responseMessages = await service.listMessages('RO10000008', 40, 'R');
    expect(responseMessages.length).toBeGreaterThan(0);
    expect(
      responseMessages.every((message) =>
        /(MESAJ CUMPARATOR|RASPUNS CUMPARATOR|BUYER RESPONSE)/i.test(
          message.tip,
        ),
      ),
    ).toBe(true);

    const fallback = await service.listMessages('RO10000008', 40, 'unknown');
    // Unknown filter falls back to P (incoming) — same as incoming check
    expect(fallback.every((m) => m.cif !== '10000008')).toBe(true);
  });

  it('filters out old messages based on lookback window and sorts by newest first', async () => {
    const supplier = simulationEngine.getCompany('RO10079193');
    const customer = simulationEngine.getCompany('RO10000008');

    if (!supplier || !customer) {
      throw new Error('Expected core preset companies to be available.');
    }

    const oldCreatedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await messageStore.save(
      buildStoredMessage('OLD-1', supplier, customer, 100, oldCreatedAt),
    );
    await messageStore.save(
      buildStoredMessage('NEW-1', supplier, customer, 200, recentCreatedAt),
    );

    const results = await service.listMessages('RO10000008', 30, 'P');

    expect(results.some((message) => message.id === 'OLD-1')).toBe(false);
    expect(results[0]?.id).toBe('NEW-1');
  });

  it('builds an aggregated invoice graph with node totals and merged edges', async () => {
    const supplier = simulationEngine.getCompany('RO10079193');
    const customer = simulationEngine.getCompany('RO10000008');

    if (!supplier || !customer) {
      throw new Error('Expected core preset companies to be available.');
    }

    const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await messageStore.save(
      buildStoredMessage('A-1', supplier, customer, 1000.5, createdAt),
    );
    await messageStore.save(
      buildStoredMessage('A-2', supplier, customer, 499.5, createdAt),
    );

    const graph = await service.buildInvoiceNetworkGraph(30);

    const edgeId = `cui-${supplier.numericCui}__cui-${customer.numericCui}__RON`;
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    const supplierNode = graph.nodes.find(
      (node) => node.id === `cui-${supplier.numericCui}`,
    );
    const customerNode = graph.nodes.find(
      (node) => node.id === `cui-${customer.numericCui}`,
    );

    expect(edge).toBeDefined();
    expect(edge?.invoiceCount).toBe(2);
    expect(edge?.totalAmount).toBe(1500);
    expect(supplierNode?.totalOut).toBe(1500);
    expect(customerNode?.totalIn).toBe(1500);
  });

  it('respects optional auto-generation probability controls', async () => {
    simulationEngine.updateConfig({
      autoGenerateTraffic: true,
      trafficProbability: 0,
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.9);

    const noTraffic = await service.listMessages('RO10000008', 1, 'P');
    expect(noTraffic).toEqual([]);
    expect(await messageStore.listAll()).toHaveLength(0);

    jest.restoreAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0);

    simulationEngine.updateConfig({
      autoGenerateTraffic: true,
      trafficProbability: 1,
    });

    const generated = await service.listMessages('RO10000008', 1, 'P');
    expect(generated.length).toBeGreaterThan(0);
  });

  it('seeds startup messages when bootstrap preset is enabled', async () => {
    process.env.ANAF_MOCK_BOOTSTRAP_PRESET = 'anaf-core';

    const localEngine = new SimulationEngineService(
      new RomanianCompanyNameGenerator(),
    );
    await localEngine.onModuleInit();

    const localStore = new StatefulMessageStoreService();
    const localService = new TrafficGeneratorService(localEngine, localStore);

    await localService.onModuleInit();
    expect((await localStore.listAll()).length).toBeGreaterThan(0);

    process.env.ANAF_MOCK_BOOTSTRAP_PRESET = 'none';
    const noSeedStore = new StatefulMessageStoreService();
    const noSeedService = new TrafficGeneratorService(localEngine, noSeedStore);
    await noSeedService.onModuleInit();
    expect(await noSeedStore.listAll()).toHaveLength(0);
  });

  describe('createMessageFromUpload', () => {
    it('creates a message with correct supplier and customer CIFs', async () => {
      const supplier = simulationEngine.getCompany('RO10079193')!;
      const customer = simulationEngine.getCompany('RO10000008')!;

      const messageId = await service.createMessageFromUpload(
        supplier,
        customer,
        1500.5,
        '<Invoice/>',
      );

      expect(typeof messageId).toBe('string');
      expect(messageId.length).toBeGreaterThan(0);

      const stored = await service.getStoredMessageById(messageId);

      expect(stored).toBeDefined();
      expect(stored?.cif_emitent).toBe(supplier.numericCui);
      expect(stored?.cif_beneficiar).toBe(customer.numericCui);
      expect(stored?.suma).toBe(1500.5);
      expect(stored?.tip).toBe('FACTURA TRIMISA');
    });
  });

  describe('listMessagesPaginated', () => {
    it('returns correct pagination metadata', async () => {
      const supplier = simulationEngine.getCompany('RO10079193')!;
      const customer = simulationEngine.getCompany('RO10000008')!;

      const now = Date.now();
      const createdAt = new Date(now - 60_000);

      await messageStore.save(
        buildStoredMessage('PAG-1', supplier, customer, 100, createdAt),
      );
      await messageStore.save(
        buildStoredMessage('PAG-2', supplier, customer, 200, createdAt),
      );

      const result = await service.listMessagesPaginated(
        'RO10000008',
        now - 3_600_000,
        now,
        1,
        'P',
      );

      expect(result.eroare).toBeNull();
      expect(result.titlu).toBeDefined();
      expect(result.numar_total_inregistrari).toBe(2);
      expect(result.numar_total_pagini).toBe(1);
      expect(result.index_pagina_curenta).toBe(1);
      expect(result.numar_inregistrari_in_pagina).toBe(2);
      expect(result.mesaje).toHaveLength(2);
    });

    it('filters by time range', async () => {
      const supplier = simulationEngine.getCompany('RO10079193')!;
      const customer = simulationEngine.getCompany('RO10000008')!;

      const now = Date.now();
      const insideRange = new Date(now - 60_000);
      const outsideRange = new Date(now - 7_200_000);

      await messageStore.save(
        buildStoredMessage('TR-IN', supplier, customer, 100, insideRange),
      );
      await messageStore.save(
        buildStoredMessage('TR-OUT', supplier, customer, 200, outsideRange),
      );

      const result = await service.listMessagesPaginated(
        'RO10000008',
        now - 3_600_000,
        now,
        1,
        'P',
      );

      expect(result.numar_total_inregistrari).toBe(1);
      expect(result.mesaje[0]?.id).toBe('TR-IN');
    });

    it('returns empty result with descriptive message when no messages match', async () => {
      const now = Date.now();

      const result = await service.listMessagesPaginated(
        'RO10000008',
        now - 3_600_000,
        now,
        1,
        'P',
      );

      expect(result.eroare).toBeNull();
      expect(result.titlu).toContain('Lista Mesaje');
      expect(result.mesaje).toHaveLength(0);
      expect(result.numar_total_inregistrari).toBe(0);
      expect(result.numar_total_pagini).toBe(0);
    });
  });
});
