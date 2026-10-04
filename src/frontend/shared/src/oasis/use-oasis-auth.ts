import { useCallback, useState } from "react";
import { createOasisApiClient } from "./oasis-api-client";
import { setTokens, clearTokens } from "./oasis-token-store";
import { clearCurrentUserCache } from "../portal-shell/current-user";
import type { OasisLoginRequest, OasisLoginApiResponse } from "./types";

const OASIS_API_URL =
  process.env.NEXT_PUBLIC_OASIS_API_URL ?? "http://localhost:8080";

/**
 * OASIS 인증 훅
 *
 * @example
 * const { login, logout, loading, error } = useOasisAuth();
 * const user = await login({ userId: "admin", password: "admin" });
 */
export function useOasisAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = createOasisApiClient({ baseUrl: OASIS_API_URL });

  const login = useCallback(
    async (credentials: OasisLoginRequest) => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.request<OasisLoginApiResponse>(
          "/api/auth/login",
          {
            method: "POST",
            body: JSON.stringify(credentials),
          },
        );
        setTokens(response.data.accessToken, response.data.refreshToken);
        return response.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "로그인 실패";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const logout = useCallback(() => {
    clearTokens();
    clearCurrentUserCache();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  return { login, logout, loading, error };
}
