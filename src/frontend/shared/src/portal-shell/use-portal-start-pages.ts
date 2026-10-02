"use client";

import { useCallback, useEffect, useState } from "react";
import { redirectToLoginOn401 } from "../http";
import type { PortalStartPageRecord } from "./start-pages";

export interface PortalStartPagesState {
  startPages: PortalStartPageRecord[];
  /**
   * 첫 조회가 끝났는지(성공·실패 무관). 한 번 true 가 되면 refetch 중에도 내려가지 않는다.
   * PortalShell 은 이 값이 true 가 된 뒤 한 번만 기본 화면을 연다.
   */
  isLoaded: boolean;
  errorMessage: string | null;
  /** 등록·해제 후 목록 재조회. 진행 중에도 이전 목록을 그대로 보여 준다(포털을 다시 그리지 않는다). */
  refetch: () => Promise<void>;
}

export interface PortalStartPagesEndpoint {
  endpoint: string;
}

/**
 * 포털 기본 화면 목록 조회 — usePortalFavorites 와 같은 OASIS 호출 방식.
 *
 *  - POST {endpoint} body: {meta:{userId, menuId:"HOME"}, params:{userId}} — BE 가 userId 를 인증 사용자로 강제한다.
 *  - 응답: {grids:{startPages:{rows:[...]}}} (BPMN `secStartPgm` search 의 output = startPages)
 *
 * usePortalFavorites 와 달리 refetch 때 로딩 상태로 돌아가지 않는다. 호출자가 로딩 상태로 포털을
 * 가리면 PortalShell 이 다시 마운트되어 탭 화면 상태를 잃기 때문이다.
 */
export function usePortalStartPages(config: PortalStartPagesEndpoint): PortalStartPagesState {
  const [startPages, setStartPages] = useState<PortalStartPageRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const configKey = config.endpoint;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (meRes.status === 401 || !meRes.ok) {
          redirectToLoginOn401();
          return;
        }
        const me = await meRes.json();
        const userId: string = me.user?.id ?? "";
        if (!userId) {
          redirectToLoginOn401();
          return;
        }

        const res = await fetch(config.endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meta: { userId, menuId: "HOME" },
            params: { userId },
          }),
        });
        if (res.status === 401) {
          redirectToLoginOn401();
          return;
        }
        if (!res.ok) throw new Error(`기본 화면 조회 실패 (${res.status})`);
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "기본 화면 조회 실패");
        }
        const rows: Array<Record<string, unknown>> = body.grids?.startPages?.rows ?? [];
        const items = rows
          .map(adaptStartPageRow)
          .filter((item): item is PortalStartPageRecord => item !== null)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (!cancelled) {
          setStartPages(items);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "기본 화면 목록을 불러오지 못했습니다."
          );
        }
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [configKey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(async () => {
    setReloadKey((prev) => prev + 1);
  }, []);

  return { startPages, isLoaded, errorMessage, refetch };
}

/**
 * 백엔드 `secStartPgm/search` 응답 row → PortalStartPageRecord.
 * pageId 는 즐겨찾기·메뉴 트리와 같은 `{sysCd}:{componentPath}` 로 조립한다. 조립할 수 없는 행은 버린다.
 */
export function adaptStartPageRow(row: Record<string, unknown>): PortalStartPageRecord | null {
  const sysCd = row.sysCd ? String(row.sysCd).trim() : "";
  const componentPath = row.componentPath ? String(row.componentPath).trim() : "";
  if (!sysCd || !componentPath.includes("/")) return null;
  const menuId = row.menuId ? String(row.menuId) : null;
  const menuNm = row.menuNm ? String(row.menuNm) : null;
  return {
    pageId: `${sysCd}:${componentPath}`,
    menuId,
    displayText: menuNm ?? menuId ?? componentPath,
    sortOrder: Number(row.startSeq ?? 0),
  };
}
