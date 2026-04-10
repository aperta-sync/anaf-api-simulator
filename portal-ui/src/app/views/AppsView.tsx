import { FormEvent } from 'react';
import { MockApplication } from '../types';
import { EmptyTableRow } from '../components/shared';

interface AppsViewProps {
  className: string;
  apps: MockApplication[];
  activeId: string;
  activeApp: MockApplication | undefined;
  appName: string;
  appRedirects: string;
  addConsoleCallback: boolean;
  setAppName: (value: string) => void;
  setAppRedirects: (value: string) => void;
  setAddConsoleCallback: (value: boolean) => void;
  setActiveId: (value: string) => void;
  setOauthClientId: (value: string) => void;
  handleCreateApp: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  copyToClipboard: (value: string, label: string) => Promise<void>;
}

/**
 * Executes AppsView.
 * @param classNameappsactiveIdactiveAppappNameappRedirectsaddConsoleCallbacksetAppNamesetAppRedirectssetAddConsoleCallbacksetActiveIdsetOauthClientIdhandleCreateAppcopyToClipboard Value for classNameappsactiveIdactiveAppappNameappRedirectsaddConsoleCallbacksetAppNamesetAppRedirectssetAddConsoleCallbacksetActiveIdsetOauthClientIdhandleCreateAppcopyToClipboard.
 * @returns The AppsView result.
 */
export function AppsView({
  className,
  apps,
  activeId,
  activeApp,
  appName,
  appRedirects,
  addConsoleCallback,
  setAppName,
  setAppRedirects,
  setAddConsoleCallback,
  setActiveId,
  setOauthClientId,
  handleCreateApp,
  copyToClipboard,
}: AppsViewProps) {
  return (
    <div className={className}>
      <h1 className="h2 mb-4">Apps & Credentials</h1>
      <div className="row g-5">
        <div className="col-lg-5">
          <div className="card" id="card-create-app">
            <h3 className="h5 mb-4">Register New App</h3>
            <form id="create-app-form" onSubmit={handleCreateApp}>
              <div className="mb-3">
                <label className="small fw-bold text-muted mb-2">Name</label>
                <input
                  className="form-control"
                  value={appName}
                  onChange={(event) => setAppName(event.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="small fw-bold text-muted mb-2">
                  Redirect URIs
                </label>
                <textarea
                  className="form-control font-monospace small"
                  rows={3}
                  placeholder="https://api.my-application.local/callback"
                  value={appRedirects}
                  onChange={(event) => setAppRedirects(event.target.value)}
                />
              </div>
              <div className="form-check mb-4">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={addConsoleCallback}
                  onChange={(event) =>
                    setAddConsoleCallback(event.target.checked)
                  }
                  id="add-console-callback"
                />
                <label
                  className="form-check-label small fw-bold"
                  htmlFor="add-console-callback"
                >
                  Add console callback automatically
                </label>
              </div>
              <button type="submit" className="btn btn-primary btn-lg w-100">
                Generate Credentials
              </button>
            </form>

            <div className="mt-4">
              {activeApp ? (
                <>
                  <div className="small fw-bold text-muted mb-2">
                    ACTIVE APP CREDENTIALS
                  </div>
                  <div className="code-panel mb-2">
                    ANAF_CLIENT_ID={activeApp.clientId}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-sm btn-outline-dark"
                      type="button"
                      onClick={() =>
                        void copyToClipboard(
                          `ANAF_CLIENT_ID=${activeApp.clientId}`,
                          'ANAF_CLIENT_ID',
                        )
                      }
                    >
                      Copy ID
                    </button>
                    <button
                      className="btn btn-sm btn-outline-dark"
                      type="button"
                      onClick={() =>
                        void copyToClipboard(
                          `ANAF_CLIENT_SECRET=${activeApp.clientSecret}`,
                          'ANAF_CLIENT_SECRET',
                        )
                      }
                    >
                      Copy Secret
                    </button>
                  </div>
                </>
              ) : (
                <div className="small text-muted">No active app selected.</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card p-0 overflow-hidden" id="card-apps-list">
            <div className="loading-overlay">
              <div className="spinner"></div>
            </div>
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client ID</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.length > 0 ? (
                  apps.map((app) => {
                    const isActive = app.clientId === activeId;

                    return (
                      <tr
                        key={app.clientId}
                        className={isActive ? 'app-row-active' : ''}
                      >
                        <td className="fw-bold">
                          {app.applicationName}
                          {isActive ? (
                            <span className="status-pill status-info ms-2">
                              ACTIVE
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <code className="small">{app.clientId}</code>
                        </td>
                        <td className="text-end">
                          <button
                            className="btn btn-sm btn-outline-dark"
                            type="button"
                            onClick={() => {
                              setActiveId(app.clientId);
                              setOauthClientId(app.clientId);
                            }}
                          >
                            Use
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyTableRow colSpan={3} message="No records found." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
