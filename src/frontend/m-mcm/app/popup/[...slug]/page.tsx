"use client";

/**
 * 포털 탭 「새 창으로 분리」 가 여는 단독 화면 — `/popup/{moduleId}/{pageName…}?h={token}`.
 * 포털 탭·사이드바 없이 PortalPageWindow 가 화면 하나만 그린다. 권한·serviceId·창 제목은 내 메뉴(myMenusTree)로 정한다.
 * 설계: docs/superpowers/specs/2026-10-06-portal-tab-popout-design.md §5.4·§5.6
 */
import { use, useEffect } from "react";
import { PortalPageWindow, usePortalMenu } from "@dk-oasis/shared/portal-shell";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/modal.css";
import { resolvePortalPage } from "../../portal/registered-modules";
import { usePortalUsageReporter } from "../../portal/use-portal-usage-reporter";
import { publishPortalMenu } from "@/lib/portal-menu-store";
import { popupSlugToPageId } from "../popup-target";

const MENU_ENDPOINT = { endpoint: "/api/mcm/oasis/secUser/myMenusTree" };

export default function PopupRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ h?: string | string[] }>;
}) {
  const { slug } = use(params);
  const { h } = use(searchParams);
  const token = typeof h === "string" ? h : null;
  const pageId = popupSlugToPageId(slug);
  const { menu, isLoading, errorMessage } = usePortalMenu(MENU_ENDPOINT);
  const { onUsageSegments } = usePortalUsageReporter();

  useEffect(() => {
    publishPortalMenu(menu?.items ?? null);
  }, [menu]);

  if (!pageId) return <p style={{ padding: 24, color: "#dc3545" }}>잘못된 화면 경로입니다.</p>;
  if (isLoading) return <p style={{ padding: 24, color: "#666" }}>로딩 중...</p>;
  if (!menu || errorMessage) return <p style={{ padding: 24, color: "#dc3545" }}>{errorMessage ?? "메뉴를 불러올 수 없습니다."}</p>;
  return (
    <PortalPageWindow
      pageId={pageId}
      menu={menu}
      resolvePage={resolvePortalPage}
      handoffToken={token}
      appName="DMES Portal"
      onUsageSegments={onUsageSegments}
    />
  );
}
