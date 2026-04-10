import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  AuthorizeOAuthClientCommand,
  IssueOAuthTokenCommand,
} from './oauth.commands';
import {
  AuthorizeOAuthClientHandler,
  IssueOAuthTokenHandler,
  ValidateAuthorizationHeaderHandler,
} from './oauth.handlers';
import { ValidateAuthorizationHeaderQuery } from './oauth.queries';
import { MockApplicationRegistryService } from '../services/mock-application-registry.service';
import { MockIdentityRegistryService } from '../services/mock-identity-registry.service';
import {
  AccessTokenValidationResult,
  OAuthTokenService,
} from '../services/oauth-token.service';

type AppRegistryMock = {
  hasClient: jest.Mock;
  isRedirectUriAllowed: jest.Mock;
  issueAuthorizationCode: jest.Mock;
  validateCredentials: jest.Mock;
  consumeAuthorizationCode: jest.Mock;
};

type IdentityRegistryMock = {
  getIdentity: jest.Mock;
  getDefaultIdentityId: jest.Mock;
};

type TokenServiceMock = {
  issueToken: jest.Mock;
  issueTokenFromRefreshToken: jest.Mock;
  validateAuthorizationHeader: jest.Mock;
};

function buildAuthorizeDeps(): {
  appRegistry: AppRegistryMock;
  identityRegistry: IdentityRegistryMock;
  handler: AuthorizeOAuthClientHandler;
} {
  const appRegistry: AppRegistryMock = {
    hasClient: jest.fn(),
    isRedirectUriAllowed: jest.fn(),
    issueAuthorizationCode: jest.fn(),
    validateCredentials: jest.fn(),
    consumeAuthorizationCode: jest.fn(),
  };

  const identityRegistry: IdentityRegistryMock = {
    getIdentity: jest.fn(),
    getDefaultIdentityId: jest.fn(),
  };

  const handler = new AuthorizeOAuthClientHandler(
    appRegistry as unknown as MockApplicationRegistryService,
    identityRegistry as unknown as MockIdentityRegistryService,
  );

  return { appRegistry, identityRegistry, handler };
}

function buildTokenDeps(): {
  appRegistry: AppRegistryMock;
  identityRegistry: IdentityRegistryMock;
  tokenService: TokenServiceMock;
  handler: IssueOAuthTokenHandler;
} {
  const appRegistry: AppRegistryMock = {
    hasClient: jest.fn(),
    isRedirectUriAllowed: jest.fn(),
    issueAuthorizationCode: jest.fn(),
    validateCredentials: jest.fn(),
    consumeAuthorizationCode: jest.fn(),
  };

  const identityRegistry: IdentityRegistryMock = {
    getIdentity: jest.fn(),
    getDefaultIdentityId: jest.fn(),
  };

  const tokenService: TokenServiceMock = {
    issueToken: jest.fn(),
    issueTokenFromRefreshToken: jest.fn(),
    validateAuthorizationHeader: jest.fn(),
  };

  const handler = new IssueOAuthTokenHandler(
    appRegistry as unknown as MockApplicationRegistryService,
    identityRegistry as unknown as MockIdentityRegistryService,
    tokenService as unknown as OAuthTokenService,
  );

  return { appRegistry, identityRegistry, tokenService, handler };
}

describe('AuthorizeOAuthClientHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects unsupported response types', async () => {
    const { handler } = buildAuthorizeDeps();

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'token',
        'client-1',
        'https://client/callback',
      ),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'unsupported_response_type',
      description: 'Only response_type=code is supported.',
    });
  });

  it('rejects unknown clients', async () => {
    const { appRegistry, handler } = buildAuthorizeDeps();
    appRegistry.hasClient.mockReturnValue(false);

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'code',
        'missing-client',
        'https://client/callback',
      ),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 401,
      error: 'invalid_client',
      description: 'Client authentication failed.',
      requiresBasicAuth: true,
    });
  });

  it('rejects unregistered redirect URIs', async () => {
    const { appRegistry, handler } = buildAuthorizeDeps();
    appRegistry.hasClient.mockReturnValue(true);
    appRegistry.isRedirectUriAllowed.mockReturnValue(false);

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'code',
        'client-1',
        'https://client/not-allowed',
      ),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_request',
      description: 'redirect_uri is not registered for this client_id.',
    });
  });

  it('rejects unknown identity selections', async () => {
    const { appRegistry, identityRegistry, handler } = buildAuthorizeDeps();
    appRegistry.hasClient.mockReturnValue(true);
    appRegistry.isRedirectUriAllowed.mockReturnValue(true);
    identityRegistry.getIdentity.mockReturnValue(undefined);

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'code',
        'client-1',
        'https://client/callback',
        undefined,
        'missing-id',
      ),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_request',
      description: 'identity_id is unknown or not registered.',
    });
  });

  it('returns server_error when no identity is available', async () => {
    const { appRegistry, identityRegistry, handler } = buildAuthorizeDeps();
    appRegistry.hasClient.mockReturnValue(true);
    appRegistry.isRedirectUriAllowed.mockReturnValue(true);
    identityRegistry.getDefaultIdentityId.mockReturnValue(undefined);

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'code',
        'client-1',
        'https://client/callback',
      ),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 500,
      error: 'server_error',
      description: 'No mock identities are available for e-sign simulation.',
    });
  });

  it('creates redirect url with auth code and state for successful authorize flow', async () => {
    const { appRegistry, identityRegistry, handler } = buildAuthorizeDeps();
    appRegistry.hasClient.mockReturnValue(true);
    appRegistry.isRedirectUriAllowed.mockReturnValue(true);
    identityRegistry.getDefaultIdentityId.mockReturnValue('id_ion_popescu');
    appRegistry.issueAuthorizationCode.mockReturnValue('code-123');

    const result = await handler.execute(
      new AuthorizeOAuthClientCommand(
        'code',
        'client-1',
        'https://client/callback',
        'state-xyz',
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected successful authorize result.');
    }

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get('code')).toBe('code-123');
    expect(redirect.searchParams.get('state')).toBe('state-xyz');
    expect(appRegistry.issueAuthorizationCode).toHaveBeenCalledWith(
      'client-1',
      'https://client/callback',
      'id_ion_popescu',
    );
  });
});

describe('IssueOAuthTokenHandler', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns invalid_client when credentials are missing', async () => {
    const { handler } = buildTokenDeps();

    const result = await handler.execute(new IssueOAuthTokenCommand({}));

    expect(result).toEqual({
      ok: false,
      statusCode: 401,
      error: 'invalid_client',
      description: 'Missing client credentials.',
      requiresBasicAuth: true,
    });
  });

  it('returns invalid_client when credentials are invalid', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(false);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        client_id: 'client-1',
        client_secret: 'wrong',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 401,
      error: 'invalid_client',
      description: 'Client authentication failed.',
      requiresBasicAuth: true,
    });
  });

  it('supports credentials extracted from Basic authorization header', async () => {
    const { appRegistry, tokenService, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    tokenService.issueTokenFromRefreshToken.mockReturnValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'efactura vat',
    });

    const result = await handler.execute(
      new IssueOAuthTokenCommand(
        {
          grant_type: 'refresh_token',
          refresh_token: 'refresh-0',
          client_id: 'ignored',
          client_secret: 'ignored',
        },
        `Basic ${Buffer.from('client-basic:secret-basic').toString('base64')}`,
      ),
    );

    expect(result.ok).toBe(true);
    expect(appRegistry.validateCredentials).toHaveBeenCalledWith(
      'client-basic',
      'secret-basic',
    );
  });

  it('falls back to body credentials when Basic payload has no separator', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(false);

    await handler.execute(
      new IssueOAuthTokenCommand(
        {
          client_id: 'client-body',
          client_secret: 'secret-body',
        },
        `Basic ${Buffer.from('not-a-pair').toString('base64')}`,
      ),
    );

    expect(appRegistry.validateCredentials).toHaveBeenCalledWith(
      'client-body',
      'secret-body',
    );
  });

  it('returns unsupported_grant_type for unknown grants', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'client_credentials',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'unsupported_grant_type',
      description: 'Only authorization_code and refresh_token are supported.',
    });
  });

  it('validates authorization_code grant payload requirements', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'authorization_code',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_request',
      description: 'authorization_code grant requires code and redirect_uri.',
    });
  });

  it('returns invalid_grant when authorization code is invalid', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    appRegistry.consumeAuthorizationCode.mockReturnValue(undefined);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'authorization_code',
        code: 'bad-code',
        redirect_uri: 'https://client/callback',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_grant',
      description: 'Authorization code is invalid or expired.',
    });
  });

  it('returns server_error when consumed grant has no identity and no default identity', async () => {
    const { appRegistry, identityRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    appRegistry.consumeAuthorizationCode.mockReturnValue({
      clientId: 'client-1',
      redirectUri: 'https://client/callback',
      identityId: '',
    });
    identityRegistry.getDefaultIdentityId.mockReturnValue(undefined);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'https://client/callback',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 500,
      error: 'server_error',
      description: 'No mock identity available for token issuance.',
    });
  });

  it('issues token for valid authorization_code grants', async () => {
    const { appRegistry, tokenService, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    appRegistry.consumeAuthorizationCode.mockReturnValue({
      clientId: 'client-1',
      redirectUri: 'https://client/callback',
      identityId: 'id_ion_popescu',
    });
    tokenService.issueToken.mockReturnValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'efactura vat',
    });

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: 'https://client/callback',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: true,
      token: {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'efactura vat',
      },
    });
    expect(tokenService.issueToken).toHaveBeenCalledWith(
      'client-1',
      'id_ion_popescu',
    );
  });

  it('validates refresh_token grant payload requirements', async () => {
    const { appRegistry, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'refresh_token',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_request',
      description: 'refresh_token grant requires refresh_token.',
    });
  });

  it('returns invalid_grant for invalid refresh tokens', async () => {
    const { appRegistry, tokenService, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    tokenService.issueTokenFromRefreshToken.mockReturnValue(undefined);

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'refresh_token',
        refresh_token: 'bad-refresh',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'invalid_grant',
      description: 'Refresh token is invalid or expired.',
    });
  });

  it('issues token for valid refresh tokens', async () => {
    const { appRegistry, tokenService, handler } = buildTokenDeps();
    appRegistry.validateCredentials.mockReturnValue(true);
    tokenService.issueTokenFromRefreshToken.mockReturnValue({
      access_token: 'access-refreshed',
      refresh_token: 'refresh-new',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'efactura vat',
    });

    const result = await handler.execute(
      new IssueOAuthTokenCommand({
        grant_type: 'refresh_token',
        refresh_token: 'refresh-old',
        client_id: 'client-1',
        client_secret: 'secret-1',
      }),
    );

    expect(result).toEqual({
      ok: true,
      token: {
        access_token: 'access-refreshed',
        refresh_token: 'refresh-new',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'efactura vat',
      },
    });
  });
});

describe('ValidateAuthorizationHeaderHandler', () => {
  it('delegates bearer header validation to OAuthTokenService', async () => {
    const expected: AccessTokenValidationResult = {
      isValid: true,
      clientId: 'client-1',
      identityId: 'id_ion_popescu',
    };

    const tokenService: TokenServiceMock = {
      issueToken: jest.fn(),
      issueTokenFromRefreshToken: jest.fn(),
      validateAuthorizationHeader: jest.fn().mockReturnValue(expected),
    };

    const handler = new ValidateAuthorizationHeaderHandler(
      tokenService as unknown as OAuthTokenService,
    );

    const result = await handler.execute(
      new ValidateAuthorizationHeaderQuery('Bearer token-1'),
    );

    expect(tokenService.validateAuthorizationHeader).toHaveBeenCalledWith(
      'Bearer token-1',
    );
    expect(result).toEqual(expected);
  });
});
