import { BadRequestException } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { RomanianCompanyNameGenerator } from './romanian-company-name.generator';
import { SimulationEngineService } from './simulation-engine.service';

const ENV_KEYS = [
  'ANAF_MOCK_BOOTSTRAP_PRESET',
  'ANAF_MOCK_BOOTSTRAP_CUIS',
  'ANAF_MOCK_STRICT_VAT',
  'ANAF_MOCK_STRICT_OWNERSHIP',
  'ANAF_MOCK_RATE_LIMIT_MODE',
  'ANAF_MOCK_LATENCY_MS',
  'ANAF_MOCK_ERROR_RATE',
  'ANAF_MOCK_RATE_LIMIT_WINDOW_MS',
  'ANAF_MOCK_RATE_LIMIT_MAX_REQUESTS',
  'ANAF_MOCK_TRAFFIC_PROBABILITY',
  'ANAF_MOCK_AUTO_TRAFFIC',
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

function buildService(): SimulationEngineService {
  return new SimulationEngineService(new RomanianCompanyNameGenerator());
}

describe('SimulationEngineService', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.ANAF_MOCK_BOOTSTRAP_PRESET = 'none';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  it('normalizes CUI input variants into numeric and RO-prefixed forms', () => {
    const service = buildService();

    expect(service.normalizeCui('  ro 1000-0008 ')).toEqual({
      numeric: '10000008',
      ro: 'RO10000008',
    });
  });

  it('validates Romanian CUI checksums', () => {
    const service = buildService();

    expect(service.isValidRomanianCui('RO10000008')).toBe(true);
    expect(service.isValidRomanianCui('111')).toBe(false);
    expect(service.isValidRomanianCui('ROABCDEFGHI')).toBe(false);
  });

  it('generates and caches unknown companies when strict lookup is disabled', async () => {
    const service = buildService();
    await service.onModuleInit();

    const first = service.getCompany('RO10395951');
    const second = service.getCompany('10395951');

    expect(first).toBeDefined();
    expect(first?.cui).toBe('RO10395951');
    expect(second).toBe(first);
  });

  it('returns undefined for unknown companies when strict lookup is enabled', async () => {
    const service = buildService();
    await service.onModuleInit();
    service.updateConfig({ strictVatLookup: true });

    expect(service.getCompany('RO10395951')).toBeUndefined();
  });

  it('throws when seeding a company with an invalid checksum', async () => {
    const service = buildService();
    await service.onModuleInit();

    expect(() =>
      service.seedCompany({
        cui: 'RO111',
        name: 'Invalid Co',
        city: 'Bucuresti',
        county: 'Bucuresti',
        address: 'Str. Test 1, Bucuresti',
        vatPayer: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('clamps and toggles runtime config values consistently', () => {
    const service = buildService();

    const updated = service.updateConfig({
      latencyMs: -10,
      errorRate: 120,
      rateLimitMode: 'windowed',
      rateLimitTrigger: false,
      rateLimitWindowMs: 100,
      rateLimitMaxRequests: 900,
      autoGenerateTraffic: true,
      strictVatLookup: true,
      strictOwnershipValidation: false,
      trafficProbability: 2,
    });

    expect(updated.latencyMs).toBe(0);
    expect(updated.errorRate).toBe(100);
    expect(updated.rateLimitMode).toBe('off');
    expect(updated.rateLimitTrigger).toBe(false);
    expect(updated.rateLimitWindowMs).toBe(1000);
    expect(updated.rateLimitMaxRequests).toBe(500);
    expect(updated.autoGenerateTraffic).toBe(true);
    expect(updated.strictVatLookup).toBe(true);
    expect(updated.strictOwnershipValidation).toBe(false);
    expect(updated.trafficProbability).toBe(1);

    const reenabled = service.updateConfig({ rateLimitTrigger: true });
    expect(reenabled.rateLimitMode).toBe('deterministic');
    expect(reenabled.rateLimitTrigger).toBe(true);
  });

  it('resets runtime config and request counters to defaults', async () => {
    const service = buildService();
    await service.onModuleInit();

    const baseline = service.getConfig();

    service.updateConfig({
      latencyMs: 999,
      errorRate: 77,
      rateLimitMode: 'windowed',
      rateLimitWindowMs: 120_000,
      rateLimitMaxRequests: 50,
      trafficProbability: 0.9,
      autoGenerateTraffic: true,
      strictVatLookup: true,
      strictOwnershipValidation: false,
    });
    service.incrementRequestCount();

    const reset = service.resetConfigToDefaults();

    expect(reset).toEqual(baseline);
    expect(service.getRequestCount()).toBe(0);
  });

  it('evaluates windowed rate limiting using a sliding time window', () => {
    const service = buildService();
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_500)
      .mockReturnValueOnce(1_600)
      .mockReturnValueOnce(2_200);

    const first = service.evaluateWindowRateLimit('client-a', 2, 1_000);
    const second = service.evaluateWindowRateLimit('client-a', 2, 1_000);
    const third = service.evaluateWindowRateLimit('client-a', 2, 1_000);
    const afterWindow = service.evaluateWindowRateLimit('client-a', 2, 1_000);

    expect(first.limited).toBe(false);
    expect(first.remaining).toBe(1);
    expect(second.limited).toBe(false);
    expect(second.remaining).toBe(0);
    expect(third.limited).toBe(true);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(afterWindow.limited).toBe(false);
  });

  it('loads the large preset with many seeded companies and foreign country codes', () => {
    const service = buildService();

    const seeded = service.loadSeedPreset('anaf-large');

    expect(seeded.length).toBeGreaterThanOrEqual(120);
    expect(seeded.some((company) => company.countryCode !== 'RO')).toBe(true);
  });

  it('builds VAT records in ANAF-compatible format', async () => {
    const service = buildService();
    await service.onModuleInit();

    const company = service.getCompany('RO10000008');
    if (!company) {
      throw new Error('Expected bootstrap company RO10000008 to exist.');
    }

    const record = service.buildVatRecord(company, '2026-04-10');

    expect(record.date_generale.cui).toBe(10000008);
    expect(record.date_generale.denumire).toContain('SRL');
    expect(record.inregistrare_scop_Tva.data_inceput_ScpTVA).toBe('2026-04-10');
  });
});
