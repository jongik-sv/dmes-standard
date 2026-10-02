"use client";

/**
 * 포털 홈(mcm:home) — 인사말·긴급 공지 띠 + 위젯(공지사항·내 알림·주요 지표·차트·작업지시·설비 알람·출하 예정·바로가기).
 * 위젯은 사용자가 [배치 편집]에서 끌어 옮기고 크기를 바꾸고 숨기거나 다시 놓는다(shared 보드, 사용자별 저장).
 * 시안: 2026-10-02 사용자 승인 HTML(홈 부분). 공지사항만 실제 조회(noticeBoard)이고, 바로가기는 사용자 즐겨찾기다.
 * KPI·차트·표·알림은 sample-data.ts 의 샘플이다(인사말 줄에 표시).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { composePageName } from "@dk-oasis/shared/portal-shell-core";
import { usePortalFavorites } from "@dk-oasis/shared/portal-shell";
import { PageLayout } from "@dk-oasis/shared/layout";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import {
  DashboardBoard,
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  useDashboardBoard,
  type DashboardWidget,
} from "@dk-oasis/shared/dashboard";

import { usePortalMenuPageIds } from "@/lib/portal-menu-store";

import { fetchCurrentUser, searchNoticeBoard, type CurrentUser } from "./api";
import { HOME_CSS, HOME_STYLE_HREF } from "./home-styles";
import { NoticeCard } from "./NoticeCard";
import { NotificationCard } from "./NotificationCard";
import { LayoutControls, OpenNoticeButton } from "./LayoutControls";
import {
  AlarmsWidget,
  DefectWidget,
  EquipmentWidget,
  HOME_DEFAULT_ROWS,
  KpiWidget,
  MonthlyWidget,
  ProcessWidget,
  ShipmentsWidget,
  WorkOrdersWidget,
} from "./home-widgets";
import { PRODUCT_GROUPS, currentShiftLabel } from "./sample-data";
import {
  firstUrgent,
  formatToday,
  keepSelection,
  NOTICE_MGMT_PAGE_ID,
  noticeKey,
  openPortalTab,
  type NoticeLoadState,
} from "./types";

const FAVORITES_ENDPOINT = { endpoint: "/api/mcm/oasis/secFavorite/search" };

/** 홈 배치 저장 키 — 사용자별 localStorage `dmes:dash:v3:{userId}:mcm.home.layout`. */
const HOME_LAYOUT_KEY = "mcm.home.layout";
const NOTICE_WIDGET_ID = "notice";

interface QuickLink {
  pageId: string;
  label: string;
  module: string;
}

export default function PortalHomePage({ tabId }: PageProps) {
  const [now] = useState(() => new Date());
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [productGroup, setProductGroup] = useState(PRODUCT_GROUPS[0]);
  const [notices, setNotices] = useState<NoticeLoadState>({ status: "loading" });
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const noticeSeq = useRef(0);

  /** 공지 조회 — 요청 순번으로 늦게 온 이전 응답을 버린다. 실패하면 카드 안에 안내와 [다시 시도]만 보인다. */
  const loadNotices = useCallback(() => {
    const seq = ++noticeSeq.current;
    return searchNoticeBoard().then(
      (rows) => {
        if (seq !== noticeSeq.current) return;
        setNotices({ status: "ok", rows });
        setSelectedNoticeId((prev) => keepSelection(rows, prev));
      },
      () => {
        if (seq !== noticeSeq.current) return;
        setNotices({ status: "error" });
      }
    );
  }, []);

  useEffect(() => {
    void loadNotices();
    return () => {
      // 언마운트 뒤 도착한 응답은 버린다.
      noticeSeq.current += 1;
    };
  }, [loadNotices]);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retryNotices = useCallback(() => {
    setNotices({ status: "loading" });
    void loadNotices();
  }, [loadNotices]);

  // "공지 관리 ›" 는 내 메뉴(포털이 받아 둔 myMenusTree)에 공지사항 관리 화면이 있을 때만 보인다.
  const menuPageIds = usePortalMenuPageIds();
  const canManageNotices = menuPageIds?.has(NOTICE_MGMT_PAGE_ID) ?? false;

  const noticeRows = notices.status === "ok" ? notices.rows : [];
  const urgent = firstUrgent(noticeRows);

  /** 공지 알림 → 긴급 공지(없으면 첫 공지)를 고른다. 샘플 알림이라 실제 공지 ID 와 잇지 않는다. */
  const openNoticeFromNotification = useCallback(() => {
    if (notices.status !== "ok" || notices.rows.length === 0) return;
    const target = firstUrgent(notices.rows) ?? notices.rows[0];
    setSelectedNoticeId(noticeKey(target));
  }, [notices]);

  /* ── 바로가기: 사용자 즐겨찾기(셸 사이드바와 같은 목록). 홈 탭으로 돌아오면 다시 읽는다. ── */
  const favorites = usePortalFavorites(FAVORITES_ENDPOINT);
  const refetchFavorites = favorites.refetch;
  useEffect(() => {
    const onActivated = (e: Event) => {
      if ((e as CustomEvent<{ tabId?: string }>).detail?.tabId === tabId) void refetchFavorites();
    };
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [tabId, refetchFavorites]);

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

  const greeting = user?.name || user?.id;

  /* ── 위젯 목록 — 크기·설명은 여기서 정하고, 배치·편집·저장은 shared 보드가 맡는다. ── */
  const quickLinksBody = favorites.isLoading ? (
    <div className="mcm-home-state">즐겨찾기를 불러오는 중입니다.</div>
  ) : favorites.errorMessage ? (
    <div className="mcm-home-state mcm-home-state--error">즐겨찾기를 불러오지 못했습니다.</div>
  ) : quickLinks.length === 0 ? (
    <div className="mcm-home-state">즐겨찾기한 메뉴가 없습니다. 메뉴의 ☆ 를 눌러 추가하세요.</div>
  ) : (
    <div className="mcm-home-quick" data-testid="home-quick-links">
      {quickLinks.map((q) => (
        <Button
          key={q.pageId}
          className="mcm-home-quick__btn"
          onClick={() => openPortalTab(q.pageId)}
        >
          {q.label}
          <span className="mcm-home-quick__mod">{q.module}</span>
        </Button>
      ))}
    </div>
  );

  const widgets: DashboardWidget[] = [
    {
      id: NOTICE_WIDGET_ID,
      title: "공지사항",
      description: "게시 중인 공지 목록과 본문",
      span: 8,
      height: 400,
      minHeight: 240,
      render: () => (
        <NoticeCard
          state={notices}
          selectedId={selectedNoticeId}
          onSelect={setSelectedNoticeId}
          onRetry={retryNotices}
          canManage={canManageNotices}
        />
      ),
    },
    {
      id: "notifications",
      title: "내 알림",
      description: "결재·공지·설비 알림(구현 예정 — 샘플)",
      span: 4,
      height: 400,
      minHeight: 200,
      render: () => <NotificationCard onOpenNotice={openNoticeFromNotification} />,
    },
    {
      id: "kpi",
      title: "주요 지표",
      description: "생산·출하·품질 등 핵심 지표 6개(샘플)",
      span: 12,
      minSpan: 4,
      render: () => <KpiWidget />,
    },
    {
      id: "monthly",
      title: "월별 생산 실적",
      description: "제품군별 월 생산 실적과 계획(샘플)",
      span: 8,
      render: () => <MonthlyWidget />,
    },
    {
      id: "equipment",
      title: "설비 가동 상태",
      description: "라인 가동·정지·점검 비율(샘플)",
      span: 4,
      render: () => <EquipmentWidget />,
    },
    {
      id: "process",
      title: "공정별 금일 생산",
      description: "공정·교대조별 생산량(샘플)",
      span: 6,
      render: () => <ProcessWidget />,
    },
    {
      id: "defect",
      title: "불량 유형 (이번 주)",
      description: "불량 유형별 발생 건수(샘플)",
      span: 6,
      render: () => <DefectWidget />,
    },
    {
      id: "workOrders",
      title: "금일 작업지시 현황",
      description: "오늘 작업지시와 진행률(샘플)",
      span: 8,
      render: () => <WorkOrdersWidget />,
    },
    {
      id: "alarms",
      title: "설비 알람",
      description: "최근 24시간 설비 알람(샘플)",
      span: 4,
      render: () => <AlarmsWidget />,
    },
    {
      id: "shipments",
      title: "출하 예정",
      description: "D+0 ~ D+2 출하 예정(샘플)",
      span: 6,
      render: () => <ShipmentsWidget />,
    },
    {
      id: "quickLinks",
      title: "바로가기",
      description: "즐겨찾기한 메뉴",
      span: 6,
      render: () => (
        <DashboardCard title="바로가기" subtitle="즐겨찾기 메뉴">
          {quickLinksBody}
        </DashboardCard>
      ),
    },
  ];
  const board = useDashboardBoard({
    widgets,
    defaultRows: HOME_DEFAULT_ROWS,
    layoutKey: HOME_LAYOUT_KEY,
  });

  return (
    <PageLayout title="홈">
      <style href={HOME_STYLE_HREF} precedence="default">
        {HOME_CSS}
      </style>
      <DashboardGrid fill ariaLabel="홈" testId="portal-home">
        {/* 1. 인사말 줄 */}
        <DashboardCell className="mcm-home-welcome">
          <h2 className="mcm-home-welcome__hello" data-testid="home-greeting">
            {greeting ? `안녕하세요, ${greeting} 님` : "안녕하세요"}
          </h2>
          <span className="mcm-home-welcome__date">
            {formatToday(now)} · {currentShiftLabel(now.getHours())}
          </span>
          <Badge tone="warning" label="지표·차트·표는 샘플 데이터" />
          <div className="mcm-home-welcome__right">
            <SegmentedControl
              value={productGroup}
              onChange={setProductGroup}
              options={PRODUCT_GROUPS}
              ariaLabel="제품군"
              testId="home-product-group"
            />
            <LayoutControls board={board} />
          </div>
        </DashboardCell>

        {/* 2. 긴급 공지 띠(위젯 아님 — 배치 편집 대상이 아니다) */}
        {urgent && (
          <DashboardCell className="mcm-home-urgent" testId="home-urgent">
            <span className="mcm-home-urgent__label">긴급 공지</span>
            <span className="mcm-home-urgent__title" title={urgent.TITLE}>
              {urgent.TITLE}
            </span>
            <OpenNoticeButton
              board={board}
              widgetId={NOTICE_WIDGET_ID}
              onOpen={() => setSelectedNoticeId(noticeKey(urgent))}
            />
          </DashboardCell>
        )}

        {/* 3. 위젯 — 배치 편집 모드에서 끌어 옮기기·크기 조절·숨기기·추가 */}
        <DashboardBoard board={board} />
      </DashboardGrid>
    </PageLayout>
  );
}
