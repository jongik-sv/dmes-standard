"use client";

/**
 * 포털 홈(mcm:home) — 인사말·긴급 공지 띠 + 사용자 위젯 탭(WidgetWorkspace).
 * 위젯은 widgets/home/* (등록부 코드 생성), 배치는 사용자별 서버 저장(secWidget). 스펙 2026-10-02-widget-foundation.
 * 실행 시 등록부 = 코드 등록부 + 유형 등록부 + widgetDef/list 의 DB 정의·덮어쓰기 행(shared mergeWidgetRegistry),
 * 「홈」 기본 배치 = 응답의 부서·전사 기본 배치, 없으면 코드 상수. 스펙 2026-10-02-widget-admin-generic §11.
 * KPI·차트·표·알림은 sample-data.ts 의 샘플이다(인사말 줄에 표시).
 * [PDF](작업 공간 도구 줄)는 홈 뿌리 .mcm-home 전체(인사말·공지 띠·탭 줄·보드)를 한 장짜리 PDF 로 인쇄한다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { PageLayout } from "@dk-oasis/shared/layout";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import { mergeWidgetRegistry, toWidgetDefRow, WidgetWorkspace, type WidgetDefRow, type WidgetRegistry } from "@dk-oasis/shared/widget";

import { useWidgetCategories } from "@/page-components/csa/commWidgetMng/use-widget-categories";
import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";
import { onWidgetDefsChanged } from "@/lib/widget-defs-events";

import { fetchCurrentUser, type CurrentUser } from "./api";
import { HOME_CSS, HOME_STYLE_HREF } from "./home-styles";
import { HOME_DEFAULT_LAYOUT } from "./home-layout";
import { ensureNoticesLoaded, resetNoticesRequest, selectNotice, useNotices } from "./notice-store";
import { PRODUCT_GROUPS, currentShiftLabel } from "./sample-data";
import { firstUrgent, formatToday, noticeKey } from "./types";
import {
  INITIAL_DEFS_STATE,
  defsReducer,
  fetchWidgetDefs,
  pickHomeDefault,
  typeTitlesOf,
} from "./widget-defs";
import { secWidgetStore } from "./widget-store";

/** 유형 ID → 이름. 유형 등록부는 생성물(모듈 상수)이라 한 번만 만든다. */
const TYPE_TITLES = typeTitlesOf(WIDGET_TYPE_REGISTRY);

export default function PortalHomePage(_props: PageProps) {
  const [now] = useState(() => new Date());
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [productGroup, setProductGroup] = useState(PRODUCT_GROUPS[0]);
  // 목록만 구독한다 — 통째 스토어를 구독하면 공지 행 선택 하나에 홈 페이지→보드→위젯 틀 11개가 다시 그려진다(widget-render-findings W8).
  const notices = useNotices();
  // [PDF] 인쇄 대상 — 홈 뿌리(.mcm-home) 전체.
  const homeRef = useRef<HTMLDivElement>(null);
  // [위젯 추가] 서랍의 분류 묶음 — 조회 전·실패면 빈 값이라 undefined 를 넘겨 서랍이 분류 없이 보이게 한다.
  const { titles: categoryTitleMap } = useWidgetCategories();
  const categoryTitles = useMemo(() => (Object.keys(categoryTitleMap).length > 0 ? categoryTitleMap : undefined), [categoryTitleMap]);

  // 위젯 정의 조회 — 응답 전·실패 동안은 코드 등록부만으로 보이고 [배치 편집]이 막힌다(정의 위젯이 사용자 배치에서 지워지지 않게).
  // 등록부·기본 배치가 응답으로 바뀌면 WidgetWorkspace 가 가진 탭을 다시 정리하므로(다시 조회하지 않는다) 따로 다시 마운트하지 않는다.
  const [defsState, dispatchDefs] = useReducer(defsReducer, INITIAL_DEFS_STATE);
  const [defsAttempt, setDefsAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchWidgetDefs().then(
      (res) => {
        if (!cancelled) dispatchDefs({ type: "loaded", rawDefs: res.rawDefs, homeDefault: res.homeDefault });
      },
      () => {
        if (!cancelled) dispatchDefs({ type: "failed" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [defsAttempt]);

  // 위젯관리에서 정의·기본 배치를 바꾸면 다시 받는다 — 홈 탭은 포털에서 계속 마운트돼 있어 처음 한 번만 받으면 새 위젯이 서랍에 안 보인다.
  // 조용히 받는다: 로딩 상태로 바꾸지 않고, 실패하면 지금 등록부를 그대로 둔다(편집 중이면 작업 공간이 편집이 끝난 뒤 다시 불러온다).
  useEffect(() => {
    let alive = true;
    const off = onWidgetDefsChanged(() => {
      fetchWidgetDefs().then(
        (res) => {
          if (alive) dispatchDefs({ type: "loaded", rawDefs: res.rawDefs, homeDefault: res.homeDefault });
        },
        () => {}
      );
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const retryDefs = useCallback(() => {
    dispatchDefs({ type: "retry" });
    setDefsAttempt((n) => n + 1);
  }, []);

  const defRows = useMemo(
    () => defsState.rawDefs.map((raw) => toWidgetDefRow(raw)).filter((row): row is WidgetDefRow => row !== null),
    [defsState.rawDefs]
  );
  // 지난 등록부를 넘겨, 정의를 다시 받아도 합친 결과가 같으면 같은 객체를 쓴다(보드가 바뀐 것으로 보지 않게, W2).
  // 렌더 중 상태 조정(파생 상태) 방식 — 행 목록이 바뀐 렌더에서만 다시 합친다.
  const [registry, setRegistry] = useState<WidgetRegistry>(() => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defRows));
  const [registryRows, setRegistryRows] = useState(defRows);
  if (registryRows !== defRows) {
    setRegistryRows(defRows);
    setRegistry((prev) => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defRows, prev));
  }
  const homeDefault = useMemo(() => pickHomeDefault(defsState.homeDefault, HOME_DEFAULT_LAYOUT), [defsState.homeDefault]);

  useEffect(() => {
    ensureNoticesLoaded();
    let cancelled = false;
    void fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
      resetNoticesRequest();
    };
  }, []);

  const urgent = notices.status === "ok" ? firstUrgent(notices.rows) : undefined;
  const greeting = user?.name || user?.id;

  const openUrgent = () => {
    if (!urgent) return;
    selectNotice(noticeKey(urgent));
    document.querySelector('[data-widget-id="home.notice"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <PageLayout title="홈">
      <style href={HOME_STYLE_HREF} precedence="default">
        {HOME_CSS}
      </style>
      <div ref={homeRef} className="mcm-home" data-testid="portal-home">
        <div className="mcm-home-welcome">
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
          </div>
        </div>

        {urgent && (
          <div className="mcm-home-urgent" data-testid="home-urgent">
            <span className="mcm-home-urgent__label">긴급 공지</span>
            <span className="mcm-home-urgent__title" title={urgent.TITLE}>
              {urgent.TITLE}
            </span>
            <Button size="mini" onClick={openUrgent}>
              내용 보기
            </Button>
          </div>
        )}

        <WidgetWorkspace
          registry={registry}
          homeDefault={homeDefault}
          store={secWidgetStore}
          userId={user?.id ?? null}
          testId="home-widgets"
          registryStatus={defsState.status}
          onRetryRegistry={retryDefs}
          typeTitles={TYPE_TITLES}
          categoryTitles={categoryTitles}
          pdfTarget={homeRef}
        />
      </div>
    </PageLayout>
  );
}
