import { useCallback } from 'react';
import { AlertType, ApiOptions, ApiResult } from '../../types';
import { getStoredAccessToken } from '../../lib/session';

export type PushAlert = (message: string, type?: AlertType) => void;

export type PortalApiRequest = <T>(
  path: string,
  options?: ApiOptions,
) => Promise<ApiResult<T>>;

/**
 * Provides a consistent API request wrapper for the portal UI.
 */
export function usePortalApiRequest(pushAlert: PushAlert): PortalApiRequest {
  /**
   * Executes a portal API request with shared auth handling, body encoding,
   * response parsing, and alert normalization.
   */
  const request = useCallback(
    async <T>(
      path: string,
      options: ApiOptions = {},
    ): Promise<ApiResult<T>> => {
      const method = options.method || 'GET';
      const headers: Record<string, string> = {
        ...(options.headers || {}),
      };

      if (options.requiresAuth) {
        const accessToken = getStoredAccessToken();
        if (!accessToken) {
          const payload = {
            error: 'invalid_token',
            error_description: 'No access token found in local session.',
          } as T;

          pushAlert(
            'Missing access token. Run OAuth Wizard first to call protected e-Factura endpoints.',
          );

          return {
            ok: false,
            status: 401,
            data: payload,
          };
        }

        headers.Authorization = `Bearer ${accessToken}`;
      }

      let body: string | undefined;
      if (options.body !== undefined && options.body !== null) {
        if (options.form) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          body = new URLSearchParams(
            options.body as Record<string, string>,
          ).toString();
        } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(options.body);
        }
      }

      let response: Response;

      try {
        response = await fetch(path, {
          method,
          headers,
          body,
        });
      } catch {
        pushAlert('Network error: unable to reach the ANAF mock server.');
        return {
          ok: false,
          status: 0,
          data: { error: 'network_error' } as T,
        };
      }

      const raw = await response.text();
      let parsed: T;

      try {
        parsed = (raw ? JSON.parse(raw) : {}) as T;
      } catch {
        parsed = { raw } as unknown as T;
      }

      if (!response.ok && !options.suppressAutoAlert) {
        const data = parsed as Record<string, unknown>;
        const message = String(
          data.message ||
            data.error_description ||
            data.error ||
            'Request failed',
        );
        pushAlert(`API ${response.status}: ${message}`);
      }

      return {
        ok: response.ok,
        status: response.status,
        data: parsed,
      };
    },
    [pushAlert],
  );

  return request;
}
