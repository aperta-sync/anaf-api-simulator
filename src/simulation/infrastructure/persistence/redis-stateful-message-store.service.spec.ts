import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { SimulationTypes } from '../../domain/simulation.types';

const ENV_KEYS = [
  'ANAF_MOCK_STORE',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
] as const;

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
  cifBeneficiar: string,
  createdAt: Date,
): SimulationTypes.StoredInvoiceMessage {
  const supplier: SimulationTypes.CompanyProfile = {
    cui: 'RO10079193',
    numericCui: '10079193',
    name: 'Supplier SRL',
    city: 'Cluj-Napoca',
    county: 'Cluj',
    address: 'Str. Memorandumului 1, Cluj-Napoca',
    countryCode: 'RO',
    vatPayer: true,
  };

  const customer: SimulationTypes.CompanyProfile = {
    cui: `RO${cifBeneficiar}`,
    numericCui: cifBeneficiar,
    name: 'Customer SRL',
    city: 'Bucuresti',
    county: 'Bucuresti',
    address: 'Bd. Unirii 1, Bucuresti',
    countryCode: 'RO',
    vatPayer: true,
  };

  return {
    id,
    data_creare: createdAt.toISOString(),
    creation_date: createdAt.toISOString(),
    cif_emitent: supplier.numericCui,
    cif_beneficiar: customer.numericCui,
    cif: supplier.numericCui,
    tip: 'FACTURA PRIMITA',
    detalii: 'Factura de test',
    suma: 120.5,
    currency: 'RON',
    issueDate: createdAt.toISOString().slice(0, 10),
    payableAmount: 120.5,
    supplier,
    customer,
    lineDescription: 'Servicii de test',
    createdAt,
  };
}

interface RedisMockState {
  constructorArgs: unknown[];
  counters: Map<string, number>;
  hashes: Map<string, Map<string, string>>;
  sets: Map<string, Set<string>>;
}

function setupRedisMock(): RedisMockState {
  const state: RedisMockState = {
    constructorArgs: [],
    counters: new Map<string, number>(),
    hashes: new Map<string, Map<string, string>>(),
    sets: new Map<string, Set<string>>(),
  };

  class FakeRedis {
    constructor(options?: unknown) {
      state.constructorArgs.push(options);
    }

    async incr(key: string): Promise<number> {
      const next = (state.counters.get(key) ?? 0) + 1;
      state.counters.set(key, next);
      return next;
    }

    async hset(key: string, field: string, value: string): Promise<number> {
      const hash = state.hashes.get(key) ?? new Map<string, string>();
      hash.set(field, value);
      state.hashes.set(key, hash);
      return 1;
    }

    async hget(key: string, field: string): Promise<string | null> {
      return state.hashes.get(key)?.get(field) ?? null;
    }

    async sadd(key: string, member: string): Promise<number> {
      const set = state.sets.get(key) ?? new Set<string>();
      set.add(member);
      state.sets.set(key, set);
      return 1;
    }

    async smembers(key: string): Promise<string[]> {
      return [...(state.sets.get(key) ?? new Set<string>())];
    }

    async del(key: string): Promise<number> {
      const deletedFromHash = state.hashes.delete(key) ? 1 : 0;
      const deletedFromSet = state.sets.delete(key) ? 1 : 0;
      return deletedFromHash + deletedFromSet;
    }
  }

  jest.doMock('ioredis', () => FakeRedis);
  return state;
}

describe('RedisStatefulMessageStoreService', () => {
  beforeEach(() => {
    restoreEnv();
    jest.resetModules();
    jest.dontMock('ioredis');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    jest.dontMock('ioredis');
    restoreEnv();
  });

  it('uses memory fallback when redis mode is not enabled', async () => {
    process.env.ANAF_MOCK_STORE = 'memory';

    const moduleRef = await import('./redis-stateful-message-store.service');
    const service = new moduleRef.RedisStatefulMessageStoreService();

    const createdAt = new Date('2026-04-10T10:00:00.000Z');
    const message = buildStoredMessage('MEM-1', '10000008', createdAt);

    await service.save(message);

    const found = await service.findById('MEM-1');
    const list = await service.listForBeneficiary('10000008');

    expect(found?.id).toBe('MEM-1');
    expect(list).toHaveLength(1);
    expect((await service.listAll())[0]?.id).toBe('MEM-1');
  });

  it('uses redis client with REDIS_URL when redis mode is enabled', async () => {
    process.env.ANAF_MOCK_STORE = 'redis';
    process.env.REDIS_URL = 'redis://127.0.0.1:6380';

    const redisState = setupRedisMock();

    const moduleRef = await import('./redis-stateful-message-store.service');
    const service = new moduleRef.RedisStatefulMessageStoreService();

    expect(redisState.constructorArgs[0]).toBe('redis://127.0.0.1:6380');

    const id1 = await service.allocateId();
    const id2 = await service.allocateId();

    expect(id1).toMatch(/^SIM-\d+-00001$/);
    expect(id2).toMatch(/^SIM-\d+-00002$/);
  });

  it('uses redis host and port config when REDIS_URL is absent', async () => {
    process.env.ANAF_MOCK_STORE = 'redis';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6381';

    const redisState = setupRedisMock();

    const moduleRef = await import('./redis-stateful-message-store.service');
    const service = new moduleRef.RedisStatefulMessageStoreService();
    await service.allocateId();

    expect(redisState.constructorArgs[0]).toEqual({
      host: 'localhost',
      port: 6381,
    });
  });

  it('saves, hydrates and sorts messages via redis-backed collections', async () => {
    process.env.ANAF_MOCK_STORE = 'redis';

    const redisState = setupRedisMock();

    const moduleRef = await import('./redis-stateful-message-store.service');
    const service = new moduleRef.RedisStatefulMessageStoreService();

    const older = buildStoredMessage(
      'RED-1',
      '10000008',
      new Date('2026-04-08T09:00:00.000Z'),
    );
    const newer = buildStoredMessage(
      'RED-2',
      '10000008',
      new Date('2026-04-09T09:00:00.000Z'),
    );

    await service.saveMany([older, newer]);

    const found = await service.findById('RED-1');
    expect(found?.createdAt instanceof Date).toBe(true);

    const listByBeneficiary = await service.listForBeneficiary('10000008');
    expect(listByBeneficiary.map((message) => message.id)).toEqual([
      'RED-2',
      'RED-1',
    ]);

    const all = await service.listAll();
    expect(all.map((message) => message.id)).toEqual(['RED-2', 'RED-1']);

    const beneficiaryKey = 'anaf:mock:beneficiary:10000008';
    redisState.sets.get(beneficiaryKey)?.add('RED-MISSING');

    const filteredList = await service.listForBeneficiary('10000008');
    expect(filteredList.map((message) => message.id)).toEqual([
      'RED-2',
      'RED-1',
    ]);
  });

  it('falls back to memory mode when ioredis cannot be loaded', async () => {
    process.env.ANAF_MOCK_STORE = 'redis';

    jest.doMock('ioredis', () => {
      throw new Error('ioredis unavailable');
    });

    const moduleRef = await import('./redis-stateful-message-store.service');
    const service = new moduleRef.RedisStatefulMessageStoreService();

    const message = buildStoredMessage(
      'FALLBACK-1',
      '10000008',
      new Date('2026-04-10T10:00:00.000Z'),
    );

    await service.save(message);
    expect((await service.findById('FALLBACK-1'))?.id).toBe('FALLBACK-1');
  });
});
