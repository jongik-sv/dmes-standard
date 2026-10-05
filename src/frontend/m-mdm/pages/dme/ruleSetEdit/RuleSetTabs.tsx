"use client";

/**
 * 룰 세트 편집 화면의 세트 탭 틀(하위 세트 spec §10, C-D13·C-D14) — 탭 머리(세트 ID·저장 안 한 변경 점·닫기)와 탭마다 편집기(`RuleSetEditor`).
 * 탭 머리·숨김 패널은 shared `ClosableTabs` 가 그린다 — 패널은 탭마다 늘 그리고(마운트 유지) 고르지 않은 패널은 `hidden` + `display:none` 으로 숨긴다.
 * 숨은 패널은 `isShown` 이 거짓이라 ⌘Z·캔버스 단축키를 받지 않고, 편집기는 `active` 가 거짓이면 오류 창(포털)을 그리지 않으며
 * 그 밖의 포털 대화 상자(테스트 케이스 편집 창)는 `EditorActiveContext` 가 거짓일 때 그리지 않는다.
 * 요청한 세트를 못 불러온 탭은 빈 탭이다(`currentOf`) — 포털 파라미터가 그 탭을 다시 쓴다.
 * 세트 고르기는 따로 위 바를 두지 않고 편집기 툴바 줄 맨 앞(`IdPicker`)에 그대로 있다(ui:7 조정) — 고르면 `pickSet` 으로 여기 맡긴다.
 * 탭 사이 연동(`RuleSetTabsContext`): 링크로 열기(`openSet`), 고르기(`pickSet`), 쓰기 알림(`notifyWritten`·`written`),
 * 저장 안 한·확정 안 한 탭의 세트(`dirtySetIds`·`unconfirmedSetIds`), 보는 사람 설정 알림(`prefs`·`publishPrefs`).
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { ClosableTabs, type ClosableTabItem } from "@dk-oasis/shared/closable-tabs";
import { MdmPageLayout, normVer, useMdmPageParams } from "@/shell";

import { loadFlag, loadVarDisplay, storeKeys } from "./debugger/local-store";
import { RuleSetEditor } from "./RuleSetEditor";
import { RSF_CSS, RSF_STYLE_HREF } from "./rsf-styles";
import { RuleSetTabsContext, type RuleSetTabsApi, type ViewPrefs } from "./tabs-context";
import {
  CLOSE_CONFIRM, closeTab, currentOf, dirtySetIds, initialTabs, openFromParams, openLinked, pickInTab, selectTab, unconfirmedSetIds, withStatus,
  type TabStatus, type TabsResult, type TabsState,
} from "./tabs-model";

export { RuleSetTabsContext, type RuleSetTabsApi, type ViewPrefs } from "./tabs-context";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";

export function RuleSetTabs({ tabId }: { tabId?: string }) {
  const [tabs, setTabs] = useState<TabsState>(initialTabs);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [message, setMessage] = useState<string | null>(null);
  const [written, setWritten] = useState<{ setId: string; seq: number } | null>(null);
  const [prefs, setPrefs] = useState<ViewPrefs>(() => ({ varDisplay: loadVarDisplay(), miniMap: loadFlag(storeKeys.miniMap, true), seq: 0 }));

  /** 탭 목록을 바꾸고 메시지 줄을 그 결과로 맞춘다(상한 문구는 다음 동작이 지운다). */
  const apply = useCallback((r: TabsResult) => {
    tabsRef.current = r.state;
    setTabs(r.state);
    setMessage(r.message);
  }, []);

  // 포털 파라미터(룰 세트 화면의 등록·목록 링크) — 세트 없는 탭 하나뿐이면 그 탭에서, 아니면 링크처럼 연다(spec §10.3).
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) apply(openFromParams(tabsRef.current, params.setId, normVer(params.ver)));
  });

  const openSet = useCallback((setId: string) => apply(openLinked(tabsRef.current, setId)), [apply]);
  const pickSet = useCallback(
    (tabKey: string, setId: string, ver?: string | null) => {
      const r = pickInTab(tabsRef.current, tabKey, setId, ver ?? null);
      apply(r);
      return r.state.active;
    },
    [apply],
  );
  const notifyWritten = useCallback((setId: string) => setWritten((w) => ({ setId, seq: (w?.seq ?? 0) + 1 })), []);
  const publishPrefs = useCallback(
    (p: Partial<Pick<ViewPrefs, "varDisplay" | "miniMap">>) => setPrefs((cur) => ({ ...cur, ...p, seq: cur.seq + 1 })),
    [],
  );
  // 편집기 알림 — 참조가 바뀌지 않아야 편집기의 알림 효과가 렌더마다 다시 돌지 않는다.
  const onStatus = useCallback((key: string, st: TabStatus) => {
    setTabs((s) => {
      const next = withStatus(s, key, st);
      tabsRef.current = next;
      return next;
    });
  }, []);
  const onSelect = useCallback((key: string) => apply({ state: selectTab(tabsRef.current, key), message: null }), [apply]);
  const onClose = useCallback(
    (key: string) => {
      const t = tabsRef.current.tabs.find((x) => x.key === key);
      if (t?.dirty && typeof window !== "undefined" && !window.confirm(CLOSE_CONFIRM)) return;
      apply({ state: closeTab(tabsRef.current, key), message: null });
    },
    [apply],
  );

  const dirty = useMemo(() => dirtySetIds(tabs), [tabs]);
  const unconfirmed = useMemo(() => unconfirmedSetIds(tabs), [tabs]);
  const api = useMemo<RuleSetTabsApi>(
    () => ({ openSet, pickSet, notifyWritten, written, dirtySetIds: dirty, unconfirmedSetIds: unconfirmed, prefs, publishPrefs }),
    [openSet, pickSet, notifyWritten, written, dirty, unconfirmed, prefs, publishPrefs],
  );

  const items = useMemo<ClosableTabItem[]>(
    () =>
      tabs.tabs.map((t) => ({
        key: t.key,
        label: currentOf(t) ?? "새 탭",
        title: t.setName ?? undefined,
        dirty: t.dirty,
      })),
    [tabs.tabs],
  );
  const renderPanel = (item: ClosableTabItem) => {
    const t = tabs.tabs.find((x) => x.key === item.key);
    return <RuleSetEditor tabKey={item.key} request={t?.request ?? null} onStatus={onStatus} active={item.key === tabs.active} />;
  };

  return (
    <>
      {/* 화면 스타일 — 포털이 dist 의 page.css 를 불러오지 않으므로 문서 head 에 한 번만 넣는다(React 19 precedence, href 로 중복 제거). */}
      <style href={RSF_STYLE_HREF} precedence="default">
        {RSF_CSS}
      </style>
      <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 세트 편집">
        <RuleSetTabsContext.Provider value={api}>
          <ClosableTabs
            items={items}
            activeKey={tabs.active}
            onSelect={onSelect}
            onClose={onClose}
            renderPanel={renderPanel}
            message={message}
            ariaLabel="열린 룰 세트"
            testIdPrefix="set-tab"
          />
        </RuleSetTabsContext.Provider>
      </MdmPageLayout>
    </>
  );
}
