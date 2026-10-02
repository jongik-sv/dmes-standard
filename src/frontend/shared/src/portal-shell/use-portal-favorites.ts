"use client";

import { useCallback, useEffect, useState } from "react";
import { redirectToLoginOn401 } from "../http";
import type { PortalFavoriteMenuRecord } from "../portal-menu";

export interface PortalFavoritePagesState {
  favorites: PortalFavoriteMenuRecord[];
  /** 첫 조회 중인지. refetch 중에는 true 로 돌아가지 않는다(이전 목록 유지). */
  isLoading: boolean;
  errorMessage: string | null;
  /** 즐겨찾기 토글 후 목록 강제 재조회. 호출자가 await 한다. */
  refetch: () => Promise<void>;
}

export interface PortalFavoritesEndpoint {
  endpoint: string;
}

export function usePortalFavorites(config: PortalFavoritesEndpoint): PortalFavoritePagesState {
  const [favorites, setFavorites] = useState<PortalFavoriteMenuRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // refetch 트리거. 값이 바뀌면 useEffect 가 다시 실행되어 목록 갱신.
  const [reloadKey, setReloadKey] = useState<number>(0);

  const configKey = config.endpoint;

  useEffect(() => {
    let cancelled = false;

    const loadFavoritePages = async () => {
      // 로딩 상태는 첫 조회(초기값 true)만이다. refetch 때 다시 true 로 올리면 포털 페이지가 로딩 화면으로 바뀌며
      // PortalShell 이 언마운트되어 열린 탭 화면 내용이 모두 사라진다 — 재조회 중에는 이전 목록을 그대로 둔다.
      setErrorMessage(null);

      try {
        let items: PortalFavoriteMenuRecord[];

        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (meRes.status === 401 || !meRes.ok) {
          redirectToLoginOn401();
          if (!cancelled) setIsLoading(false);
          return;
        }
        const me = await meRes.json();
        const userId: string = me.user?.id ?? "";
        if (!userId) {
          redirectToLoginOn401();
          if (!cancelled) setIsLoading(false);
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
          if (!cancelled) setIsLoading(false);
          return;
        }
        if (!res.ok) throw new Error(`즐겨찾기 조회 실패 (${res.status})`);
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "즐겨찾기 조회 실패");
        }
        const rows: Array<Record<string, unknown>> = body.grids?.favorites?.rows ?? [];
        items = rows.map(adaptFavoriteRow);

        if (!cancelled) {
          setFavorites(items);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "즐겨찾기 목록을 불러오지 못했습니다."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadFavoritePages();
    return () => {
      cancelled = true;
    };
  }, [configKey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // refetch — 호출자가 즐겨찾기 토글 후 호출. setState 가 비동기라
  // 호출 직후 새 데이터를 보장하지는 않지만, 다음 렌더 사이클에서 갱신됨.
  const refetch = useCallback(async () => {
    setReloadKey((prev) => prev + 1);
  }, []);

  return { favorites, isLoading, errorMessage, refetch };
}

/**
 * 백엔드 `secFavorite/search` 응답 row → PortalFavoriteMenuRecord 매핑.
 *
 * 백엔드는 SecMenu+SecObj JOIN 으로 `sysCd`/`objId`/`menuNm` 을 함께 내려준다.
 * portal-shell 의 pageId 는 `{moduleId}:{pageName}` = `{sysCd}:{objId}` 이므로
 * moduleId/pageName 에 그대로 매핑한다 — 매핑 없이 둘 다 null 이면
 * `toPageIdFromFavoriteMenuItem()` 이 null 을 반환하여 즐겨찾기 트리/하이라이트가 깨진다.
 */
function adaptFavoriteRow(row: Record<string, unknown>): PortalFavoriteMenuRecord {
  const sysCd = row.sysCd ? String(row.sysCd) : null;
  const objId = row.objId ? String(row.objId) : null;
  const menuNm = row.menuNm ? String(row.menuNm) : null;
  const menuId = row.menuId ? String(row.menuId) : null;
  const fvtFoldId = row.fvtFoldId ? String(row.fvtFoldId) : null;
  const fvtFoldNm = row.fvtFoldNm ? String(row.fvtFoldNm) : null;
  const parentFold = row.parentFold ? String(row.parentFold) : null;
  // 메뉴트리 별버튼과 동일한 pageId 조립을 위해 BE 가 내려준 componentPath(=FULL_ID) 보존.
  const componentPath = row.componentPath ? String(row.componentPath) : null;

  // Phase 8 — 폴더 행 인식: menuId 없이 fvtFoldId 만 있는 row 는 폴더.
  const isFolder = !menuId && !!fvtFoldId;

  return {
    id: String(row.id ?? ""),
    userId: String(row.userId ?? ""),
    name: isFolder ? (fvtFoldId ?? "") : (menuId ?? ""),
    displayText: isFolder ? (fvtFoldNm ?? fvtFoldId ?? "폴더") : (menuNm ?? menuId ?? ""),
    type: isFolder ? "folder" : "page",
    parentId: isFolder ? parentFold : (fvtFoldId ?? parentFold),
    expended: null,
    path: String(row.serviceUrl ?? row.formUrl ?? "/"),
    moduleId: sysCd,
    pageName: objId,
    sortOrder: Number(row.fvtSeq ?? row.fvtFoldSeq ?? row.menuSeq ?? 0),
    componentPath,
  };
}
