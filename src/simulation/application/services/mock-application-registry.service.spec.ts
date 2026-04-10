import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { MockApplicationRegistryService } from './mock-application-registry.service';

const ENV_KEYS = [
  'ANAF_CLIENT_ID',
  'ANAF_CLIENT_SECRET',
  'ANAF_CALLBACK_URL',
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

describe('MockApplicationRegistryService', () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  it('registers applications with trimmed and deduplicated redirect URIs', () => {
    const service = new MockApplicationRegistryService();

    const app = service.registerApplication(' Demo App ', [
      'https://example.com/callback',
      ' https://example.com/callback ',
      '',
      'https://example.com/alt',
    ]);

    expect(app.applicationName).toBe('Demo App');
    expect(app.redirectUris).toEqual([
      'https://example.com/callback',
      'https://example.com/alt',
    ]);
    expect(app.clientId.startsWith('mock_')).toBe(true);
    expect(app.clientSecret.startsWith('mocksec_')).toBe(true);
  });

  it('lists applications without exposing client secrets', () => {
    const service = new MockApplicationRegistryService();
    service.registerApplication('Portal App', ['https://portal/callback']);

    const listed = service.listApplications();

    expect(listed).toHaveLength(1);
    expect('clientSecret' in listed[0]).toBe(false);
  });

  it('validates credentials and redirect URI allow-list entries', () => {
    const service = new MockApplicationRegistryService();
    const app = service.registerApplication('OAuth App', [
      'https://client/callback',
    ]);

    expect(service.validateCredentials(app.clientId, app.clientSecret)).toBe(
      true,
    );
    expect(service.validateCredentials(app.clientId, 'invalid')).toBe(false);
    expect(
      service.isRedirectUriAllowed(app.clientId, 'https://client/callback'),
    ).toBe(true);
    expect(
      service.isRedirectUriAllowed(app.clientId, 'https://client/other'),
    ).toBe(false);
  });

  it('issues and consumes one-time authorization codes', () => {
    const service = new MockApplicationRegistryService();
    const app = service.registerApplication('OAuth App', [
      'https://client/callback',
    ]);

    const code = service.issueAuthorizationCode(
      app.clientId,
      'https://client/callback',
      'id_ion_popescu',
    );

    const consumed = service.consumeAuthorizationCode(
      code,
      app.clientId,
      'https://client/callback',
    );

    expect(consumed).toEqual({
      clientId: app.clientId,
      redirectUri: 'https://client/callback',
      identityId: 'id_ion_popescu',
    });

    expect(
      service.consumeAuthorizationCode(
        code,
        app.clientId,
        'https://client/callback',
      ),
    ).toBeUndefined();
  });

  it('rejects expired and mismatched authorization codes', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const service = new MockApplicationRegistryService();
    const app = service.registerApplication('OAuth App', [
      'https://client/callback',
    ]);

    nowSpy.mockReturnValue(1_000);
    const code = service.issueAuthorizationCode(
      app.clientId,
      'https://client/callback',
      'id_ion_popescu',
    );

    nowSpy.mockReturnValue(1_000 + 6 * 60 * 1_000);
    expect(
      service.consumeAuthorizationCode(
        code,
        app.clientId,
        'https://client/callback',
      ),
    ).toBeUndefined();

    const freshCode = service.issueAuthorizationCode(
      app.clientId,
      'https://client/callback',
      'id_ion_popescu',
    );
    expect(
      service.consumeAuthorizationCode(
        freshCode,
        app.clientId,
        'https://wrong',
      ),
    ).toBeUndefined();
  });

  it('updates and deletes existing applications', () => {
    const service = new MockApplicationRegistryService();
    const app = service.registerApplication('OAuth App', [
      'https://client/callback',
    ]);

    const unchanged = service.updateApplication(app.clientId, {
      applicationName: '   ',
      redirectUris: [],
    });
    expect(unchanged?.applicationName).toBe('OAuth App');
    expect(unchanged?.redirectUris).toEqual(['https://client/callback']);

    const updated = service.updateApplication(app.clientId, {
      applicationName: 'Renamed App',
      redirectUris: [
        'https://client/new-callback',
        'https://client/new-callback',
      ],
    });
    expect(updated?.applicationName).toBe('Renamed App');
    expect(updated?.redirectUris).toEqual(['https://client/new-callback']);

    expect(service.deleteApplication(app.clientId)).toBe(true);
    expect(service.deleteApplication(app.clientId)).toBe(false);
  });

  it('resets app registry to defaults and clears authorization grants', async () => {
    process.env.ANAF_CLIENT_ID = 'env-client';
    process.env.ANAF_CLIENT_SECRET = 'env-secret';
    process.env.ANAF_CALLBACK_URL = 'https://env/callback';

    const service = new MockApplicationRegistryService();
    await service.onModuleInit();

    const created = service.registerApplication('Portal App', [
      'https://portal/callback',
    ]);

    const code = service.issueAuthorizationCode(
      created.clientId,
      'https://portal/callback',
      'id_ion_popescu',
    );

    const resetApps = await service.resetToDefaults();

    expect(resetApps).toHaveLength(1);
    expect(resetApps[0].clientId).toBe('env-client');
    expect(service.getApplication(created.clientId)).toBeUndefined();
    expect(
      service.consumeAuthorizationCode(
        code,
        created.clientId,
        'https://portal/callback',
      ),
    ).toBeUndefined();
  });

  it('bootstraps one environment-defined client during module init', async () => {
    process.env.ANAF_CLIENT_ID = 'env-client';
    process.env.ANAF_CLIENT_SECRET = 'env-secret';
    process.env.ANAF_CALLBACK_URL = 'https://env/callback';

    const service = new MockApplicationRegistryService();
    await service.onModuleInit();
    await service.onModuleInit();

    const app = service.getApplication('env-client');
    expect(app).toBeDefined();
    expect(app?.source).toBe('env');
    expect(service.listApplicationsWithSecrets()).toHaveLength(1);
  });
});
