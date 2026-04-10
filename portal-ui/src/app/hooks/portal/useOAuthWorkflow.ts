import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
} from '../../lib/session';
import { stringifyJson } from '../../lib/format';
import {
  EsignSimulationMode,
  IdentityProfile,
  MockApplication,
  TokenDisplay,
} from '../../types';
import { PortalApiRequest, PushAlert } from './usePortalApiRequest';
import { inspectAccessToken } from './tokenInspector';

interface UseOAuthWorkflowParams {
  apps: MockApplication[];
  activeId: string;
  identities: IdentityProfile[];
  apiRequest: PortalApiRequest;
  pushAlert: PushAlert;
}

/**
 * Owns OAuth wizard state, popup handshake lifecycle, and token storage/inspection.
 */
export function useOAuthWorkflow({
  apps,
  activeId,
  identities,
  apiRequest,
  pushAlert,
}: UseOAuthWorkflowParams) {
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthRedirectUri, setOauthRedirectUri] = useState('');
  const [oauthIdentityId, setOauthIdentityId] = useState('');
  const [capturedCode, setCapturedCode] = useState('');
  const [tokenResponseJson, setTokenResponseJson] = useState('{}');
  const [eSignModalOpen, setESignModalOpen] = useState(false);
  const [eSignMode, setESignMode] = useState<EsignSimulationMode>('ok');

  const [tokenDisplay, setTokenDisplay] = useState<TokenDisplay>({
    access: getStoredAccessToken(),
    refresh: getStoredRefreshToken(),
  });

  const oauthApp = useMemo(
    () => apps.find((app) => app.clientId === oauthClientId),
    [apps, oauthClientId],
  );

  const oauthRedirectUris = oauthApp?.redirectUris ?? [];

  const tokenInspector = useMemo(
    () => inspectAccessToken(tokenDisplay.access),
    [tokenDisplay.access],
  );

  /**
   * Rehydrates token display values from local storage to keep UI state aligned
   * with persisted OAuth session data.
   */
  const syncTokenDisplay = useCallback(() => {
    setTokenDisplay({
      access: getStoredAccessToken(),
      refresh: getStoredRefreshToken(),
    });
  }, []);

  useEffect(() => {
    if (!apps.length) {
      setOauthClientId('');
      setOauthRedirectUri('');
      return;
    }

    const appExists = apps.some((app) => app.clientId === oauthClientId);
    if (!appExists) {
      const nextId = apps.some((app) => app.clientId === activeId)
        ? activeId
        : apps[0].clientId;
      setOauthClientId(nextId);
      return;
    }

    const selected = apps.find((app) => app.clientId === oauthClientId);
    if (!selected) {
      return;
    }

    if (!selected.redirectUris.includes(oauthRedirectUri)) {
      setOauthRedirectUri(selected.redirectUris[0] || '');
    }
  }, [activeId, apps, oauthClientId, oauthRedirectUri]);

  useEffect(() => {
    if (!identities.length) {
      setOauthIdentityId('');
      return;
    }

    const exists = identities.some(
      (identity) => identity.id === oauthIdentityId,
    );
    if (!exists) {
      setOauthIdentityId(identities[0].id);
    }
  }, [identities, oauthIdentityId]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (!event.data || event.data.type !== 'anaf-oauth-callback') {
        return;
      }

      const error = String(event.data.error || '').trim();
      const errorDescription = String(
        event.data.error_description || '',
      ).trim();

      if (error) {
        setCapturedCode('');
        pushAlert(
          errorDescription
            ? `OAuth authorize failed: ${error} - ${errorDescription}`
            : `OAuth authorize failed: ${error}`,
        );
        return;
      }

      const code = String(event.data.code || '').trim();
      if (!code) {
        pushAlert('OAuth callback did not include an authorization code.');
        return;
      }

      setCapturedCode(code);
      pushAlert('Authorization code captured from callback.', 'success');
    };

    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, [pushAlert]);

  /**
   * Performs pre-checks before opening the simulated e-sign modal.
   */
  const handleStartHandshake = useCallback(() => {
    if (!oauthClientId || !oauthRedirectUri) {
      pushAlert('Select an application and redirect URI first.');
      return;
    }

    if (!oauthIdentityId) {
      pushAlert('Select who is signing this request before starting OAuth.');
      return;
    }

    setESignModalOpen(true);
  }, [oauthClientId, oauthIdentityId, oauthRedirectUri, pushAlert]);

  /**
   * Closes the e-sign simulation modal without starting the OAuth redirect.
   */
  const handleCancelHandshake = useCallback(() => {
    setESignModalOpen(false);
  }, []);

  /**
   * Builds the OAuth authorize URL including selected identity and e-sign mode,
   * then opens the popup for consent simulation.
   */
  const handleConfirmHandshake = useCallback(() => {
    if (!oauthClientId || !oauthRedirectUri || !oauthIdentityId) {
      pushAlert('Select app, redirect URI, and signing identity first.');
      return;
    }

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: oauthClientId,
      redirect_uri: oauthRedirectUri,
      identity_id: oauthIdentityId,
      state: 'xyz',
      token_content_type: 'jwt',
    });

    if (eSignMode !== 'ok') {
      query.set('simulate_esign', eSignMode);
    }

    const popup = window.open(
      `/anaf-oauth2/v1/authorize?${query.toString()}`,
      'oauth',
      'width=600,height=750',
    );

    if (!popup) {
      pushAlert(
        'Popup blocked by browser. Allow popups for this origin and retry.',
      );
      return;
    }

    setESignModalOpen(false);
  }, [eSignMode, oauthClientId, oauthIdentityId, oauthRedirectUri, pushAlert]);

  /**
   * Exchanges the captured authorization code for tokens and persists them to
   * local storage when the token endpoint succeeds.
   */
  const handleExchangeCode = useCallback(async () => {
    if (!oauthApp) {
      pushAlert('No application selected for token exchange.');
      return;
    }

    if (!capturedCode.trim()) {
      pushAlert('No authorization code captured yet.');
      return;
    }

    const result = await apiRequest<Record<string, unknown>>(
      '/anaf-oauth2/v1/token',
      {
        method: 'POST',
        form: true,
        body: {
          grant_type: 'authorization_code',
          code: capturedCode.trim(),
          client_id: oauthApp.clientId,
          client_secret: oauthApp.clientSecret,
          redirect_uri: oauthRedirectUri,
        },
      },
    );

    setTokenResponseJson(stringifyJson(result.data));

    if (result.ok && typeof result.data.access_token === 'string') {
      setStoredTokens(
        String(result.data.access_token),
        String(result.data.refresh_token || ''),
      );
      syncTokenDisplay();
      pushAlert(
        'Access and refresh tokens stored in browser session.',
        'success',
      );
    }
  }, [
    apiRequest,
    capturedCode,
    oauthApp,
    oauthRedirectUri,
    pushAlert,
    syncTokenDisplay,
  ]);

  /**
   * Clears persisted OAuth tokens from local storage and refreshes token UI.
   */
  const handleClearTokens = useCallback(() => {
    clearStoredTokens();
    syncTokenDisplay();
    pushAlert('Session tokens cleared.', 'success');
  }, [pushAlert, syncTokenDisplay]);

  return {
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
  };
}
