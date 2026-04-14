import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ── Helpers ────────────────────────────────────────────────────────────

const UPLOAD_NS = 'mfp:anaf:dgti:spv:respUploadFisier:v1';

/** Minimal express Response stub that captures status / headers / body. */
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

/** Creates a fake express Request whose body stream emits `content`. */
function createMockRequest(content: string) {
  const req = new EventEmitter() as EventEmitter & { headers: Record<string, string> };
  req.headers = { 'content-type': 'application/xml' };

  // Schedule data + end on next tick so `readRawBody` can attach listeners.
  process.nextTick(() => {
    req.emit('data', Buffer.from(content, 'utf-8'));
    req.emit('end');
  });

  return req;
}

/** Asserts the body is ANAF XML with ExecutionStatus="1" and the given errorMessage. */
function expectUploadXmlError(res: ReturnType<typeof createMockResponse>, errorMessage: string) {
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('application/xml');

  const body = res.body as string;
  expect(body).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  expect(body).toContain(`xmlns="${UPLOAD_NS}"`);
  expect(body).toContain('ExecutionStatus="1"');
  expect(body).toContain(`errorMessage="${errorMessage}"`);
}

/** Asserts the body is ANAF XML with ExecutionStatus="0" (success). */
function expectUploadXmlSuccess(res: ReturnType<typeof createMockResponse>) {
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('application/xml');
  const body = res.body as string;
  expect(body).toContain('ExecutionStatus="0"');
  expect(body).toContain('index_incarcare=');
}

// ── Mock factories ─────────────────────────────────────────────────────

function createQueryBus(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    ValidateAuthorizationHeaderQuery: { isValid: true, identityId: 'id_ion_popescu' },
  };
  const merged = { ...defaults, ...overrides };
  return {
    execute: jest.fn<(query: { constructor: { name: string } }) => Promise<unknown>>()
      .mockImplementation(async (query) => merged[query.constructor.name]),
  };
}

function createCommandBus() {
  return {
    execute: jest.fn<() => Promise<{ indexIncarcare: string; dateResponse: string }>>()
      .mockResolvedValue({ indexIncarcare: '42', dateResponse: '202604141015' }),
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
    isIdentityAuthorizedForCui: jest.fn<(_id: string, _cui: string) => boolean>().mockReturnValue(true),
  };
}

function createRateLimitService() {
  return {
    checkUploadRasp: jest.fn<() => Promise<{ allowed: boolean; limit: number }>>()
      .mockResolvedValue({ allowed: true, limit: 1000 }),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────

import { MessagesCommandHttpController } from './messages.command.http.controller';

describe('MessagesCommandHttpController', () => {
  let controller: MessagesCommandHttpController;
  let commandBus: ReturnType<typeof createCommandBus>;
  let queryBus: ReturnType<typeof createQueryBus>;
  let simulationEngine: ReturnType<typeof createSimulationEngine>;
  let identityRegistry: ReturnType<typeof createIdentityRegistry>;
  let rateLimitService: ReturnType<typeof createRateLimitService>;

  beforeEach(() => {
    commandBus = createCommandBus();
    queryBus = createQueryBus();
    simulationEngine = createSimulationEngine();
    identityRegistry = createIdentityRegistry();
    rateLimitService = createRateLimitService();
    controller = new MessagesCommandHttpController(
      commandBus as never,
      queryBus as never,
      simulationEngine as never,
      identityRegistry as never,
      rateLimitService as never,
    );
  });

  // ======================================================================
  // POST /upload — success path
  // ======================================================================

  describe('POST /upload — success', () => {
    it('factura a fost incarcata cu succes (Swagger: upload 200 success)', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlSuccess(res);
    });
  });

  // ======================================================================
  // POST /upload — HTTP 200 XML error examples from upload.json
  // ======================================================================

  describe('POST /upload — HTTP 200 XML errors', () => {
    it('nu a fost specificat un standard bun — invalid standard returns ANAF XML error', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'INVALID', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Valorile acceptate pentru parametrul standard sunt UBL, CN, CII sau RASP');
    });

    it('marimea fisierului estre prea mare — file size > 10 MB', async () => {
      const res = createMockResponse();
      const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1);
      const req = createMockRequest(bigContent);
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Marime fisier transmis mai mare de 10 MB.');
    });

    it('cif-ul trebuie sa fie numeric — non-numeric CIF', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '123a' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'CIF introdus= 123a nu este un numar');
    });

    it('cif-ul trebuie sa fie numeric — alphabetic CIF "aaa"', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: 'aaa' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'CIF introdus= aaa nu este un numar');
    });

    it('nu aveti dreptul de incarcare — no SPV rights at all', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: false },
      });
      controller = new MessagesCommandHttpController(
        commandBus as never,
        queryBus as never,
        simulationEngine as never,
        identityRegistry as never,
        rateLimitService as never,
      );

      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        undefined,
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Nu exista niciun CIF pentru care sa aveti drept in SPV');
    });

    it('nu aveti dreptul de incarcare pentru cif-ul specificat in request — ownership denied', async () => {
      simulationEngine = createSimulationEngine(true);
      identityRegistry.isIdentityAuthorizedForCui.mockReturnValue(false);
      controller = new MessagesCommandHttpController(
        commandBus as never,
        queryBus as never,
        simulationEngine as never,
        identityRegistry as never,
        rateLimitService as never,
      );

      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '1234' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Nu aveti drept in SPV pentru CIF=RO1234');
    });

    it('fisierul transmis nu respecta structura UBL sau CII — X-Simulate-Xml-Validation-Error header', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, 'true', undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(
        res,
        "Fisierul transmis nu este valid. org.xml.sax.SAXParseException; lineNumber: 1; columnNumber: 1; cvc-elt.1.a: Cannot find the declaration of element &apos;Invoice1&apos;.",
      );
    });

    it('parametrul extern este completat dar este invalid', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008', extern: 'NU' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Daca parametrul extern trebuie completat, valoarea acceptata este DA');
    });

    it('parametrul autofactura este completat dar este invalid', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008', autofactura: 'NU' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Daca parametrul autofacturare trebuie completat, valoarea acceptata este DA');
    });

    it('parametrul executare este completat dar este invalid', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008', executare: 'NU' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Daca parametrul executare trebuie completat, valoarea acceptata este DA');
    });

    it('cif-ul nu este inregistrat in Registrul RO e-Factura executari silite — X-Simulate-Executare-Registry header', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '1234' },
        'Bearer valid-token',
        undefined, undefined, undefined, 'true',
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'CIF introdus= 1234 nu este inregistrat in Registrul RO e-Factura executari silite');
    });

    it('a fost atinsa limita de apeluri zilnice — RASP rate limit exceeded', async () => {
      rateLimitService.checkUploadRasp.mockResolvedValue({ allowed: false, limit: 1000 });

      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'RASP', cif: '1234' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'S-au incarcat deja 1000 de mesaje de tip RASP pentru cui=1234 in cursul zilei');
    });

    it('eroare tehnica — X-Simulate-Technical-Error header', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, 'true', undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'A aparut o eroare tehnica. Cod: SIM-001');
    });

    it('simulated generic upload error — X-Simulate-Upload-Error header', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        'true', undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Simulated upload validation error.');
    });
  });

  // ======================================================================
  // POST /upload — HTTP 400 JSON error examples from upload.json
  // ======================================================================

  describe('POST /upload — HTTP 400 JSON errors', () => {
    it('nu ati atasat nimic in request body — empty body returns ANAF 400 JSON', async () => {
      const res = createMockResponse();
      const req = createMockRequest('');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expect(res.statusCode).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Trebuie sa aveti atasat in request un fisier de tip xml');
      expect(typeof body.timestamp).toBe('string');
    });

    it('nu ati atasat nimic in request body — whitespace-only body also triggers 400', async () => {
      const res = createMockResponse();
      const req = createMockRequest('   \n  ');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).message).toBe(
        'Trebuie sa aveti atasat in request un fisier de tip xml',
      );
    });
  });

  // ======================================================================
  // POST /uploadb2c — mirrors /upload exactly (shared handler)
  // ======================================================================

  describe('POST /uploadb2c — mirrors /upload', () => {
    it('factura a fost incarcata cu succes via uploadb2c', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.uploadB2c(
        { standard: 'CII', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlSuccess(res);
    });

    it('cif-ul trebuie sa fie numeric via uploadb2c', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.uploadB2c(
        { standard: 'UBL', cif: 'abc' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'CIF introdus= abc nu este un numar');
    });

    it('invalid standard via uploadb2c', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.uploadB2c(
        { standard: 'XML', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Valorile acceptate pentru parametrul standard sunt UBL, CN, CII sau RASP');
    });

    it('empty body returns 400 JSON via uploadb2c', async () => {
      const res = createMockResponse();
      const req = createMockRequest('');
      await controller.uploadB2c(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as Record<string, unknown>).message).toBe(
        'Trebuie sa aveti atasat in request un fisier de tip xml',
      );
    });

    it('eroare tehnica via uploadb2c', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.uploadB2c(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, 'true', undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'A aparut o eroare tehnica. Cod: SIM-001');
    });

    it('RASP rate limit exceeded via uploadb2c', async () => {
      rateLimitService.checkUploadRasp.mockResolvedValue({ allowed: false, limit: 1000 });
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.uploadB2c(
        { standard: 'RASP', cif: '5678' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'S-au incarcat deja 1000 de mesaje de tip RASP pentru cui=5678 in cursul zilei');
    });
  });

  // ======================================================================
  // Validation priority order
  // ======================================================================

  describe('Validation priority', () => {
    it('auth failure takes precedence over non-numeric CIF', async () => {
      queryBus = createQueryBus({
        ValidateAuthorizationHeaderQuery: { isValid: false },
      });
      controller = new MessagesCommandHttpController(
        commandBus as never,
        queryBus as never,
        simulationEngine as never,
        identityRegistry as never,
        rateLimitService as never,
      );

      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: 'aaa' },
        undefined,
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Nu exista niciun CIF pentru care sa aveti drept in SPV');
    });

    it('non-numeric CIF takes precedence over invalid standard', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'INVALID', cif: 'abc' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'CIF introdus= abc nu este un numar');
    });

    it('invalid standard takes precedence over ownership check', async () => {
      simulationEngine = createSimulationEngine(true);
      identityRegistry.isIdentityAuthorizedForCui.mockReturnValue(false);
      controller = new MessagesCommandHttpController(
        commandBus as never,
        queryBus as never,
        simulationEngine as never,
        identityRegistry as never,
        rateLimitService as never,
      );

      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'XYZ', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expectUploadXmlError(res, 'Valorile acceptate pentru parametrul standard sunt UBL, CN, CII sau RASP');
    });

    it('RASP rate limit is only checked for RASP standard', async () => {
      const res = createMockResponse();
      const req = createMockRequest('<Invoice/>');
      await controller.upload(
        { standard: 'UBL', cif: '10000008' },
        'Bearer valid-token',
        undefined, undefined, undefined, undefined,
        req as never,
        res as never,
      );
      expect(rateLimitService.checkUploadRasp).not.toHaveBeenCalled();
      expectUploadXmlSuccess(res);
    });
  });

  // ======================================================================
  // Valid standards are accepted (case-insensitive)
  // ======================================================================

  describe('Valid standards', () => {
    for (const std of ['UBL', 'CII', 'CN', 'RASP']) {
      it(`accepts standard "${std}"`, async () => {
        const res = createMockResponse();
        const req = createMockRequest('<Invoice/>');
        await controller.upload(
          { standard: std, cif: '10000008' },
          'Bearer valid-token',
          undefined, undefined, undefined, undefined,
          req as never,
          res as never,
        );
        expectUploadXmlSuccess(res);
      });
    }
  });
});
