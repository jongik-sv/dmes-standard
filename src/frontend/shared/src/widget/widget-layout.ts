/**
 * 위젯 배치 순수 함수 — React·DOM 에 기대지 않아 단위 시험으로 고정한다(스펙 §3·§4.3).
 * 좌표는 늘 넓은 화면(24칸) 기준이다. 당김·충돌은 react-grid-layout/core 의 verticalCompactor·moveElement 를 쓴다.
 */
import { verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout/core";

import {
  HOME_TAB_ID,
  HOME_TAB_NAME,
  MAX_WIDGETS_PER_TAB,
  TAB_NAME_MAX,
  WIDGET_COLS,
  WIDGET_DEFAULT_MIN_SIZE,
  WIDGET_MEDIUM_MIN_WIDTH,
  WIDGET_WIDE_MIN_WIDTH,
} from "./constants";
import type { WidgetItem, WidgetMeta, WidgetMoveKey, WidgetRegistry, WidgetSize, WidgetTab } from "./types";

const WIDGET_ID_RE = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/;

export function colsForWidth(width: number): 24 | 12 | 1 {
  if (width >= WIDGET_WIDE_MIN_WIDTH) return 24;
  if (width >= WIDGET_MEDIUM_MIN_WIDTH) return 12;
  return 1;
}

export function minSizeOf(meta?: WidgetMeta): WidgetSize {
  return meta?.minSize ?? { ...WIDGET_DEFAULT_MIN_SIZE };
}

export function maxSizeOf(meta?: WidgetMeta): WidgetSize {
  return {
    w: Math.min(meta?.maxSize?.w ?? WIDGET_COLS, WIDGET_COLS),
    h: meta?.maxSize?.h ?? Number.POSITIVE_INFINITY,
  };
}

/** 메타 문제 목록(없으면 []). 등록부를 읽을 때 콘솔 오류로 알리고 크기는 범위로 자른다. */
export function validateWidgetMeta(meta: WidgetMeta): string[] {
  const problems: string[] = [];
  if (!WIDGET_ID_RE.test(meta.id)) problems.push(`${meta.id}: id 는 "{모듈}.{이름}" 형식이어야 합니다.`);
  const min = minSizeOf(meta);
  const max = maxSizeOf(meta);
  const { w, h } = meta.defaultSize;
  if (w < min.w || h < min.h || w > max.w || h > max.h) {
    problems.push(`${meta.id}: defaultSize ${w}×${h} 가 최소 ${min.w}×${min.h}·최대 ${max.w}×${max.h} 범위 밖입니다.`);
  }
  return problems;
}

const toInt = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function clampItem(item: WidgetItem, registry: WidgetRegistry, cols: number = WIDGET_COLS): WidgetItem {
  const meta = registry[item.widgetId]?.meta;
  const min = meta ? minSizeOf(meta) : { w: 1, h: 1 };
  const max = meta ? maxSizeOf(meta) : { w: cols, h: Number.POSITIVE_INFINITY };
  const w = clamp(toInt(item.w, min.w), Math.min(min.w, cols), Math.min(max.w, cols));
  const h = clamp(toInt(item.h, min.h), min.h, max.h);
  const x = clamp(toInt(item.x, 0), 0, cols - w);
  const y = Math.max(0, toInt(item.y, 0));
  return { ...item, x, y, w, h, locked: Boolean(item.locked), config: item.config ?? null };
}

function toLayout(items: readonly WidgetItem[]): LayoutItem[] {
  return items.map((i) => ({ i: i.instId, x: i.x, y: i.y, w: i.w, h: i.h, static: i.locked }));
}

function fromLayout(layout: Layout, items: readonly WidgetItem[]): WidgetItem[] {
  const pos = new Map(layout.map((l) => [l.i, l]));
  return items.map((it) => {
    const l = pos.get(it.instId);
    return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : it;
  });
}

function compact(items: readonly WidgetItem[], cols: number = WIDGET_COLS): WidgetItem[] {
  return fromLayout(verticalCompactor.compact(toLayout(items), cols), items);
}

/**
 * firstId 위젯을 정렬 순서와 상관없이 제 자리에 먼저 고정해, 겹치는 이웃이 비켜나게 한다(놓거나 옮긴 위젯이 이긴다).
 * 1단계: 그 위젯을 고정물로 보고 이웃을 밀어낸다. 2단계: 고정을 풀고 전체를 위로 당긴다. 반환 순서는 입력 순서.
 */
function compactPreferring(items: readonly WidgetItem[], firstId: string, cols: number = WIDGET_COLS): WidgetItem[] {
  const pinned = toLayout(items).map((l) => (l.i === firstId ? { ...l, static: true } : l));
  const pushed = fromLayout(verticalCompactor.compact(pinned, cols), items);
  return compact(pushed, cols);
}

/** 서버·저장값을 화면에 쓰기 전에 정리한다 — 중복 instId 제거, 크기·좌표 자르기, 겹침을 당김으로 풀기. */
export function sanitizeLayout(items: readonly WidgetItem[], registry: WidgetRegistry): WidgetItem[] {
  const seen = new Set<string>();
  const unique: WidgetItem[] = [];
  for (const it of items) {
    if (!it || !it.instId || seen.has(it.instId)) continue;
    seen.add(it.instId);
    unique.push(clampItem(it, registry));
  }
  return compact(unique);
}

/** 넓은 화면 배치를 중간(12칸)·좁은(1칸) 화면용으로 다시 흘린다(보기 전용). */
export function reflowLayout(items: readonly WidgetItem[], cols: number): WidgetItem[] {
  if (cols >= WIDGET_COLS) return [...items];
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  if (cols === 1) {
    let y = 0;
    return ordered.map((it) => {
      const out = { ...it, x: 0, y, w: 1 };
      y += it.h;
      return out;
    });
  }
  const ratio = cols / WIDGET_COLS;
  const scaled = ordered.map((it) => {
    const w = Math.max(1, Math.min(cols, Math.ceil(it.w * ratio)));
    const x = Math.min(Math.floor(it.x * ratio), cols - w);
    return { ...it, x, w, locked: false };
  });
  return compact(scaled, cols);
}

/** 사용 중지 위젯(스펙 widget-admin-generic §1.1)·탭 한도·이미 놓인 multiple:false 위젯은 새로 놓을 수 없다. */
export function canAddWidget(items: readonly WidgetItem[], meta: WidgetMeta): boolean {
  if (meta.disabled) return false;
  if (items.length >= MAX_WIDGETS_PER_TAB) return false;
  if (meta.multiple === false && items.some((i) => i.widgetId === meta.id)) return false;
  return true;
}

/** 위젯을 놓는다 — at 이 없으면 맨 아래 왼쪽, 있으면 그 자리(겹친 위젯은 밀려난다). */
export function addItem(
  items: readonly WidgetItem[],
  widgetId: string,
  meta: WidgetMeta,
  instId: string,
  at?: { x: number; y: number }
): WidgetItem[] {
  const bottom = items.reduce((acc, i) => Math.max(acc, i.y + i.h), 0);
  const placed = clampItem(
    { instId, widgetId, x: at?.x ?? 0, y: at?.y ?? bottom, w: meta.defaultSize.w, h: meta.defaultSize.h, locked: false, config: null },
    { [widgetId]: { meta, load: async () => ({ default: null }) } }
  );
  return compactPreferring([...items, placed], instId);
}

/** 잠긴 위젯은 빼지 않는다. `force`(등록부에 없는 위젯 칸)면 잠금과 무관하게 뺀다. */
export function removeItem(items: readonly WidgetItem[], instId: string, force = false): WidgetItem[] {
  const target = items.find((i) => i.instId === instId);
  if (!target || (target.locked && !force)) return [...items];
  return compact(items.filter((i) => i.instId !== instId));
}

export function toggleLock(items: readonly WidgetItem[], instId: string): WidgetItem[] {
  return items.map((i) => (i.instId === instId ? { ...i, locked: !i.locked } : i));
}

/** 키보드 이동(mode=move) · 크기 조절(mode=resize). 잠긴 위젯은 그대로. ↑↓ 는 위·아래 이웃과 순서를 바꾼다. */
export function moveByKey(
  items: readonly WidgetItem[],
  instId: string,
  key: WidgetMoveKey,
  mode: "move" | "resize",
  registry: WidgetRegistry
): WidgetItem[] {
  const target = items.find((i) => i.instId === instId);
  if (!target || target.locked) return [...items];
  if (mode === "resize") {
    const dw = key === "right" ? 1 : key === "left" ? -1 : 0;
    const dh = key === "down" ? 1 : key === "up" ? -1 : 0;
    const resized = clampItem({ ...target, w: target.w + dw, h: target.h + dh }, registry);
    return compact(items.map((i) => (i.instId === instId ? resized : i)));
  }
  let nx = target.x;
  let ny = target.y;
  if (key === "left") nx = Math.max(0, target.x - 1);
  if (key === "right") nx = Math.min(WIDGET_COLS - target.w, target.x + 1);
  const sharesColumns = (o: WidgetItem) => o.instId !== instId && o.x < target.x + target.w && target.x < o.x + o.w;
  if (key === "down") {
    const below = items.filter((o) => sharesColumns(o) && o.y >= target.y + target.h).sort((a, b) => a.y - b.y)[0];
    if (!below || below.locked) return [...items];
    // 아래 위젯을 이동 위젯 자리로 올리고 이동 위젯이 비켜나게 한다(순서 교환).
    return compactPreferring(
      items.map((i) => (i.instId === below.instId ? { ...i, y: target.y } : i)),
      below.instId
    );
  }
  if (key === "up") {
    const above = items.filter((o) => sharesColumns(o) && o.y + o.h <= target.y).sort((a, b) => b.y - a.y)[0];
    if (!above) return [...items];
    ny = above.y;
  }
  return compactPreferring(
    items.map((i) => (i.instId === instId ? { ...i, x: nx, y: ny } : i)),
    instId
  );
}

const itemKey = (i: WidgetItem) => `${i.instId}|${i.widgetId}|${i.x}|${i.y}|${i.w}|${i.h}|${i.locked ? 1 : 0}`;

export function itemsEqual(a: readonly WidgetItem[], b: readonly WidgetItem[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(itemKey).sort();
  const sb = b.map(itemKey).sort();
  return sa.every((k, idx) => k === sb[idx]);
}

export function tabsEqual(a: WidgetTab, b: WidgetTab): boolean {
  return a.tabId === b.tabId && a.name === b.name && a.locked === b.locked && itemsEqual(a.items, b.items);
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** 순서·설정까지 같은 탭인지 — tabsEqual(저장 대상 판정, 순서 무시)보다 엄격하다. */
function sameTabExact(a: WidgetTab, b: WidgetTab): boolean {
  if (a.tabId !== b.tabId || a.name !== b.name || a.seq !== b.seq || a.locked !== b.locked || a.items.length !== b.items.length) return false;
  return a.items.every((x, i) => {
    const y = b.items[i];
    return itemKey(x) === itemKey(y) && sameJson(x.config, y.config);
  });
}

/**
 * 다시 정리한 탭 목록에서 이전과 같은 탭은 이전 객체를, 모두 같으면 이전 배열을 돌려준다(Screen-Performance-Guide R7·W3).
 * 같은 배치를 다시 받아도 setTabs 가 바뀐 것 없음으로 끝나 보드·위젯 틀이 다시 그려지지 않는다.
 */
export function reuseTabs(prev: readonly WidgetTab[], next: WidgetTab[]): WidgetTab[] {
  const out = next.map((t) => prev.find((p) => p.tabId === t.tabId && sameTabExact(p, t)) ?? t);
  return out.length === prev.length && out.every((t, i) => t === prev[i]) ? (prev as WidgetTab[]) : out;
}

export function validateTabName(name: string, tabs: readonly WidgetTab[], selfTabId: string): string | null {
  const v = name.trim();
  if (!v) return "탭 이름을 입력해 주세요.";
  if (v.length > TAB_NAME_MAX) return `탭 이름은 ${TAB_NAME_MAX}자 이하로 정합니다.`;
  if (tabs.some((t) => t.tabId !== selfTabId && t.name === v)) return "같은 이름의 탭이 있습니다.";
  return null;
}

export function nextTabId(tabs: readonly WidgetTab[]): string {
  const used = new Set(tabs.map((t) => t.tabId));
  let n = 1;
  while (used.has(`tab-${n}`)) n += 1;
  return `tab-${n}`;
}

export function newInstanceId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `w-${Date.now().toString(36)}-${rand}`;
}

export function homeTab(items: readonly WidgetItem[]): WidgetTab {
  return { tabId: HOME_TAB_ID, name: HOME_TAB_NAME, seq: 0, locked: false, items: [...items] };
}
