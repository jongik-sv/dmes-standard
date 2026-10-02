"use client";

import { useEffect, useMemo } from "react";
import { composePageName } from "@dk-oasis/shared/portal-shell-core";
import { usePortalFavorites } from "@dk-oasis/shared/portal-shell";
import { Button } from "@dk-oasis/shared/form";
import { openPortalPage, type WidgetProps } from "@dk-oasis/shared/widget";

const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };

interface QuickLink {
  pageId: string;
  label: string;
  module: string;
}

/** 바로가기 — 사용자 즐겨찾기(셸 사이드바와 같은 목록). 새로 고침 신호·탭 활성화 때 다시 읽는다. */
export default function QuickLinksWidget({ refreshKey }: WidgetProps) {
  const favorites = usePortalFavorites(FAVORITES_ENDPOINT);
  const refetch = favorites.refetch;

  useEffect(() => {
    if (refreshKey > 0) void refetch();
  }, [refreshKey, refetch]);

  // 위젯은 자기 포털 tabId 를 모르므로 탭 구분 없이 다시 읽는다.
  useEffect(() => {
    const onActivated = () => void refetch();
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [refetch]);

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
