import {
  EsignSimulationMode,
  IdentityProfile,
  MockApplication,
  TokenDisplay,
  TokenInspectorData,
} from '../types';
import {
  UiButton,
  UiCard,
  UiCodeBlock,
  UiInput,
  UiSelect,
} from '../components/shared';

interface OAuthViewProps {
  className: string;
  apps: MockApplication[];
  oauthClientId: string;
  oauthRedirectUri: string;
  oauthRedirectUris: string[];
  identities: IdentityProfile[];
  oauthIdentityId: string;
  capturedCode: string;
  tokenDisplay: TokenDisplay;
  tokenInspector: TokenInspectorData;
  tokenResponseJson: string;
  eSignModalOpen: boolean;
  eSignMode: EsignSimulationMode;
  setOauthClientId: (value: string) => void;
  setOauthRedirectUri: (value: string) => void;
  setOauthIdentityId: (value: string) => void;
  setCapturedCode: (value: string) => void;
  setESignModalOpen: (value: boolean) => void;
  setESignMode: (value: EsignSimulationMode) => void;
  handleStartHandshake: () => void;
  handleCancelHandshake: () => void;
  handleConfirmHandshake: () => void;
  handleExchangeCode: () => Promise<void>;
  handleClearTokens: () => void;
}

/**
 * Executes OAuthView.
 * @param classNameappsoauthClientIdoauthRedirectUrioauthRedirectUrisidentitiesoauthIdentityIdcapturedCodetokenDisplaytokenInspectortokenResponseJsoneSignModalOpeneSignModesetOauthClientIdsetOauthRedirectUrisetOauthIdentityIdsetESignModalOpensetESignModehandleStartHandshakehandleCancelHandshakehandleConfirmHandshakehandleExchangeCodehandleClearTokens Value for classNameappsoauthClientIdoauthRedirectUrioauthRedirectUrisidentitiesoauthIdentityIdcapturedCodetokenDisplaytokenInspectortokenResponseJsoneSignModalOpeneSignModesetOauthClientIdsetOauthRedirectUrisetOauthIdentityIdsetESignModalOpensetESignModehandleStartHandshakehandleCancelHandshakehandleConfirmHandshakehandleExchangeCodehandleClearTokens.
 * @returns The OAuthView result.
 */
export function OAuthView({
  className,
  apps,
  oauthClientId,
  oauthRedirectUri,
  oauthRedirectUris,
  identities,
  oauthIdentityId,
  capturedCode,
  tokenDisplay,
  tokenInspector,
  tokenResponseJson,
  eSignModalOpen,
  eSignMode,
  setOauthClientId,
  setOauthRedirectUri,
  setOauthIdentityId,
  setESignModalOpen,
  setESignMode,
  handleStartHandshake,
  handleCancelHandshake,
  handleConfirmHandshake,
  handleExchangeCode,
  handleClearTokens,
}: OAuthViewProps) {
  return (
    <div className={className}>
      <h1 className="h2 mb-5">OAuth Handshake Wizard</h1>
      <p className="text-muted mb-4">
        The real ANAF flow requires certificate-based sign-in. Use the e-sign
        simulation popup to approve or reject the login before code issuance.
      </p>
      <div className="row g-5">
        <div className="col-lg-6">
          <UiCard id="card-oauth-wizard">
            <div className="mb-4">
              <label className="stat-label d-block mb-2">
                Target Application
              </label>
              <UiSelect
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
              >
                {apps.map((app) => (
                  <option key={app.clientId} value={app.clientId}>
                    {app.applicationName}
                  </option>
                ))}
                {!apps.length && (
                  <option value="">No applications registered</option>
                )}
              </UiSelect>
            </div>
            <div className="mb-4">
              <label className="stat-label d-block mb-2">
                Authorized Redirect URI
              </label>
              <UiSelect
                className="font-monospace small"
                value={oauthRedirectUri}
                onChange={(e) => setOauthRedirectUri(e.target.value)}
              >
                {oauthRedirectUris.map((uri) => (
                  <option key={uri} value={uri}>
                    {uri}
                  </option>
                ))}
                {!oauthRedirectUris.length && (
                  <option value="">No URIs registered</option>
                )}
              </UiSelect>
            </div>
            <div className="mb-4">
              <label className="stat-label d-block mb-2">
                Who is signing this request?
              </label>
              <UiSelect
                value={oauthIdentityId}
                onChange={(e) => setOauthIdentityId(e.target.value)}
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.fullName} ({identity.email})
                  </option>
                ))}
                {!identities.length && (
                  <option value="">No mock identities available</option>
                )}
              </UiSelect>
            </div>
            <div className="row g-3 mb-4">
              <div className="col-6">
                <UiButton size="lg" fullWidth onClick={handleStartHandshake}>
                  Start Flow (Simulate e-sign)
                </UiButton>
              </div>
              <div className="col-6">
                <UiButton
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => void handleExchangeCode()}
                >
                  Exchange Code
                </UiButton>
              </div>
            </div>
            <hr className="my-4 opacity-5" />
            <div>
              <label className="stat-label d-block mb-2">
                Captured Authorization Code
              </label>
              <UiInput
                className="font-monospace text-primary"
                value={capturedCode}
                readOnly
                placeholder="Waiting for callback..."
              />
            </div>
          </UiCard>

          <UiCard className="mt-4">
            <h3 className="stat-label mb-3">Stored Session Tokens</h3>
            <div className="mb-3">
              <label className="small fw-bold text-muted mb-1 d-block">
                ACCESS TOKEN
              </label>
              <UiCodeBlock id="stored-access-token">
                {tokenDisplay.access || 'No token stored.'}
              </UiCodeBlock>
            </div>
            <div className="mb-3">
              <label className="small fw-bold text-muted mb-1 d-block">
                REFRESH TOKEN
              </label>
              <UiCodeBlock id="stored-refresh-token">
                {tokenDisplay.refresh || 'No token stored.'}
              </UiCodeBlock>
            </div>
            <div className="pt-3 border-top">
              <h3 className="stat-label mb-3">Token Inspector</h3>
              <div className="mb-2">
                <label className="small fw-bold text-muted mb-1 d-block">
                  identity_id
                </label>
                <UiCodeBlock>{tokenInspector.identityId}</UiCodeBlock>
              </div>
              <div className="mb-2">
                <label className="small fw-bold text-muted mb-1 d-block">
                  client_id
                </label>
                <UiCodeBlock>{tokenInspector.clientId}</UiCodeBlock>
              </div>
              <div className="mb-2">
                <label className="small fw-bold text-muted mb-1 d-block">
                  scope
                </label>
                <UiCodeBlock>{tokenInspector.scope}</UiCodeBlock>
              </div>
              <div className="small text-muted">
                iat: {tokenInspector.issuedAt} | exp: {tokenInspector.expiresAt}
              </div>
              {tokenInspector.parseError && (
                <div className="small text-muted mt-2">
                  {tokenInspector.parseError}
                </div>
              )}
            </div>
            <UiButton
              variant="link-danger"
              size="sm"
              className="mt-3"
              onClick={handleClearTokens}
            >
              Clear session tokens
            </UiButton>
          </UiCard>
        </div>
        <div className="col-lg-6">
          <UiCard id="card-token-response">
            <div className="stat-label mb-3">Token Response Payload</div>
            <pre className="json-view mb-0" id="token-json">
              {tokenResponseJson}
            </pre>
          </UiCard>
        </div>
      </div>

      {eSignModalOpen && (
        <div
          className="esign-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Simulate e-sign step"
          onClick={() => setESignModalOpen(false)}
        >
          <div
            className="esign-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="h5 mb-2">Simulate e-sign Authorization</h3>
            <p className="text-muted small mb-4">
              Choose the simulated certificate login outcome before continuing
              to the ANAF authorize redirect.
            </p>

            <div className="esign-options">
              <label className="esign-option">
                <input
                  type="radio"
                  name="esign-mode"
                  value="ok"
                  checked={eSignMode === 'ok'}
                  onChange={() => setESignMode('ok')}
                />
                <span>
                  <strong>OK</strong>
                  <small>Issue authorization code normally.</small>
                </span>
              </label>

              <label className="esign-option">
                <input
                  type="radio"
                  name="esign-mode"
                  value="incorrect_credentials"
                  checked={eSignMode === 'incorrect_credentials'}
                  onChange={() => setESignMode('incorrect_credentials')}
                />
                <span>
                  <strong>ERROR: Incorrect Credentials</strong>
                  <small>Certificate or PIN validation fails.</small>
                </span>
              </label>

              <label className="esign-option">
                <input
                  type="radio"
                  name="esign-mode"
                  value="network_issue"
                  checked={eSignMode === 'network_issue'}
                  onChange={() => setESignMode('network_issue')}
                />
                <span>
                  <strong>ERROR: Network Issue</strong>
                  <small>
                    Authorization service is temporarily unavailable.
                  </small>
                </span>
              </label>

              <label className="esign-option">
                <input
                  type="radio"
                  name="esign-mode"
                  value="server_error"
                  checked={eSignMode === 'server_error'}
                  onChange={() => setESignMode('server_error')}
                />
                <span>
                  <strong>ERROR: Server Side</strong>
                  <small>Authorization service returns a server error.</small>
                </span>
              </label>
            </div>

            <div className="d-flex gap-3 mt-4">
              <button
                type="button"
                className="btn btn-outline-dark w-50"
                onClick={handleCancelHandshake}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary w-50"
                onClick={handleConfirmHandshake}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
