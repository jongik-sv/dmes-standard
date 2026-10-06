"use client";

/**
 * 위젯 도크 상태 훅 — 사용자 ID 와 등록부로 떠 있는 창 목록을 들고, 불러오기·400ms 디바운스 저장·언마운트(사용자 바뀜·pagehide) 저장을 맡는다.
 * - enabled=false 면 저장소를 만들지 않고 리스너도 달지 않는다(포털 셸이 widgetDock 을 받지 않은 경우).
 * - 사용자 ID 가 없으면(확인 전·로그아웃) 창이 없고 아무것도 저장하지 않는다. isSaveBlocked()가 true(로그아웃 중)여도 저장하지 않는다.
 * - 저장소가 바뀌면(사용자 바뀜) 그 렌더부터 빈 목록으로 보고 새 사용자 것을 불러온다 — 앞 사용자의 창이 잠깐도 보이거나 저장되지 않게.
 * - 화면 크기는 상태로 들지 않는다 — 조작(열기·접기·옮기기·크기)이 호출 순간의 창 크기를 읽는다. 그릴 때 자르는 쪽은 창 층(useDockViewport)이 맡아
 *   화면 크기가 바뀌어도 이 훅을 쓰는 상위 컴포넌트가 다시 그려지지 않는다.
 * - 등록부 정리(없는·사용 중지 위젯 창 제거)는 등록부가 ready 일 때만 하고 결과를 저장한다(dock-model sanitizeDockWindows).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WidgetRegistry } from "../widget/types";
import { createBrowserDockStore } from "./browser-dock-store";
import {
  bringDockWindowToFront,
  closeDockWindow,
  isDockMenuEntry,
  listDockableEntries,
  moveDockWindow,
  openDockWindow,
  resizeDockWindow,
  sanitizeDockWindows,
  toggleDockCollapse,
  type OpenDockResult,
} from "./dock-model";
import type { DockRegistryStatus, DockWindow, WidgetDockStore } from "./types";
import { readDockViewport } from "./use-dock-viewport";

export const DOCK_SAVE_DELAY_MS = 400;

export interface UseWidgetDockOptions {
  enabled: boolean;
  /** 확인된 사용자 ID. 빈 문자열이면 사용자 없음. */
  userId: string;
  registry: WidgetRegistry;
  registryStatus: DockRegistryStatus;
  /** 없으면 사용자 ID 로 브라우저 저장소를 만든다. */
  store?: WidgetDockStore;
  /** true 를 돌려주면 저장하지 않는다(로그아웃 중 — 비운 저장소를 다시 쓰지 않게). */
  isSaveBlocked?: () => boolean;
  saveDelayMs?: number;
}

export interface WidgetDockApi {
  /** 저장값을 다 불러왔는지. 그 전에는 「도구」 메뉴가 창을 열지 않는다. */
  loaded: boolean;
  /** 상태의 창 전부(등록부 준비 전이면 아직 그릴 수 없는 창도 들어 있다). */
  windows: DockWindow[];
  open: (widgetId: string) => OpenDockResult["kind"] | "missing";
  close: (id: string) => void;
  focus: (id: string) => void;
  toggleCollapse: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
}

interface DockState {
  owner: WidgetDockStore | null;
  windows: DockWindow[];
  loaded: boolean;
  /** 사용자 조작·정리로 바뀌어 저장할 것이 있다. 불러온 직후는 false. */
  dirty: boolean;
}

const EMPTY: DockWindow[] = [];

export function useWidgetDock({
  enabled,
  userId,
  registry,
  registryStatus,
  store,
  isSaveBlocked,
  saveDelayMs = DOCK_SAVE_DELAY_MS,
}: UseWidgetDockOptions): WidgetDockApi {
  const browserStore = useMemo(
    () => (enabled && userId && !store ? createBrowserDockStore(userId) : null),
    [enabled, userId, store]
  );
  const activeStore = enabled && userId ? (store ?? browserStore) : null;

  const [rawState, setState] = useState<DockState>({
    owner: null,
    windows: EMPTY,
    loaded: false,
    dirty: false,
  });
  // 저장소가 바뀐 렌더에서는 앞 저장소의 창을 쓰지 않는다(사용자 전환 때 한 프레임도 보이지 않게).
  const state: DockState =
    rawState.owner === activeStore
      ? rawState
      : { owner: activeStore, windows: EMPTY, loaded: false, dirty: false };

  const ownerRef = useRef(activeStore);
  ownerRef.current = activeStore;
  const blockedRef = useRef(isSaveBlocked);
  blockedRef.current = isSaveBlocked;

  // ── 저장(디바운스) ──
  const pendingRef = useRef<{ store: WidgetDockStore; windows: DockWindow[] } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || blockedRef.current?.()) return;
    void pending.store.save(pending.windows).catch(() => {});
  }, []);

  // ── 불러오기 — 저장소(사용자)가 바뀔 때마다. 정리 때 남은 저장을 그 저장소로 보낸다(언마운트·사용자 바뀜). ──
  useEffect(() => {
    if (!activeStore) return;
    let cancelled = false;
    activeStore.load().then(
      (windows) => {
        if (!cancelled) setState({ owner: activeStore, windows, loaded: true, dirty: false });
      },
      () => {
        if (!cancelled)
          setState({ owner: activeStore, windows: EMPTY, loaded: true, dirty: false });
      }
    );
    return () => {
      cancelled = true;
      flush();
    };
  }, [activeStore, flush]);

  // 바뀐 창 목록을 늦춰 저장한다. 불러오기 전·불러온 직후(dirty=false)는 저장하지 않는다 — 빈 목록이 저장값을 덮지 않게.
  useEffect(() => {
    if (!rawState.loaded || !rawState.dirty || !rawState.owner || rawState.owner !== activeStore)
      return;
    pendingRef.current = { store: rawState.owner, windows: rawState.windows };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, saveDelayMs);
  }, [rawState, activeStore, flush, saveDelayMs]);

  // 페이지를 떠날 때 남은 저장을 보낸다(언마운트가 불리지 않는 경우).
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [enabled, flush]);

  // 등록부가 ready 가 되면 없는·사용 중지·floatable 아닌 위젯 창을 정리하고 저장한다.
  const sanitized = state.loaded
    ? sanitizeDockWindows(state.windows, registry, registryStatus)
    : state.windows;
  useEffect(() => {
    if (!state.loaded || sanitized === state.windows) return;
    setState((prev) =>
      prev.owner === state.owner && prev.windows === state.windows
        ? { ...prev, windows: sanitized, dirty: true }
        : prev
    );
  }, [sanitized, state.loaded, state.owner, state.windows]);

  const update = useCallback((fn: (windows: DockWindow[]) => DockWindow[]) => {
    setState((prev) => {
      if (!prev.loaded || prev.owner !== ownerRef.current || !prev.owner) return prev;
      const next = fn(prev.windows);
      return next === prev.windows ? prev : { ...prev, windows: next, dirty: true };
    });
  }, []);

  const registryRef = useRef(registry);
  registryRef.current = registry;
  const windowsRef = useRef(state.windows);
  windowsRef.current = state.windows;
  const loadedRef = useRef(state.loaded);
  loadedRef.current = state.loaded;

  const open = useCallback(
    (widgetId: string): OpenDockResult["kind"] | "missing" => {
      const entry = registryRef.current[widgetId];
      if (!isDockMenuEntry(entry) || !loadedRef.current || !ownerRef.current) return "missing";
      const kind = openDockWindow(windowsRef.current, entry, readDockViewport()).kind;
      update((windows) => openDockWindow(windows, entry, readDockViewport()).windows);
      return kind;
    },
    [update]
  );
  const close = useCallback((id: string) => update((ws) => closeDockWindow(ws, id)), [update]);
  const focus = useCallback(
    (id: string) => update((ws) => bringDockWindowToFront(ws, id)),
    [update]
  );
  const toggleCollapse = useCallback(
    (id: string) => update((ws) => toggleDockCollapse(ws, id, readDockViewport())),
    [update]
  );
  const move = useCallback(
    (id: string, x: number, y: number) =>
      update((ws) => moveDockWindow(ws, id, x, y, readDockViewport())),
    [update]
  );
  const resize = useCallback(
    (id: string, w: number, h: number) =>
      update((ws) => resizeDockWindow(ws, id, w, h, readDockViewport())),
    [update]
  );

  return useMemo(
    () => ({
      loaded: state.loaded,
      windows: sanitized,
      open,
      close,
      focus,
      toggleCollapse,
      move,
      resize,
    }),
    [state.loaded, sanitized, open, close, focus, toggleCollapse, move, resize]
  );
}

/** 「도구」 메뉴 목록(제목순) — 등록부가 바뀔 때만 다시 만든다. */
export function useDockableEntries(registry: WidgetRegistry) {
  return useMemo(() => listDockableEntries(registry), [registry]);
}
