"use client";

/**
 * 포털 홈(mcm:home) — 인사말·긴급 공지 띠 + 사용자 위젯 탭(WidgetWorkspace).
 * 위젯은 widgets/home/* (등록부 코드 생성), 배치는 사용자별 서버 저장(secWidget). 스펙 2026-10-02-widget-foundation.
 * KPI·차트·표·알림은 sample-data.ts 의 샘플이다(인사말 줄에 표시).
 */
import { useEffect, useState } from "react";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { PageLayout } from "@dk-oasis/shared/layout";
import { Badge, Button, SegmentedControl } from "@dk-oasis/shared/form";
import { WidgetWorkspace } from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";

import { fetchCurrentUser, type CurrentUser } from "./api";
import { HOME_CSS, HOME_STYLE_HREF } from "./home-styles";
import { HOME_DEFAULT_LAYOUT } from "./home-layout";
import { ensureNoticesLoaded, resetNoticesRequest, selectNotice, useNoticeStore } from "./notice-store";
import { PRODUCT_GROUPS, currentShiftLabel } from "./sample-data";
import { firstUrgent, formatToday, noticeKey } from "./types";
import { secWidgetStore } from "./widget-store";

export default function PortalHomePage(_props: PageProps) {
  const [now] = useState(() => new Date());
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [productGroup, setProductGroup] = useState(PRODUCT_GROUPS[0]);
  const { notices } = useNoticeStore();

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
      <div className="mcm-home" data-testid="portal-home">
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
          registry={WIDGET_REGISTRY}
          homeDefault={HOME_DEFAULT_LAYOUT}
          store={secWidgetStore}
          userId={user?.id ?? null}
          testId="home-widgets"
        />
      </div>
    </PageLayout>
  );
}
