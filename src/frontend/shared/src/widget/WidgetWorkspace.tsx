"use client";

/**
 * 위젯 작업 공간 — 탭 줄 + 보드 + [위젯 추가] 서랍 + 편집 흐름(스펙 §3·§4.3·§6).
 * - 저장은 주입받은 WidgetStore 로 한다. [완료]는 편집 시작 이후 바뀐 탭만 saveTab 한다.
 * - 보기 모드 탭 메뉴 작업(이름·잠금·옮기기·지우기·홈 되돌리기)은 바로 저장하고, 실패하면 화면을 되돌린다.
 * - 편집 모드 탭 메뉴는 이름 바꾸기만(이름은 [완료] 때 저장). (+) 새 탭은 편집 모드로 만들고 [취소]면 사라진다.
 * - 불러오기 실패면 기본 「홈」을 보이고 [배치 편집]을 막는다(빈 상태로 덮어쓰지 않게).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMessage } from "../components/message-provider";
import { HOME_TAB_ID, MAX_TABS } from "./constants";
import { WidgetBoard } from "./WidgetBoard";
import { WidgetPicker } from "./WidgetPicker";
import { WidgetStyle } from "./styles";
import { WidgetTabs } from "./WidgetTabs";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "./types";
import {
  addItem,
  canAddWidget,
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
  /** 시험용 고정 폭. */
  boardWidth?: number;
  testId?: string;
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

export function WidgetWorkspace({ registry, homeDefault, store, userId, confirm, notify, boardWidth, testId }: WidgetWorkspaceProps) {
  const message = useOptionalMessage();
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tabs, setTabs] = useState<WidgetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetTab[] | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
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
      const others = cleaned.filter((t) => t.tabId !== HOME_TAB_ID).sort((a, b) => a.seq - b.seq);
      const next = [home ? { ...home, name: homeTab([]).name, seq: 0 } : defaultHome(), ...others];
      setTabs(next);
      const last = readLastTab(userId);
      setActiveTabId(last && next.some((t) => t.tabId === last) ? last : HOME_TAB_ID);
      setStatus("ready");
    } catch {
      if (seq !== loadSeq.current) return;
      setTabs([defaultHome()]);
      setActiveTabId(HOME_TAB_ID);
      setStatus("error");
    }
  }, [store, registry, defaultHome, userId]);

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
    writeLastTab(userId, tabId);
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

  const doneEdit = async () => {
    if (status !== "ready") return;
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
      if (e.key !== "Escape" || t?.closest("input, textarea, [role='menu']")) return;
      void cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  /* ── 탭 작업 ── */
  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
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
    const next = tabs.map((t) => (t.tabId === HOME_TAB_ID ? { ...defaultHome(), locked: t.locked } : t));
    await saveNow(next, () => store.resetHome());
  };

  const addFromPicker = (widgetId: string) => {
    const meta = registry[widgetId]?.meta;
    if (!active || !meta || !canAddWidget(active.items, meta)) return;
    setActiveItems(addItem(active.items, widgetId, meta, newInstanceId()));
  };

  if (status === "loading" || !active) {
    return (
      <div className="cm-widget-ws" data-testid={testId} aria-busy="true">
        <WidgetStyle />
        <div className="cm-widget-tabs" />
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
      <button type="button" className="cm-widget-ws__btn cm-widget-ws__btn--primary" data-action="done-edit" disabled={saving || status !== "ready"} onClick={() => void doneEdit()}>
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
    <div className="cm-widget-ws" data-testid={testId}>
      <WidgetStyle />
      {status === "error" && (
        <div className="cm-widget-ws__banner" role="alert">
          저장한 위젯 화면을 불러오지 못했습니다.
          <button type="button" className="cm-widget-ws__btn" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      <WidgetTabs
        tabs={tabs}
        activeTabId={active.tabId}
        editing={editing}
        menuDisabled={status === "error"}
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
      <div className="cm-widget-ws__body">
        <div className="cm-widget-ws__board">
          <WidgetBoard
            items={active.items}
            registry={registry}
            editing={editing}
            tabLocked={active.locked}
            onChange={setActiveItems}
            onWideChange={setWide}
            width={boardWidth}
          />
        </div>
        {editing && wide && !active.locked && <WidgetPicker registry={registry} items={active.items} onAdd={addFromPicker} />}
      </div>
    </div>
  );
}
