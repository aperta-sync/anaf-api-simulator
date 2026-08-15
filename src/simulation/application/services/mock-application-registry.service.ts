import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SimulationTypes } from '../../domain/simulation.types';
import { RedisControlStateStoreService } from '../../infrastructure/persistence/redis-control-state-store.service';
import { readTtlSeconds } from './ttl-config';

interface AuthorizationCodeGrant {
  code: string;
  clientId: string;
  redirectUri: string;
  identityId: string;
  expiresAt: number;
}

export interface ConsumedAuthorizationCodeGrant {
  clientId: string;
  redirectUri: string;
  identityId: string;
}

/**
 * Authorization code lifetime, matching ANAF's inferred F5 BIG-IP APM configuration.
 *
 * ANAF's OAuth server is F5 BIG-IP APM: its OIDC discovery document at
 * logincert.anaf.ro serves revoke, introspect and userinfo from /f5-oauth2/v1/ paths.
 * F5 expresses OAuth lifetimes in minutes, and the values ANAF publishes are quoted in
 * exactly those units — "ACCES TOKEN JWT: 129600 minute", "REFRESH TOKEN JWT: 525600
 * minute" — i.e. its overridden jwt-access-token-lifetime and jwt-refresh-token-lifetime.
 * auth-code-lifetime is absent from that list, indicating it is left at the F5 default
 * of 5 minutes, which is what this value mirrors.
 *
 * The separate "60 de secunde" entry in the same section describes a connection reset
 * during token acquisition, not the code exchange window. See issue #12.
 */
const DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;

/**
 * Stores mock OAuth applications and short-lived authorization codes.
 */
@Injectable()
export class MockApplicationRegistryService implements OnModuleInit {
  private static readonly APPS_STATE_KEY = 'anaf:mock:state:applications:v1';

  private readonly logger = new Logger(MockApplicationRegistryService.name);
  private readonly applications = new Map<
    string,
    SimulationTypes.RegisteredMockApplication
  >();
  private readonly authorizationCodes = new Map<
    string,
    AuthorizationCodeGrant
  >();
  private readonly authorizationCodeTtlSeconds: number;

  /**
   * Seeds an environment-defined OAuth client at startup when configured.
   */
  async onModuleInit(): Promise<void> {
    await this.restorePersistedApplications();
    this.bootstrapFromEnv();
    await this.persistApplications();
  }

  /**
   * Creates an instance of MockApplicationRegistryService.
   * @param controlStateStore Value for controlStateStore.
   */
  constructor(
    private readonly controlStateStore?: RedisControlStateStoreService,
  ) {
    // Nest manages lifecycle for injected services.
    this.authorizationCodeTtlSeconds = readTtlSeconds(
      process.env.ANAF_MOCK_AUTHORIZATION_CODE_TTL_SECONDS,
      DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS,
    );
  }

  /**
   * Registers a new mock application and generates credentials.
   *
   * @param applicationName Human-readable client name.
   * @param redirectUris Allowed callback URIs.
   * @param source Origin marker for diagnostics.
   * @returns Persisted application including generated client secret.
   */
  registerApplication(
    applicationName: string,
    redirectUris: string[],
    source: 'portal' | 'env' = 'portal',
  ): SimulationTypes.RegisteredMockApplication {
    const clientId = this.generateClientId();
    const clientSecret = this.generateClientSecret();

    const app: SimulationTypes.RegisteredMockApplication = {
      applicationName: applicationName.trim(),
      clientId,
      clientSecret,
      redirectUris: this.sanitizeRedirectUris(redirectUris),
      createdAt: new Date().toISOString(),
      source,
    };

    this.applications.set(clientId, app);
    this.persistApplicationsAsync();
    return app;
  }

  /**
   * Registers a mock application with pre-existing credentials.
   *
   * @param applicationName Human-readable client name.
   * @param redirectUris Allowed callback URIs.
   * @param clientId External client identifier.
   * @param clientSecret External client secret.
   * @returns Persisted application entity.
   */
  registerApplicationWithCredentials(
    applicationName: string,
    redirectUris: string[],
    clientId: string,
    clientSecret: string,
  ): SimulationTypes.RegisteredMockApplication {
    const app: SimulationTypes.RegisteredMockApplication = {
      applicationName: applicationName.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUris: this.sanitizeRedirectUris(redirectUris),
      createdAt: new Date().toISOString(),
      source: 'env',
    };

    this.applications.set(app.clientId, app);
    this.persistApplicationsAsync();
    return app;
  }

  /**
   * Lists applications without exposing secrets.
   *
   * @returns Public-safe application summaries sorted by newest first.
   */
  listApplications(): SimulationTypes.PublicMockApplication[] {
    const apps = [...this.applications.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );

    return apps.map((app) => ({
      applicationName: app.applicationName,
      clientId: app.clientId,
      redirectUris: [...app.redirectUris],
      createdAt: app.createdAt,
      source: app.source,
    }));
  }

  /**
   * Lists applications with secrets for internal administration flows.
   *
   * @returns Full application entities sorted by newest first.
   */
  listApplicationsWithSecrets(): SimulationTypes.RegisteredMockApplication[] {
    return [...this.applications.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  /**
   * Resolves an application by client id.
   *
   * @param clientId OAuth client identifier.
   * @returns Matching application or undefined.
   */
  getApplication(
    clientId: string,
  ): SimulationTypes.RegisteredMockApplication | undefined {
    return this.applications.get(clientId.trim());
  }

  /**
   * Updates mutable fields for an existing application.
   *
   * @param clientId OAuth client identifier.
   * @param update Partial update payload.
   * @returns Updated application or undefined when not found.
   */
  updateApplication(
    clientId: string,
    update: {
      applicationName?: string;
      redirectUris?: string[];
    },
  ): SimulationTypes.RegisteredMockApplication | undefined {
    const key = clientId.trim();
    const existing = this.applications.get(key);
    if (!existing) {
      return undefined;
    }

    const updated: SimulationTypes.RegisteredMockApplication = {
      ...existing,
      applicationName:
        typeof update.applicationName === 'string' &&
        update.applicationName.trim().length > 0
          ? update.applicationName.trim()
          : existing.applicationName,
      redirectUris:
        Array.isArray(update.redirectUris) && update.redirectUris.length > 0
          ? this.sanitizeRedirectUris(update.redirectUris)
          : existing.redirectUris,
    };

    this.applications.set(key, updated);
    this.persistApplicationsAsync();
    return updated;
  }

  /**
   * Deletes an application from the registry.
   *
   * @param clientId OAuth client identifier.
   * @returns True when an application was removed.
   */
  deleteApplication(clientId: string): boolean {
    const deleted = this.applications.delete(clientId.trim());
    if (deleted) {
      this.persistApplicationsAsync();
    }

    return deleted;
  }

  /**
   * Resets application registry to startup defaults.
   *
   * @returns Restored applications after reset/bootstrapping.
   */
  async resetToDefaults(): Promise<
    SimulationTypes.RegisteredMockApplication[]
  > {
    this.applications.clear();
    this.authorizationCodes.clear();
    this.bootstrapFromEnv();
    await this.persistApplications();
    return this.listApplicationsWithSecrets();
  }

  /**
   * Checks whether a client id exists.
   *
   * @param clientId OAuth client identifier.
   * @returns True when the client is registered.
   */
  hasClient(clientId: string): boolean {
    return this.applications.has(clientId.trim());
  }

  /**
   * Validates client id and secret pair.
   *
   * @param clientId OAuth client identifier.
   * @param clientSecret OAuth client secret.
   * @returns True when credentials match a registered client.
   */
  validateCredentials(clientId: string, clientSecret: string): boolean {
    const app = this.applications.get(clientId.trim());
    if (!app) {
      return false;
    }

    return app.clientSecret === clientSecret.trim();
  }

  /**
   * Validates whether the provided redirect URI is allowed for a client.
   *
   * @param clientId OAuth client identifier.
   * @param redirectUri Redirect URI to validate.
   * @returns True when URI is present in the client's allow-list.
   */
  isRedirectUriAllowed(clientId: string, redirectUri: string): boolean {
    const app = this.applications.get(clientId.trim());
    if (!app) {
      return false;
    }

    const normalized = redirectUri.trim();
    return app.redirectUris.includes(normalized);
  }

  /**
   * Issues a short-lived authorization code for an approved authorize request.
   *
   * @param clientId OAuth client identifier.
   * @param redirectUri Approved redirect URI.
   * @param identityId Selected e-sign identity identifier.
   * @returns Newly generated authorization code.
   */
  issueAuthorizationCode(
    clientId: string,
    redirectUri: string,
    identityId: string,
  ): string {
    this.pruneExpiredAuthorizationCodes();

    const code = randomBytes(24).toString('base64url');
    const grant: AuthorizationCodeGrant = {
      code,
      clientId: clientId.trim(),
      redirectUri: redirectUri.trim(),
      identityId: identityId.trim(),
      expiresAt: Date.now() + this.authorizationCodeTtlSeconds * 1000,
    };

    this.authorizationCodes.set(code, grant);
    return code;
  }

  /**
   * Consumes an authorization code and validates grant ownership.
   *
   * @param code Authorization code.
   * @param clientId OAuth client identifier.
   * @param redirectUri Redirect URI submitted during token exchange.
   * @returns Consumed grant data when the code is valid.
   */
  consumeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
  ): ConsumedAuthorizationCodeGrant | undefined {
    this.pruneExpiredAuthorizationCodes();

    const grant = this.authorizationCodes.get(code.trim());
    if (!grant) {
      return undefined;
    }

    this.authorizationCodes.delete(code.trim());

    const isValid =
      grant.clientId === clientId.trim() &&
      grant.redirectUri === redirectUri.trim() &&
      grant.expiresAt >= Date.now();

    if (!isValid) {
      return undefined;
    }

    return {
      clientId: grant.clientId,
      redirectUri: grant.redirectUri,
      identityId: grant.identityId,
    };
  }

  /**
   * Bootstraps one predefined OAuth application from environment variables.
   */
  private bootstrapFromEnv(): void {
    const envClientId = process.env.ANAF_CLIENT_ID?.trim();
    const envClientSecret = process.env.ANAF_CLIENT_SECRET?.trim();
    const callback = process.env.ANAF_CALLBACK_URL?.trim();

    if (!envClientId || !envClientSecret || !callback) {
      return;
    }

    if (this.applications.has(envClientId)) {
      return;
    }

    this.registerApplicationWithCredentials(
      'Environment Bootstrapped ANAF Application',
      [callback],
      envClientId,
      envClientSecret,
    );

    this.logger.log(
      `Bootstrapped ANAF OAuth client from environment: ${envClientId}`,
    );
  }

  /**
   * Restores registered applications from persisted control state.
   */
  private async restorePersistedApplications(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    const persisted = await this.controlStateStore.readJson<
      SimulationTypes.RegisteredMockApplication[]
    >(MockApplicationRegistryService.APPS_STATE_KEY);

    if (!Array.isArray(persisted) || persisted.length === 0) {
      return;
    }

    for (const candidate of persisted) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const clientId = String(candidate.clientId ?? '').trim();
      const clientSecret = String(candidate.clientSecret ?? '').trim();
      const applicationName = String(candidate.applicationName ?? '').trim();
      const createdAt = String(candidate.createdAt ?? '').trim();

      if (!clientId || !clientSecret || !applicationName || !createdAt) {
        continue;
      }

      const source: 'portal' | 'env' =
        candidate.source === 'env' ? 'env' : 'portal';

      const restored: SimulationTypes.RegisteredMockApplication = {
        clientId,
        clientSecret,
        applicationName,
        createdAt,
        source,
        redirectUris: this.sanitizeRedirectUris(candidate.redirectUris ?? []),
      };

      if (restored.redirectUris.length === 0) {
        continue;
      }

      this.applications.set(restored.clientId, restored);
    }

    if (this.applications.size > 0) {
      this.logger.log(
        `Loaded ${this.applications.size} persisted mock OAuth applications.`,
      );
    }
  }

  /**
   * Persists application registry state without blocking request flow.
   */
  private persistApplicationsAsync(): void {
    void this.persistApplications();
  }

  /**
   * Persists application registry state to control-state store.
   */
  private async persistApplications(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    await this.controlStateStore.writeJson(
      MockApplicationRegistryService.APPS_STATE_KEY,
      this.listApplicationsWithSecrets(),
    );
  }

  /**
   * Normalizes and de-duplicates redirect URI inputs.
   *
   * @param redirectUris Raw URI list.
   * @returns Unique, trimmed URI values.
   */
  private sanitizeRedirectUris(redirectUris: string[]): string[] {
    const normalized = redirectUris
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const unique = new Set(normalized);
    return [...unique];
  }

  /**
   * Generates a mock client id.
   *
   * @returns Randomized client id value.
   */
  private generateClientId(): string {
    return `mock_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Generates a mock client secret.
   *
   * @returns Randomized client secret value.
   */
  private generateClientSecret(): string {
    return `mocksec_${randomBytes(24).toString('hex')}`;
  }

  /**
   * Removes expired authorization code grants from the in-memory store.
   */
  private pruneExpiredAuthorizationCodes(): void {
    const now = Date.now();

    for (const [code, grant] of this.authorizationCodes.entries()) {
      if (grant.expiresAt < now) {
        this.authorizationCodes.delete(code);
      }
    }
  }
}
