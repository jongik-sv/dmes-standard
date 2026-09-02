import { useCallback, useState } from "react";
import { createOasisApiClient } from "./oasis-api-client";
import type { OasisServiceRequest, OasisServiceResponse } from "./types";

const OASIS_API_URL =
  process.env.NEXT_PUBLIC_OASIS_API_URL ?? "http://localhost:8080";

const client = createOasisApiClient({
  baseUrl: OASIS_API_URL,
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  },
});

/**
 * OASIS 서비스 호출 훅
 *
 * @example
 * const { execute, loading, error } = useOasisService();
 * const result = await execute("searchUser", "csa::CommUserMng", {
 *   params: { p_USER_ID: "admin" }
 * });
 */
export function useOasisService() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async <T = Record<string, unknown>>(
      action: string,
      serviceUrl: string,
      body?: OasisServiceRequest,
    ): Promise<OasisServiceResponse<T> | null> => {
      setLoading(true);
      setError(null);

      try {
        const [serviceGroup, serviceId] = serviceUrl.split("::");

        const response = await client.executeService<T>(
          serviceGroup,
          serviceId,
          action,
          body,
        );

        if (response.statusMap.ErrorCode !== 0) {
          setError(response.statusMap.ErrorMsg);
        }

        return response;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "서비스 호출 실패";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { execute, loading, error };
}
