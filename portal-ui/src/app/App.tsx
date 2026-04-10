import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AlertStack } from './layout/AlertStack';
import { Sidebar } from './layout/Sidebar';
import { usePortalConsole } from './hooks/usePortalConsole';
import {
  AppsView,
  DashboardView,
  DataView,
  InspectorView,
  OAuthView,
  SettingsView,
} from './views';
import { PortalView } from './types';

/**
 * Executes App.
 * @returns The App result.
 */
export function App() {
  const {
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
    identities,
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
  } = usePortalConsole();

  const location = useLocation();

  // Sync internal view state with route
  useEffect(() => {
    const path = (location.pathname.substring(1) as PortalView) || 'dashboard';
    if (path !== view) {
      setView(path);
    }
  }, [location, setView, view]);

  return (
    <div className="app-shell">
      <Sidebar view={view} />

      <main className="main-content">
        <AlertStack
          alerts={alerts}
          onDismiss={(id) => {
            setAlerts((current) => current.filter((entry) => entry.id !== id));
          }}
        />

        <Routes>
          <Route
            path="/"
            element={
              <DashboardView
                className="view-pane active"
                apps={apps}
                requestCount={requestCount}
                companies={companies}
                globalMessages={globalMessages}
              />
            }
          />
          <Route
            path="/apps"
            element={
              <AppsView
                className="view-pane active"
                apps={apps}
                activeId={activeId}
                activeApp={activeApp}
                appName={appName}
                appRedirects={appRedirects}
                addConsoleCallback={addConsoleCallback}
                setAppName={setAppName}
                setAppRedirects={setAppRedirects}
                setAddConsoleCallback={setAddConsoleCallback}
                setActiveId={handleActivateApp}
                setOauthClientId={setOauthClientId}
                handleCreateApp={handleCreateApp}
                copyToClipboard={copyToClipboard}
              />
            }
          />
          <Route
            path="/oauth"
            element={
              <OAuthView
                className="view-pane active"
                apps={apps}
                oauthClientId={oauthClientId}
                oauthRedirectUri={oauthRedirectUri}
                oauthRedirectUris={oauthRedirectUris}
                identities={identities}
                oauthIdentityId={oauthIdentityId}
                capturedCode={capturedCode}
                tokenDisplay={tokenDisplay}
                tokenInspector={tokenInspector}
                tokenResponseJson={tokenResponseJson}
                eSignModalOpen={eSignModalOpen}
                eSignMode={eSignMode}
                setOauthClientId={setOauthClientId}
                setOauthRedirectUri={setOauthRedirectUri}
                setOauthIdentityId={setOauthIdentityId}
                setCapturedCode={setCapturedCode}
                setESignModalOpen={setESignModalOpen}
                setESignMode={setESignMode}
                handleStartHandshake={handleStartHandshake}
                handleCancelHandshake={handleCancelHandshake}
                handleConfirmHandshake={handleConfirmHandshake}
                handleExchangeCode={handleExchangeCode}
                handleClearTokens={handleClearTokens}
              />
            }
          />
          <Route
            path="/data"
            element={
              <DataView
                className="view-pane active"
                vatInput={vatInput}
                vatResponseJson={vatResponseJson}
                messageCif={messageCif}
                messageDays={messageDays}
                messageRows={messageRows}
                setVatInput={setVatInput}
                setMessageCif={setMessageCif}
                setMessageDays={setMessageDays}
                handleVatLookup={handleVatLookup}
                handleListMessages={handleListMessages}
                handleDownloadZip={handleDownloadZip}
              />
            }
          />
          <Route
            path="/inspector"
            element={
              <InspectorView
                className="view-pane active"
                companies={companies}
                identities={identities}
                globalMessages={globalMessages}
                graphDays={graphDays}
                setGraphDays={setGraphDays}
                graphData={graphData}
                handleLoadSeedPreset={handleLoadSeedPreset}
                handleRefreshGraph={handleRefreshGraph}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsView
                className="view-pane active"
                configDraft={configDraft}
                setConfigDraft={setConfigDraft}
                handleSaveConfig={handleSaveConfig}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
