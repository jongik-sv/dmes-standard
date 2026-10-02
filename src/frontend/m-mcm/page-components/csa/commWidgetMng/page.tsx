"use client";

/**
 * commWidgetMng — 위젯 관리(관리자). 스펙 2026-10-02-widget-admin-generic §10, 계획 Task 4(화면 틀·위젯 목록)·Task 5(기본 배치).
 * - 탭 「위젯 목록」(WidgetListTab — 코드·정의 위젯 목록·상세·유형 편집기·미리보기)·「기본 배치」(LayoutTab — 전사·부서 홈 기본 배치).
 * - 상단 [조회] 는 위젯 목록 탭에서만 — 목록을 다시 받는다. 기본 배치 탭은 보드 안 [배치 편집]·[완료] 가 맡는다.
 * - 화면은 메뉴 RBAC(objId commWidgetMng)로 보호한다(W-D22). 서버 action 도 같은 권한으로 막는다.
 */
import { useCallback, useRef, useState } from "react";

import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { LayoutTab } from "./LayoutTab";
import { SCREEN_ID } from "./types";
import { WidgetListTab } from "./WidgetListTab";

type AdminTab = "list" | "layout";

const TAB_ITEMS: TabItem[] = [
  { key: "list", label: "위젯 목록" },
  { key: "layout", label: "기본 배치" },
];

export default function CommWidgetMngPage() {
  const { showMessage } = useMessage();
  const [tab, setTab] = useState<AdminTab>("list");
  const [reloadSignal, setReloadSignal] = useState(0);
  /** 위젯 목록 탭이 조회·저장·삭제 처리 중인지 — 그동안 [조회] 를 막는다. 탭은 첫 조회 중으로 마운트된다. */
  const [listBusy, setListBusy] = useState(true);
  /** 위젯 목록 탭에 저장하지 않은 변경이 있는지 — 탭을 바꾸면 그 탭 상태가 사라지므로 먼저 묻는다. */
  const listDirty = useRef(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    listDirty.current = dirty;
  }, []);

  const handleTabChange = useCallback(
    (key: string) => {
      const next = key as AdminTab;
      if (next === tab) return;
      if (tab === "list" && listDirty.current) {
        showMessage({
          title: "확인",
          message: "저장하지 않은 변경을 버릴까요?",
          alertType: "confirm",
          onConfirm: () => {
            listDirty.current = false;
            setTab(next);
          },
        });
        return;
      }
      setTab(next);
    },
    [tab, showMessage]
  );

  const buttons: PageButton[] =
    tab === "list"
      ? [
          {
            id: "btn_search",
            label: "조회",
            onClick: () => setReloadSignal((n) => n + 1),
            type: "primary",
            action: "search",
            disabled: listBusy,
          },
        ]
      : [];

  return (
    <PageLayout
      title="위젯 관리"
      breadcrumb="공통관리 > 시스템관리 > 위젯 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={buttons}
    >
      {/* data-testid 용 감싸기 — display:contents 라 PageLayout 의 세로 배치에 끼지 않는다. */}
      <div data-testid="widget-admin-page" style={{ display: "contents" }}>
        <Tabs items={TAB_ITEMS} activeKey={tab} onChange={handleTabChange} />
        {tab === "list" ? (
          <WidgetListTab reloadSignal={reloadSignal} onDirtyChange={handleDirtyChange} onBusyChange={setListBusy} />
        ) : (
          <LayoutTab />
        )}
      </div>
    </PageLayout>
  );
}
