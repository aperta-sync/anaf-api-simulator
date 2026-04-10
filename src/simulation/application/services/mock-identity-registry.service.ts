import { Injectable, OnModuleInit } from '@nestjs/common';
import { SimulationTypes } from '../../domain/simulation.types';
import { SimulationEngineService } from './simulation-engine.service';
import { RedisControlStateStoreService } from '../../infrastructure/persistence/redis-control-state-store.service';

interface PersistedIdentityState {
  manualOwnershipOverride: boolean;
  profiles: SimulationTypes.IdentityProfile[];
}

interface IdentitySeedProfile {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Stores mock e-sign identity ownership profiles used for CIF authorization checks.
 */
@Injectable()
export class MockIdentityRegistryService implements OnModuleInit {
  private static readonly IDENTITY_STATE_KEY =
    'anaf:mock:state:identity-ownership:v1';

  private static readonly IDENTITY_SEED: IdentitySeedProfile[] = [
    {
      id: 'id_ion_popescu',
      fullName: 'Ion Popescu',
      email: 'ion.popescu@example.com',
    },
    {
      id: 'id_elena_ionescu',
      fullName: 'Elena Ionescu',
      email: 'elena.ionescu@example.com',
    },
    {
      id: 'id_mihai_stanescu',
      fullName: 'Mihai Stanescu',
      email: 'mihai.stanescu@example.com',
    },
    {
      id: 'id_andreea_marin',
      fullName: 'Andreea Marin',
      email: 'andreea.marin@example.com',
    },
    {
      id: 'id_radu_dumitrescu',
      fullName: 'Radu Dumitrescu',
      email: 'radu.dumitrescu@example.com',
    },
  ];

  private static readonly PRIMARY_IDENTITY_ID = 'id_ion_popescu';
  private static readonly SECONDARY_IDENTITY_ID = 'id_elena_ionescu';
  private static readonly SHARED_OWNERSHIP_CUI = 'RO10000008';

  private readonly profiles = new Map<
    string,
    SimulationTypes.IdentityProfile
  >();
  private manualOwnershipOverride = false;

  /**
   * Creates an instance of MockIdentityRegistryService.
   * @param simulationEngine Value for simulationEngine.
   * @param controlStateStore Value for controlStateStore.
   */
  constructor(
    private readonly simulationEngine: SimulationEngineService,
    private readonly controlStateStore?: RedisControlStateStoreService,
  ) {}

  /**
   * Seeds default mock identities and assigns CIF ownership on startup.
   */
  async onModuleInit(): Promise<void> {
    await this.restoreIdentityState();
    this.seedProfiles();
    this.ensureCoverageForDomesticCompanies();
    await this.persistIdentityState();
  }

  /**
   * Returns all identities with deterministic ordering for UI rendering.
   *
   * @returns Snapshot of known identity profiles.
   */
  listIdentities(): SimulationTypes.IdentityProfile[] {
    this.syncOwnershipState();

    return [...this.profiles.values()]
      .map((profile) => ({
        ...profile,
        authorizedCuis: [...profile.authorizedCuis].sort((left, right) =>
          left.localeCompare(right, 'ro'),
        ),
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ro'));
  }

  /**
   * Resolves one identity by identifier.
   *
   * @param identityId Identity identifier.
   * @returns Identity profile when it exists.
   */
  getIdentity(identityId: string): SimulationTypes.IdentityProfile | undefined {
    this.syncOwnershipState();

    const profile = this.profiles.get(identityId.trim());
    if (!profile) {
      return undefined;
    }

    return {
      ...profile,
      authorizedCuis: [...profile.authorizedCuis],
    };
  }

  /**
   * Returns the default identity id used when no explicit selection is provided.
   *
   * @returns Identity id when available.
   */
  getDefaultIdentityId(): string | undefined {
    if (this.profiles.has(MockIdentityRegistryService.PRIMARY_IDENTITY_ID)) {
      return MockIdentityRegistryService.PRIMARY_IDENTITY_ID;
    }

    return [...this.profiles.keys()][0];
  }

  /**
   * Validates whether an identity is authorized to access one beneficiary CUI.
   *
   * @param identityId Identity identifier from OAuth token.
   * @param rawCui Beneficiary CUI from request context.
   * @returns True when identity owns the requested CUI.
   */
  isIdentityAuthorizedForCui(identityId: string, rawCui: string): boolean {
    const profile = this.getIdentity(identityId);
    if (!profile) {
      return false;
    }

    const normalized = this.simulationEngine.normalizeCui(rawCui).ro;
    return profile.authorizedCuis.includes(normalized);
  }

  /**
   * Replaces CIF ownership for one identity at runtime.
   *
   * @param identityId Target identity identifier.
   * @param authorizedCuis CIF list that will replace existing ownership.
   * @returns Updated identity profile, or undefined when identity does not exist.
   */
  updateIdentityOwnership(
    identityId: string,
    authorizedCuis: string[],
  ): SimulationTypes.IdentityProfile | undefined {
    this.syncOwnershipState();

    const profile = this.profiles.get(identityId.trim());
    if (!profile) {
      return undefined;
    }

    this.manualOwnershipOverride = true;
    const normalized = [
      ...new Set(
        authorizedCuis
          .map((value) => this.simulationEngine.normalizeCui(value).ro)
          .filter((value) => /^RO\d{2,10}$/.test(value)),
      ),
    ].sort((left, right) => left.localeCompare(right, 'ro'));

    profile.authorizedCuis = normalized;

    this.persistIdentityStateAsync();

    return {
      ...profile,
      authorizedCuis: [...profile.authorizedCuis],
    };
  }

  /**
   * Ensures seeded identities are available and applies automatic coverage
   * unless manual override mode is enabled.
   */
  private syncOwnershipState(): void {
    if (this.profiles.size === 0) {
      this.seedProfiles();
    }

    if (!this.manualOwnershipOverride) {
      this.ensureCoverageForDomesticCompanies();
    }
  }

  /**
   * Seeds static identity rows used by the mock ownership model.
   */
  private seedProfiles(): void {
    for (const seed of MockIdentityRegistryService.IDENTITY_SEED) {
      if (!this.profiles.has(seed.id)) {
        this.profiles.set(seed.id, {
          id: seed.id,
          fullName: seed.fullName,
          email: seed.email,
          authorizedCuis: [],
        });
      }
    }
  }

  /**
   * Ensures each domestic company has at least one owner and shared ownership
   * for the dedicated test company.
   */
  private ensureCoverageForDomesticCompanies(): void {
    if (this.profiles.size === 0) {
      this.seedProfiles();
    }

    const domesticCuis = this.collectDomesticCompanyCuis();
    const domesticSet = new Set(domesticCuis);

    let changed = this.pruneUnknownAssignments(domesticSet);

    const identityIds = [...this.profiles.keys()];
    if (identityIds.length === 0) {
      return;
    }

    let cursor = 0;
    for (const cui of domesticCuis) {
      if (this.hasAnyOwner(cui)) {
        continue;
      }

      const targetIdentity = identityIds[cursor % identityIds.length];
      changed = this.assignCui(targetIdentity, cui) || changed;
      cursor += 1;
    }

    const sharedCui = this.simulationEngine.normalizeCui(
      MockIdentityRegistryService.SHARED_OWNERSHIP_CUI,
    ).ro;

    if (domesticSet.has(sharedCui)) {
      changed =
        this.assignCui(
        MockIdentityRegistryService.PRIMARY_IDENTITY_ID,
        sharedCui,
      ) || changed;
      changed =
        this.assignCui(
        MockIdentityRegistryService.SECONDARY_IDENTITY_ID,
        sharedCui,
      ) || changed;
    }

    if (changed) {
      this.persistIdentityStateAsync();
    }
  }

  /**
   * Collects all domestic company CUIs in deterministic order.
   */
  private collectDomesticCompanyCuis(): string[] {
    const domestic = this.simulationEngine
      .getKnownCompanies()
      .filter(
        (company) =>
          (company.countryCode ?? 'RO').trim().toUpperCase() === 'RO',
      )
      .map((company) => this.simulationEngine.normalizeCui(company.cui).ro);

    return [...new Set(domestic)].sort((left, right) =>
      left.localeCompare(right, 'ro'),
    );
  }

  /**
   * Removes assignments that are no longer part of domestic company ownership.
   */
  private pruneUnknownAssignments(domesticSet: Set<string>): boolean {
    let changed = false;

    for (const profile of this.profiles.values()) {
      const next = profile.authorizedCuis.filter((cui) =>
        domesticSet.has(cui),
      );
      if (next.length !== profile.authorizedCuis.length) {
        changed = true;
      }
      profile.authorizedCuis = next;
    }

    return changed;
  }

  /**
   * Returns whether at least one identity currently owns a CUI.
   */
  private hasAnyOwner(cui: string): boolean {
    for (const profile of this.profiles.values()) {
      if (profile.authorizedCuis.includes(cui)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Assigns one CUI to one identity without duplicates.
   */
  private assignCui(identityId: string, cui: string): boolean {
    const profile = this.profiles.get(identityId);
    if (!profile) {
      return false;
    }

    if (!profile.authorizedCuis.includes(cui)) {
      profile.authorizedCuis.push(cui);
      return true;
    }

    return false;
  }

  /**
   * Restores identity ownership state from control-state persistence.
   */
  private async restoreIdentityState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    const persisted = await this.controlStateStore.readJson<PersistedIdentityState>(
      MockIdentityRegistryService.IDENTITY_STATE_KEY,
    );

    if (!persisted || typeof persisted !== 'object') {
      return;
    }

    this.manualOwnershipOverride = persisted.manualOwnershipOverride === true;

    if (!Array.isArray(persisted.profiles)) {
      return;
    }

    this.profiles.clear();
    for (const candidate of persisted.profiles) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const id = String(candidate.id ?? '').trim();
      const fullName = String(candidate.fullName ?? '').trim();
      const email = String(candidate.email ?? '').trim();
      if (!id || !fullName || !email) {
        continue;
      }

      const authorizedCuis = [
        ...new Set(
          (candidate.authorizedCuis ?? [])
            .map((value) => this.simulationEngine.normalizeCui(value).ro)
            .filter((value) => /^RO\d{2,10}$/.test(value)),
        ),
      ].sort((left, right) => left.localeCompare(right, 'ro'));

      this.profiles.set(id, {
        id,
        fullName,
        email,
        authorizedCuis,
      });
    }
  }

  /**
   * Persists identity ownership state without blocking request flow.
   */
  private persistIdentityStateAsync(): void {
    void this.persistIdentityState();
  }

  /**
   * Persists identity ownership state into Redis control-store.
   */
  private async persistIdentityState(): Promise<void> {
    if (!this.controlStateStore) {
      return;
    }

    await this.controlStateStore.writeJson<PersistedIdentityState>(
      MockIdentityRegistryService.IDENTITY_STATE_KEY,
      {
        manualOwnershipOverride: this.manualOwnershipOverride,
        profiles: [...this.profiles.values()].map((profile) => ({
          ...profile,
          authorizedCuis: [...profile.authorizedCuis],
        })),
      },
    );
  }
}
