"use client";

/**
 * 위젯 탭 줄(스펙 §3.5). 「홈」은 늘 첫 자리이고 지우기·이름 바꾸기 불가.
 * 탭 메뉴(⋯): 이름 바꾸기·잠금·왼쪽/오른쪽·지우기, 「홈」은 잠금·기본 배치로 되돌리기만. 편집 모드에서는 이름 바꾸기만.
 * 기본 탭(defaultTab, widget-tabs)은 「홈」처럼 고정 탭이다 — 잠금·기본으로 되돌리기(onResetTab, customized 일 때만)만.
 * 일반 탭은 고정 탭 앞으로 옮길 수 없다. 공유(onShare)·내보내기(onExport)·가져오기(onImport, (+) 옆)는 핸들러가 있을 때만 그린다.
 * mode="admin"(관리자 기본 탭 편집)이면 잠그기·홈 되돌리기를 숨기고, 메뉴가 빈 「홈」에는 ⋯ 를 그리지 않는다.
 * 메뉴는 Mantine 없이 그린다(바깥 누름·Escape 로 닫힘).
 * 탭 메뉴·⋯ 단추·(+)·가져오기는 data-print-hide 를 달아 화면 PDF(printElementAsPage)에 찍히지 않게 한다. 메뉴를 연 채 [PDF] 를 눌러도
 * (PDF 단추의 클릭이 메뉴를 닫기 전에 인쇄가 시작된다) 메뉴가 찍히지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { HOME_TAB_ID, MAX_TABS, TAB_NAME_MAX } from "./constants";
import { WidgetStyle } from "./styles";
import type { WidgetTab } from "./types";
import { fixedTabCount } from "./widget-layout";

export interface WidgetTabsProps {
  tabs: readonly WidgetTab[];
  activeTabId: string;
  editing: boolean;
  /** 불러오기 실패 등으로 탭 메뉴(⋯)와 (+) 를 막는다. */
  menuDisabled?: boolean;
  /** (+) 새 탭만 막는다(⋯ 탭 메뉴는 그대로). 정의 목록이 준비되지 않았을 때처럼 편집 진입로만 닫을 때 쓴다. */
  addDisabled?: boolean;
  /** (+) 의 title. 없으면 「새 탭 (최대 N개)」. addDisabled 이유를 알릴 때 넘긴다. */
  addTitle?: string;
  renamingTabId: string | null;
  onSelect: (tabId: string) => void;
  onAdd: () => void;
  onRenameStart: (tabId: string) => void;
  /** 오류 문구를 돌려주면 입력 칸을 유지하고 문구를 보인다. */
  onRenameCommit: (tabId: string, name: string) => string | null;
  onRenameCancel: () => void;
  onToggleLock: (tabId: string) => void;
  onMove: (tabId: string, dir: -1 | 1) => void;
  onDelete: (tabId: string) => void;
  onResetHome: () => void;
  trailing?: ReactNode;
  /** "admin" 이면 잠그기·「홈」 되돌리기를 숨긴다(관리자 기본 탭 편집). 기본 "user". */
  mode?: "user" | "admin";
  /** (+)·가져오기 한도. 기본 MAX_TABS. */
  maxTabs?: number;
  /** 기본 탭의 「기본으로 되돌리기」. 없으면 항목이 없다. 탭이 customized 일 때만 켜진다. */
  onResetTab?: (tabId: string) => void;
  /** 「공유…」. 없으면 항목이 없다. */
  onShare?: (tabId: string) => void;
  /** 「내보내기」. 없으면 항목이 없다. */
  onExport?: (tabId: string) => void;
  /** (+) 옆 「가져오기」 — 고른 파일을 넘긴다. 없으면 단추가 없다. */
  onImport?: (file: File) => void;
  /** 가져오기만 막는다(편집 중·정의 목록 준비 전 등). */
  importDisabled?: boolean;
  /** 가져오기 title. 없으면 「탭 가져오기(JSON 파일)」. */
  importTitle?: string;
}

function RenameInput({ tab, onCommit, onCancel }: { tab: WidgetTab; onCommit: (name: string) => string | null; onCancel: () => void }) {
  const [value, setValue] = useState(tab.name);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  /** Escape·성공 확정 뒤 입력 칸이 사라지며 나는 blur 로 다시 확정되지 않게 한다. */
  const doneRef = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (doneRef.current) return;
    const message = onCommit(value);
    if (message === null) doneRef.current = true;
    setError(message);
  };
  return (
    <>
      <input
        ref={ref}
        className="cm-widget-tab__name"
        value={value}
        maxLength={TAB_NAME_MAX}
        aria-label="탭 이름"
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            doneRef.current = true;
            onCancel();
          }
        }}
        onBlur={commit}
      />
      {error && <span className="cm-widget-tab__error" role="alert">{error}</span>}
    </>
  );
}

export function WidgetTabs(props: WidgetTabsProps) {
  const { tabs, activeTabId, editing, menuDisabled, renamingTabId, trailing } = props;
  const admin = props.mode === "admin";
  const maxTabs = props.maxTabs ?? MAX_TABS;
  const fixedCount = fixedTabCount(tabs);
  const [menu, setMenu] = useState<{ tabId: string; left: number; top: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 관리자 화면의 「홈」은 메뉴 항목이 하나도 없다(잠그기·되돌리기 숨김, 이름·지우기 불가).
  const hasMenu = (t: WidgetTab) => !(admin && t.tabId === HOME_TAB_ID);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const menuTab = menu ? tabs.find((t) => t.tabId === menu.tabId) : undefined;
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1;
  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };

  const lockItem = (t: WidgetTab) =>
    admin ? null : (
      <button type="button" role="menuitem" disabled={editing} onClick={run(() => props.onToggleLock(t.tabId))}>
        {t.locked ? "잠금 풀기" : "탭 잠그기"}
      </button>
    );
  // 공유·내보내기는 저장된 배치를 다루므로 편집 중에는 막는다.
  const shareItems = (t: WidgetTab) =>
    admin || (!props.onShare && !props.onExport) ? null : (
      <>
        <hr />
        {props.onShare && (
          <button type="button" role="menuitem" data-menu="share" disabled={editing} onClick={run(() => props.onShare!(t.tabId))}>
            공유…
          </button>
        )}
        {props.onExport && (
          <button type="button" role="menuitem" data-menu="export" disabled={editing} onClick={run(() => props.onExport!(t.tabId))}>
            내보내기
          </button>
        )}
      </>
    );

  return (
    <div className="cm-widget-tabs" role="tablist" aria-label="위젯 탭">
      <WidgetStyle />
      {tabs.map((t) => (
        <div
          key={t.tabId}
          role="tab"
          tabIndex={0}
          aria-selected={t.tabId === activeTabId}
          className="cm-widget-tab"
          data-tab-id={t.tabId}
          data-default-tab={t.defaultTab ? "" : undefined}
          title={t.defaultTab ? "관리자가 제공하는 기본 탭입니다(이름·순서는 바꿀 수 없습니다)" : undefined}
          onClick={() => props.onSelect(t.tabId)}
          onKeyDown={(e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && props.onSelect(t.tabId)}
        >
          {renamingTabId === t.tabId ? (
            <RenameInput tab={t} onCommit={(name) => props.onRenameCommit(t.tabId, name)} onCancel={props.onRenameCancel} />
          ) : (
            <span>{t.name}</span>
          )}
          {t.locked && <span className="cm-widget-tab__lock" title="잠긴 탭">🔒</span>}
          {!menuDisabled && hasMenu(t) && (
            <button
              type="button"
              className="cm-widget-tab__more"
              data-print-hide=""
              data-tab-menu={t.tabId}
              aria-label={`${t.name} 탭 메뉴`}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu((m) => (m?.tabId === t.tabId ? null : { tabId: t.tabId, left: r.left, top: r.bottom + 4 }));
              }}
            >
              ⋯
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="cm-widget-tabs__add"
        data-action="add-tab"
        data-print-hide=""
        title={props.addTitle ?? `새 탭 (최대 ${maxTabs}개)`}
        aria-label="새 탭"
        disabled={menuDisabled || props.addDisabled || tabs.length >= maxTabs}
        onClick={props.onAdd}
      >
        +
      </button>
      {props.onImport && (
        <>
          <button
            type="button"
            className="cm-widget-tabs__import"
            data-action="import-tab"
            data-print-hide=""
            title={tabs.length >= maxTabs ? `탭은 최대 ${maxTabs}개까지 둘 수 있습니다` : (props.importTitle ?? "탭 가져오기(JSON 파일)")}
            disabled={menuDisabled || props.importDisabled || tabs.length >= maxTabs}
            onClick={() => fileRef.current?.click()}
          >
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-print-hide=""
            data-action="import-file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              // 같은 파일을 다시 골라도 change 가 나게 비운다.
              e.currentTarget.value = "";
              if (file) props.onImport!(file);
            }}
          />
        </>
      )}
      <div className="cm-widget-tabs__trailing">{trailing}</div>
      {menu && menuTab && (
        <div className="cm-widget-menu" role="menu" data-print-hide="" style={{ position: "fixed", left: menu.left, top: menu.top }} onClick={(e) => e.stopPropagation()}>
          {menuTab.tabId === HOME_TAB_ID ? (
            <>
              {lockItem(menuTab)}
              {!admin && (
                <>
                  <hr />
                  <button type="button" role="menuitem" disabled={editing} onClick={run(props.onResetHome)}>
                    기본 배치로 되돌리기
                  </button>
                </>
              )}
              {shareItems(menuTab)}
            </>
          ) : menuTab.defaultTab ? (
            <>
              {lockItem(menuTab)}
              {props.onResetTab && (
                <>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    data-menu="reset-tab"
                    disabled={editing || !menuTab.customized}
                    title={menuTab.customized ? undefined : "바꾼 배치가 없습니다"}
                    onClick={run(() => props.onResetTab!(menuTab.tabId))}
                  >
                    기본으로 되돌리기
                  </button>
                </>
              )}
              {shareItems(menuTab)}
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={run(() => props.onRenameStart(menuTab.tabId))}>
                이름 바꾸기
              </button>
              {lockItem(menuTab)}
              <button type="button" role="menuitem" disabled={editing || menuIndex <= fixedCount} onClick={run(() => props.onMove(menuTab.tabId, -1))}>
                왼쪽으로
              </button>
              <button type="button" role="menuitem" disabled={editing || menuIndex >= tabs.length - 1} onClick={run(() => props.onMove(menuTab.tabId, 1))}>
                오른쪽으로
              </button>
              {shareItems(menuTab)}
              <hr />
              <button type="button" role="menuitem" data-danger="true" disabled={editing} onClick={run(() => props.onDelete(menuTab.tabId))}>
                탭 지우기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
