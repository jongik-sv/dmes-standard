import type {
  OasisApiClientOptions,
  OasisServiceRequest,
  OasisServiceResponse,
} from "./types";
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from "./oasis-token-store";

export function createOasisApiClient(options: OasisApiClientOptions) {
  const { baseUrl, onUnauthorized } = options;

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${getAccessToken()}`;
        const retry = await fetch(`${baseUrl}${path}`, { ...init, headers });
        if (retry.ok) return retry.json();
      }
      clearTokens();
      onUnauthorized?.();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const body = error as {
        message?: string;
        statusMap?: { ErrorMsg?: string };
      };
      throw new Error(
        body.statusMap?.ErrorMsg ?? body.message ?? `HTTP ${response.status}`,
      );
    }

    return response.json();
  }

  async function tryRefreshToken(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          data: { accessToken: string; refreshToken: string };
        };
        setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
    } catch {
      /* refresh failed */
    }
    return false;
  }

  return {
    async executeService<T = Record<string, unknown>>(
      serviceGroup: string,
      serviceId: string,
      action: string,
      body: OasisServiceRequest = {},
    ): Promise<OasisServiceResponse<T>> {
      return request<OasisServiceResponse<T>>(
        `/api/services/${serviceGroup}/${serviceId}/${action}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
    },

    request,
  };
}
