"use client";

/**
 * 위젯 작업 공간 — 탭 줄 + 보드 + [위젯 추가] 서랍 + 편집 흐름(스펙 §3·§4.3·§6).
 * - 저장은 주입받은 WidgetStore 로 한다. [완료]는 편집 시작 이후 바뀐 탭만 saveTab 한다.
 * - 보기 모드 탭 메뉴 작업(이름·잠금·옮기기·지우기·홈 되돌리기)은 바로 저장하고, 실패하면 화면을 되돌린다.
 * - 편집 모드 탭 메뉴는 이름 바꾸기만(이름은 [완료] 때 저장). (+) 새 탭은 편집 모드로 만들고 [취소]면 사라진다.
 * - 불러오기 실패면 기본 「홈」을 보이고 [배치 편집]을 막는다(빈 상태로 덮어쓰지 않게).
 * - 정의 위젯 목록(registryStatus)이 loading·error 면 [배치 편집]과 (+) 새 탭(둘 다 편집 진입로)·탭 메뉴를 막고, error 면 띠를 보인다(스펙 widget-admin-generic §1.1·W-D19).
 * - singleTab 이면 탭 줄 대신 제목을 보이고 「홈」 하나만 다룬다(관리자 기본 배치 편집, 스펙 §10.2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContainerWidth } from "react-grid-layout";

import { useMessage } from "../components/message-provider";
import { HOME_TAB_ID, MAX_TABS, WIDGET_COLS } from "./constants";
import { WidgetBoard } from "./WidgetBoard";
import { WidgetPicker } from "./WidgetPicker";
import { WidgetStyle } from "./styles";
import { WidgetTabs } from "./WidgetTabs";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "./types";
import {
  addItem,
  canAddWidget,
  colsForWidth,
  homeTab,
  newInstanceId,
  nextTabId,
  sanitizeLayout,
  tabsEqual,
  validateTabName,
  validateWidgetMeta,
} from "./widget-layout";

export interface WidgetWorkspaceProps {
  registry: WidgetRegistry;
  homeDefault: readonly WidgetItem[];
  store: WidgetStore;
  /** 마지막 탭 기억 키(localStorage dmes:widget:lastTab:{userId}). */
  userId?: string | null;
  confirm?: (title: string, message: string) => Promise<boolean>;
  notify?: (message: string, kind: "success" | "error") => void;
  /** 시험용 고정 폭 — 보드(react-grid-layout)에 넘기는 픽셀 폭. */
  boardWidth?: number;
  /** 시험용 고정 폭 — 서랍 자리까지 포함한 바깥 폭. 칸 수·편집 가능 판정에 쓴다(없으면 boardWidth, 그것도 없으면 잰 폭). */
  workspaceWidth?: number;
  testId?: string;
  /**
   * 정의 위젯 목록(widgetDef/list) 상태(기본 "ready"). "loading"·"error" 면 [배치 편집]을 막는다 —
   * 정의 위젯이 「없는 위젯」으로 보이는 상태에서 저장하면 사용자 배치에서 지워지기 때문이다(스펙 widget-admin-generic §1.1·W-D19).
   * "error" 면 탭 줄 위에 「위젯 정의를 불러오지 못했습니다」 띠와 [다시 시도](onRetryRegistry 가 있을 때)를 보인다.
   */
  registryStatus?: "ready" | "loading" | "error";
  /** registryStatus="error" 띠의 [다시 시도]. 없으면 버튼을 그리지 않는다. */
  onRetryRegistry?: () => void;
  /** 위젯 유형 ID → 이름("query-table" → "쿼리 표"). [위젯 추가] 서랍이 정의 위젯 옆에 작은 글씨로 보인다. */
  typeTitles?: Readonly<Record<string, string>>;
  /** 탭 줄을 숨기고 「홈」 탭 하나만 다룬다 — 관리자 기본 배치 편집용. title 은 보드 위 제목. */
  singleTab?: { title: string };
}

type LoadStatus = "loading" | "ready" | "error";

/** MessageProvider 밖(시험 등)이면 null. useMessage 는 Provider 밖에서 던진다. */
function useOptionalMessage() {
  try {
    return useMessage();
  } catch {
    return null;
  }
}

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "요청을 처리하지 못했습니다.");
const lastTabKey = (userId?: string | null) => (userId ? `dmes:widget:lastTab:${userId}` : null);

function readLastTab(userId?: string | null): string | null {
  const key = lastTabKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLastTab(userId: string | null | undefined, tabId: string) {
  const key = lastTabKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, tabId);
  } catch {
    /* 사적 창 등 — 기억하지 않는다 */
  }
}

export function WidgetWorkspace({
  registry,
  homeDefault,
  store,
  userId,
  confirm,
  notify,
  boardWidth,
  workspaceWidth,
  testId,
  registryStatus = "ready",
  onRetryRegistry,
  typeTitles,
  singleTab,
}: WidgetWorkspaceProps) {
  const message = useOptionalMessage();
  // singleTab 은 화면이 렌더마다 새 객체로 넘기기 쉬우므로 불러오기 의존성에는 있고 없음만 쓴다.
  const single = singleTab != null;
  // 단일 탭(관리자 기본 배치)은 마지막 탭을 기억하지 않는다.
  const memoUserId = single ? null : userId;
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tabs, setTabs] = useState<WidgetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetTab[] | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  // 칸 수는 서랍 자리까지 포함한 바깥 폭으로 정한다 — 서랍이 보드 폭을 줄여도 칸 수가 바뀌지 않게(D1).
  const outer = useContainerWidth({ initialWidth: workspaceWidth ?? boardWidth ?? 1280 });
  const cols = colsForWidth(workspaceWidth ?? boardWidth ?? outer.width);
  const wide = cols === WIDGET_COLS;
  const [saving, setSaving] = useState(false);
  const loadSeq = useRef(0);

  const ask = useCallback(
    (title: string, text: string): Promise<boolean> => {
      if (confirm) return confirm(title, text);
      if (!message) return Promise.resolve(window.confirm(`${title}\n${text}`));
      return new Promise((resolve) =>
        message.showMessage({ title, message: text, alertType: "confirm", onConfirm: () => resolve(true), onCancel: () => resolve(false) })
      );
    },
    [confirm, message]
  );
  const tell = useCallback(
    (text: string, kind: "success" | "error") => {
      if (notify) return notify(text, kind);
      message?.showMessage({ message: text, alertType: kind === "error" ? "error" : "success", toast: true });
    },
    [notify, message]
  );

  // 등록부 메타 검사(크기 범위 등) — 개발 중 알림용.
  useEffect(() => {
    for (const entry of Object.values(registry)) {
      for (const p of validateWidgetMeta(entry.meta)) console.error(`[widget] ${p}`);
    }
  }, [registry]);

  const defaultHome = useCallback(() => homeTab(sanitizeLayout(homeDefault, registry)), [homeDefault, registry]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setStatus("loading");
    // 다시 불러오면 편집 중이던 변경은 버려진다 — 편집 상태도 함께 정리한다.
    setEditing(false);
    setSnapshot(null);
    setRenamingTabId(null);
    try {
      const loaded = await store.load();
      if (seq !== loadSeq.current) return;
      const cleaned = loaded.map((t) => ({ ...t, items: sanitizeLayout(t.items, registry) }));
      const home = cleaned.find((t) => t.tabId === HOME_TAB_ID);
      // 단일 탭이면 「홈」만 다룬다 — 다른 탭은 상태에 두지 않으므로 저장되지도 않는다.
      const others = single ? [] : cleaned.filter((t) => t.tabId !== HOME_TAB_ID).sort((a, b) => a.seq - b.seq);
      const next = [home ? { ...home, name: homeTab([]).name, seq: 0 } : defaultHome(), ...others];
      setTabs(next);
      const last = readLastTab(memoUserId);
      setActiveTabId(last && next.some((t) => t.tabId === last) ? last : HOME_TAB_ID);
      setStatus("ready");
    } catch {
      if (seq !== loadSeq.current) return;
      setTabs([defaultHome()]);
      setActiveTabId(HOME_TAB_ID);
      setStatus("error");
    }
  }, [store, registry, defaultHome, memoUserId, single]);

  useEffect(() => {
    void load();
    return () => {
      loadSeq.current += 1;
    };
  }, [load]);

  const active = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0];
  const setActiveItems = (items: WidgetItem[]) =>
    setTabs((prev) => prev.map((t) => (t.tabId === active?.tabId ? { ...t, items } : t)));

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId);
    writeLastTab(memoUserId, tabId);
  };

  /* ── 편집 흐름 ── */
  const startEdit = () => {
    setSnapshot(tabs.map((t) => ({ ...t, items: [...t.items] })));
    setEditing(true);
  };
  const changedTabs = useMemo(() => {
    if (!snapshot) return [];
    return tabs.filter((t) => {
      const before = snapshot.find((s) => s.tabId === t.tabId);
      return !before || !tabsEqual(before, t);
    });
  }, [tabs, snapshot]);

  const finishEdit = () => {
    setEditing(false);
    setSnapshot(null);
    setRenamingTabId(null);
  };

  // 정의 목록이 준비되지 않았으면 저장을 막는다 — 정의 위젯이 「없는 위젯」인 상태의 저장은 사용자 배치를 지운다(W-D19).
  const registryReady = registryStatus === "ready";

  const doneEdit = async () => {
    if (status !== "ready" || !registryReady) return;
    setSaving(true);
    try {
      for (const t of changedTabs) {
        const seq = tabs.indexOf(t);
        const saved = { ...t, seq };
        await store.saveTab(saved);
        // 저장된 탭은 되돌릴 기준(snapshot)도 새 값으로 — 뒤 탭이 실패해도 [취소]가 저장된 탭을 되돌리지 않는다.
        setSnapshot((prev) => (prev ? (prev.some((s) => s.tabId === saved.tabId) ? prev.map((s) => (s.tabId === saved.tabId ? saved : s)) : [...prev, saved]) : prev));
      }
      finishEdit();
      if (changedTabs.length > 0) tell("배치를 저장했습니다.", "success");
    } catch (e) {
      tell(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    if (saving) return;
    if (changedTabs.length > 0 && !(await ask("변경 내용을 버릴까요?", "배치 편집을 시작한 뒤 바꾼 내용이 모두 사라집니다."))) return;
    const restored = snapshot ?? tabs;
    setTabs(restored);
    if (!restored.some((t) => t.tabId === activeTabId)) setActiveTabId(HOME_TAB_ID);
    finishEdit();
  };

  // Escape — 편집 취소(입력 칸·메뉴 안에서 누른 Escape 는 그쪽이 처리한다).
  const cancelRef = useRef(cancelEdit);
  cancelRef.current = cancelEdit;
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "Escape" || t?.closest("input, textarea, [role='menu'], [role='dialog']")) return;
      void cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  /* ── 탭 작업 ── */
  // (+) 새 탭도 편집 모드로 들어가는 길이다 — 정의 목록이 준비되지 않았으면 [배치 편집]처럼 막는다(W-D19).
  const addTab = () => {
    if (saving || tabs.length >= MAX_TABS || !registryReady) return;
    const tabId = nextTabId(tabs);
    let name = "새 탭";
    for (let n = 2; tabs.some((t) => t.name === name); n += 1) name = `새 탭 ${n}`;
    if (!editing) startEdit();
    setTabs((prev) => [...prev, { tabId, name, seq: prev.length, locked: false, items: [] }]);
    setActiveTabId(tabId);
    setRenamingTabId(tabId);
  };

  /** 보기 모드 즉시 저장 — 먼저 화면에 반영하고 실패하면 되돌린다. */
  const saveNow = async (next: WidgetTab[], persist: () => Promise<void>) => {
    const before = tabs;
    setTabs(next);
    try {
      await persist();
    } catch (e) {
      setTabs(before);
      tell(errMsg(e), "error");
    }
  };

  const renameCommit = (tabId: string, name: string): string | null => {
    if (saving) return null; // 저장 중 바뀐 이름은 저장 대상에서 빠지므로 반영하지 않는다.
    const error = validateTabName(name, tabs, tabId);
    if (error) return error;
    const value = name.trim();
    setRenamingTabId(null);
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, name: value } : t));
    if (editing) setTabs(next);
    else {
      const tab = next.find((t) => t.tabId === tabId)!;
      void saveNow(next, () => store.saveTab({ ...tab, seq: next.indexOf(tab) }));
    }
    return null;
  };

  const toggleTabLock = (tabId: string) => {
    const next = tabs.map((t) => (t.tabId === tabId ? { ...t, locked: !t.locked } : t));
    const tab = next.find((t) => t.tabId === tabId)!;
    void saveNow(next, () => store.saveTab({ ...tab, seq: next.indexOf(tab) }));
  };

  const moveTab = (tabId: string, dir: -1 | 1) => {
    const i = tabs.findIndex((t) => t.tabId === tabId);
    const j = i + dir;
    if (i <= 0 || j <= 0 || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    void saveNow(next, () => store.reorderTabs(next.filter((t) => t.tabId !== HOME_TAB_ID).map((t) => t.tabId)));
  };

  const deleteTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || tabId === HOME_TAB_ID) return;
    if (!(await ask("탭을 지울까요?", `「${tab.name}」 탭과 위젯 ${tab.items.length}개를 지웁니다.`))) return;
    const next = tabs.filter((t) => t.tabId !== tabId);
    if (activeTabId === tabId) selectTab(HOME_TAB_ID);
    await saveNow(next, () => store.deleteTab(tabId));
  };

  const resetHome = async () => {
    if (!(await ask("기본 배치로 되돌릴까요?", "「홈」 탭의 내 배치를 지우고 기본 배치로 돌아갑니다."))) return;
    const next = tabs.map((t) => (t.tabId === HOME_TAB_ID ? defaultHome() : t));
    await saveNow(next, () => store.resetHome());
  };

  // 서랍에서 눌러 추가한 위젯으로 스크롤한다(스펙 §3.4). 격자가 칸을 그리는 시점이 한 박자 늦을 수 있어 찾을 때까지 몇 프레임 다시 본다.
  const scrollToRef = useRef<string | null>(null);
  useEffect(() => {
    const instId = scrollToRef.current;
    if (!instId) return;
    let tries = 0;
    let frame = 0;
    const seek = () => {
      const el = outer.containerRef.current?.querySelector<HTMLElement>(`[data-inst-id="${instId}"]`);
      if (el) {
        if (scrollToRef.current === instId) scrollToRef.current = null;
        el.scrollIntoView({ block: "nearest" });
      } else if ((tries += 1) < 10) {
        frame = requestAnimationFrame(seek);
      }
    };
    seek();
    return () => cancelAnimationFrame(frame);
  }, [tabs, outer.containerRef]);

  const addFromPicker = (widgetId: string) => {
    const meta = registry[widgetId]?.meta;
    if (!active || !meta || !canAddWidget(active.items, meta)) return;
    const instId = newInstanceId();
    scrollToRef.current = instId;
    setActiveItems(addItem(active.items, widgetId, meta, instId));
  };

  if (status === "loading" || !active) {
    return (
      <div ref={outer.containerRef} className="cm-widget-ws" data-testid={testId} aria-busy="true">
        <WidgetStyle />
        {single ? (
          <div className="cm-widget-ws__head">
            <h3 className="cm-widget-ws__title">{singleTab.title}</h3>
          </div>
        ) : (
          <div className="cm-widget-tabs" />
        )}
        <div className="cm-widget__skeleton">
          <i style={{ width: "40%" }} />
          <i />
          <i style={{ width: "70%" }} />
        </div>
      </div>
    );
  }

  const editBlockedReason =
    status === "error"
      ? "저장한 위젯 화면을 불러오지 못해 편집할 수 없습니다"
      : registryStatus === "loading"
        ? "위젯 목록을 불러오는 중입니다"
        : registryStatus === "error"
          ? "위젯 정의를 불러오지 못했습니다"
          : !wide
            ? "넓은 화면에서 편집할 수 있습니다"
            : active.locked
              ? "잠긴 탭입니다. 탭 메뉴에서 잠금을 풀어 주세요."
              : null;

  const trailing = editing ? (
    <>
      <span className="cm-widget-ws__hint">배치 편집 중</span>
      <button type="button" className="cm-widget-ws__btn" data-action="cancel-edit" disabled={saving} onClick={() => void cancelEdit()}>
        취소
      </button>
      <button type="button" className="cm-widget-ws__btn cm-widget-ws__btn--primary" data-action="done-edit" disabled={saving || status !== "ready" || !registryReady} onClick={() => void doneEdit()}>
        {saving ? "저장 중…" : "완료"}
      </button>
    </>
  ) : (
    <button
      type="button"
      className="cm-widget-ws__btn"
      data-action="start-edit"
      disabled={editBlockedReason != null}
      title={editBlockedReason ?? "위젯을 옮기고 크기를 바꿉니다"}
      onClick={startEdit}
    >
      ✎ 배치 편집
    </button>
  );

  return (
    <div ref={outer.containerRef} className="cm-widget-ws" data-testid={testId}>
      <WidgetStyle />
      {status === "error" && (
        <div className="cm-widget-ws__banner" role="alert">
          저장한 위젯 화면을 불러오지 못했습니다.
          <button type="button" className="cm-widget-ws__btn" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      {registryStatus === "error" && (
        <div className="cm-widget-ws__banner" role="alert" data-testid={testId ? `${testId}-registry-error` : undefined}>
          위젯 정의를 불러오지 못했습니다
          {onRetryRegistry && (
            <button type="button" className="cm-widget-ws__btn" data-action="retry-registry" onClick={onRetryRegistry}>
              다시 시도
            </button>
          )}
        </div>
      )}
      {single ? (
        <div className="cm-widget-ws__head">
          <h3 className="cm-widget-ws__title">{singleTab.title}</h3>
          <div className="cm-widget-ws__head-trailing">{trailing}</div>
        </div>
      ) : (
        <WidgetTabs
          tabs={tabs}
          activeTabId={active.tabId}
          editing={editing}
          menuDisabled={status === "error" || saving}
          // 정의 목록이 loading·error 면 (+) 새 탭(편집 진입로)만 막는다 — ⋯ 탭 메뉴는 보기 모드에서 그대로 쓴다.
          addDisabled={!registryReady}
          addTitle={registryStatus === "loading" ? "위젯 목록을 불러오는 중입니다" : registryStatus === "error" ? "위젯 정의를 불러오지 못했습니다" : undefined}
          renamingTabId={renamingTabId}
          onSelect={selectTab}
          onAdd={addTab}
          onRenameStart={setRenamingTabId}
          onRenameCommit={renameCommit}
          onRenameCancel={() => setRenamingTabId(null)}
          onToggleLock={toggleTabLock}
          onMove={moveTab}
          onDelete={(id) => void deleteTab(id)}
          onResetHome={() => void resetHome()}
          trailing={trailing}
        />
      )}
      <div className="cm-widget-ws__body">
        <div className="cm-widget-ws__board">
          <WidgetBoard
            items={active.items}
            registry={registry}
            editing={editing}
            tabLocked={active.locked || saving}
            onChange={setActiveItems}
            cols={cols}
            width={boardWidth}
          />
        </div>
        {editing && !saving && wide && !active.locked && (
          <WidgetPicker registry={registry} items={active.items} onAdd={addFromPicker} typeTitles={typeTitles} />
        )}
      </div>
    </div>
  );
}
