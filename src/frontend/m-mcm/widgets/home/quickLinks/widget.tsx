"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { composePageName } from "@dk-oasis/shared/portal-shell-core";
import { usePortalFavorites, useTabPage, type PortalFavoritePagesState } from "@dk-oasis/shared/portal-shell";
import { Button } from "@dk-oasis/shared/form";
import { openPortalPage, type WidgetProps } from "@dk-oasis/shared/widget";

import { usePublishedPortalFavorites } from "@/lib/portal-favorites-store";

const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };

interface QuickLink {
  pageId: string;
  label: string;
  module: string;
}

type FavoriteRecord = PortalFavoritePagesState["favorites"][number];

/**
 * 바로가기 — 사용자 즐겨찾기(셸 사이드바와 같은 목록). 새로 고침 신호·자기 탭 활성화 때 다시 읽는다.
 * 포털 안이면 처음에는 포털이 받아 둔 목록(publishPortalFavorites)을 그대로 보여 진입 때 같은 요청을 다시 하지 않는다(W4).
 * 다시 읽을 일이 생기면 그때부터 위젯이 직접 조회한다(포털 사이드바 전체를 다시 그리지 않게 호스트 refetch 는 부르지 않는다).
 */
export default function QuickLinksWidget({ refreshKey }: WidgetProps) {
  const hosted = usePublishedPortalFavorites();
  // 포털이 받아 둔 목록이 없으면(포털 밖·받기 전) 처음부터 직접 조회한다.
  const [own, setOwn] = useState(hosted == null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => {
    setOwn(true);
    setReloadToken((n) => n + 1);
  }, []);

  // 새로 고침 신호(↻·자동 새로 고침) — 렌더 중 상태 조정으로 받는다(effect 안 setState 를 피한다).
  const [seenRefreshKey, setSeenRefreshKey] = useState(refreshKey);
  if (refreshKey !== seenRefreshKey) {
    setSeenRefreshKey(refreshKey);
    if (refreshKey > 0) reload();
  }

  // 자기 탭(홈)이 활성화될 때만 다시 읽는다 — 다른 탭으로 옮길 때마다 요청하지 않게(Screen-Performance-Guide K5).
  // 포털 밖이라 tabId 를 모르면 예전처럼 탭 구분 없이 다시 읽는다.
  const { tabId } = useTabPage();
  useEffect(() => {
    const onActivated = (e: Event) => {
      const activated = (e as CustomEvent<{ tabId?: string }>).detail?.tabId;
      if (tabId && activated !== tabId) return;
      reload();
    };
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [reload, tabId]);

  if (own || hosted == null) return <OwnQuickLinks reloadToken={reloadToken} fallback={hosted} />;
  return <QuickLinkList favorites={hosted} isLoading={false} errorMessage={null} />;
}

/** 직접 조회하는 바로가기 — 마운트 때 한 번 읽고, reloadToken 이 바뀔 때마다 다시 읽는다. 첫 응답 전에는 fallback 목록을 보인다. */
function OwnQuickLinks({ reloadToken, fallback }: { reloadToken: number; fallback: readonly FavoriteRecord[] | null }) {
  const favorites = usePortalFavorites(FAVORITES_ENDPOINT);
  const refetch = favorites.refetch;
  const mountedToken = useRef(reloadToken);
  useEffect(() => {
    if (reloadToken !== mountedToken.current) void refetch();
  }, [reloadToken, refetch]);

  if (favorites.isLoading && fallback) return <QuickLinkList favorites={fallback} isLoading={false} errorMessage={null} />;
  return <QuickLinkList favorites={favorites.favorites} isLoading={favorites.isLoading} errorMessage={favorites.errorMessage} />;
}

function QuickLinkList({
  favorites,
  isLoading,
  errorMessage,
}: {
  favorites: readonly FavoriteRecord[];
  isLoading: boolean;
  errorMessage: string | null;
}) {
  const quickLinks = useMemo<QuickLink[]>(() => {
    const seen = new Set<string>();
    const out: QuickLink[] = [];
    for (const f of favorites) {
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
  }, [favorites]);

  if (isLoading) return <div className="mcm-home-state">즐겨찾기를 불러오는 중입니다.</div>;
  if (errorMessage) {
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
