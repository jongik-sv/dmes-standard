"use client";

import { useEffect, useMemo } from "react";
import { composePageName } from "@dk-oasis/shared/portal-shell-core";
import { usePortalFavorites, useTabPage } from "@dk-oasis/shared/portal-shell";
import { Button } from "@dk-oasis/shared/form";
import { openPortalPage, type WidgetProps } from "@dk-oasis/shared/widget";

const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };

interface QuickLink {
  pageId: string;
  label: string;
  module: string;
}

/** 바로가기 — 사용자 즐겨찾기(셸 사이드바와 같은 목록). 새로 고침 신호·자기 탭 활성화 때 다시 읽는다. */
export default function QuickLinksWidget({ refreshKey }: WidgetProps) {
  const favorites = usePortalFavorites(FAVORITES_ENDPOINT);
  const refetch = favorites.refetch;

  useEffect(() => {
    if (refreshKey > 0) void refetch();
  }, [refreshKey, refetch]);

  // 자기 탭(홈)이 활성화될 때만 다시 읽는다 — 다른 탭으로 옮길 때마다 요청하지 않게(Screen-Performance-Guide K5).
  // 포털 밖이라 tabId 를 모르면 예전처럼 탭 구분 없이 다시 읽는다.
  const { tabId } = useTabPage();
  useEffect(() => {
    const onActivated = (e: Event) => {
      const activated = (e as CustomEvent<{ tabId?: string }>).detail?.tabId;
      if (tabId && activated !== tabId) return;
      void refetch();
    };
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [refetch, tabId]);

  const quickLinks = useMemo<QuickLink[]>(() => {
    const seen = new Set<string>();
    const out: QuickLink[] = [];
    for (const f of favorites.favorites) {
      if (f.type !== "page" || !f.moduleId || !f.pageName) continue;
      // 셸 즐겨찾기와 같은 pageId 규칙 — componentPath(그룹/화면) 우선, 없으면 path + pageName.
      const name =
        f.componentPath && f.componentPath.includes("/")
          ? f.componentPath
          : composePageName(f.path, f.pageName);
      if (!name) continue;
      const pageId = `${f.moduleId}:${name}`;
      if (seen.has(pageId)) continue;
      seen.add(pageId);
      out.push({
        pageId,
        label: f.displayText?.trim() || f.name,
        module: f.moduleId.toUpperCase(),
      });
    }
    return out;
  }, [favorites.favorites]);

  if (favorites.isLoading) return <div className="mcm-home-state">즐겨찾기를 불러오는 중입니다.</div>;
  if (favorites.errorMessage) {
    return <div className="mcm-home-state mcm-home-state--error">즐겨찾기를 불러오지 못했습니다.</div>;
  }
  if (quickLinks.length === 0) {
    return <div className="mcm-home-state">즐겨찾기한 메뉴가 없습니다. 메뉴의 ☆ 를 눌러 추가하세요.</div>;
  }
  return (
    <div className="mcm-home-quick" data-testid="home-quick-links">
      {quickLinks.map((q) => (
        <Button key={q.pageId} className="mcm-home-quick__btn" onClick={() => openPortalPage(q.pageId)}>
          {q.label}
          <span className="mcm-home-quick__mod">{q.module}</span>
        </Button>
      ))}
    </div>
  );
}
