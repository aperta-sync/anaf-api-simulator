import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { RomanianCompanyNameGenerator } from './romanian-company-name.generator';
import { SimulationTypes } from '../../domain/simulation.types';
import { RedisControlStateStoreService } from '../../infrastructure/persistence/redis-control-state-store.service';

interface PersistedSimulationRuntimeState {
  config?: Partial<SimulationTypes.SimulationConfig>;
  registry?: SimulationTypes.CompanyProfile[];
  generatedCompanies?: SimulationTypes.CompanyProfile[];
}

/**
 * Core simulation state manager for company registry, VAT behavior and runtime settings.
 */
@Injectable()
export class SimulationEngineService implements OnModuleInit {
  private static readonly RUNTIME_STATE_KEY =
    'anaf:mock:state:simulation-runtime:v1';

  private static readonly CORE_PRESET_COMPANIES: SimulationTypes.SeedCompanyRequest[] =
    [
      {
        cui: 'RO10000008',
        name: 'Aperta Sync Consulting SRL',
        city: 'Bucuresti',
        county: 'Bucuresti',
        address: 'Bd. Unirii 12, Bucuresti',
        vatPayer: true,
      },
      {
        cui: 'RO10079193',
        name: 'Delta Logistics Solutions SRL',
        city: 'Cluj-Napoca',
        county: 'Cluj',
        address: 'Str. Dorobantilor 28, Cluj-Napoca',
        vatPayer: true,
      },
      {
        cui: 'RO10158386',
        name: 'Transilvania Energy Partners SRL',
        city: 'Brasov',
        county: 'Brasov',
        address: 'Calea Bucuresti 51, Brasov',
        vatPayer: true,
      },
      {
        cui: 'RO10237579',
        name: 'Nordic Parts Distribution SRL',
        city: 'Oradea',
        county: 'Bihor',
        address: 'Str. Republicii 10, Oradea',
        vatPayer: true,
      },
      {
        cui: 'RO10316761',
        name: 'Vest Service Hub SRL',
        city: 'Sibiu',
        county: 'Sibiu',
        address: 'Bd. Victoriei 25, Sibiu',
        vatPayer: true,
      },
    ];

  private static readonly LARGE_PRESET_BRANDS = [
    'Amazon Web Services',
    'Microsoft Azure',
    'Google Cloud',
    'Oracle',
    'SAP',
    'Salesforce',
    'Atlassian',
    'Adobe',
    'Siemens Digital',
    'Bosch Connected',
    'Schneider Electric',
    'Accenture Technology',
    'Capgemini Business',
    'Deloitte Digital',
    'PwC Advisory',
    'EY Consulting',
    'KPMG Services',
    'Vodafone Enterprise',
    'Orange Business',
    'ING Procurement',
    'UniCredit Services',
    'Deutsche Telekom',
    'Nokia Networks',
    'Ericsson Digital',
    'Continental Engineering',
    'Michelin Supply',
    'Maersk Trade',
    'DHL Global Forwarding',
    'HP Enterprise',
    'Lenovo Solutions',
  ];

  private static readonly LARGE_PRESET_COUNTRIES = [
    'US',
    'DE',
    'FR',
    'NL',
    'SE',
    'NO',
    'DK',
    'IE',
    'IT',
    'ES',
    'PL',
    'CZ',
    'HU',
    'AT',
    'CH',
    'BE',
    'LU',
    'PT',
    'FI',
    'GB',
    'CA',
    'JP',
    'KR',
    'SG',
    'AE',
    'AU',
  ];

  private readonly logger = new Logger(SimulationEngineService.name);
  private readonly counties = [
    'Bucuresti',
    'Cluj',
    'Iasi',
    'Timis',
    'Brasov',
    'Constanta',
  ];
  private readonly cities = [
    'Bucuresti',
    'Cluj-Napoca',
    'Iasi',
    'Timisoara',
    'Brasov',
    'Constanta',
  ];

  private readonly registry = new Map<string, SimulationTypes.CompanyProfile>();
  private readonly generatedCompanies = new Map<
    string,
    SimulationTypes.CompanyProfile
  >();

  private simulationConfig: SimulationTypes.SimulationConfig;

  private requestCount = 0;
  private readonly rateLimitWindows = new Map<string, number[]>();

  /**
   * Creates an instance of SimulationEngineService.
   * @param companyNameGenerator Value for companyNameGenerator.
   * @param controlStateStore Value for controlStateStore.
   */
  constructor(
    private readonly companyNameGenerator: RomanianCompanyNameGenerator,
    private readonly controlStateStore?: RedisControlStateStoreService,
  ) {
    this.simulationConfig = this.buildDefaultConfig();
  }

  /**
   * Seeds bootstrap companies on module startup.
   */
  async onModuleInit(): Promise<void> {
    await this.restoreRuntimeState();

    if (!this.registry.size) {
      const bootstrapPreset = this.resolveBootstrapPreset();
      if (bootstrapPreset) {
        this.loadSeedPreset(bootstrapPreset);
      }

      this.bootstrapCompaniesFromEnv();
    }

    if (!this.registry.size) {
      for (const company of SimulationEngineService.CORE_PRESET_COMPANIES) {
        this.seedCompanyInternal(company, false);
      }
    }

    await this.persistRuntimeState();
  }

  /**
   * Normalizes CUI inputs into numeric and RO-prefixed variants.
   *
   * @param raw Raw CUI value.
   * @returns Normalized numeric and RO-prefixed CUI values.
   */
  normalizeCui(raw: string | number): { numeric: string; ro: string } {
    const normalized = String(raw).trim().toUpperCase();
    const withoutPrefix = normalized.replace(/^RO/, '');
    const numeric = withoutPrefix.replace(/[\s-]/g, '');
    return { numeric, ro: `RO${numeric}` };
  }

  /**
   * Validates Romanian CUI checksum and format.
   *
   * @param raw Raw CUI value.
   * @returns True when checksum and length rules are satisfied.
   */
  isValidRomanianCui(raw: string | number): boolean {
    const { numeric } = this.normalizeCui(raw);

    if (!/^\d{2,10}$/.test(numeric)) {
      return false;
    }

    const controlDigit = Number(numeric[numeric.length - 1]);
    const body = numeric.slice(0, -1);
    const controlKey = '753217532';
    const offset = controlKey.length - body.length;

    if (offset < 0) {
      return false;
    }

    let sum = 0;
    for (let index = 0; index < body.length; index += 1) {
      sum += Number(body[index]) * Number(controlKey[offset + index]);
    }

    let expected = (sum * 10) % 11;
    if (expected === 10) {
      expected = 0;
    }

    return expected === controlDigit;
  }

  /**
   * Resolves a company profile for a CUI from seeded or generated datasets.
   *
   * @param rawCui Raw CUI value.
   * @returns Company profile when available under current lookup mode.
   */
  getCompany(
    rawCui: string | number,
  ): SimulationTypes.CompanyProfile | undefined {
    if (!this.isValidRomanianCui(rawCui)) {
      return undefined;
    }

    const { numeric, ro } = this.normalizeCui(rawCui);

    const registered = this.registry.get(numeric);
    if (registered) {
      return registered;
    }

    if (this.simulationConfig.strictVatLookup) {
      return undefined;
    }

    const cached = this.generatedCompanies.get(numeric);
    if (cached) {
      return cached;
    }

    const company = this.createGeneratedProfile(numeric, ro);

    this.generatedCompanies.set(numeric, company);
    this.persistRuntimeStateAsync();
    return company;
  }

  /**
   * Seeds multiple companies at once.
   *
   * @param companies Company seed payloads.
   * @returns Persisted company profiles.
   */
  seedCompanies(
    companies: SimulationTypes.SeedCompanyRequest[],
  ): SimulationTypes.CompanyProfile[] {
    const seeded = companies.map((company) =>
      this.seedCompanyInternal(company, false),
    );
    this.persistRuntimeStateAsync();
    return seeded;
  }

  /**
   * Seeds one company profile into the registry.
   *
   * @param company Company seed payload.
   * @returns Persisted company profile.
   */
  seedCompany(
    company: SimulationTypes.SeedCompanyRequest,
  ): SimulationTypes.CompanyProfile {
    return this.seedCompanyInternal(company, true);
  }

  /**
   * Returns all currently known companies under active strictness rules.
   *
   * @returns Merged list of seeded and generated profiles.
   */
  getKnownCompanies(): SimulationTypes.CompanyProfile[] {
    const known = new Map<string, SimulationTypes.CompanyProfile>();

    for (const company of this.registry.values()) {
      known.set(company.numericCui, company);
    }

    if (!this.simulationConfig.strictVatLookup) {
      for (const company of this.generatedCompanies.values()) {
        known.set(company.numericCui, company);
      }
    }

    return [...known.values()].sort((left, right) =>
      left.name.localeCompare(right.name, 'ro'),
    );
  }

  /**
   * Seeds a predefined dataset profile used by realism and demo scenarios.
   *
   * @param preset Seed preset identifier.
   * @returns Seeded company profiles.
   */
  loadSeedPreset(
    preset: SimulationTypes.SeedPresetName,
  ): SimulationTypes.CompanyProfile[] {
    const payload =
      preset === 'anaf-large'
        ? this.buildLargePresetCompanies()
        : SimulationEngineService.CORE_PRESET_COMPANIES;

    const seeded = this.seedCompanies(payload);
    this.logger.log(
      `Loaded seed preset ${preset} (${seeded.length} company profiles).`,
    );
    return seeded;
  }

  /**
   * Builds ANAF-like VAT registry response payload for a company.
   *
   * @param company Company profile.
   * @param requestDate Lookup date from caller.
   * @returns VAT record in ANAF v9-compatible shape.
   */
  buildVatRecord(
    company: SimulationTypes.CompanyProfile,
    requestDate: string,
  ): SimulationTypes.VatFoundRecord {
    const hash = this.hash(company.numericCui);
    const registrationDate = new Date(
      Date.UTC(2018 + (hash % 6), hash % 12, 1 + (hash % 27)),
    )
      .toISOString()
      .slice(0, 10);

    const nrRegCom =
      company.nrRegCom ??
      `J${40 + (hash % 12)}/${1000 + (hash % 7000)}/2019`;
    const codPostal =
      `${100000 + (hash % 899999)}`;
    const countyCode = company.countyCode ?? company.county.slice(0, 2).toUpperCase();

    return {
      date_generale: {
        cui: Number(company.numericCui),
        denumire: company.name,
        adresa: company.address,
        nrRegCom,
        telefon: `+40 7${10 + (hash % 89)} ${100 + (hash % 899)} ${
          100 + ((hash * 7) % 899)
        }`,
        codPostal,
        data_inregistrare: registrationDate,
        cod_CAEN: `${4711 + (hash % 200)}`,
      },
      inregistrare_scop_Tva: {
        scpTVA: company.vatPayer,
        data_inceput_ScpTVA: requestDate,
        data_anulare_ScpTVA: null,
      },
      inregistrare_RTVAI: {
        statusRTVAI: false,
        dataInregistrare: requestDate,
        dataAnulare: null,
      },
      adresa_sediu_social: {
        sdenumire_Strada: company.streetName ?? `Str. Independentei`,
        snumar_Strada: company.streetNumber ?? `${1 + (hash % 97)}`,
        sdenumire_Localitate: company.locality ?? company.city,
        scod_Localitate: `${hash % 999}`,
        sdenumire_Judet: company.county,
        scod_JudetAuto: countyCode,
        scod_Judet: `${40 + (hash % 12)}`,
        stara: company.countryCode ?? 'RO',
        sdetalii_Adresa: '',
        scod_Postal: codPostal,
      },
    };
  }

  /**
   * Returns current runtime simulation config.
   *
   * @returns Copy of current simulation configuration.
   */
  getConfig(): SimulationTypes.SimulationConfig {
    return { ...this.simulationConfig };
  }

  /**
   * Applies runtime config updates with bounded value normalization.
   *
   * @param update Partial config updates.
   * @returns Updated simulation configuration.
   */
  updateConfig(
    update: Partial<SimulationTypes.SimulationConfig>,
  ): SimulationTypes.SimulationConfig {
    this.applyConfigUpdate(update);
    this.persistRuntimeStateAsync();
    return this.getConfig();
  }

  /**
   * Resets runtime simulation config and counters to startup defaults.
   *
   * @returns Updated simulation configuration.
   */
  resetConfigToDefaults(): SimulationTypes.SimulationConfig {
    this.simulationConfig = this.buildDefaultConfig();
    this.requestCount = 0;
    this.rateLimitWindows.clear();
    this.persistRuntimeStateAsync();
    return this.getConfig();
  }

  /**
   * Applies validated config values onto the in-memory runtime config.
   *
   * @param update Partial config values.
   */
  private applyConfigUpdate(
    update: Partial<SimulationTypes.SimulationConfig>,
  ): void {
    if (typeof update.latencyMs === 'number') {
      this.simulationConfig.latencyMs = Math.max(
        0,
        Math.floor(update.latencyMs),
      );
    }
    if (typeof update.processingDelayMs === 'number') {
      this.simulationConfig.processingDelayMs = Math.max(
        0,
        Math.floor(update.processingDelayMs),
      );
    }
    if (typeof update.errorRate === 'number') {
      this.simulationConfig.errorRate = Math.min(
        100,
        Math.max(0, update.errorRate),
      );
    }
    if (
      update.rateLimitMode === 'off' ||
      update.rateLimitMode === 'deterministic' ||
      update.rateLimitMode === 'windowed'
    ) {
      this.simulationConfig.rateLimitMode = update.rateLimitMode;
    }
    if (typeof update.rateLimitTrigger === 'boolean') {
      this.simulationConfig.rateLimitMode = update.rateLimitTrigger
        ? this.simulationConfig.rateLimitMode === 'off'
          ? 'deterministic'
          : this.simulationConfig.rateLimitMode
        : 'off';
    }
    if (typeof update.rateLimitWindowMs === 'number') {
      this.simulationConfig.rateLimitWindowMs = Math.min(
        300_000,
        Math.max(1_000, Math.floor(update.rateLimitWindowMs)),
      );
    }
    if (typeof update.rateLimitMaxRequests === 'number') {
      this.simulationConfig.rateLimitMaxRequests = Math.min(
        500,
        Math.max(1, Math.floor(update.rateLimitMaxRequests)),
      );
    }
    if (typeof update.autoGenerateTraffic === 'boolean') {
      this.simulationConfig.autoGenerateTraffic = update.autoGenerateTraffic;
    }
    if (typeof update.strictVatLookup === 'boolean') {
      this.simulationConfig.strictVatLookup = update.strictVatLookup;
    }
    if (typeof update.strictOwnershipValidation === 'boolean') {
      this.simulationConfig.strictOwnershipValidation =
        update.strictOwnershipValidation;
    }
    if (typeof update.trafficProbability === 'number') {
      this.simulationConfig.trafficProbability = Math.min(
        1,
        Math.max(0, update.trafficProbability),
      );
    }

    this.simulationConfig.rateLimitTrigger =
      this.simulationConfig.rateLimitMode !== 'off';
  }

  /**
   * Builds startup-default simulation configuration from environment values.
   *
   * @returns Environment-resolved simulation defaults.
   */
  private buildDefaultConfig(): SimulationTypes.SimulationConfig {
    return {
      latencyMs: Number(process.env.ANAF_MOCK_LATENCY_MS ?? 200),
      processingDelayMs: Number(process.env.ANAF_MOCK_PROCESSING_DELAY_MS ?? 3000),
      errorRate: Number(process.env.ANAF_MOCK_ERROR_RATE ?? 0),
      rateLimitMode: (process.env.ANAF_MOCK_RATE_LIMIT_MODE ?? 'off') as any,
      rateLimitWindowMs: Number(
        process.env.ANAF_MOCK_RATE_LIMIT_WINDOW_MS ?? 60_000,
      ),
      rateLimitMaxRequests: Number(
        process.env.ANAF_MOCK_RATE_LIMIT_MAX_REQUESTS ?? 10,
      ),
      rateLimitTrigger:
        (process.env.ANAF_MOCK_RATE_LIMIT_MODE ?? 'off') !== 'off',
      trafficProbability: Number(
        process.env.ANAF_MOCK_TRAFFIC_PROBABILITY ?? 0.35,
      ),
      autoGenerateTraffic:
        (process.env.ANAF_MOCK_AUTO_TRAFFIC ?? 'false') === 'true',
      strictVatLookup: (process.env.ANAF_MOCK_STRICT_VAT ?? 'false') === 'true',
      strictOwnershipValidation:
        (process.env.ANAF_MOCK_STRICT_OWNERSHIP ?? 'true') === 'true',
    };
  }

  /**
   * Increments and returns global request counter.
   *
   * @returns Updated request count.
   */
  incrementRequestCount(): number {
    this.requestCount += 1;
    return this.requestCount;
  }

  /**
   * Returns total requests processed by fault injector middleware.
   *
   * @returns Request counter value.
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Applies a sliding-window rate limit for the provided key.
   *
   * @param key Per-client key used to isolate counters.
   * @param maxRequests Allowed requests within the window.
   * @param windowMs Sliding window size in milliseconds.
   * @returns Window limit evaluation details.
   */
  evaluateWindowRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): {
    limited: boolean;
    remaining: number;
    retryAfterSeconds: number;
    resetAt: number;
  } {
    const now = Date.now();
    const windowStart = now - windowMs;
    const active = (this.rateLimitWindows.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );

    if (active.length >= maxRequests) {
      const resetAt = active[0] + windowMs;
      this.rateLimitWindows.set(key, active);

      return {
        limited: true,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
        resetAt,
      };
    }

    active.push(now);
    this.rateLimitWindows.set(key, active);

    return {
      limited: false,
      remaining: Math.max(0, maxRequests - active.length),
      retryAfterSeconds: 0,
      resetAt: active[0] + windowMs,
    };
  }

  /**
   * Seeds bootstrap companies from environment variable list.
   */
  private bootstrapCompaniesFromEnv(): void {
    const configuredCuis = process.env.ANAF_MOCK_BOOTSTRAP_CUIS;
    if (!configuredCuis) {
      return;
    }

    const values = configuredCuis
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const seeded = values
      .map((value) => this.seedBootstrapCompany(value))
      .filter(
        (profile): profile is SimulationTypes.CompanyProfile =>
          profile !== undefined,
      );

    if (seeded.length > 0) {
      this.logger.log(
        `Bootstrapped ${seeded.length} CUI profiles from ANAF_MOCK_BOOTSTRAP_CUIS`,
      );
      this.persistRuntimeStateAsync();
    }
  }

  /**
   * Restores simulation runtime state from control-state persistence.
   */
  private async restoreRuntimeState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    const persisted =
      await this.controlStateStore.readJson<PersistedSimulationRuntimeState>(
        SimulationEngineService.RUNTIME_STATE_KEY,
      );

    if (!persisted || typeof persisted !== 'object') {
      return;
    }

    if (persisted.config && typeof persisted.config === 'object') {
      this.applyConfigUpdate(persisted.config);
    }

    if (Array.isArray(persisted.registry)) {
      this.registry.clear();
      for (const candidate of persisted.registry) {
        const profile = this.hydrateCompanyProfile(candidate);
        if (!profile) {
          continue;
        }

        this.registry.set(profile.numericCui, profile);
      }
    }

    if (Array.isArray(persisted.generatedCompanies)) {
      this.generatedCompanies.clear();
      for (const candidate of persisted.generatedCompanies) {
        const profile = this.hydrateCompanyProfile(candidate);
        if (!profile) {
          continue;
        }

        this.generatedCompanies.set(profile.numericCui, profile);
      }
    }

    if (this.registry.size > 0 || this.generatedCompanies.size > 0) {
      this.logger.log(
        `Restored simulation runtime state from Redis (${this.registry.size} seeded, ${this.generatedCompanies.size} generated companies).`,
      );
    }
  }

  /**
   * Persists runtime state without blocking request flow.
   */
  private persistRuntimeStateAsync(): void {
    void this.persistRuntimeState();
  }

  /**
   * Persists simulation runtime state to Redis control-store.
   */
  private async persistRuntimeState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    const payload: PersistedSimulationRuntimeState = {
      config: this.getConfig(),
      registry: [...this.registry.values()],
      generatedCompanies: [...this.generatedCompanies.values()],
    };

    await this.controlStateStore.writeJson(
      SimulationEngineService.RUNTIME_STATE_KEY,
      payload,
    );
  }

  /**
   * Hydrates a stored company profile after basic validation.
   *
   * @param input Raw persisted value.
   * @returns Normalized company profile or undefined when invalid.
   */
  private hydrateCompanyProfile(
    input: unknown,
  ): SimulationTypes.CompanyProfile | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const candidate = input as Partial<SimulationTypes.CompanyProfile>;
    const rawCui = String(candidate.cui ?? '').trim();
    if (!this.isValidRomanianCui(rawCui)) {
      return undefined;
    }

    const normalized = this.normalizeCui(rawCui);
    const name = String(candidate.name ?? '').trim();
    const city = String(candidate.city ?? '').trim();
    const county = String(candidate.county ?? '').trim();
    const address = String(candidate.address ?? '').trim();

    if (!name || !city || !county || !address) {
      return undefined;
    }

    return {
      cui: normalized.ro,
      numericCui: normalized.numeric,
      name,
      city,
      county,
      address,
      countryCode: String(candidate.countryCode ?? 'RO')
        .trim()
        .toUpperCase(),
      vatPayer: candidate.vatPayer !== false,
    };
  }

  /**
   * Resolves the startup seed preset from environment variables.
   *
   * @returns Preset name when configured, otherwise undefined.
   */
  private resolveBootstrapPreset(): SimulationTypes.SeedPresetName | undefined {
    const configured = (process.env.ANAF_MOCK_BOOTSTRAP_PRESET ?? 'anaf-core')
      .trim()
      .toLowerCase();

    if (!configured || configured === 'none') {
      return undefined;
    }

    if (configured === 'anaf-large' || configured === 'large') {
      return 'anaf-large';
    }

    if (configured !== 'anaf-core' && configured !== 'core') {
      this.logger.warn(
        `Unknown ANAF_MOCK_BOOTSTRAP_PRESET value "${configured}". Falling back to anaf-core.`,
      );
    }

    return 'anaf-core';
  }

  /**
   * Seeds one bootstrap company when checksum is valid.
   *
   * @param rawCui Raw CUI from bootstrap list.
   * @returns Seeded profile or undefined when CUI is invalid.
   */
  private seedBootstrapCompany(
    rawCui: string,
  ): SimulationTypes.CompanyProfile | undefined {
    if (!this.isValidRomanianCui(rawCui)) {
      this.logger.warn(
        `Skipping invalid bootstrap CUI ${rawCui} (checksum validation failed).`,
      );
      return undefined;
    }

    const normalized = this.normalizeCui(rawCui);
    const existing = this.registry.get(normalized.numeric);

    if (existing) {
      return existing;
    }

    const generated = this.createGeneratedProfile(
      normalized.numeric,
      normalized.ro,
    );

    return this.seedCompanyInternal(
      {
        cui: generated.cui,
        name: generated.name,
        city: generated.city,
        county: generated.county,
        address: generated.address,
        countryCode: generated.countryCode,
        vatPayer: generated.vatPayer,
      },
      false,
    );
  }

  /**
   * Seeds one company profile into the registry with optional persistence.
   *
   * @param company Company seed payload.
   * @param persist Whether to persist runtime state after mutation.
   * @returns Persisted company profile.
   */
  private seedCompanyInternal(
    company: SimulationTypes.SeedCompanyRequest,
    persist: boolean,
  ): SimulationTypes.CompanyProfile {
    if (!this.isValidRomanianCui(company.cui)) {
      throw new BadRequestException(
        `Invalid Romanian CUI checksum: ${company.cui}`,
      );
    }

    const normalized = this.normalizeCui(company.cui);

    const seededProfile: SimulationTypes.CompanyProfile = {
      cui: normalized.ro,
      numericCui: normalized.numeric,
      name: company.name,
      city: company.city,
      county: company.county,
      address: company.address,
      countryCode: (company.countryCode ?? 'RO').toUpperCase(),
      vatPayer: company.vatPayer ?? true,
      nrRegCom: company.nrRegCom,
      streetName: company.streetName,
      streetNumber: company.streetNumber,
      locality: company.locality,
      countyCode: company.countyCode,
    };

    this.registry.set(normalized.numeric, seededProfile);
    this.generatedCompanies.delete(normalized.numeric);

    if (persist) {
      this.persistRuntimeStateAsync();
    }

    return seededProfile;
  }

  /**
   * Creates a deterministic synthetic company profile from CUI.
   *
   * @param numericCui Numeric CUI string.
   * @param roCui RO-prefixed CUI string.
   * @returns Generated company profile.
   */
  private createGeneratedProfile(
    numericCui: string,
    roCui: string,
  ): SimulationTypes.CompanyProfile {
    const hash = this.hash(numericCui);
    const city = this.cities[hash % this.cities.length];
    const county = this.counties[Math.floor(hash / 7) % this.counties.length];

    return {
      cui: roCui,
      numericCui,
      name: this.companyNameGenerator.generateFromCui(numericCui),
      city,
      county,
      address: `Str. Independentei ${1 + (hash % 97)}, ${city}`,
      countryCode: 'RO',
      vatPayer: hash % 10 !== 0,
    };
  }

  /**
   * Builds a larger deterministic dataset that includes Romanian branches of
   * international counterparties for realistic sandbox and graph scenarios.
   *
   * @returns Seed request payload for the large preset.
   */
  private buildLargePresetCompanies(): SimulationTypes.SeedCompanyRequest[] {
    const dataset = [...SimulationEngineService.CORE_PRESET_COMPANIES];
    const targetSize = 120;

    for (let index = 0; dataset.length < targetSize; index += 1) {
      const numericCui = this.toValidRomanianCui(
        String(20_000_000 + index * 97 + 31),
      );
      const brand =
        SimulationEngineService.LARGE_PRESET_BRANDS[
          index % SimulationEngineService.LARGE_PRESET_BRANDS.length
        ];
      const countryCode =
        SimulationEngineService.LARGE_PRESET_COUNTRIES[
          index % SimulationEngineService.LARGE_PRESET_COUNTRIES.length
        ];
      const city = this.cities[index % this.cities.length];
      const county = this.counties[index % this.counties.length];

      dataset.push({
        cui: `RO${numericCui}`,
        name: `${brand} ${countryCode} Shared Services SRL`,
        city,
        county,
        address: `Str. Europa ${10 + (index % 80)}, ${city}`,
        countryCode,
        vatPayer: true,
      });
    }

    return dataset;
  }

  /**
   * Converts an arbitrary numeric base into a valid Romanian CUI checksum.
   *
   * @param rawBase Numeric base string used as checksum body.
   * @returns Valid Romanian CUI numeric value.
   */
  private toValidRomanianCui(rawBase: string): string {
    const sanitized = rawBase.replace(/\D/g, '').slice(0, 9) || '10000000';
    const body = sanitized.replace(/^0+/, '') || '10000000';
    const controlKey = '753217532';
    const offset = controlKey.length - body.length;

    let sum = 0;
    for (let index = 0; index < body.length; index += 1) {
      sum += Number(body[index]) * Number(controlKey[offset + index]);
    }

    let checkDigit = (sum * 10) % 11;
    if (checkDigit === 10) {
      checkDigit = 0;
    }

    return `${body}${checkDigit}`;
  }

  /**
   * Computes deterministic integer hash for synthetic data generation.
   *
   * @param input Hash input.
   * @returns Deterministic positive integer hash.
   */
  private hash(input: string): number {
    let value = 23;
    for (let index = 0; index < input.length; index += 1) {
      value = (value * 37 + input.charCodeAt(index)) % 2_147_483_647;
    }
    return value;
  }
}
