import { FormEvent } from 'react';
import { SimulationConfig, RateLimitMode } from '../types';
import {
  UiButton,
  UiCard,
  UiInput,
  UiSelect,
  UiToggleSwitch,
} from '../components/shared';

interface SettingsViewProps {
  className: string;
  configDraft: SimulationConfig;
  setConfigDraft: (
    updater: (current: SimulationConfig) => SimulationConfig,
  ) => void;
  handleSaveConfig: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleResetDefaults: () => Promise<void>;
}

/**
 * Executes SettingsView.
 * @param classNameconfigDraftsetConfigDrafthandleSaveConfig Value for classNameconfigDraftsetConfigDrafthandleSaveConfig.
 * @returns The SettingsView result.
 */
export function SettingsView({
  className,
  configDraft,
  setConfigDraft,
  handleSaveConfig,
  handleResetDefaults,
}: SettingsViewProps) {
  const updateRateLimitMode = (mode: RateLimitMode) => {
    setConfigDraft((current) => ({
      ...current,
      rateLimitMode: mode,
      rateLimitTrigger: mode !== 'off',
    }));
  };

  const infoIcon = (text: string) => (
    <span
      className="material-symbols-outlined fs-6 text-muted align-middle ms-1"
      style={{ cursor: 'help' }}
      title={text}
    >
      info
    </span>
  );

  return (
    <div className={className}>
      <h1 className="h2 mb-4">Settings</h1>
      <UiCard id="card-settings">
        <form id="config-form" onSubmit={handleSaveConfig}>
          <div className="row g-4">
            <div className="col-md-4">
              <label className="small fw-bold mb-2">
                Latency (ms)
                {infoIcon(
                  'Adds artificial delay to API responses to test loading states.',
                )}
              </label>
              <UiInput
                type="number"
                value={configDraft.latencyMs}
                onChange={(event) =>
                  setConfigDraft((current) => ({
                    ...current,
                    latencyMs: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <label className="small fw-bold mb-2">
                Fail Rate (%)
                {infoIcon(
                  'Chance (0-100) that a request will return a 500 or 504 error.',
                )}
              </label>
              <UiInput
                type="number"
                value={configDraft.errorRate}
                onChange={(event) =>
                  setConfigDraft((current) => ({
                    ...current,
                    errorRate: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <label className="small fw-bold mb-2">
                Traffic Prob
                {infoIcon(
                  'Probability that the background cron will generate new invoices.',
                )}
              </label>
              <UiInput
                type="number"
                step="0.01"
                value={configDraft.trafficProbability}
                onChange={(event) =>
                  setConfigDraft((current) => ({
                    ...current,
                    trafficProbability: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <label className="small fw-bold mb-2 d-block">
                429 Throttle Mode
                {infoIcon(
                  'Choose deterministic test mode (every 5th request) or realistic sliding-window throttling.',
                )}
              </label>
              <UiSelect
                value={configDraft.rateLimitMode}
                onChange={(event) =>
                  updateRateLimitMode(event.target.value as RateLimitMode)
                }
              >
                <option value="off">Off</option>
                <option value="windowed">Realistic (Windowed)</option>
                <option value="deterministic">Testing (Every 5th)</option>
              </UiSelect>
            </div>
            {configDraft.rateLimitMode === 'windowed' ? (
              <>
                <div className="col-md-4">
                  <label className="small fw-bold mb-2">
                    Max Requests
                    {infoIcon('Allowed requests per client within the window.')}
                  </label>
                  <UiInput
                    type="number"
                    min={1}
                    max={500}
                    value={configDraft.rateLimitMaxRequests}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        rateLimitMaxRequests: Number(event.target.value || 1),
                      }))
                    }
                  />
                </div>
                <div className="col-md-4">
                  <label className="small fw-bold mb-2">
                    Window (seconds)
                    {infoIcon(
                      'Sliding time frame used by realistic rate limiting.',
                    )}
                  </label>
                  <UiInput
                    type="number"
                    min={1}
                    max={300}
                    value={Math.max(
                      1,
                      Math.round(configDraft.rateLimitWindowMs / 1000),
                    )}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        rateLimitWindowMs:
                          Number(event.target.value || 1) * 1000,
                      }))
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="col-12">
              <UiToggleSwitch
                id="cfg-strict"
                checked={configDraft.strictVatLookup}
                onChange={(checked) =>
                  setConfigDraft((current) => ({
                    ...current,
                    strictVatLookup: checked,
                  }))
                }
                label={
                  <>
                    Strict VAT Lookup
                    {infoIcon(
                      'Only find companies that are explicitly seeded or bootstrapped.',
                    )}
                  </>
                }
              />
              <UiToggleSwitch
                id="cfg-strict-ownership"
                className="mt-2"
                checked={configDraft.strictOwnershipValidation}
                onChange={(checked) =>
                  setConfigDraft((current) => ({
                    ...current,
                    strictOwnershipValidation: checked,
                  }))
                }
                label={
                  <>
                    Enable Strict Ownership Validation
                    {infoIcon(
                      'Validate that the OAuth Token identity owns the target CIF.',
                    )}
                  </>
                }
              />
              <UiToggleSwitch
                id="cfg-auto-traffic"
                className="mt-2"
                checked={configDraft.autoGenerateTraffic}
                onChange={(checked) =>
                  setConfigDraft((current) => ({
                    ...current,
                    autoGenerateTraffic: checked,
                  }))
                }
                label={
                  <>
                    Enable Synthetic Traffic
                    {infoIcon(
                      'Generate random invoices in the background every minute.',
                    )}
                  </>
                }
              />
            </div>
          </div>
          <UiButton type="submit" className="mt-4 px-5">
            Save Config
          </UiButton>

          <div className="mt-4 pt-4 border-top">
            <div className="small fw-bold text-uppercase text-muted mb-2">
              Danger Zone
            </div>
            <p className="small text-muted mb-3">
              Reset runtime configuration and mock app data to startup defaults.
            </p>
            <UiButton
              type="button"
              variant="link-danger"
              onClick={() => void handleResetDefaults()}
            >
              Reset Config + App Data
            </UiButton>
          </div>
        </form>
      </UiCard>
    </div>
  );
}
