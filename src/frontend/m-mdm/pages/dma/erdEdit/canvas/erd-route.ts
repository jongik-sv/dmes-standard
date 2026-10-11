/**
 * 관계선 경유점(2차 c5, README §7.1) — 순수 계산과 캔버스별 작은 버스.
 * - 꺾임점은 캔버스 절대 좌표(정수)다. 표를 옮겨도 꺾임점은 그대로다. 한 선에 1~50개(서버 POINTS_JSON 규칙).
 * - 꺾임점이 있는 선 = 자식 끝 → 꺾임점들 → 부모 끝을 잇는 꺾은선(직각 강제 없음). 끝 모양은 끝 마디 방향을 따른다.
 * - 버스: 선 부품(ErdRelationEdge)은 React Flow 안에 그려져 useCanvasEditing 의 콜백을 props 로 받을 수 없다(ErdViewer 무변경).
 *   그래서 xyflow store(캔버스마다 하나)를 열쇠로 고른 선·손잡이 콜백을 나눈다. 선은 「내가 골랐나」 불리언만 구독한다.
 */
import { useCallback, useSyncExternalStore } from "react";

import { useStoreApi } from "@dk-oasis/shared/react-flow";

import type { ErdRoutePoint } from "../types";

/** 한 선의 꺾임점 상한(서버 POINTS_JSON 1~50). */
export const MAX_ROUTE_POINTS = 50;

export type Pt = { x: number; y: number };

const round = (p: Pt): ErdRoutePoint => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** 꺾임점 i 를 p 로 옮긴다. */
export function movePoint(points: readonly ErdRoutePoint[], i: number, p: Pt): ErdRoutePoint[] {
  return points.map((q, k) => (k === i ? round(p) : q));
}

/**
 * 마디 가운데 손잡이를 끌어 새 꺾임점을 넣는다. seg = 전체 꺾은선(끝 포함)의 마디 번호 —
 * 마디 seg 는 꺾임점 seg-1 과 seg 사이(0 = 자식 끝 → 첫 꺾임점)라 새 점은 꺾임점 자리 seg 에 들어간다. 상한이면 그대로 돌려준다.
 */
export function insertPoint(points: readonly ErdRoutePoint[], seg: number, p: Pt): ErdRoutePoint[] {
  if (points.length >= MAX_ROUTE_POINTS) return [...points];
  const at = Math.max(0, Math.min(seg, points.length));
  return [...points.slice(0, at), round(p), ...points.slice(at)];
}

/** 꺾임점 i 를 지운다. 남은 것이 없으면 빈 목록(= 자동 경로로, clearRoutes). */
export function removePoint(points: readonly ErdRoutePoint[], i: number): ErdRoutePoint[] {
  return points.filter((_, k) => k !== i);
}

/**
 * 지워도 모양이 같은 꺾임점의 번호(꺾임점 기준). full = [앞 끝, ...꺾임점, 뒤 끝].
 * 앞에서부터 걸으며 「마지막으로 남긴 점」과 견준다 — 4px 안이면 겹침, 남긴 점과 다음 점 사이 선분 위(1px 안)면 한 줄.
 * 되돌아가는 점(선분 밖으로 튀어나간 점)은 모양을 바꾸므로 남긴다.
 */
export function tidyPoints(full: readonly Pt[]): number[] {
  const drop: number[] = [];
  let a = full[0];
  for (let k = 1; k < full.length - 1; k++) {
    const b = full[k];
    const c = full[k + 1];
    const near = Math.hypot(b.x - a.x, b.y - a.y) < 4;
    const ax = c.x - a.x;
    const ay = c.y - a.y;
    const len2 = ax * ax + ay * ay;
    const t = len2 > 0 ? ((b.x - a.x) * ax + (b.y - a.y) * ay) / len2 : -1;
    const dist = len2 > 0 ? Math.abs((b.x - a.x) * ay - (b.y - a.y) * ax) / Math.sqrt(len2) : Infinity;
    if (near || (t >= 0 && t <= 1 && dist < 1)) drop.push(k - 1);
    else a = b;
  }
  return drop;
}

/** 꺾은선 path(모서리 둥글림 없음). */
export function polylinePath(full: readonly Pt[]): string {
  return full.map((p, k) => `${k === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/** 마디마다 가운데 점. 길이가 짧은(16px 미만) 마디는 손잡이를 두지 않는다(null). */
export function segmentMids(full: readonly Pt[]): (Pt | null)[] {
  const out: (Pt | null)[] = [];
  for (let k = 0; k < full.length - 1; k++) {
    const a = full[k];
    const b = full[k + 1];
    out.push(Math.hypot(b.x - a.x, b.y - a.y) < 16 ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

// ── 캔버스별 버스 ──

export interface RouteHandlers {
  /** 끌어 놓음·지움의 결과. 빈 목록 = 자동 경로로 되돌리기(clearRoutes). */
  commit(relation: string, points: ErdRoutePoint[]): Promise<void> | void;
  /** 꺾임점을 고칠 수 있는가(다이어그램 편집 권한). 없으면 손잡이를 그리지 않는다. */
  canEdit: boolean;
}

export interface RouteBus {
  selected: string | null;
  handlers: RouteHandlers | null;
  /** 선에 마지막으로 알린 「고칠 수 있음」. 콜백을 갈아 끼우는 사이(effect 정리 → 다시 설정)에는 알리지 않는다. */
  editable: boolean;
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
    b = { selected: null, handlers: null, editable: false, listeners: new Set() };
    buses.set(key, b);
  }
  return b;
}

/** 고른 선을 바꾸고 구독자에게 알린다. 같으면 아무것도 하지 않는다. */
export function selectRoute(bus: RouteBus, relation: string | null): void {
  if (bus.selected === relation) return;
  bus.selected = relation;
  for (const l of bus.listeners) l();
}

/** 손잡이 콜백·권한을 바꾼다. 권한이 바뀌면 구독자(선)에게 알린다. silent = 갈아 끼우기 전 비우기(알리지 않음). */
export function setRouteHandlers(bus: RouteBus, handlers: RouteHandlers | null, silent = false): void {
  bus.handlers = handlers;
  if (silent) return;
  const editable = !!handlers?.canEdit;
  if (bus.editable === editable) return;
  bus.editable = editable;
  for (const l of bus.listeners) l();
}

/** 선 부품용 — 이 선이 골라졌는가와 고칠 수 있는가만 구독한다(다른 선을 골라도 이 선은 다시 그리지 않는다). */
export function useRouteSelection(relation: string): { selected: boolean; editable: boolean; bus: RouteBus } {
  const store = useStoreApi();
  const bus = routeBusOf(store);
  const subscribe = useCallback((l: () => void) => {
    bus.listeners.add(l);
    return () => {
      bus.listeners.delete(l);
    };
  }, [bus]);
  const selected = useSyncExternalStore(subscribe, () => bus.selected === relation, () => false);
  const editable = useSyncExternalStore(subscribe, () => bus.editable, () => false);
  return { selected, editable, bus };
}
