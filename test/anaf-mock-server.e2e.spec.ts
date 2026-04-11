import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { AnafMockServerModule } from '../src/anaf-mock-server.module';
import AdmZip from 'adm-zip';

describe('AnafMockServer (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let mockAppCredentials: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };

  beforeAll(async () => {
    process.env.ANAF_MOCK_STORE = 'memory';
    process.env.ANAF_MOCK_BOOTSTRAP_CUIS = 'RO10000008,RO10079193,RO10158386';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AnafMockServerModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    const redirectUri = 'http://localhost/callback';
    const registerResponse = await request(app.getHttpServer())
      .post('/developer-portal/api/apps')
      .send({
        applicationName: 'ANAF Mock E2E Portal App',
        redirectUris: [redirectUri],
      })
      .expect(201);

    mockAppCredentials = {
      clientId: registerResponse.body.clientId,
      clientSecret: registerResponse.body.clientSecret,
      redirectUri,
    };

    accessToken = await issueAccessToken();

    await updateConfig({
      latencyMs: 0,
      errorRate: 0,
      rateLimitTrigger: false,
      rateLimitMode: 'off',
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 10,
      trafficProbability: 0.35,
      autoGenerateTraffic: false,
      strictVatLookup: false,
      strictOwnershipValidation: true,
      processingDelayMs: 0,
    });

    await request(app.getHttpServer())
      .post('/simulation/seed/preset')
      .send({ preset: 'anaf-core' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues oauth token with one-hour expiry for a registered application', async () => {
    const authCode = await issueAuthorizationCode(
      mockAppCredentials.redirectUri,
    );

    const response = await request(app.getHttpServer())
      .post('/anaf-oauth2/v1/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: mockAppCredentials.redirectUri,
        client_id: mockAppCredentials.clientId,
        client_secret: mockAppCredentials.clientSecret,
      })
      .expect(200);

    expect(response.body.token_type).toBe('Bearer');
    expect(response.body.expires_in).toBe(3600);
    expect(typeof response.body.access_token).toBe('string');
    expect(typeof response.body.refresh_token).toBe('string');
    expect(String(response.body.access_token).split('.')).toHaveLength(3);
  });

  it('serves developer portal and static assets from the presentation layer', async () => {
    const portalResponse = await request(app.getHttpServer())
      .get('/')
      .expect(200);
    expect(portalResponse.text).toContain(
      '/developer-portal/assets/console.css',
    );
    expect(portalResponse.text).toContain(
      '/developer-portal/assets/console.js',
    );
    expect(portalResponse.text).toContain('<div id="app"></div>');

    const callbackPage = await request(app.getHttpServer())
      .get('/developer-portal/oauth/callback')
      .expect(200);
    expect(callbackPage.text).toContain('window.opener.postMessage');
    expect(callbackPage.text).toContain('anaf-oauth-callback');

    const jsAsset = await request(app.getHttpServer())
      .get('/developer-portal/assets/console.js')
      .expect(200);
    expect(jsAsset.headers['content-type']).toContain('application/javascript');
    expect(jsAsset.text).toContain('createRoot');
  });

  it('rejects oauth token requests with invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/anaf-oauth2/v1/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: 'abc',
        client_id: 'invalid-client',
        client_secret: 'invalid-secret',
      })
      .expect(401)
      .expect({
        error: 'invalid_client',
        error_description: 'Client authentication failed.',
      });
  });

  it('simulates e-sign authorization failures with oauth redirect errors', async () => {
    const authorizeResponse = await request(app.getHttpServer())
      .get('/anaf-oauth2/v1/authorize')
      .query({
        response_type: 'code',
        client_id: mockAppCredentials.clientId,
        redirect_uri: mockAppCredentials.redirectUri,
        state: 'workspace-123:RO10000008',
        simulate_esign: 'incorrect_credentials',
      })
      .redirects(0)
      .expect(302);

    const location = String(authorizeResponse.headers.location ?? '');
    const callbackUrl = new URL(location);

    expect(callbackUrl.searchParams.get('code')).toBeNull();
    expect(callbackUrl.searchParams.get('error')).toBe('access_denied');
    expect(callbackUrl.searchParams.get('error_description')).toContain(
      'Digital certificate authentication failed',
    );
    expect(callbackUrl.searchParams.get('state')).toBe(
      'workspace-123:RO10000008',
    );
  });

  it('returns VAT records for bootstrap and generated CUIs when strict mode is disabled', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/PlatitorTvaRest/v9/tva')
      .send([
        { cui: 'RO10000008', data: '2026-04-08' },
        { cui: 'RO10395951', data: '2026-04-08' },
      ])
      .expect(200);

    expect(response.body.cod).toBe(200);
    expect(response.body.found).toHaveLength(2);
    expect(response.body.notFound).toEqual([]);
    expect(response.body.found[1].date_generale.denumire).toContain('SRL');
  });

  it('returns official ANAF notFound payload when strict mode is enabled and none are found', async () => {
    await updateConfig({ strictVatLookup: true });

    const response = await request(app.getHttpServer())
      .post('/api/PlatitorTvaRest/v9/tva')
      .send([{ cui: 'RO10395951', data: '2026-04-08' }])
      .expect(404);

    expect(response.body).toMatchObject({
      cod: 404,
      message: 'NOT_FOUND',
    });
    expect(response.body.found).toHaveLength(0);
    expect(response.body.notFound).toContain('RO10395951');

    await updateConfig({ strictVatLookup: false });
  });

  it('returns official ANAF notFound payload when forced via header', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/PlatitorTvaRest/v9/tva')
      .set('X-Simulate-CUI-NotFound', 'true')
      .send([{ cui: 'RO10000008', data: '2026-04-08' }])
      .expect(404);

    expect(response.body).toEqual({
      cod: 404,
      message: 'NOT_FOUND',
      found: [],
      notFound: ['RO10000008'],
    });
  });

  it('rejects e-Factura message list without a valid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
      .expect(401)
      .expect({
        error: 'invalid_token',
        error_description: 'Missing Authorization header.',
      });
  });

  it('rejects e-Factura endpoints when bearer token is invalid', async () => {
    await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
      .set('Authorization', 'Bearer invalid-or-expired-token')
      .expect(401)
      .expect({
        error: 'invalid_token',
        error_description: 'The access token is invalid or expired.',
      });

    await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/descarcare?id=SIM-000')
      .set('Authorization', 'Bearer invalid-or-expired-token')
      .expect(401)
      .expect({
        error: 'invalid_token',
        error_description: 'The access token is invalid or expired.',
      });
  });

  it('allows owner identity to access owned CIF inbox (strict ownership)', async () => {
    const ionToken = await issueAccessTokenForIdentity('id_ion_popescu');

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ionToken}`)
      .expect(200);
  });

  it('returns 403 when identity accesses CIF owned by someone else', async () => {
    const ionToken = await issueAccessTokenForIdentity('id_ion_popescu');

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10079193&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ionToken}`)
      .expect(403)
      .expect({
        error: 'access_denied',
        error_description:
          'User is not authorized to access data for CIF RO10079193.',
      });
  });

  it('allows both owners to access the shared company inbox', async () => {
    const ionToken = await issueAccessTokenForIdentity('id_ion_popescu');
    const elenaToken = await issueAccessTokenForIdentity('id_elena_ionescu');

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ionToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${elenaToken}`)
      .expect(200);
  });

  it('applies runtime identity ownership overrides for custom scenarios', async () => {
    await updateIdentityOwnership('id_ion_popescu', ['RO10079193']);

    const ionOverrideToken =
      await issueAccessTokenForIdentity('id_ion_popescu');

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10079193&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ionOverrideToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ionOverrideToken}`)
      .expect(403)
      .expect({
        error: 'access_denied',
        error_description:
          'User is not authorized to access data for CIF RO10000008.',
      });

    await updateIdentityOwnership('id_ion_popescu', ['RO10000008']);
  });

  it('supports runtime seeding and seeded inter-company traffic', async () => {
    await request(app.getHttpServer())
      .post('/simulation/seed')
      .send({
        companies: [
          {
            cui: 'RO10237579',
            name: 'Nordic Parts SRL',
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
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/simulation/seed/preset')
      .send({ preset: 'anaf-large' })
      .expect(201);

    const ownerIdentityId = await findIdentityForCui('RO10237579');
    const ownerToken = await issueAccessTokenForIdentity(ownerIdentityId);

    const response = await request(app.getHttpServer())
      .get(
        '/prod/FCTEL/rest/listaMesajeFactura?cif=RO10237579&zile=30&filtru=P',
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const suppliers = new Set<string>(
      response.body.mesaje.map(
        (entry: { cif_emitent: string }) => entry.cif_emitent,
      ),
    );

    expect(response.body.mesaje.length).toBeGreaterThan(0);
    expect([...suppliers].some((supplier) => supplier !== '10237579')).toBe(
      true,
    );
  });

  it('returns ZIP downloads with legal date drift between issueDate and data_creare', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=30')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const message = listResponse.body.mesaje[0] as {
      id: string;
      data_creare: string;
    };

    const downloadResponse = await request(app.getHttpServer())
      .get(`/prod/FCTEL/rest/descarcare?id=${encodeURIComponent(message.id)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(downloadResponse.headers['content-type']).toContain(
      'application/zip',
    );

    const zip = new AdmZip(downloadResponse.body as Buffer);
    const entries = zip.getEntries().map((entry) => entry.entryName);
    expect(entries).toContain('factura.xml');
    expect(entries).toContain('semnatura.xml');

    const xml = zip.readAsText('factura.xml');
    const issueDateMatch = xml.match(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
    expect(issueDateMatch).toBeTruthy();

    const issueDate = issueDateMatch![1];
    const uploadDay = new Date(
      `${message.data_creare.slice(0, 10)}T00:00:00.000Z`,
    );
    const issueDay = new Date(`${issueDate}T00:00:00.000Z`);
    const driftDays = Math.round(
      (uploadDay.getTime() - issueDay.getTime()) / (24 * 60 * 60 * 1000),
    );

    expect(driftDays).toBeGreaterThanOrEqual(1);
    expect(driftDays).toBeLessThanOrEqual(5);
  });

  it('enforces rate limit trigger every fifth request when enabled', async () => {
    await updateConfig({
      latencyMs: 0,
      errorRate: 0,
      rateLimitMode: 'deterministic',
      rateLimitTrigger: true,
    });

    const cfg = await request(app.getHttpServer())
      .get('/simulation/config')
      .expect(200);
    const requestCount = cfg.body.requestCount as number;
    const remainder = requestCount % 5;
    const callsUntilRateLimit = remainder === 0 ? 5 : 5 - remainder;

    let lastStatus = 200;
    for (let index = 0; index < callsUntilRateLimit; index += 1) {
      const response = await request(app.getHttpServer())
        .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
        .set('Authorization', `Bearer ${accessToken}`);
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);

    await updateConfig({
      latencyMs: 0,
      errorRate: 0,
      rateLimitTrigger: false,
      rateLimitMode: 'off',
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 10,
      trafficProbability: 0.35,
      autoGenerateTraffic: false,
      strictVatLookup: false,
      strictOwnershipValidation: true,
    });
  });

  it('enforces windowed rate limiting and returns retry metadata', async () => {
    await updateConfig({
      latencyMs: 0,
      errorRate: 0,
      rateLimitMode: 'windowed',
      rateLimitTrigger: true,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 2,
    });

    await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const limitedResponse = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajeFactura?cif=RO10000008&zile=7')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(429);

    expect(limitedResponse.headers['retry-after']).toBeDefined();
    expect(limitedResponse.headers['x-ratelimit-limit']).toBe('2');
    expect(limitedResponse.body.mode).toBe('windowed');

    await updateConfig({
      latencyMs: 0,
      errorRate: 0,
      rateLimitTrigger: false,
      rateLimitMode: 'off',
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 10,
      trafficProbability: 0.35,
      autoGenerateTraffic: false,
      strictVatLookup: false,
      strictOwnershipValidation: true,
    });
  });

  it('completes full upload lifecycle: upload → stareMesaj → descarcare', async () => {
    const invoiceXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">',
      '  <cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">TEST-001</cbc:ID>',
      '</Invoice>',
    ].join('\n');

    // Step 1: Upload
    const uploadResponse = await request(app.getHttpServer())
      .post('/prod/FCTEL/rest/upload?standard=UBL&cif=RO10000008')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'text/plain')
      .send(invoiceXml)
      .expect(200);

    expect(uploadResponse.headers['content-type']).toContain('application/xml');
    expect(uploadResponse.text).toContain('ExecutionStatus="0"');
    expect(uploadResponse.text).toContain('index_incarcare=');

    const indexMatch = uploadResponse.text.match(/index_incarcare="(\d+)"/);
    expect(indexMatch).toBeTruthy();
    const indexIncarcare = indexMatch![1];

    // Step 2: Check status (processingDelayMs=0, should be "ok" immediately)
    const statusResponse = await request(app.getHttpServer())
      .get(`/prod/FCTEL/rest/stareMesaj?id_incarcare=${indexIncarcare}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(statusResponse.headers['content-type']).toContain('application/xml');
    expect(statusResponse.text).toContain('stare="ok"');
    expect(statusResponse.text).toContain('id_descarcare=');

    const idDescarcareMatch = statusResponse.text.match(/id_descarcare="([^"]+)"/);
    expect(idDescarcareMatch).toBeTruthy();
    const idDescarcare = idDescarcareMatch![1];

    // Step 3: Download the processed invoice
    const downloadResponse = await request(app.getHttpServer())
      .get(`/prod/FCTEL/rest/descarcare?id=${encodeURIComponent(idDescarcare)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(downloadResponse.headers['content-type']).toContain('application/zip');

    const zip = new AdmZip(downloadResponse.body as Buffer);
    const entries = zip.getEntries().map((entry) => entry.entryName);
    expect(entries).toContain('factura.xml');
    expect(entries).toContain('semnatura.xml');
  });

  it('rejects upload without valid bearer token', async () => {
    await request(app.getHttpServer())
      .post('/prod/FCTEL/rest/upload?standard=UBL&cif=RO10000008')
      .set('Content-Type', 'text/plain')
      .send('<Invoice/>')
      .expect(401);
  });

  it('returns upload error XML when x-simulate-upload-error header is set', async () => {
    const response = await request(app.getHttpServer())
      .post('/prod/FCTEL/rest/upload?standard=UBL&cif=RO10000008')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'text/plain')
      .set('X-Simulate-Upload-Error', 'true')
      .send('<Invoice/>')
      .expect(200);

    expect(response.text).toContain('ExecutionStatus="1"');
    expect(response.text).toContain('errorMessage=');
  });

  it('returns 404 XML for unknown upload index in stareMesaj', async () => {
    const response = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/stareMesaj?id_incarcare=99999999999')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.text).toContain('stare="in prelucrare"');
  });

  it('returns paginated message list with ANAF pagination fields', async () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const response = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/listaMesajePaginatieFactura')
      .query({
        cif: 'RO10000008',
        startTime: String(thirtyDaysAgo),
        endTime: String(now),
        pagina: '1',
        filtru: 'P',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.cod).toBe(200);
    expect(response.body).toHaveProperty('numar_total_inregistrari');
    expect(response.body).toHaveProperty('numar_total_pagini');
    expect(response.body).toHaveProperty('index_pagina_curenta');
    expect(response.body).toHaveProperty('numar_inregistrari_in_pagina');
    expect(response.body).toHaveProperty('numar_total_inregistrari_per_pagina');
    expect(response.body.index_pagina_curenta).toBe(1);
    expect(Array.isArray(response.body.mesaje)).toBe(true);
  });

  it('simulates XML validation failure via x-simulate-invalid-xml header', async () => {
    const response = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/stareMesaj?id_incarcare=12345')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Simulate-Invalid-Xml', 'true')
      .expect(200);

    expect(response.text).toContain('stare="XML cu erori nepreluat de sistem"');
    expect(response.text).toContain('errorMessage=');
  });

  it('simulates nok status via x-simulate-nok header', async () => {
    const response = await request(app.getHttpServer())
      .get('/prod/FCTEL/rest/stareMesaj?id_incarcare=12345')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Simulate-Nok', 'true')
      .expect(200);

    expect(response.text).toContain('stare="nok"');
    expect(response.text).toContain('errorMessage=');
  });

  /**
   * Executes updateConfig.
   * @param config Value for config.
   */
  async function updateConfig(config: {
    latencyMs?: number;
    errorRate?: number;
    rateLimitTrigger?: boolean;
    rateLimitMode?: 'off' | 'deterministic' | 'windowed';
    rateLimitWindowMs?: number;
    rateLimitMaxRequests?: number;
    autoGenerateTraffic?: boolean;
    trafficProbability?: number;
    strictVatLookup?: boolean;
    strictOwnershipValidation?: boolean;
    processingDelayMs?: number;
  }): Promise<void> {
    await request(app.getHttpServer())
      .patch('/simulation/config')
      .send(config)
      .expect(200);
  }

  /**
   * Executes updateIdentityOwnership.
   * @param identityId Value for identityId.
   * @param authorizedCuis Value for authorizedCuis.
   */
  async function updateIdentityOwnership(
    identityId: string,
    authorizedCuis: string[],
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch(
        `/developer-portal/api/internal/identities/${encodeURIComponent(
          identityId,
        )}/ownership`,
      )
      .send({ authorizedCuis })
      .expect(200);
  }

  /**
   * Executes issueAuthorizationCode.
   * @param redirectUri Value for redirectUri.
   * @param identityId Value for identityId.
   * @returns The issueAuthorizationCode result.
   */
  async function issueAuthorizationCode(
    redirectUri: string,
    identityId?: string,
  ): Promise<string> {
    const authorizeResponse = await request(app.getHttpServer())
      .get('/anaf-oauth2/v1/authorize')
      .query({
        response_type: 'code',
        client_id: mockAppCredentials.clientId,
        redirect_uri: redirectUri,
        state: 'workspace-123:RO10000008',
        ...(identityId ? { identity_id: identityId } : {}),
      })
      .redirects(0)
      .expect(302);

    const location = String(authorizeResponse.headers.location ?? '');
    const callbackUrl = new URL(location);
    const code = callbackUrl.searchParams.get('code');

    if (!code) {
      throw new Error('Expected authorization code in redirect URL');
    }

    return code;
  }

  /**
   * Executes issueAccessToken.
   * @param identityId Value for identityId.
   * @returns The issueAccessToken result.
   */
  async function issueAccessToken(identityId?: string): Promise<string> {
    const authCode = await issueAuthorizationCode(
      mockAppCredentials.redirectUri,
      identityId,
    );

    const tokenResponse = await request(app.getHttpServer())
      .post('/anaf-oauth2/v1/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: mockAppCredentials.redirectUri,
        client_id: mockAppCredentials.clientId,
        client_secret: mockAppCredentials.clientSecret,
      })
      .expect(200);

    const token = tokenResponse.body.access_token as string;
    if (!token) {
      throw new Error('Expected access token during test bootstrap');
    }

    return token;
  }

  /**
   * Executes issueAccessTokenForIdentity.
   * @param identityId Value for identityId.
   * @returns The issueAccessTokenForIdentity result.
   */
  async function issueAccessTokenForIdentity(
    identityId: string,
  ): Promise<string> {
    return issueAccessToken(identityId);
  }

  /**
   * Executes findIdentityForCui.
   * @param cui Value for cui.
   * @returns The findIdentityForCui result.
   */
  async function findIdentityForCui(cui: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/developer-portal/api/internal/identities')
      .expect(200);

    const normalized = normalizeCui(cui);
    const identities = (response.body.identities ?? []) as Array<{
      id: string;
      authorizedCuis: string[];
    }>;

    const owner = identities.find((identity) =>
      (identity.authorizedCuis ?? []).includes(normalized),
    );

    if (!owner?.id) {
      throw new Error(`No identity mapped to CUI ${normalized}`);
    }

    return owner.id;
  }

  /**
   * Executes normalizeCui.
   * @param raw Value for raw.
   * @returns The normalizeCui result.
   */
  function normalizeCui(raw: string): string {
    const normalized = raw.trim().toUpperCase();
    const numeric = normalized.replace(/^RO/, '').replace(/[\s-]/g, '');
    return `RO${numeric}`;
  }
});

/**
 * Executes binaryParser.
 * @param res Value for res.
 * @param callback Value for callback.
 */
function binaryParser(
  res: any,
  callback: (error: Error | null, data?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error));
}
