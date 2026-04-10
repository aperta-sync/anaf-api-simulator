import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertItem,
  AlertType,
  CompanyProfile,
  IdentityProfile,
  InvoiceNetworkGraph,
  MockApplication,
  PortalView,
  SeedPresetSummary,
  SimulationConfig,
  StoredMessage,
} from '../types';
import { getStoredActiveAppId, setStoredActiveAppId } from '../lib/session';
import { parseRedirectUris } from '../lib/format';
import { usePortalApiRequest } from './portal/usePortalApiRequest';
import { useOAuthWorkflow } from './portal/useOAuthWorkflow';
import { useDataExplorer } from './portal/useDataExplorer';

const DEFAULT_CONFIG: SimulationConfig = {
  latencyMs: 0,
  errorRate: 0,
  trafficProbability: 0.35,
  autoGenerateTraffic: false,
  strictVatLookup: false,
  rateLimitMode: 'off',
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 10,
  rateLimitTrigger: false,
  strictOwnershipValidation: true,
};

const EMPTY_GRAPH: InvoiceNetworkGraph = {
  generatedAt: '',
  windowDays: 30,
  nodes: [],
  edges: [],
};

/**
 * Coordinates the ANAF mock developer portal state and feature hooks.
 */
export function usePortalConsole() {
  const [view, setView] = useState<PortalView>('dashboard');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const [apps, setApps] = useState<MockApplication[]>([]);
  const [activeId, setActiveId] = useState(getStoredActiveAppId());
  const [requestCount, setRequestCount] = useState(0);
  const [configDraft, setConfigDraft] =
    useState<SimulationConfig>(DEFAULT_CONFIG);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [identities, setIdentities] = useState<IdentityProfile[]>([]);
  const [globalMessages, setGlobalMessages] = useState<StoredMessage[]>([]);
  const [graphDays, setGraphDays] = useState('30');
  const [graphData, setGraphData] = useState<InvoiceNetworkGraph>(EMPTY_GRAPH);

  const [appName, setAppName] = useState('');
  const [appRedirects, setAppRedirects] = useState('');
  const [addConsoleCallback, setAddConsoleCallback] = useState(true);

  const consoleCallback = `${window.location.origin}/developer-portal/oauth/callback`;

  /**
   * Pushes an ephemeral alert notification and auto-dismisses it after timeout.
   */
  const pushAlert = useCallback(
    (message: string, type: AlertType = 'danger') => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setAlerts((current) => [...current, { id, message, type }]);

      window.setTimeout(() => {
        setAlerts((current) => current.filter((entry) => entry.id !== id));
      }, 4500);
    },
    [],
  );

  const apiRequest = usePortalApiRequest(pushAlert);

  const {
    oauthClientId,
    setOauthClientId,
    oauthRedirectUri,
    setOauthRedirectUri,
    oauthIdentityId,
    setOauthIdentityId,
    capturedCode,
    setCapturedCode,
    tokenResponseJson,
    tokenDisplay,
    tokenInspector,
    eSignModalOpen,
    setESignModalOpen,
    eSignMode,
    setESignMode,
    oauthRedirectUris,
    handleStartHandshake,
    handleCancelHandshake,
    handleConfirmHandshake,
    handleExchangeCode,
    handleClearTokens,
    syncTokenDisplay,
  } = useOAuthWorkflow({
    apps,
    activeId,
    identities,
    apiRequest,
    pushAlert,
  });

  const {
    vatInput,
    setVatInput,
    vatResponseJson,
    messageCif,
    setMessageCif,
    messageDays,
    setMessageDays,
    messageRows,
    handleVatLookup,
    handleListMessages,
    handleDownloadZip,
  } = useDataExplorer({
    apiRequest,
    pushAlert,
  });

  const activeApp = useMemo(
    () => apps.find((app) => app.clientId === activeId),
    [apps, activeId],
  );

  /**
   * Refreshes the network graph for the selected day window with server-side
   * bounds enforcement mirrored in the client.
   */
  const refreshGraph = useCallback(
    async (daysInput?: string) => {
      const parsed = Number.parseInt(daysInput ?? graphDays, 10);
      const boundedDays = Number.isFinite(parsed)
        ? Math.min(90, Math.max(1, parsed))
        : 30;

      const graphRes = await apiRequest<{ graph?: InvoiceNetworkGraph }>(
        `/developer-portal/api/internal/graph?days=${encodeURIComponent(
          String(boundedDays),
        )}`,
        {
          suppressAutoAlert: true,
        },
      );

      if (graphRes.ok && graphRes.data.graph) {
        setGraphData(graphRes.data.graph);
        setGraphDays(String(boundedDays));
      }
    },
    [apiRequest, graphDays],
  );

  /**
   * Loads portal datasets in parallel so dashboard, inspector, and OAuth views
   * stay in sync with the latest simulation state.
   */
  const refresh = useCallback(async () => {
    const [appsRes, configRes, companiesRes, messagesRes, identitiesRes] =
      await Promise.all([
        apiRequest<{ applications?: MockApplication[] }>(
          '/developer-portal/api/apps',
          {
            suppressAutoAlert: true,
          },
        ),
        apiRequest<{ config?: SimulationConfig; requestCount?: number }>(
          '/simulation/config',
          {
            suppressAutoAlert: true,
          },
        ),
        apiRequest<{ companies?: CompanyProfile[] }>(
          '/developer-portal/api/internal/companies',
          {
            suppressAutoAlert: true,
          },
        ),
        apiRequest<{ messages?: StoredMessage[] }>(
          '/developer-portal/api/internal/messages',
          {
            suppressAutoAlert: true,
          },
        ),
        apiRequest<{ identities?: IdentityProfile[] }>(
          '/developer-portal/api/internal/identities',
          {
            suppressAutoAlert: true,
          },
        ),
      ]);

    if (appsRes.ok) {
      setApps(appsRes.data.applications || []);
    }

    if (configRes.ok && configRes.data.config) {
      const rawConfig = configRes.data.config as Partial<SimulationConfig>;
      const resolvedMode =
        rawConfig.rateLimitMode ||
        (rawConfig.rateLimitTrigger ? 'deterministic' : 'off');

      setConfigDraft({
        ...DEFAULT_CONFIG,
        ...rawConfig,
        rateLimitMode: resolvedMode,
        rateLimitTrigger: resolvedMode !== 'off',
      });
      setRequestCount(configRes.data.requestCount || 0);
    }

    if (companiesRes.ok) {
      setCompanies(companiesRes.data.companies || []);
    }

    if (messagesRes.ok) {
      setGlobalMessages(messagesRes.data.messages || []);
    }

    if (identitiesRes.ok) {
      setIdentities(identitiesRes.data.identities || []);
    }

    await refreshGraph();

    syncTokenDisplay();
  }, [apiRequest, refreshGraph, syncTokenDisplay]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (view === 'inspector') {
      void refresh();
    }
  }, [view, refresh]);

  useEffect(() => {
    if (!apps.length) {
      setActiveId('');
      return;
    }

    const exists = apps.some((app) => app.clientId === activeId);
    if (!exists) {
      setActiveId(apps[0].clientId);
    }
  }, [apps, activeId]);

  useEffect(() => {
    setStoredActiveAppId(activeId);
  }, [activeId]);

  /**
   * Copies a value to clipboard and provides uniform success/failure feedback.
   */
  const copyToClipboard = useCallback(
    async (value: string, label: string) => {
      if (!navigator.clipboard) {
        pushAlert('Clipboard API unavailable in this browser instance.');
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        pushAlert(`${label} copied to clipboard.`, 'success');
      } catch {
        pushAlert('Failed to copy value to clipboard.');
      }
    },
    [pushAlert],
  );

  /**
   * Marks an app as active for the portal and aligns OAuth defaults to it.
   */
  const handleActivateApp = useCallback(
    (id: string) => {
      const app = apps.find((entry) => entry.clientId === id);
      if (!app) {
        return;
      }

      setActiveId(id);
      setOauthClientId(id);
      setStoredActiveAppId(id);
      pushAlert(`Application "${app.applicationName}" activated.`, 'success');
    },
    [apps, pushAlert, setOauthClientId],
  );

  /**
   * Registers a new mock OAuth client, applies console callback conventions,
   * and then activates it for immediate use.
   */
  const handleCreateApp = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!appName.trim()) {
        pushAlert('Application name is required.');
        return;
      }

      const redirectUris = parseRedirectUris(appRedirects);
      if (addConsoleCallback && !redirectUris.includes(consoleCallback)) {
        redirectUris.push(consoleCallback);
      }

      if (redirectUris.length === 0) {
        pushAlert(
          'Provide at least one redirect URI or enable the console callback.',
        );
        return;
      }

      const result = await apiRequest<MockApplication>(
        '/developer-portal/api/apps',
        {
          method: 'POST',
          body: {
            applicationName: appName.trim(),
            redirectUris,
          },
        },
      );

      if (!result.ok || !result.data.clientId) {
        return;
      }

      handleActivateApp(result.data.clientId);
      setAppName('');
      setAppRedirects('');
      setAddConsoleCallback(true);
      pushAlert('Mock application created and activated.', 'success');
      await refresh();
    },
    [
      addConsoleCallback,
      apiRequest,
      appName,
      appRedirects,
      consoleCallback,
      handleActivateApp,
      pushAlert,
      refresh,
    ],
  );

  /**
   * Persists simulation settings and then reloads dependent dashboard datasets.
   */
  const handleSaveConfig = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const result = await apiRequest<{
        config?: SimulationConfig;
        requestCount?: number;
      }>('/simulation/config', {
        method: 'PATCH',
        body: configDraft,
      });

      if (!result.ok) {
        return;
      }

      if (result.data.config) {
        setConfigDraft(result.data.config);
      }

      if (typeof result.data.requestCount === 'number') {
        setRequestCount(result.data.requestCount);
      }

      pushAlert('Configuration synchronized.', 'success');
      await refresh();
    },
    [apiRequest, configDraft, pushAlert, refresh],
  );

  /**
   * Loads one of the predefined simulation seed presets and refreshes aggregate
   * data panels.
   */
  const handleLoadSeedPreset = useCallback(
    async (preset: 'anaf-core' | 'anaf-large') => {
      const result = await apiRequest<SeedPresetSummary>(
        '/simulation/seed/preset',
        {
          method: 'POST',
          body: { preset },
        },
      );

      if (!result.ok) {
        return;
      }

      pushAlert(
        `Loaded ${result.data.preset}: +${result.data.seededCompanies} companies, +${result.data.seededMessages} messages.`,
        'success',
      );
      await refresh();
    },
    [apiRequest, pushAlert, refresh],
  );

  /**
   * Recomputes graph data using the currently selected lookback value.
   */
  const handleRefreshGraph = useCallback(async () => {
    await refreshGraph(graphDays);
  }, [graphDays, refreshGraph]);

  /**
   * Returns CSS class names for legacy pane toggling compatibility.
   */
  const paneClass = useCallback(
    (targetView: PortalView): string =>
      `view-pane${view === targetView ? ' active' : ''}`,
    [view],
  );

  return {
    view,
    setView,
    alerts,
    setAlerts,
    apps,
    activeId,
    setActiveId,
    requestCount,
    configDraft,
    setConfigDraft,
    companies,
    identities,
    globalMessages,
    graphDays,
    setGraphDays,
    graphData,
    appName,
    setAppName,
    appRedirects,
    setAppRedirects,
    addConsoleCallback,
    setAddConsoleCallback,
    oauthClientId,
    setOauthClientId,
    oauthRedirectUri,
    setOauthRedirectUri,
    oauthIdentityId,
    setOauthIdentityId,
    capturedCode,
    setCapturedCode,
    tokenResponseJson,
    tokenDisplay,
    tokenInspector,
    eSignModalOpen,
    setESignModalOpen,
    eSignMode,
    setESignMode,
    vatInput,
    setVatInput,
    vatResponseJson,
    messageCif,
    setMessageCif,
    messageDays,
    setMessageDays,
    messageRows,
    activeApp,
    oauthRedirectUris,
    handleCreateApp,
    handleStartHandshake,
    handleCancelHandshake,
    handleConfirmHandshake,
    handleExchangeCode,
    handleClearTokens,
    handleVatLookup,
    handleListMessages,
    handleDownloadZip,
    handleSaveConfig,
    handleLoadSeedPreset,
    handleRefreshGraph,
    handleActivateApp,
    copyToClipboard,
    paneClass,
  };
}
