import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ── MCP SDK mocks ──────────────────────────────────────────────────────────────

const mockConnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockServerSetRequestHandler = jest.fn();

const MockServer = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  setRequestHandler: mockServerSetRequestHandler,
}));

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: MockServer,
}));

const mockSseStart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHandlePostMessage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
let mockSessionId = 'test-session-123';

const MockSSEServerTransport = jest.fn().mockImplementation(() => ({
  start: mockSseStart,
  handlePostMessage: mockHandlePostMessage,
  get sessionId() { return mockSessionId; },
  onclose: undefined as (() => void) | undefined,
}));

jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: MockSSEServerTransport,
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { _tag: 'CallToolRequestSchema' },
  ListToolsRequestSchema: { _tag: 'ListToolsRequestSchema' },
  ListResourcesRequestSchema: { _tag: 'ListResourcesRequestSchema' },
  ReadResourceRequestSchema: { _tag: 'ReadResourceRequestSchema' },
  ListPromptsRequestSchema: { _tag: 'ListPromptsRequestSchema' },
  GetPromptRequestSchema: { _tag: 'GetPromptRequestSchema' },
  ErrorCode: { InternalError: -32603, MethodNotFound: -32601, InvalidRequest: -32600 },
  McpError: class McpError extends Error {
    constructor(public code: number, message: string) {
      super(message);
      this.name = 'McpError';
    }
  },
}));

// ── Subject under test ─────────────────────────────────────────────────────────

import { McpService } from './mcp.service';
import { CHEAT_HEADERS } from './mcp.constants';

// ── Service stubs ──────────────────────────────────────────────────────────────

const SAMPLE_COMPANY = {
  cui: 'RO10000008',
  numericCui: '10000008',
  name: 'Aperta Sync Consulting SRL',
  city: 'Bucuresti',
  county: 'Bucuresti',
  address: 'Bd. Unirii 12, Bucuresti',
  countryCode: 'RO',
  vatPayer: true,
};

const SAMPLE_COMPANY_2 = {
  cui: 'RO10079193',
  numericCui: '10079193',
  name: 'Delta Logistics Solutions SRL',
  city: 'Cluj-Napoca',
  county: 'Cluj',
  address: 'Str. Dorobantilor 28, Cluj-Napoca',
  countryCode: 'RO',
  vatPayer: true,
};

function makeEngine(config = { latency: 0, errorRate: 0 }) {
  return {
    getConfig: jest.fn<() => object>().mockReturnValue(config),
    getKnownCompanies: jest.fn<() => object[]>().mockReturnValue([SAMPLE_COMPANY, SAMPLE_COMPANY_2]),
    getCompany: jest.fn<(cui: string) => object | undefined>().mockImplementation((cui: string) =>
      cui === 'RO10000008' || cui === '10000008' ? SAMPLE_COMPANY : undefined,
    ),
    normalizeCui: jest.fn<(cui: string) => { numeric: string; ro: string }>().mockImplementation((cui: string) => {
      const numeric = cui.replace(/^RO/, '');
      return { numeric, ro: `RO${numeric}` };
    }),
  } as any;
}

const SAMPLE_APP = {
  applicationName: 'Test App',
  clientId: 'mock_abc123',
  redirectUris: ['http://localhost:3000/callback'],
  createdAt: '2025-01-01T00:00:00.000Z',
  source: 'env' as const,
};

function makeAppRegistry() {
  return {
    listApplications: jest.fn<() => object[]>().mockReturnValue([SAMPLE_APP]),
  } as any;
}

const SAMPLE_IDENTITY = {
  id: 'id_ion_popescu',
  fullName: 'Ion Popescu',
  email: 'ion.popescu@example.com',
  authorizedCuis: ['RO10000008'],
};

function makeIdentityRegistry() {
  return {
    listIdentities: jest.fn<() => object[]>().mockReturnValue([SAMPLE_IDENTITY]),
  } as any;
}

function makeUblGenerator() {
  return {
    generateInvoiceXml: jest.fn<(msg: object) => string>().mockReturnValue('<Invoice>generated</Invoice>'),
  } as any;
}

function makeRateLimitStore(countsByKey: Record<string, number> = {}) {
  return {
    peekCount: jest.fn<(key: string) => number>().mockImplementation((key: string) => countsByKey[key] ?? 0),
  } as any;
}

const SAMPLE_SWAGGER = { openapi: '3.0.0', info: { title: 'Test' } };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('McpService', () => {
  let service: McpService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionId = 'test-session-123';
    service = new McpService();
  });

  // ── initialize ─────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('stores engine and swaggerDoc so that subsequent calls succeed', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);
      expect(service.getSimulationConfig()).toEqual({ latency: 0, errorRate: 0 });
      expect(service.getSwaggerSpec()).toEqual(SAMPLE_SWAGGER);
    });

    it('accepts optional services without throwing', () => {
      const engine = makeEngine();
      expect(() =>
        service.initialize(
          engine,
          SAMPLE_SWAGGER,
          makeAppRegistry(),
          makeIdentityRegistry(),
          makeUblGenerator(),
          makeRateLimitStore(),
        ),
      ).not.toThrow();
    });
  });

  // ── getSimulationConfig ────────────────────────────────────────────────────

  describe('getSimulationConfig()', () => {
    it('throws McpError when not initialized', () => {
      expect(() => service.getSimulationConfig()).toThrow('McpService has not been initialized');
    });

    it('delegates to engine.getConfig()', () => {
      const config = { latency: 50, errorRate: 0.1 };
      const engine = makeEngine(config);
      service.initialize(engine, SAMPLE_SWAGGER);
      expect(service.getSimulationConfig()).toBe(config);
      expect(engine.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  // ── listCheatHeaders ───────────────────────────────────────────────────────

  describe('listCheatHeaders()', () => {
    it('returns the static CHEAT_HEADERS array', () => {
      expect(service.listCheatHeaders()).toBe(CHEAT_HEADERS);
    });

    it('includes all 11 expected header names', () => {
      const names = service.listCheatHeaders().map((h) => h.name);
      expect(names).toContain('x-simulate-upload-error');
      expect(names).toContain('x-simulate-technical-error');
      expect(names).toContain('x-simulate-xml-validation-error');
      expect(names).toContain('x-simulate-executare-registry');
      expect(names).toContain('x-simulate-no-spv');
      expect(names).toContain('x-simulate-wrong-certificate');
      expect(names).toContain('x-simulate-no-download-rights');
      expect(names).toContain('x-simulate-invalid-xml');
      expect(names).toContain('x-simulate-nok');
      expect(names).toContain('x-simulate-no-query-rights');
      expect(names).toContain('x-simulate-cui-notfound');
      expect(names).toHaveLength(11);
    });

    it('each header has name, description, and at least one endpoint', () => {
      for (const header of service.listCheatHeaders()) {
        expect(typeof header.name).toBe('string');
        expect(header.name.length).toBeGreaterThan(0);
        expect(typeof header.description).toBe('string');
        expect(header.description.length).toBeGreaterThan(0);
        expect(Array.isArray(header.endpoints)).toBe(true);
        expect(header.endpoints.length).toBeGreaterThan(0);
      }
    });
  });

  // ── getSwaggerSpec ─────────────────────────────────────────────────────────

  describe('getSwaggerSpec()', () => {
    it('throws McpError when not initialized', () => {
      expect(() => service.getSwaggerSpec()).toThrow('McpService has not been initialized');
    });

    it('returns the swagger document passed to initialize()', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      expect(service.getSwaggerSpec()).toBe(SAMPLE_SWAGGER);
    });
  });

  // ── listMockCompanies ──────────────────────────────────────────────────────

  describe('listMockCompanies()', () => {
    it('throws when not initialized', () => {
      expect(() => service.listMockCompanies()).toThrow('McpService has not been initialized');
    });

    it('delegates to engine.getKnownCompanies()', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);
      const companies = service.listMockCompanies();
      expect(engine.getKnownCompanies).toHaveBeenCalledTimes(1);
      expect(companies).toContainEqual(SAMPLE_COMPANY);
    });

    it('returns an array with company profiles', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const companies = service.listMockCompanies();
      expect(Array.isArray(companies)).toBe(true);
      expect(companies.length).toBeGreaterThan(0);
      expect(companies[0]).toHaveProperty('cui');
      expect(companies[0]).toHaveProperty('name');
    });
  });

  // ── getMockCompany ─────────────────────────────────────────────────────────

  describe('getMockCompany()', () => {
    it('throws when not initialized', () => {
      expect(() => service.getMockCompany('RO10000008')).toThrow('McpService has not been initialized');
    });

    it('returns the company profile for a known CUI', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);
      const company = service.getMockCompany('RO10000008');
      expect(company).toEqual(SAMPLE_COMPANY);
      expect(engine.getCompany).toHaveBeenCalledWith('RO10000008');
    });

    it('returns undefined for an unknown CUI', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);
      const company = service.getMockCompany('RO99999999');
      expect(company).toBeUndefined();
    });
  });

  // ── listMockApplications ───────────────────────────────────────────────────

  describe('listMockApplications()', () => {
    it('throws when not initialized', () => {
      expect(() => service.listMockApplications()).toThrow('McpService has not been initialized');
    });

    it('returns empty array when no appRegistry was provided', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      expect(service.listMockApplications()).toEqual([]);
    });

    it('delegates to appRegistry.listApplications()', () => {
      const engine = makeEngine();
      const appRegistry = makeAppRegistry();
      service.initialize(engine, SAMPLE_SWAGGER, appRegistry);
      const apps = service.listMockApplications();
      expect(appRegistry.listApplications).toHaveBeenCalledTimes(1);
      expect(apps).toContainEqual(SAMPLE_APP);
    });
  });

  // ── listMockIdentities ─────────────────────────────────────────────────────

  describe('listMockIdentities()', () => {
    it('throws when not initialized', () => {
      expect(() => service.listMockIdentities()).toThrow('McpService has not been initialized');
    });

    it('returns empty array when no identityRegistry was provided', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      expect(service.listMockIdentities()).toEqual([]);
    });

    it('delegates to identityRegistry.listIdentities()', () => {
      const engine = makeEngine();
      const identityRegistry = makeIdentityRegistry();
      service.initialize(engine, SAMPLE_SWAGGER, undefined, identityRegistry);
      const identities = service.listMockIdentities();
      expect(identityRegistry.listIdentities).toHaveBeenCalledTimes(1);
      expect(identities).toContainEqual(SAMPLE_IDENTITY);
    });
  });

  // ── generateUblXml ─────────────────────────────────────────────────────────

  describe('generateUblXml()', () => {
    it('throws when not initialized', () => {
      expect(() =>
        service.generateUblXml('RO10000008', 'RO10079193', 1000, 'RON', 'Test'),
      ).toThrow('McpService has not been initialized');
    });

    it('calls ublGenerator.generateInvoiceXml with resolved company profiles', () => {
      const engine = makeEngine();
      const ublGenerator = makeUblGenerator();
      service.initialize(engine, SAMPLE_SWAGGER, undefined, undefined, ublGenerator);

      const xml = service.generateUblXml('RO10000008', 'RO10079193', 2500, 'RON', 'IT services');

      expect(ublGenerator.generateInvoiceXml).toHaveBeenCalledTimes(1);
      const callArg = (ublGenerator.generateInvoiceXml as jest.Mock).mock.calls[0][0] as any;
      expect(callArg.payableAmount).toBe(2500);
      expect(callArg.currency).toBe('RON');
      expect(callArg.lineDescription).toBe('IT services');
      expect(xml).toBe('<Invoice>generated</Invoice>');
    });

    it('uses fallback profile when company is not found', () => {
      const engine = makeEngine();
      const ublGenerator = makeUblGenerator();
      service.initialize(engine, SAMPLE_SWAGGER, undefined, undefined, ublGenerator);

      // RO99999999 is not in the mock engine; engine.getCompany returns undefined
      service.generateUblXml('RO99999999', 'RO10000008', 500, 'EUR', 'Consulting');

      const callArg = (ublGenerator.generateInvoiceXml as jest.Mock).mock.calls[0][0] as any;
      expect(callArg.supplier.cui).toBe('RO99999999');
      expect(callArg.supplier.name).toBe('Supplier Company SRL');
    });

    it('falls back to built-in XML generator when ublGenerator is not provided', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);

      const xml = service.generateUblXml('RO10000008', 'RO10079193', 1000, 'RON', 'Services');

      expect(typeof xml).toBe('string');
      expect(xml).toContain('<Invoice');
      expect(xml).toContain('RO10000008');
    });

    it('defaults amount to 1000 and currency to RON when using fallback generator', () => {
      const engine = makeEngine();
      service.initialize(engine, SAMPLE_SWAGGER);
      const xml = service.generateUblXml('RO10000008', 'RO10079193', 1000, 'RON', 'Test');
      expect(xml).toContain('1000.00');
      expect(xml).toContain('RON');
    });
  });

  // ── getErrorCatalogue ──────────────────────────────────────────────────────
  // These tests use the actual scraped ANAF swagger files that ship with the repo,
  // so they verify the real parsing logic against real data without needing fs mocks.

  describe('getErrorCatalogue()', () => {
    it('returns an object with the expected catalogue shape', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;

      expect(catalogue).toHaveProperty('generatedAt');
      expect(catalogue).toHaveProperty('endpoints');
      expect(catalogue).toHaveProperty('totalErrors');
      expect(Array.isArray(catalogue.endpoints)).toBe(true);
    });

    it('returns a cached result on second call (same object reference)', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const first = service.getErrorCatalogue();
      const second = service.getErrorCatalogue();
      expect(first).toBe(second);
    });

    it('reads error messages from the actual scraped ANAF swagger files', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;
      // The repo ships with real ANAF swagger files that contain error examples
      expect(catalogue.totalErrors).toBeGreaterThan(0);
      expect(catalogue.endpoints.length).toBeGreaterThan(0);
    });

    it('extracts XML errorMessage attributes from staremesaj swagger', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;
      const allErrors: string[] = catalogue.endpoints.flatMap((e: any) => e.errorMessages as string[]);
      // staremesaj.json contains: errorMessage="Nu aveti dreptul de inteorgare pentru id_incarcare= 18"
      expect(allErrors.some((msg) => msg.includes('dreptul de interog') || msg.includes('dreptul de inteorg'))).toBe(true);
    });

    it('extracts eroare fields from descarcare swagger JSON examples', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;
      const allErrors: string[] = catalogue.endpoints.flatMap((e: any) => e.errorMessages as string[]);
      // descarcare.json contains: "eroare": "S-au facut deja 10 descarcari de mesaj in cursul zilei"
      expect(allErrors.some((msg) => msg.includes('descarcari de mesaj'))).toBe(true);
    });

    it('groups errors by endpoint name', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;
      for (const entry of catalogue.endpoints) {
        expect(typeof entry.endpoint).toBe('string');
        expect(entry.endpoint.length).toBeGreaterThan(0);
        expect(Array.isArray(entry.errorMessages)).toBe(true);
        expect(entry.errorMessages.length).toBeGreaterThan(0);
      }
    });

    it('de-duplicates identical error messages within an endpoint', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const catalogue = service.getErrorCatalogue() as any;
      for (const entry of catalogue.endpoints) {
        const messages: string[] = entry.errorMessages;
        const unique = new Set(messages);
        expect(messages.length).toBe(unique.size);
      }
    });
  });

  // ── checkQuotaUsage ────────────────────────────────────────────────────────

  describe('checkQuotaUsage()', () => {
    it('throws when not initialized', () => {
      expect(() => service.checkQuotaUsage('upload', '10000008')).toThrow(
        'McpService has not been initialized',
      );
    });

    it('throws McpError for unknown endpoint', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      expect(() => service.checkQuotaUsage('unknown_endpoint', '10000008')).toThrow(
        /Unknown endpoint/,
      );
    });

    it('returns quota details for upload endpoint with zero usage', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER, undefined, undefined, undefined, makeRateLimitStore());
      const result = service.checkQuotaUsage('upload', '10000008') as any;

      expect(result.endpoint).toBe('upload');
      expect(result.discriminator).toBe('10000008');
      expect(result.limit).toBe(1000);
      expect(result.currentCount).toBe(0);
      expect(result.remaining).toBe(1000);
      expect(result.limitReached).toBe(false);
      expect(result.storageKey).toMatch(/^upload:rasp:10000008:\d{4}-\d{2}-\d{2}$/);
    });

    it('returns correct remaining count when some quota has been consumed', () => {
      const today = new Date().toISOString().slice(0, 10);
      const store = makeRateLimitStore({ [`stare:MSG-001:${today}`]: 42 });
      service.initialize(makeEngine(), SAMPLE_SWAGGER, undefined, undefined, undefined, store);

      const result = service.checkQuotaUsage('stare', 'MSG-001') as any;

      expect(result.currentCount).toBe(42);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(58);
      expect(result.limitReached).toBe(false);
    });

    it('reports limitReached when counter equals limit', () => {
      const today = new Date().toISOString().slice(0, 10);
      const store = makeRateLimitStore({ [`descarcare:MSG-999:${today}`]: 10 });
      service.initialize(makeEngine(), SAMPLE_SWAGGER, undefined, undefined, undefined, store);

      const result = service.checkQuotaUsage('descarcare', 'MSG-999') as any;

      expect(result.limitReached).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('returns zero count when rateLimitStore was not provided', () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const result = service.checkQuotaUsage('lista', 'RO10000008') as any;

      expect(result.currentCount).toBe(0);
      expect(result.limit).toBe(1500);
    });

    it('covers all five endpoint types', () => {
      const store = makeRateLimitStore();
      service.initialize(makeEngine(), SAMPLE_SWAGGER, undefined, undefined, undefined, store);

      const endpoints = ['upload', 'stare', 'lista', 'lista_paginata', 'descarcare'];
      for (const ep of endpoints) {
        const result = service.checkQuotaUsage(ep, 'test-disc') as any;
        expect(result.endpoint).toBe(ep);
        expect(typeof result.limit).toBe('number');
      }
    });
  });

  // ── connectSse ─────────────────────────────────────────────────────────────

  describe('connectSse()', () => {
    it('creates a transport, connects a server, and registers the session', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      const mockRes = {} as any;

      await service.connectSse('/mcp/messages', mockRes);

      expect(MockSSEServerTransport).toHaveBeenCalledWith('/mcp/messages', mockRes);
      expect(MockServer).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('registers a fresh Server instance per SSE session', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);

      mockSessionId = 'session-A';
      await service.connectSse('/mcp/messages', {} as any);

      mockSessionId = 'session-B';
      await service.connectSse('/mcp/messages', {} as any);

      expect(MockServer).toHaveBeenCalledTimes(2);
    });

    it('removes the transport from the map when onclose fires', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      mockSessionId = 'close-test';

      let capturedTransport: any;
      MockSSEServerTransport.mockImplementationOnce(() => {
        capturedTransport = {
          sessionId: 'close-test',
          handlePostMessage: mockHandlePostMessage,
          onclose: undefined as (() => void) | undefined,
        };
        return capturedTransport;
      });

      await service.connectSse('/mcp/messages', {} as any);
      expect(capturedTransport.onclose).toBeDefined();

      // Simulate close event
      capturedTransport.onclose!();

      // After close, handleMessage should report unknown session
      const mockReq = {} as any;
      const chunks: string[] = [];
      const mockResForMessage = {
        writeHead: jest.fn(),
        end: jest.fn((data: string) => { chunks.push(data); }),
      } as any;

      await service.handleMessage('close-test', mockReq, mockResForMessage, {});

      expect(mockResForMessage.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
      expect(chunks[0]).toContain('close-test');
    });
  });

  // ── handleMessage ──────────────────────────────────────────────────────────

  describe('handleMessage()', () => {
    it('returns 400 when session does not exist', async () => {
      const mockReq = {} as any;
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      } as any;

      await service.handleMessage('unknown-session', mockReq, mockRes, {});

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      const body = JSON.parse(mockRes.end.mock.calls[0][0] as string);
      expect(body.error).toContain('unknown-session');
    });

    it('delegates to transport.handlePostMessage for known session', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      mockSessionId = 'known-session';

      let capturedTransport: any;
      MockSSEServerTransport.mockImplementationOnce(() => {
        capturedTransport = {
          sessionId: 'known-session',
          handlePostMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          onclose: undefined,
        };
        return capturedTransport;
      });

      await service.connectSse('/mcp/messages', {} as any);

      const parsedBody = { jsonrpc: '2.0', method: 'tools/list', id: 1 };
      const mockReq = {} as any;
      const mockRes = {} as any;

      await service.handleMessage('known-session', mockReq, mockRes, parsedBody);

      expect(capturedTransport.handlePostMessage).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        parsedBody,
      );
    });
  });

  // ── createServer — handler registration ───────────────────────────────────

  describe('createServer() — handler registration', () => {
    it('registers handlers for ListTools, CallTool, ListResources, ReadResource', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      await service.connectSse('/mcp/messages', {} as any);

      const registeredSchemas = mockServerSetRequestHandler.mock.calls.map(
        (call: any[]) => call[0],
      );

      const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } =
        await import('@modelcontextprotocol/sdk/types.js');

      expect(registeredSchemas).toContainEqual(ListToolsRequestSchema);
      expect(registeredSchemas).toContainEqual(CallToolRequestSchema);
      expect(registeredSchemas).toContainEqual(ListResourcesRequestSchema);
      expect(registeredSchemas).toContainEqual(ReadResourceRequestSchema);
    });

    it('also registers ListPrompts and GetPrompt handlers', async () => {
      service.initialize(makeEngine(), SAMPLE_SWAGGER);
      await service.connectSse('/mcp/messages', {} as any);

      const registeredSchemas = mockServerSetRequestHandler.mock.calls.map(
        (call: any[]) => call[0],
      );

      const { ListPromptsRequestSchema, GetPromptRequestSchema } =
        await import('@modelcontextprotocol/sdk/types.js');

      expect(registeredSchemas).toContainEqual(ListPromptsRequestSchema);
      expect(registeredSchemas).toContainEqual(GetPromptRequestSchema);
    });
  });
});
