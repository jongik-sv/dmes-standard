"use client";

import { useEffect, useState } from "react";
import { redirectToLoginOn401 } from "../http";
import type { PortalShellMenuItem, PortalShellMenuResponse } from "./types";

export interface PortalMenuState {
  menu: PortalShellMenuResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
}

/**
 * OASIS catch-all 호출로 메뉴 트리를 가져온다.
 *
 *  - POST {endpoint} body: {meta:{userId, menuId:"HOME"}, params:{userId}}
 *  - 응답 CactusResponse: {grids:{menus:{rows:[ 트리 노드 ]}}}
 *  - 트리 노드의 필드를 PortalShellMenuItem으로 매핑
 */
export interface PortalMenuEndpoint {
  endpoint: string;
}

export function usePortalMenu(config: PortalMenuEndpoint): PortalMenuState {
  const [menu, setMenu] = useState<PortalShellMenuResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const configKey = config.endpoint;

  useEffect(() => {
    let cancelled = false;

    const loadMenu = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        let items: PortalShellMenuItem[];

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
        if (!res.ok) throw new Error(`메뉴 조회 실패 (${res.status})`);
        const body = await res.json();
        if (!body.meta?.success) {
          throw new Error(body.meta?.message ?? "메뉴 조회 실패");
        }
        const rawTree: Array<Record<string, unknown>> = body.grids?.menus?.rows ?? [];
        items = rawTree.map(adaptMenuNode);

        if (!cancelled) {
          setMenu({ items });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "메뉴 조회에 실패했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMenu();
    return () => {
      cancelled = true;
    };
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { menu, isLoading, errorMessage };
}

/**
 * CactusResponse 트리 노드 → PortalShellMenuItem 재귀 매핑.
 * Backend getMyMenusTree()가 items(자식 배열)을 이미 조립해서 내려보냄.
 * 여기서는 필드명만 화면용으로 변환.
 *
 * hiddenYn='Y' 노드는 메뉴 트리에서 제외하되 부모의 자식 배열에서 빠진다 —
 * popup 등 다른 진입 경로로만 호출되는 부속 화면용.
 */
function adaptMenuNode(row: Record<string, unknown>): PortalShellMenuItem {
  const menuType = String(row.menuType ?? "page");
  const rawItems = Array.isArray(row.items) ? row.items : [];

  // 2026-06-05 Phase 1+2 — BE SecUserService.getMyMenus 가 leaf row 에 derived 로 채워 보내는 componentPath.
  //   형태: `${PARENT_MENU_ID}/${OBJECT_ID}` (예: "csa/commMenuMng"). 둘 중 하나라도 null/blank 면 null.
  //   Sidebar 가 본 값을 우선 사용해 module-pages.ts 의 group prefix 부착 (resolvePagePath) 을 우회한다.
  const rawComponentPath = row.componentPath;
  const componentPath =
    typeof rawComponentPath === "string" && rawComponentPath.trim().length > 0
      ? rawComponentPath
      : null;

  return {
    id: String(row.menuId ?? ""),
    name: String(row.menuNm ?? ""),
    displayText: String(row.menuNm ?? ""),
    type: menuType === "dir" ? "dir" : "page",
    items: rawItems
      .filter((child) => (child as Record<string, unknown>).hiddenYn !== "Y")
      .map((child) => adaptMenuNode(child as Record<string, unknown>)),
    parentId: row.uprLvMenuId ? String(row.uprLvMenuId) : null,
    expended: null,
    path: String(row.serviceUrl ?? "/"),
    moduleId: row.sysCd ? String(row.sysCd) : null,
    pageName: row.objId ? String(row.objId) : null,
    componentPath,
  };
}
