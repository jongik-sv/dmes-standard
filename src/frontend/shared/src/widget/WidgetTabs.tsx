"use client";

/**
 * 위젯 탭 줄(스펙 §3.5). 「홈」은 늘 첫 자리이고 지우기·이름 바꾸기 불가.
 * 탭 메뉴(⋯): 이름 바꾸기·잠금·왼쪽/오른쪽·지우기, 「홈」은 잠금·기본 배치로 되돌리기만. 편집 모드에서는 이름 바꾸기만.
 * 메뉴는 Mantine 없이 그린다(바깥 누름·Escape 로 닫힘).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { HOME_TAB_ID, MAX_TABS, TAB_NAME_MAX } from "./constants";
import { WidgetStyle } from "./styles";
import type { WidgetTab } from "./types";

export interface WidgetTabsProps {
  tabs: readonly WidgetTab[];
  activeTabId: string;
  editing: boolean;
  /** 불러오기 실패 등으로 탭 메뉴·추가를 막는다. */
  menuDisabled?: boolean;
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
  const [menu, setMenu] = useState<{ tabId: string; left: number; top: number } | null>(null);

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
          onClick={() => props.onSelect(t.tabId)}
          onKeyDown={(e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && props.onSelect(t.tabId)}
        >
          {renamingTabId === t.tabId ? (
            <RenameInput tab={t} onCommit={(name) => props.onRenameCommit(t.tabId, name)} onCancel={props.onRenameCancel} />
          ) : (
            <span>{t.name}</span>
          )}
          {t.locked && <span className="cm-widget-tab__lock" title="잠긴 탭">🔒</span>}
          {!menuDisabled && (
            <button
              type="button"
              className="cm-widget-tab__more"
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
        title={`새 탭 (최대 ${MAX_TABS}개)`}
        aria-label="새 탭"
        disabled={menuDisabled || tabs.length >= MAX_TABS}
        onClick={props.onAdd}
      >
        +
      </button>
      <div className="cm-widget-tabs__trailing">{trailing}</div>
      {menu && menuTab && (
        <div className="cm-widget-menu" role="menu" style={{ position: "fixed", left: menu.left, top: menu.top }} onClick={(e) => e.stopPropagation()}>
          {menuTab.tabId === HOME_TAB_ID ? (
            <>
              <button type="button" role="menuitem" disabled={editing} onClick={run(() => props.onToggleLock(menuTab.tabId))}>
                {menuTab.locked ? "잠금 풀기" : "탭 잠그기"}
              </button>
              <hr />
              <button type="button" role="menuitem" disabled={editing} onClick={run(props.onResetHome)}>
                기본 배치로 되돌리기
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={run(() => props.onRenameStart(menuTab.tabId))}>
                이름 바꾸기
              </button>
              <button type="button" role="menuitem" disabled={editing} onClick={run(() => props.onToggleLock(menuTab.tabId))}>
                {menuTab.locked ? "잠금 풀기" : "탭 잠그기"}
              </button>
              <button type="button" role="menuitem" disabled={editing || menuIndex <= 1} onClick={run(() => props.onMove(menuTab.tabId, -1))}>
                왼쪽으로
              </button>
              <button type="button" role="menuitem" disabled={editing || menuIndex >= tabs.length - 1} onClick={run(() => props.onMove(menuTab.tabId, 1))}>
                오른쪽으로
              </button>
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
