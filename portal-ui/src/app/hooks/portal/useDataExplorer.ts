import { useCallback, useState } from 'react';
import { normalizeCuiList, stringifyJson } from '../../lib/format';
import { getStoredAccessToken } from '../../lib/session';
import { MessageListEntry } from '../../types';
import { PortalApiRequest, PushAlert } from './usePortalApiRequest';

interface UseDataExplorerParams {
  apiRequest: PortalApiRequest;
  pushAlert: PushAlert;
}

/**
 * Handles VAT lookup and message explorer state/actions.
 */
export function useDataExplorer({
  apiRequest,
  pushAlert,
}: UseDataExplorerParams) {
  const [vatInput, setVatInput] = useState('RO10000008, RO10079193');
  const [vatResponseJson, setVatResponseJson] = useState('{}');
  const [messageCif, setMessageCif] = useState('RO10000008');
  const [messageDays, setMessageDays] = useState('30');
  const [messageRows, setMessageRows] = useState<MessageListEntry[]>([]);

  /**
   * Calls the VAT registry endpoint with a normalized CUI list and stores the
   * full HTTP result payload for inspection in the UI.
   */
  const handleVatLookup = useCallback(async () => {
    const cuis = normalizeCuiList(vatInput);

    if (!cuis.length) {
      pushAlert('Enter at least one CUI for VAT lookup.');
      return;
    }

    const payload = cuis.map((cui) => ({
      cui,
      data: new Date().toISOString().slice(0, 10),
    }));

    const result = await apiRequest<Record<string, unknown>>(
      '/api/PlatitorTvaRest/v9/tva',
      {
        method: 'POST',
        body: payload,
        suppressAutoAlert: true,
      },
    );

    setVatResponseJson(
      stringifyJson({
        httpStatus: result.status,
        payload: result.data,
      }),
    );

    if (!result.ok) {
      pushAlert(
        `VAT lookup returned HTTP ${result.status}. Check response payload.`,
      );
    }
  }, [apiRequest, pushAlert, vatInput]);

  /**
   * Lists e-Factura inbox messages for the selected beneficiary CIF and lookback
   * window using the currently stored OAuth access token.
   */
  const handleListMessages = useCallback(async () => {
    const cif = messageCif.trim();
    const zile = messageDays.trim() || '30';

    const result = await apiRequest<{ mesaje?: MessageListEntry[] }>(
      `/prod/FCTEL/rest/listaMesajeFactura?cif=${encodeURIComponent(
        cif,
      )}&zile=${encodeURIComponent(zile)}&filtru=P`,
      {
        requiresAuth: true,
      },
    );

    setMessageRows(result.data.mesaje || []);
  }, [apiRequest, messageCif, messageDays]);

  /**
   * Downloads a ZIP archive for a message id from the protected e-Factura
   * endpoint and triggers a browser file download.
   */
  const handleDownloadZip = useCallback(
    async (messageId: string) => {
      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        pushAlert(
          'Missing access token. Run OAuth Wizard before downloading ZIP.',
        );
        return;
      }

      const response = await fetch(
        `/prod/FCTEL/rest/descarcare?id=${encodeURIComponent(messageId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const bodyText = await response.text();
        pushAlert(`ZIP download failed: HTTP ${response.status} ${bodyText}`);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anaf-${messageId}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      pushAlert('ZIP download started.', 'success');
    },
    [pushAlert],
  );

  return {
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
  };
}
