"use client";

/**
 * 대시보드 배치 상태 — 행(DashboardRow)별 접힘, 카드별 넓은 화면 칸 수·높이를 DashboardGrid 가 들고, 사용자별로 브라우저에 저장한다.
 * - 저장: localStorage `dmes:dash:v2:{userId}:{layoutKey}` = { [cardId]: { span?, height? }, ["row:" + rowId]: { collapsed } }.
 *   접기는 행 단위만 있다. 행 키(`row:` 접두)는 collapsed 만, 카드 키는 span·height 만 남긴다.
 *   v1(카드 단위 접힘, 2026-10-02 첫 판)은 형식이 달라 읽지 않는다 — 버전 접두가 달라 이전 저장값은 자연히 무시된다.
 *   첫 렌더는 이 세션에서 확인된 사용자(peekLastUserId)로 읽고, 쓰기는 확인된 사용자 ID 로만 한다(ContentBody 와 같은 규칙).
 * - 읽을 때 값을 검증한다(span 1~12 정수, height 는 양수, 행 collapsed 는 불리언). 모르는 값은 버린다.
 * - 이 v2 저장은 격자 모드(DashboardGrid layoutKey) 전용이다. 위젯 보드(useDashboardBoard)는 v3 형식으로 따로 저장하고,
 *   보드 안 행·카드에는 같은 계약(DashboardLayoutApi)의 어댑터를 DashboardLayoutContext 로 넣는다(DashboardBoard.tsx).
 * - 칸 수(span)는 넓은 화면 값에만 쓴다. 1100px 이하의 세로 쌓기는 코드에 선언한 span 규칙을 그대로 따른다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useCurrentUserState } from "../../portal-shell/use-current-user-id";
import { peekLastUserId } from "../../portal-shell/use-user-button-rbac";

export interface DashboardCardLayout {
  collapsed?: boolean;
  span?: number;
  height?: number;
}

export type DashboardLayoutMap = Record<string, DashboardCardLayout>;

export const DASHBOARD_LAYOUT_PREFIX = "dmes:dash:v2:";

/** 행 접힘 항목 키. */
export const rowLayoutKey = (rowId: string) => `row:${rowId}`;

/** 칸 수를 1~12 정수로(최소 minSpan). */
export function clampSpan(span: number, minSpan = 1): number {
  const min = Math.min(12, Math.max(1, Math.round(minSpan)));
  if (!Number.isFinite(span)) return min;
  return Math.min(12, Math.max(min, Math.round(span)));
}

/** 높이를 최소값 이상 정수로. */
export function clampHeight(height: number, minHeight: number): number {
  if (!Number.isFinite(height)) return Math.round(minHeight);
  return Math.max(Math.round(minHeight), Math.round(height));
}

/**
 * 끈 뒤의 카드 폭(px)을 격자 칸 수로 맞춘다.
 * 칸 폭 = (격자 폭 − 11 × 간격) / 12. 카드 n칸 폭 = n × 칸 폭 + (n−1) × 간격 이므로 n = (폭 + 간격) / (칸 폭 + 간격).
 */
export function widthToSpan(width: number, gridWidth: number, gap: number, minSpan = 1): number {
  const col = (gridWidth - 11 * gap) / 12;
  if (!(col > 0)) return clampSpan(12, minSpan);
  return clampSpan((width + gap) / (col + gap), minSpan);
}

function isEntry(v: unknown): v is DashboardCardLayout {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 저장값 검증 — 올바른 항목만 남긴다. */
export function sanitizeLayout(raw: unknown): DashboardLayoutMap {
  const out: DashboardLayoutMap = {};
  if (!isEntry(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isEntry(v)) continue;
    const e: DashboardCardLayout = {};
    if (id.startsWith("row:")) {
      if (v.collapsed === true) out[id] = { collapsed: true };
      continue;
    }
    if (typeof v.span === "number" && Number.isInteger(v.span) && v.span >= 1 && v.span <= 12)
      e.span = v.span;
    if (typeof v.height === "number" && Number.isFinite(v.height) && v.height > 0)
      e.height = Math.round(v.height);
    if (Object.keys(e).length > 0) out[id] = e;
  }
  return out;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDashboardLayout(userId: string, layoutKey: string): DashboardLayoutMap {
  try {
    const raw = storage()?.getItem(`${DASHBOARD_LAYOUT_PREFIX}${userId}:${layoutKey}`);
    return raw ? sanitizeLayout(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveDashboardLayout(
  userId: string,
  layoutKey: string,
  map: DashboardLayoutMap
): void {
  try {
    const s = storage();
    if (!s) return;
    const key = `${DASHBOARD_LAYOUT_PREFIX}${userId}:${layoutKey}`;
    if (Object.keys(map).length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(map));
  } catch {
    // 저장 실패는 무시(배치 조절 자체는 동작)
  }
}

export interface DashboardLayoutApi {
  /** 카드 하나의 배치(없으면 빈 객체). */
  get: (cardId: string) => DashboardCardLayout;
  /** 카드 하나의 배치를 바꾼다. undefined 값은 지운다. persist=false 면 저장하지 않는다(끄는 중). */
  update: (cardId: string, patch: DashboardCardLayout, persist?: boolean) => void;
  /** 지금 상태를 저장한다(끌기를 마칠 때). */
  commit: () => void;
  /** 모든 카드를 기본 배치로 되돌리고 저장값을 지운다. */
  reset: () => void;
  /** 바꾼 카드가 하나라도 있는지. */
  customized: boolean;
}

/** 배치 상태 맥락(보드가 자기 행에 어댑터를 넣을 때도 쓴다 — 내부용, index 에서 내보내지 않는다). */
export const DashboardLayoutContext = createContext<DashboardLayoutApi | null>(null);

/** DashboardGrid 안에서 배치 상태를 읽고 바꾼다(그리드 밖이면 null). "배치 초기화" 버튼 등에 쓴다. */
export function useDashboardLayout(): DashboardLayoutApi | null {
  return useContext(DashboardLayoutContext);
}

function applyPatch(
  map: DashboardLayoutMap,
  cardId: string,
  patch: DashboardCardLayout
): DashboardLayoutMap {
  const cur = { ...(map[cardId] ?? {}) };
  for (const k of Object.keys(patch) as Array<keyof DashboardCardLayout>) {
    const v = patch[k];
    if (v === undefined || v === false) delete cur[k];
    else (cur as Record<string, unknown>)[k] = v;
  }
  const next = { ...map };
  if (Object.keys(cur).length === 0) delete next[cardId];
  else next[cardId] = cur;
  return next;
}

export function DashboardLayoutProvider({
  layoutKey,
  children,
}: {
  layoutKey?: string;
  children: ReactNode;
}) {
  const { userId } = useCurrentUserState(Boolean(layoutKey));
  const loadedFor = useRef("");
  const [map, setMap] = useState<DashboardLayoutMap>(() => {
    const last = peekLastUserId();
    if (!layoutKey || !last) return {};
    loadedFor.current = `${last}:${layoutKey}`;
    return loadDashboardLayout(last, layoutKey);
  });
  const mapRef = useRef(map);
  mapRef.current = map;

  // 확인된 사용자로 다시 읽는다(첫 렌더에 읽은 것과 같으면 건너뛴다).
  useEffect(() => {
    if (!layoutKey || !userId) return;
    const key = `${userId}:${layoutKey}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setMap(loadDashboardLayout(userId, layoutKey));
  }, [userId, layoutKey]);

  const persist = useCallback(
    (next: DashboardLayoutMap) => {
      if (layoutKey && userId) saveDashboardLayout(userId, layoutKey, next);
    },
    [layoutKey, userId]
  );

  const api = useMemo<DashboardLayoutApi>(
    () => ({
      get: (cardId) => map[cardId] ?? {},
      update: (cardId, patch, doPersist = true) => {
        const next = applyPatch(mapRef.current, cardId, patch);
        mapRef.current = next;
        setMap(next);
        if (doPersist) persist(next);
      },
      commit: () => persist(mapRef.current),
      reset: () => {
        mapRef.current = {};
        setMap({});
        persist({});
      },
      customized: Object.keys(map).length > 0,
    }),
    [map, persist]
  );

  return <DashboardLayoutContext.Provider value={api}>{children}</DashboardLayoutContext.Provider>;
}
