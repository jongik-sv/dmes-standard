/**
 * 작업 상태 저장(UX 1차 U21) — 마지막 모델·다이어그램·모드·프리셋·패널 열림·viewport 를 localStorage 한 키에 둔다.
 * 순수 함수(load·save·with*)와 훅 하나(useErdPrefs). 모든 읽기·쓰기는 try/catch 이고, 실패하면 기본값으로 동작한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ErdMode, ErdPreset } from "../canvas/erd-flow";
import type { ReviewTab } from "../panels/ReviewPanel";

export interface ErdViewport { x: number; y: number; zoom: number }
export interface ErdPrefs {
  lastModelId: string | null;
  /** modelId → 마지막 다이어그램 id. */
  lastDiagram: Record<string, string>;
  mode: ErdMode;
  preset: ErdPreset;
  reviewOpen: boolean;
  reviewTab: ReviewTab;
  sideOpen: boolean;
  /** 사용자 접기 표시. 고른 표가 없으면 이 값과 무관하게 숨긴다. */
  propsOpen: boolean;
  /** `${modelId}/${diagramId}` → viewport. 최대 30개, 넘치면 오래 쓴 것부터 뺀다(넣은 순서). */
  viewports: Record<string, ErdViewport>;
  /** 저절로 연 읽기 전용 안내 `${modelId}:${reasonKind}`. 최대 20개. */
  seenReadOnly: string[];
}

export const PREFS_MAX_VIEWPORTS = 30;
export const PREFS_MAX_SEEN = 20;
export const PREFS_SAVE_DELAY_MS = 300;
export const prefsKey = (userId: string): string => `dmes:erdEdit:v1:${userId}`;

export const DEFAULT_PREFS: ErdPrefs = {
  lastModelId: null, lastDiagram: {}, mode: "logical", preset: "basic", reviewOpen: false, reviewTab: "inferred",
  sideOpen: true, propsOpen: true, viewports: {}, seenReadOnly: [],
};

const MODES: readonly string[] = ["logical", "physical"];
const PRESETS: readonly string[] = ["basic", "overview", "both"];
const TABS: readonly string[] = ["violations", "inferred", "diff", "history"];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readViewports(v: unknown): Record<string, ErdViewport> {
  if (!isObj(v)) return {};
  const out: Record<string, ErdViewport> = {};
  for (const [k, raw] of Object.entries(v)) {
    if (isObj(raw) && finite(raw.x) && finite(raw.y) && finite(raw.zoom) && raw.zoom >= MIN_ZOOM && raw.zoom <= MAX_ZOOM) {
      out[k] = { x: raw.x, y: raw.y, zoom: raw.zoom };
    }
  }
  const keys = Object.keys(out);
  // 넘치면 뒤(최근)에서 30개만 남긴다.
  for (const k of keys.slice(0, Math.max(0, keys.length - PREFS_MAX_VIEWPORTS))) delete out[k];
  return out;
}

function readLastDiagram(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(v)) if (typeof raw === "string") out[k] = raw;
  return out;
}

/** 모양 검사 후 칸별로 기본값을 채운다. 깨진 JSON·모르는 값·저장소 막힘 → DEFAULT_PREFS. */
export function loadPrefs(userId: string | null, storage?: Pick<Storage, "getItem"> | null): ErdPrefs {
  const fresh: ErdPrefs = { ...DEFAULT_PREFS, lastDiagram: {}, viewports: {}, seenReadOnly: [] };
  if (!userId) return fresh;
  try {
    const store = storage ?? globalThis.localStorage;
    const text = store.getItem(prefsKey(userId));
    if (!text) return fresh;
    const raw: unknown = JSON.parse(text);
    if (!isObj(raw)) return fresh;
    return {
      lastModelId: typeof raw.lastModelId === "string" ? raw.lastModelId : null,
      lastDiagram: readLastDiagram(raw.lastDiagram),
      mode: typeof raw.mode === "string" && MODES.includes(raw.mode) ? (raw.mode as ErdMode) : fresh.mode,
      preset: typeof raw.preset === "string" && PRESETS.includes(raw.preset) ? (raw.preset as ErdPreset) : fresh.preset,
      reviewOpen: bool(raw.reviewOpen, fresh.reviewOpen),
      reviewTab: typeof raw.reviewTab === "string" && TABS.includes(raw.reviewTab) ? (raw.reviewTab as ReviewTab) : fresh.reviewTab,
      sideOpen: bool(raw.sideOpen, fresh.sideOpen),
      propsOpen: bool(raw.propsOpen, fresh.propsOpen),
      viewports: readViewports(raw.viewports),
      seenReadOnly: Array.isArray(raw.seenReadOnly)
        ? raw.seenReadOnly.filter((s): s is string => typeof s === "string").slice(0, PREFS_MAX_SEEN) : [],
    };
  } catch {
    return fresh;
  }
}

export function savePrefs(userId: string | null, p: ErdPrefs, storage?: Pick<Storage, "setItem"> | null): void {
  if (!userId) return;
  try {
    (storage ?? globalThis.localStorage).setItem(prefsKey(userId), JSON.stringify(p));
  } catch {
    // 저장소가 막혀도(시크릿 창·용량) 화면은 기본값으로 계속 동작한다.
  }
}

/** 같은 키를 지우고 다시 넣어 맨 뒤(가장 최근)로 보내고, 30개가 넘으면 앞(오래된 것)부터 뺀다. */
export function withViewport(p: ErdPrefs, modelId: string, diagramId: string, vp: ErdViewport): ErdPrefs {
  const key = `${modelId}/${diagramId}`;
  const next: Record<string, ErdViewport> = { ...p.viewports };
  delete next[key];
  next[key] = { x: vp.x, y: vp.y, zoom: vp.zoom };
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - PREFS_MAX_VIEWPORTS))) delete next[k];
  return { ...p, viewports: next };
}

/** 안내를 이미 본 키를 기록한다. 같은 키는 두 번 넣지 않고, 20개가 넘으면 오래된 것부터 뺀다. */
export function withSeen(p: ErdPrefs, key: string): ErdPrefs {
  if (p.seenReadOnly.includes(key)) return p;
  return { ...p, seenReadOnly: [...p.seenReadOnly, key].slice(-PREFS_MAX_SEEN) };
}

/**
 * userId 가 null 이면 기본값을 주고 저장하지 않는다. userId 가 처음 정해질 때 한 번 읽고 loaded=true,
 * 바뀌면(로그인 바뀜) 다시 읽는다. 쓰기는 300ms 미뤄 묶고, 사용자가 바뀌거나 화면이 사라질 때 남은 저장을 바로 한다.
 */
export function useErdPrefs(userId: string | null): { prefs: ErdPrefs; loaded: boolean; update(fn: (p: ErdPrefs) => ErdPrefs): void } {
  const [prefs, setPrefs] = useState<ErdPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const prefsRef = useRef(prefs);
  const userRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    savePrefs(userRef.current, prefsRef.current);
  }, []);

  useEffect(() => {
    if (!userId) {
      userRef.current = null;
      return undefined;
    }
    const p = loadPrefs(userId);
    prefsRef.current = p;
    userRef.current = userId;
    setPrefs(p);
    setLoaded(true);
    return flush; // 사용자가 바뀌거나 언마운트될 때 이전 사용자의 남은 저장을 바로 한다.
  }, [userId, flush]);

  const update = useCallback((fn: (p: ErdPrefs) => ErdPrefs) => {
    const next = fn(prefsRef.current);
    if (next === prefsRef.current) return;
    prefsRef.current = next;
    setPrefs(next);
    if (!userRef.current) return;
    dirty.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, PREFS_SAVE_DELAY_MS);
  }, [flush]);

  return { prefs, loaded, update };
}
