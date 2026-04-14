import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ── Helpers ────────────────────────────────────────────────────────────

const STARE_MESAJ_NS = 'mfp:anaf:dgti:efactura:stareMesajFactura:v1';

function createMockResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(data: unknown) {
      res.body = data;
      return res;
    },
    json(data: unknown) {
      res.headers['content-type'] = 'application/json';
      res.body = data;
      return res;
    },
  };
  return res;
}

function expectListError(res: ReturnType<typeof createMockResponse>, eroare: string, titlu = 'Lista Mesaje') {
  expect(res.statusCode).toBe(200);
  const body = res.body as { eroare: string; titlu: string };
  expect(body.eroare).toBe(eroare);
  expect(body.titlu).toBe(titlu);
}

function expectDescarcareError(res: ReturnType<typeof createMockResponse>, eroare: string) {
  expect(res.statusCode).toBe(200);
  const body = res.body as { eroare: string; titlu: string };
  expect(body.eroare).toBe(eroare);
  expect(body.titlu).toBe('Descarcare mesaj');
}

function expectStareMesajXmlError(res: ReturnType<typeof createMockResponse>, errorMessage: string) {
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('application/xml');
  const body = res.body as string;
  expect(body).toContain(`xmlns="${STARE_MESAJ_NS}"`);
  expect(body).toContain(`errorMessage="${errorMessage}"`);
}

function expectStareMesajXmlStare(res: ReturnType<typeof createMockResponse>, stare: string) {
  expect(res.statusCode).toBe(200);
  const body = res.body as string;
  expect(body).toContain(`stare="${stare}"`);
}

// ── Mock factories ─────────────────────────────────────────────────────

function createQueryBus(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
  };
  const merged = { ...defaults, ...overrides };
  return {
    execute: jest.fn<(q: { constructor: { name: string } }) => Promise<unknown>>()
      .mockImplementation(async (q) => merged[q.constructor.name]),
  };
}

function createSimulationEngine(strict = false) {
  return {
    getConfig: () => ({ strictOwnershipValidation: strict }),
    normalizeCui: (raw: string) => {
      const numeric = String(raw).replace(/^RO/i, '');
      return { numeric, ro: `RO${numeric}` };
    },
  };
}

function createIdentityRegistry() {
  return {
    isIdentityAuthorizedForCui: jest.fn<() => boolean>().mockReturnValue(true),
  };
}

function createRateLimitService() {
  return {
    checkListaSimple: jest.fn<() => Promise<{ allowed: boolean; limit: number }>>()
      .mockResolvedValue({ allowed: true, limit: 1500 }),
    checkListaPaginated: jest.fn<() => Promise<{ allowed: boolean; limit: number }>>()
      .mockResolvedValue({ allowed: true, limit: 100000 }),
    checkDescarcare: jest.fn<() => Promise<{ allowed: boolean; limit: number }>>()
      .mockResolvedValue({ allowed: true, limit: 10 }),
    checkStare: jest.fn<() => Promise<{ allowed: boolean; limit: number }>>()
      .mockResolvedValue({ allowed: true, limit: 100 }),
  };
}

// Build a list response that the handler would return
function makeListResponse(count: number) {
  const mesaje = Array.from({ length: count }, (_, i) => ({
    data_creare: '202604141015',
    cif: '10000008',
    id_solicitare: `SIM-${i}`,
    detalii: `Factura ${i}`,
    tip: 'FACTURA PRIMITA',
    id: `MSG-${i}`,
  }));
  return { mesaje, serial: '1234AA456', cui: '10000008', titlu: 'Lista Mesaje disponibile din ultimele 5 zile' };
}

function makePaginatedResponse(count: number, totalRecords: number, totalPages: number, currentPage: number) {
  const mesaje = Array.from({ length: count }, (_, i) => ({
    data_creare: '202604141015',
    cif: '10000008',
    id_solicitare: `SIM-${i}`,
    detalii: `Factura ${i}`,
    tip: 'FACTURA PRIMITA',
    id: `MSG-${i}`,
  }));
  return {
    mesaje,
    serial: '1234AA456',
    cui: '10000008',
    titlu: 'Lista Mesaje disponibile din intervalul ...',
    numar_inregistrari_in_pagina: count,
    numar_total_inregistrari_per_pagina: 500,
    numar_total_inregistrari: totalRecords,
    numar_total_pagini: totalPages,
    index_pagina_curenta: currentPage,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────

import { MessagesQueryHttpController } from './messages.query.http.controller';

describe('MessagesQueryHttpController', () => {
  let controller: MessagesQueryHttpController;
  let queryBus: ReturnType<typeof createQueryBus>;
  let simulationEngine: ReturnType<typeof createSimulationEngine>;
  let identityRegistry: ReturnType<typeof createIdentityRegistry>;
  let rateLimitService: ReturnType<typeof createRateLimitService>;

  beforeEach(() => {
    queryBus = createQueryBus();
    simulationEngine = createSimulationEngine();
    identityRegistry = createIdentityRegistry();
    rateLimitService = createRateLimitService();
    controller = new MessagesQueryHttpController(
      queryBus as never,
      simulationEngine as never,
      identityRegistry as never,
      rateLimitService as never,
    );
  });

  // ====================================================================
  //  GET /listaMesajeFactura — all Swagger examples
  // ====================================================================

  describe('GET /listaMesajeFactura', () => {
    it('cif-ul returneaza mesaje — success response', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListEfacturaMessagesQuery: makeListResponse(2),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '5' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      const body = res.body as { mesaje: unknown[]; serial: string };
      expect(body.mesaje).toHaveLength(2);
      expect(body.serial).toBe('1234AA456');
    });

    it('cif este non numeric — "CIF introdus= aaa nu este un numar"', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: 'aaa', zile: '5' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'CIF introdus= aaa nu este un numar');
    });

    it('numar de zile este non numeric — "Numarul de zile introdus= aaa nu este un numar intreg"', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: 'aaa' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Numarul de zile introdus= aaa nu este un numar intreg');
    });

    it('numar de zile incorect — zile=0 returns range error', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '0' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Numarul de zile trebuie sa fie intre 1 si 60');
    });

    it('numar de zile incorect — zile=61 returns range error', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '61' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Numarul de zile trebuie sa fie intre 1 si 60');
    });

    it('parametrul filtru invalid — "Valorile acceptate pentru parametrul filtru sunt E, T, P sau R"', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '5', filtru: 'X' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Valorile acceptate pentru parametrul filtru sunt E, T, P sau R');
    });

    it('lipsa drepturi SPV — X-Simulate-No-Spv header', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '5' },
        'Bearer token', undefined, 'true', res as never,
      );
      expectListError(res, 'Nu exista niciun CIF pentru care sa aveti drept in SPV');
    });

    it('nu exista mesaje — empty result returns ANAF error', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListEfacturaMessagesQuery: makeListResponse(0),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '15' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Nu exista mesaje in ultimele 15 zile');
    });

    it('limita mesaje in pagina atinsa — >500 messages triggers overflow error', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListEfacturaMessagesQuery: makeListResponse(501),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '5' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Lista de mesaje este mai mare decat numarul de 500 elemente permise in pagina. Folositi endpoint-ul cu paginatie.');
    });

    it('limita apeluri zilnice atinsa — rate limit exceeded', async () => {
      rateLimitService.checkListaSimple.mockResolvedValue({ allowed: false, limit: 1000 });
      const res = createMockResponse();
      await controller.listMessages(
        { cif: '10000008', zile: '5' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'S-au facut deja 1000 interogari de lista mesaje de catre utilizator in cursul zilei');
    });

    // HTTP 400 example
    it('lipsa zile sau cif — missing mandatory params returns 400 JSON', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { }, // both missing
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Parametrii zile si cif sunt obligatorii');
    });

    it('lipsa cif — only cif missing returns 400 JSON', async () => {
      const res = createMockResponse();
      await controller.listMessages(
        { zile: '5' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).message).toBe('Parametrii zile si cif sunt obligatorii');
    });
  });

  // ====================================================================
  //  GET /listaMesajePaginatieFactura — all Swagger examples
  // ====================================================================

  describe('GET /listaMesajePaginatieFactura', () => {
    // Timestamps for valid time range (recent)
    const now = Date.now();
    const recentStart = String(now - 3_600_000); // 1h ago
    const recentEnd = String(now - 60_000);       // 1min ago

    it('cif-ul returneaza mesaje — success response', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListMessagesPaginatedQuery: makePaginatedResponse(2, 2, 1, 1),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      const body = res.body as { mesaje: unknown[]; numar_total_pagini: number };
      expect(body.mesaje).toHaveLength(2);
    });

    it('cif este non numeric — paginated', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: 'aaa', startTime: recentStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'CIF introdus= aaa nu este un numar sau nu are o valoare acceptata de sistem');
    });

    it('startTime nu este un numar — non-numeric startTime', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: 'aaa', endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'startTime = aaa nu este un numar sau nu are o valoare acceptata de sistem');
    });

    it('endTime nu este un numar — non-numeric endTime', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: 'aaa', pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'endTime = aaa nu este un numar sau nu are o valoare acceptata de sistem');
    });

    it('pagina nu este un numar — non-numeric pagina', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: 'aa' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'pagina = aa nu este un numar sau nu are o valoare acceptata de sistem');
    });

    it('startTime mai vechi de 60 de zile', async () => {
      const oldStart = String(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: oldStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      const body = res.body as { eroare: string };
      expect(body.eroare).toMatch(/nu poate fi mai vechi de 60 de zile/);
    });

    it('endTime inainte de startTime', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentEnd, endTime: recentStart, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      const body = res.body as { eroare: string };
      expect(body.eroare).toMatch(/nu poate fi <= startTime/);
    });

    it('endTime in viitor', async () => {
      const futureEnd = String(Date.now() + 3_600_000);
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: futureEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      const body = res.body as { eroare: string };
      expect(body.eroare).toMatch(/nu poate in viitor/);
    });

    it('parametrul filtru invalid — paginated', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '1', filtru: 'X' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Valorile acceptate pentru parametrul filtru sunt E, T, P sau R');
    });

    it('lipsa drepturi SPV — X-Simulate-No-Spv header (paginated)', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, 'true', res as never,
      );
      expectListError(res, 'Nu exista niciun CIF pentru care sa aveti drept in SPV');
    });

    it('pagina mai mare decat total pagini', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListMessagesPaginatedQuery: makePaginatedResponse(0, 14130, 29, 50),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '50' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Pagina solicitata 50 este mai mare decat numarul toatal de pagini 29');
    });

    it('nu exista mesaje in intervalul selectat — empty paginated result', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        ListMessagesPaginatedQuery: makePaginatedResponse(0, 0, 0, 1),
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'Nu exista mesaje in intervalul selectat');
    });

    it('limita apeluri zilnice atinsa — paginated rate limit', async () => {
      rateLimitService.checkListaPaginated.mockResolvedValue({ allowed: false, limit: 1000 });
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008', startTime: recentStart, endTime: recentEnd, pagina: '1' },
        'Bearer token', undefined, undefined, res as never,
      );
      expectListError(res, 'S-au facut deja 1000 interogari de lista mesaje de catre utilizator in cursul zilei');
    });

    // HTTP 400 example
    it('lipsa startTime, endTime, cif sau pagina — missing params returns 400', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Parametrii startTime, endTime, cif si pagina sunt obligatorii');
    });

    it('lipsa partial — only cif provided returns 400', async () => {
      const res = createMockResponse();
      await controller.listMessagesPaginated(
        { cif: '10000008' },
        'Bearer token', undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).message).toBe(
        'Parametrii startTime, endTime, cif si pagina sunt obligatorii',
      );
    });
  });

  // ====================================================================
  //  GET /stareMesaj — all Swagger examples
  // ====================================================================

  describe('GET /stareMesaj', () => {
    it('factura a fost prelucrata cu succes — stare="ok" with id_descarcare', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetUploadStatusQuery: { stare: 'ok', idDescarcare: '1234', errors: [] },
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlStare(res, 'ok');
      expect((res.body as string)).toContain('id_descarcare="1234"');
    });

    it('factura nu a fost prelucrata cu succes — stare="nok"', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetUploadStatusQuery: { stare: 'nok', idDescarcare: '123', errors: [] },
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlStare(res, 'nok');
    });

    it('factura in prelucrare — stare="in prelucrare"', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetUploadStatusQuery: { stare: 'in prelucrare', idDescarcare: null, errors: [] },
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlStare(res, 'in prelucrare');
      expect((res.body as string)).not.toContain('id_descarcare');
    });

    it('factura nu a fost preluata de sistem — X-Simulate-Invalid-Xml header', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', 'true', undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlStare(res, 'XML cu erori nepreluat de sistem');
    });

    it('nu aveti dreptul de interogare pentru indexul solicitat — X-Simulate-No-Query-Rights header', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, undefined, 'true', res as never,
      );
      expectStareMesajXmlError(res, 'Nu aveti dreptul de inteorgare pentru id_incarcare= 18');
    });

    it('nu aveti dreptul de interogare — X-Simulate-No-Spv header (stareMesaj)', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, 'true', undefined, res as never,
      );
      expectStareMesajXmlError(res, 'Nu exista niciun CIF petru care sa aveti drept');
    });

    it('index de incarcare nu este valid — non-numeric id_incarcare "aaa"', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: 'aaa' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlError(res, 'Id_incarcare introdus= aaa nu este un numar intreg');
    });

    it('index de incarcare nu este valid — alphanumeric id_incarcare "12ab"', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '12ab' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlError(res, 'Id_incarcare introdus= 12ab nu este un numar intreg');
    });

    it('factura nu a fost identificata in sistem — not found', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetUploadStatusQuery: undefined,
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '15000' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlError(res, 'Nu exista factura cu id_incarcare= 15000');
    });

    it('a fost atinsa limita de apeluri zilnice — rate limit', async () => {
      rateLimitService.checkStare.mockResolvedValue({ allowed: false, limit: 20 });
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expectStareMesajXmlError(res, 'S-au facut deja 20 descarcari de mesaj in cursul zilei');
    });

    it('simulated nok — X-Simulate-Nok header', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { id_incarcare: '18' },
        'Bearer token', undefined, 'true', undefined, undefined, res as never,
      );
      expectStareMesajXmlStare(res, 'nok');
      expect((res.body as string)).toContain('Simulated processing failure.');
    });

    // HTTP 400 example
    it('nu ati completat parametrul id_incarcare — missing param returns 400 JSON', async () => {
      const res = createMockResponse();
      await controller.getMessageState(
        { },
        'Bearer token', undefined, undefined, undefined, undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Parametrul id_incarcare este obligatoriu');
    });
  });

  // ====================================================================
  //  GET /descarcare — all Swagger examples
  // ====================================================================

  describe('GET /descarcare', () => {
    it('factura a fost descarcata cu succes — returns zip buffer', async () => {
      const fakeArchive = Buffer.from('PK-mock-zip');
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetEfacturaArchiveQuery: {
          message: { id: '42', cif_beneficiar: '10000008', cif_emitent: '10079193' },
          archive: fakeArchive,
        },
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.download(
        { id: '42' },
        'Bearer token', undefined, res as never,
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.body).toBe(fakeArchive);
    });

    it('id-ul furnizat nu este valid — non-numeric id', async () => {
      const res = createMockResponse();
      await controller.download(
        { id: '123a' },
        'Bearer token', undefined, res as never,
      );
      expectDescarcareError(res, 'Id descarcare introdus= 123a nu este un numar intreg');
    });

    it('id-ul furnizat nu este valid — alphabetic id', async () => {
      const res = createMockResponse();
      await controller.download(
        { id: 'abc' },
        'Bearer token', undefined, res as never,
      );
      expectDescarcareError(res, 'Id descarcare introdus= abc nu este un numar intreg');
    });

    it('a fost atinsa limita de apeluri zilnice — descarcare rate limit', async () => {
      rateLimitService.checkDescarcare.mockResolvedValue({ allowed: false, limit: 10 });
      const res = createMockResponse();
      await controller.download(
        { id: '42' },
        'Bearer token', undefined, res as never,
      );
      expectDescarcareError(res, 'S-au facut deja 10 descarcari de mesaj in cursul zilei');
    });

    it('nu aveti dreptul sa descarcati factura — X-Simulate-No-Download-Rights header', async () => {
      const res = createMockResponse();
      await controller.download(
        { id: '42' },
        'Bearer token', 'true', res as never,
      );
      expectDescarcareError(res, 'Nu aveti dreptul sa descarcati acesta factura');
    });

    it('nu exista nici o factura pentru id-ul solicitat — not found', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
        GetEfacturaArchiveQuery: undefined,
      });
      controller = new MessagesQueryHttpController(
        queryBus as never, simulationEngine as never, identityRegistry as never, rateLimitService as never,
      );
      const res = createMockResponse();
      await controller.download(
        { id: '21' },
        'Bearer token', undefined, res as never,
      );
      expectDescarcareError(res, 'Pentru id=21 nu exista inregistrata nici o factura');
    });

    // HTTP 400 example
    it('nu ati completat parametrul id — missing id returns 400 JSON', async () => {
      const res = createMockResponse();
      await controller.download(
        { },
        'Bearer token', undefined, res as never,
      );
      expect(res.statusCode).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Parametrul id este obligatoriu');
    });
  });
});
