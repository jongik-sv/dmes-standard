/**
 * 관계선 경유점(README §7.1) — 캔버스별 작은 버스. 선 경로 계산은 shared `@dk-oasis/shared/react-flow` 의 route-path 순수 함수를 쓴다(룰 세트 편집기와 같다).
 * - 꺾임점은 캔버스 절대 좌표(정수)다. 표를 옮겨도 꺾임점은 그대로다. 한 선에 1~50개(서버 POINTS_JSON 규칙).
 * - 버스: 선 부품(ErdRelationEdge)은 React Flow 안에 그려져 useCanvasEditing 의 콜백을 props 로 받을 수 없다(ErdViewer 무변경).
 *   그래서 xyflow store(캔버스마다 하나)를 열쇠로 고른 선·고른 꺾임점·올려진 선·손잡이 콜백을 나눈다. 선은 「나와 관계있는 값」만 구독한다.
 * - 올려진 선(hover, 룰 세트 편집기 W1 HoverStore 와 같다): 떠날 때 ROUTE_HOVER_GRACE_MS 뒤에 비운다. 그 사이 다시 들어오면 취소한다.
 */
import { useCallback, useSyncExternalStore } from "react";

import { useStoreApi } from "@dk-oasis/shared/react-flow";

import type { FixedSides } from "./erd-geometry";

/** 한 선의 꺾임점 상한(서버 POINTS_JSON 1~50). */
export const MAX_ROUTE_POINTS = 50;
/** 상한을 넘는 꺾임점을 보내려 할 때의 알림. */
export const ROUTE_LIMIT_TEXT = `꺾임점은 한 선에 ${MAX_ROUTE_POINTS}개까지입니다.`;
/** 선에서 마우스가 떠난 뒤 손잡이를 남겨 두는 시간(ms) — 룰 세트 편집기 ADD_HOVER_GRACE_MS 와 같다. */
export const ROUTE_HOVER_GRACE_MS = 150;

export interface RouteHandlers {
  /** 끌어 놓음·빼기·더하기의 결과. 빈 목록 = 자동 경로로 되돌리기(clearRoutes). */
  commit(relation: string, points: { x: number; y: number }[]): Promise<void> | void;
  /**
   * 끝점 변 바꾸기(§7.5) — fixed = 저장할 두 끝의 변(키 없음 = 자동). points = 함께 바꿀 꺾임점: undefined = 그대로, 빈 목록 = 비우기.
   * 명령은 한 묶음(되돌리기 1번)이다.
   */
  commitSides(relation: string, fixed: FixedSides, points?: { x: number; y: number }[]): Promise<void> | void;
  /** 꺾임점을 고칠 수 있는가(다이어그램 편집 권한). 없으면 손잡이를 그리지 않는다. */
  canEdit: boolean;
  /**
   * 손잡이를 눌렀다 — 캔버스 host 에 초점을 줘 Delete·Backspace 가 캔버스 onKeyDown 에 닿게 하고, 고른 표를 푼다
   * (선 누르기와 같다. 고른 표가 남으면 마지막 점을 뺀 뒤의 Delete 가 표 빼기로 샌다).
   */
  pressed(): void;
}

export interface RoutePointSel {
  relation: string;
  index: number;
}

export interface RouteBus {
  selected: string | null;
  /** 고른 꺾임점(저장 점만, Delete·Backspace 로 뺀다). 고른 선이 바뀌면 비운다. */
  point: RoutePointSel | null;
  /** 마우스가 올려진 선. */
  hovered: string | null;
  hoverTimer: ReturnType<typeof setTimeout> | null;
  handlers: RouteHandlers | null;
  /** 선에 마지막으로 알린 「고칠 수 있음」. 콜백을 갈아 끼우는 사이(effect 정리 → 다시 설정)에는 알리지 않는다. */
  editable: boolean;
  /** 손잡이를 마지막으로 누르거나 뗀 시각(ms). 그 직후 click 이 빈 곳(pane)으로 가도 고른 선을 풀지 않는다. */
  pressedAt: number;
  listeners: Set<() => void>;
}

const buses = new WeakMap<object, RouteBus>();

/**
 * 이 캔버스(xyflow store)의 버스. 없으면 만든다. useStoreApi 는 부품마다 새 감싸개 객체를 돌려주므로
 * 열쇠는 그 안의 getState 함수(캔버스마다 하나인 zustand store 의 것)다.
 */
export function routeBusOf(store: { getState: unknown }): RouteBus {
  const key = store.getState as object;
  let b = buses.get(key);
  if (!b) {
    b = { selected: null, point: null, hovered: null, hoverTimer: null, handlers: null, editable: false, pressedAt: 0, listeners: new Set() };
    buses.set(key, b);
  }
  return b;
}

const emit = (bus: RouteBus) => {
  for (const l of bus.listeners) l();
};

/** 고른 선을 바꾸고 구독자에게 알린다. 다른 선의 고른 꺾임점은 비운다. 같으면 아무것도 하지 않는다. */
export function selectRoute(bus: RouteBus, relation: string | null): void {
  const dropPoint = !!bus.point && bus.point.relation !== relation;
  if (bus.selected === relation && !dropPoint) return;
  bus.selected = relation;
  if (dropPoint) bus.point = null;
  emit(bus);
}

/** 꺾임점을 고른다(그 선도 고른다). null = 꺾임점만 비운다. */
export function selectRoutePoint(bus: RouteBus, sel: RoutePointSel | null): void {
  const same = sel ? bus.point?.relation === sel.relation && bus.point.index === sel.index : bus.point === null;
  if (same && (!sel || bus.selected === sel.relation)) return;
  bus.point = sel;
  if (sel) bus.selected = sel.relation;
  emit(bus);
}

/** 마우스가 선에 올라왔다. 떠남 유예 중이면 취소한다. */
export function hoverRoute(bus: RouteBus, relation: string): void {
  if (bus.hoverTimer !== null) clearTimeout(bus.hoverTimer);
  bus.hoverTimer = null;
  if (bus.hovered === relation) return;
  bus.hovered = relation;
  emit(bus);
}

/** 마우스가 선을 떠났다. ROUTE_HOVER_GRACE_MS 뒤에 비운다. */
export function leaveRoute(bus: RouteBus, relation: string): void {
  if (bus.hovered !== relation) return;
  if (bus.hoverTimer !== null) clearTimeout(bus.hoverTimer);
  bus.hoverTimer = setTimeout(() => {
    bus.hoverTimer = null;
    if (bus.hovered !== relation) return;
    bus.hovered = null;
    emit(bus);
  }, ROUTE_HOVER_GRACE_MS);
}

/** 이 시간(ms) 안의 빈 곳 click 은 손잡이 누르기의 뒤따르는 click 으로 본다. */
export const HANDLE_CLICK_WINDOW = 400;

/** 손잡이를 누르거나 뗐다고 적는다. */
export function markHandlePress(bus: RouteBus): void {
  bus.pressedAt = Date.now();
}

/** 손잡이를 방금 누르거나 뗐는가 — 그 직후의 빈 곳 click 이면 선택을 풀지 않는다. */
export function handlePressedRecently(bus: RouteBus): boolean {
  return Date.now() - bus.pressedAt < HANDLE_CLICK_WINDOW;
}

/** 손잡이 콜백·권한을 바꾼다. 권한이 바뀌면 구독자(선)에게 알린다. silent = 갈아 끼우기 전 비우기(알리지 않음). */
export function setRouteHandlers(bus: RouteBus, handlers: RouteHandlers | null, silent = false): void {
  bus.handlers = handlers;
  if (silent) return;
  const editable = !!handlers?.canEdit;
  if (bus.editable === editable) return;
  bus.editable = editable;
  if (!editable) {
    if (bus.hoverTimer !== null) clearTimeout(bus.hoverTimer);
    bus.hoverTimer = null;
    bus.hovered = null;
    bus.point = null;
  }
  emit(bus);
}

/** 올려진 선이 사라질 때(언마운트) 비운다 — React 는 지운 요소에 mouseleave 를 보내지 않는다(되살아난 선에 손잡이가 남지 않게). */
export function dropHover(bus: RouteBus, relation: string): void {
  if (bus.hovered !== relation) return;
  if (bus.hoverTimer !== null) clearTimeout(bus.hoverTimer);
  bus.hoverTimer = null;
  bus.hovered = null;
  emit(bus);
}

/** 캔버스를 떠날 때(언마운트) 유예 타이머를 끈다. */
export function resetRouteHover(bus: RouteBus): void {
  if (bus.hoverTimer !== null) clearTimeout(bus.hoverTimer);
  bus.hoverTimer = null;
  bus.hovered = null;
}

/**
 * 선 부품용 — 이 선이 골라졌는가·올려졌는가·고른 꺾임점 번호(없으면 -1)·고칠 수 있는가만 구독한다
 * (다른 선을 고르거나 올려도 이 선은 다시 그리지 않는다).
 */
export function useRouteSelection(relation: string): { selected: boolean; hovered: boolean; pointIndex: number; editable: boolean; bus: RouteBus } {
  const store = useStoreApi();
  const bus = routeBusOf(store);
  const subscribe = useCallback((l: () => void) => {
    bus.listeners.add(l);
    return () => {
      bus.listeners.delete(l);
    };
  }, [bus]);
  const selected = useSyncExternalStore(subscribe, () => bus.selected === relation, () => false);
  const hovered = useSyncExternalStore(subscribe, () => bus.hovered === relation, () => false);
  const pointIndex = useSyncExternalStore(subscribe, () => (bus.point?.relation === relation ? bus.point.index : -1), () => -1);
  const editable = useSyncExternalStore(subscribe, () => bus.editable, () => false);
  return { selected, hovered, pointIndex, editable, bus };
}
