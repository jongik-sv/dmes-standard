"use client";

import { useCallback } from "react";
import { useGfnMessage } from "../components/message-provider";

export interface ApiCallOptions {
  /** 성공 시 표시할 토스트 메시지 (생략 시 표시 안 함) */
  successMessage?: string;
  /** 에러 메시지 앞에 붙일 접두사 (예: "공장 저장 실패: ") */
  errorPrefix?: string;
  /** true이면 에러를 gfn_message로 표시하지 않음 */
  suppressError?: boolean;
  /** true이면 catch 후 에러를 다시 throw (호출부에서 추가 처리 가능) */
  rethrow?: boolean;
}

/**
 * API 호출을 감싸서 에러를 자동으로 gfn_message 로 노출하는 훅.
 *
 * @example
 * ```tsx
 * const apiCall = useApiCall();
 *
 * // 저장
 * const saved = await apiCall(() => savePlant(form), {
 *   successMessage: "공장이 저장되었습니다",
 * });
 * if (saved) onClose();
 *
 * // 조회 (성공 토스트 생략)
 * const rows = await apiCall(() => fetchPlants());
 * if (rows) setRows(rows);
 * ```
 */
export function useApiCall() {
  const gfn_message = useGfnMessage();

  return useCallback(
    async <T>(
      fn: () => Promise<T>,
      opts: ApiCallOptions = {},
    ): Promise<T | undefined> => {
      try {
        const data = await fn();
        if (opts.successMessage) {
          gfn_message(opts.successMessage);
        }
        return data;
      } catch (err) {
        if (!opts.suppressError) {
          const msg =
            err instanceof Error ? err.message : "처리에 실패했습니다";
          const full = opts.errorPrefix ? `${opts.errorPrefix}${msg}` : msg;
          gfn_message(full, "", "", "error");
        }
        if (opts.rethrow) throw err;
        return undefined;
      }
    },
    [gfn_message],
  );
}
