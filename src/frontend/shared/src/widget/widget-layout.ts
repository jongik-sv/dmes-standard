/**
 * 위젯 배치 순수 함수 — React·DOM 에 기대지 않아 단위 시험으로 고정한다(스펙 §3·§4.3).
 * 좌표는 늘 넓은 화면(24칸) 기준이다. 당김·충돌은 react-grid-layout/core 의 verticalCompactor·moveElement 를 쓴다.
 */
import { verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout/core";

import {
  HOME_TAB_ID,
  HOME_TAB_NAME,
  MAX_TABS,
  MAX_WIDGETS_PER_TAB,
  TAB_EXPORT_KIND,
  TAB_EXPORT_VERSION,
  TAB_NAME_MAX,
  WIDGET_COLS,
  WIDGET_DEFAULT_MIN_SIZE,
  WIDGET_MEDIUM_MIN_WIDTH,
  WIDGET_WIDE_MIN_WIDTH,
} from "./constants";
import type {
  WidgetItem,
  WidgetMeta,
  WidgetMoveKey,
  WidgetRegistry,
  WidgetShareResult,
  WidgetSize,
  WidgetTab,
  WidgetTabExportFile,
} from "./types";
import { resolveWidgetPlacement } from "./widget-placement";

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

/**
 * 사용 중지 위젯(스펙 widget-admin-generic §1.1)·배치가 「업무 화면만」(B)인 위젯·탭 한도·이미 놓인 multiple:false 위젯은 새로 놓을 수 없다.
 * 이미 보드에 놓인 B 위젯은 이 함수를 거치지 않으므로 그대로 남는다.
 */
export function canAddWidget(items: readonly WidgetItem[], meta: WidgetMeta): boolean {
  if (meta.disabled) return false;
  if (!resolveWidgetPlacement(meta).board) return false;
  if (items.length >= MAX_WIDGETS_PER_TAB) return false;
  if (meta.multiple === false && items.some((i) => i.widgetId === meta.id)) return false;
  return true;
}

/** 새로 놓을 때의 크기 — meta.defaultSize 를 최소·최대와 격자 폭(24칸)으로 자른 값. addItem 이 놓는 크기와 같다. */
export function placedSizeOf(meta: WidgetMeta): WidgetSize {
  const min = minSizeOf(meta);
  const max = maxSizeOf(meta);
  return {
    w: clamp(toInt(meta.defaultSize.w, min.w), Math.min(min.w, WIDGET_COLS), Math.min(max.w, WIDGET_COLS)),
    h: clamp(toInt(meta.defaultSize.h, min.h), min.h, max.h),
  };
}

/**
 * 크기 size 위젯이 들어갈 첫 빈 자리 — y 0 부터 행 우선, 같은 행에서는 x 0 부터 훑는다(잠긴 위젯도 점유로 본다).
 * 빈 자리가 없으면 맨 아래 왼쪽(addItem 이 at 없이 놓는 자리). size.w 는 격자 폭(cols)으로 자른다.
 */
export function firstFreeSpot(items: readonly WidgetItem[], size: WidgetSize, cols: number = WIDGET_COLS): { x: number; y: number } {
  const w = clamp(toInt(size.w, 1), 1, cols);
  const h = Math.max(1, toInt(size.h, 1));
  const bottom = items.reduce((acc, i) => Math.max(acc, i.y + i.h), 0);
  const overlaps = (x: number, y: number) => items.some((i) => x < i.x + i.w && i.x < x + w && y < i.y + i.h && i.y < y + h);
  for (let y = 0; y < bottom; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return { x: 0, y: bottom };
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
/** 순서·설정까지 같은 항목 목록인지 — itemsEqual(저장 대상 판정, 순서 무시)보다 엄격하다. */
export function sameItemsExact(a: readonly WidgetItem[], b: readonly WidgetItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return itemKey(x) === itemKey(y) && sameJson(x.config, y.config);
  });
}

function sameTabExact(a: WidgetTab, b: WidgetTab): boolean {
  return (
    a.tabId === b.tabId &&
    a.name === b.name &&
    a.seq === b.seq &&
    a.locked === b.locked &&
    // 기본 탭 표시·개인화 여부도 본다 — 되돌리기 뒤 조용한 재조회에서 옛 객체(customized)가 남지 않게.
    Boolean(a.defaultTab) === Boolean(b.defaultTab) &&
    Boolean(a.customized) === Boolean(b.customized) &&
    // 관리자 고정 탭 표시·출처 글도 본다 — 고정이 풀리거나 출처가 바뀌면 옛 객체가 남지 않게.
    Boolean(a.fixed) === Boolean(b.fixed) &&
    (a.origin ?? "") === (b.origin ?? "") &&
    sameItemsExact(a.items, b.items)
  );
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

/* ── 고정 탭·내보내기·가져오기·공유 결과(widget-tabs 2026-10-05, 설계 design-widget-tabs §4) ── */

/** 「홈」과 기본 탭(defaultTab)·관리자 고정 탭(fixed)은 고정 탭이다 — 지우기·이름 바꾸기·옮기기 불가, 탭 줄 앞쪽에 고정. */
export function isFixedTab(tab: Pick<WidgetTab, "tabId" | "defaultTab" | "fixed">): boolean {
  return tab.tabId === HOME_TAB_ID || tab.defaultTab === true || tab.fixed === true;
}

/** 개인 탭 한도에 세는 탭 수 — 관리자 고정 탭(fixed)은 뺀다. fixed 탭이 없으면 tabs.length 와 같다. */
export function countedTabCount(tabs: readonly Pick<WidgetTab, "fixed">[]): number {
  return tabs.filter((t) => t.fixed !== true).length;
}

const tabRank = (t: WidgetTab) => (t.tabId === HOME_TAB_ID ? 0 : t.defaultTab || t.fixed ? 1 : 2);

/**
 * 탭 줄 순서 — 「홈」, 기본 탭·관리자 고정 탭(seq 순), 일반 탭(seq 순). 같은 자리·seq 면 입력 순서를 지킨다.
 * 서버는 기본 탭 tabSeq 를 100+관리자 순서로 주므로 seq 만으로 정렬하면 기본 탭이 일반 탭 뒤로 간다.
 */
export function orderTabs(tabs: readonly WidgetTab[]): WidgetTab[] {
  return [...tabs].sort((a, b) => tabRank(a) - tabRank(b) || a.seq - b.seq);
}

/** 앞에서부터 이어진 고정 탭 수 — 일반 탭은 이 자리보다 앞으로 옮길 수 없다. */
export function fixedTabCount(tabs: readonly WidgetTab[]): number {
  let n = 0;
  while (n < tabs.length && isFixedTab(tabs[n])) n += 1;
  return n;
}

/**
 * 다른 탭과 겹치지 않는 이름 — 앞뒤 공백을 지우고 TAB_NAME_MAX 자로 자른 뒤, 겹치면 「 2」「 3」… 꼬리를 붙인다
 * (꼬리까지 TAB_NAME_MAX 자 안에 들도록 앞부분을 줄인다). 비면 fallback.
 */
export function uniqueTabName(name: string, tabs: readonly WidgetTab[], fallback = "가져온 탭"): string {
  const base = name.trim().slice(0, TAB_NAME_MAX).trim() || fallback;
  const used = new Set(tabs.map((t) => t.name));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const tail = ` ${n}`;
    const candidate = `${base.slice(0, TAB_NAME_MAX - tail.length).trimEnd()}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** 탭 내보내기 파일 내용 — instId 는 빼고 넓은 화면 좌표·잠금·설정만 싣는다. */
export function buildTabExport(tab: WidgetTab): WidgetTabExportFile {
  return {
    version: TAB_EXPORT_VERSION,
    kind: TAB_EXPORT_KIND,
    name: tab.name,
    items: tab.items.map((i) => ({ widgetId: i.widgetId, x: i.x, y: i.y, w: i.w, h: i.h, locked: i.locked, config: i.config ?? null })),
  };
}

/** 가져오면서 뺀 위젯 — missing: 등록부에 없음, disabled: 사용 중지, duplicate: 한 번만 놓는 위젯(multiple:false)의 두 번째부터. */
export interface TabImportDrop {
  widgetId: string;
  reason: "missing" | "disabled" | "placement" | "duplicate";
}

export type TabImportResult = { ok: true; tab: WidgetTab; dropped: TabImportDrop[] } | { ok: false; error: string };

export interface TabImportContext {
  registry: WidgetRegistry;
  /** 지금 탭 목록 — 탭 한도·이름 겹침·새 탭 ID 를 정한다. */
  tabs: readonly WidgetTab[];
  /** 탭 한도(기본 MAX_TABS). */
  maxTabs?: number;
  /** 인스턴스 ID 만들기(기본 newInstanceId) — 시험이 고정값으로 바꾼다. */
  newId?: () => string;
}

const SHAPE_ERROR = "위젯 탭 파일 모양이 아닙니다.";
/** 가져오기 위젯 ID 최대 길이(서버 WIDGET_ID 칸과 같다). */
const IMPORT_WIDGET_ID_MAX = 100;
/** 가져오기 위젯 설정(config) JSON 최대 길이. */
const IMPORT_CONFIG_JSON_MAX = 4000;
const isRecord = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** 등록부의 자기 항목만 본다 — "__proto__"·"constructor" 같은 ID 가 Object 원형을 집지 않게. */
const ownEntry = (registry: WidgetRegistry, id: string) => (Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : undefined);

/**
 * 탭 가져오기 — 파일 글을 검사해 새 일반 탭을 만든다(서버 저장은 호출자 몫).
 * 거절: 탭 한도, JSON 아님, 모양 틀림, version 이 TAB_EXPORT_VERSION 이 아님, 위젯 MAX_WIDGETS_PER_TAB 개 초과.
 * 등록부에 없거나 사용 중지인 위젯, 한 번만 놓는 위젯의 두 번째부터는 빼고 dropped 로 알린다.
 * 새 탭은 tab-N ID·새 instId·겹치지 않는 이름(uniqueTabName)·잠금 없음이고, 항목은 sanitizeLayout 으로 정리한다.
 */
export function parseTabImport(text: string, ctx: TabImportContext): TabImportResult {
  const maxTabs = ctx.maxTabs ?? MAX_TABS;
  if (countedTabCount(ctx.tabs) >= maxTabs) return { ok: false, error: `탭은 최대 ${maxTabs}개까지 둘 수 있습니다. 탭을 지운 뒤 가져와 주세요.` };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 파일이 아닙니다." };
  }
  if (!isRecord(data)) return { ok: false, error: SHAPE_ERROR };
  if (data.version !== TAB_EXPORT_VERSION) {
    return { ok: false, error: `지원하지 않는 파일 버전입니다(version ${JSON.stringify(data.version ?? null)}). version ${TAB_EXPORT_VERSION} 파일만 가져올 수 있습니다.` };
  }
  if (data.kind !== TAB_EXPORT_KIND || typeof data.name !== "string" || !Array.isArray(data.items)) return { ok: false, error: SHAPE_ERROR };
  const rawItems: unknown[] = data.items;
  if (rawItems.length > MAX_WIDGETS_PER_TAB) {
    return { ok: false, error: `위젯이 ${rawItems.length}개라 가져올 수 없습니다(탭당 최대 ${MAX_WIDGETS_PER_TAB}개).` };
  }
  const newId = ctx.newId ?? newInstanceId;
  const kept: WidgetItem[] = [];
  const dropped: TabImportDrop[] = [];
  for (let n = 0; n < rawItems.length; n += 1) {
    const r = rawItems[n];
    if (
      !isRecord(r) ||
      typeof r.widgetId !== "string" ||
      !r.widgetId ||
      r.widgetId.length > IMPORT_WIDGET_ID_MAX ||
      !isNum(r.x) ||
      !isNum(r.y) ||
      !isNum(r.w) ||
      !isNum(r.h) ||
      (r.locked !== undefined && typeof r.locked !== "boolean") ||
      // 설정은 객체이거나 없음(null)이다.
      (r.config != null && !isRecord(r.config))
    ) {
      return { ok: false, error: `${n + 1}번째 위젯의 모양이 틀립니다.` };
    }
    if (r.config != null && JSON.stringify(r.config).length > IMPORT_CONFIG_JSON_MAX) {
      return { ok: false, error: `${n + 1}번째 위젯의 설정이 너무 깁니다(${IMPORT_CONFIG_JSON_MAX}자 이하).` };
    }
    const meta = ownEntry(ctx.registry, r.widgetId)?.meta;
    if (!meta) dropped.push({ widgetId: r.widgetId, reason: "missing" });
    else if (meta.disabled) dropped.push({ widgetId: r.widgetId, reason: "disabled" });
    else if (!resolveWidgetPlacement(meta).board) dropped.push({ widgetId: r.widgetId, reason: "placement" });
    else if (meta.multiple === false && kept.some((k) => k.widgetId === r.widgetId)) dropped.push({ widgetId: r.widgetId, reason: "duplicate" });
    else kept.push({ instId: newId(), widgetId: r.widgetId, x: r.x, y: r.y, w: r.w, h: r.h, locked: r.locked === true, config: r.config ?? null });
  }
  const tab: WidgetTab = {
    tabId: nextTabId(ctx.tabs),
    name: uniqueTabName(data.name, ctx.tabs),
    seq: ctx.tabs.length,
    locked: false,
    items: sanitizeLayout(kept, ctx.registry),
  };
  return { ok: true, tab, dropped };
}

/** 가져오기 알림 — 뺀 위젯이 있으면 사유별로 덧붙인다. */
export function tabImportMessage(tabName: string, dropped: readonly TabImportDrop[]): string {
  const head = `「${tabName}」 탭을 가져왔습니다.`;
  if (dropped.length === 0) return head;
  // 파일에 적힌 ID 는 길 수 있다 — 알림에는 40자까지만 보인다.
  const shortId = (id: string) => (id.length > 40 ? `${id.slice(0, 40)}…` : id);
  const ids = (reason: TabImportDrop["reason"]) => [...new Set(dropped.filter((d) => d.reason === reason).map((d) => shortId(d.widgetId)))];
  const groups: [string, string[]][] = [
    ["없는 위젯", ids("missing")],
    ["사용 중지 위젯", ids("disabled")],
    ["업무 화면 전용 위젯", ids("placement")],
    ["한 번만 놓는 위젯의 중복", ids("duplicate")],
  ];
  const parts = groups.filter(([, list]) => list.length > 0).map(([label, list]) => `${label}(${list.join(", ")})`);
  return `${head} ${parts.join(", ")}은(는) 빼고 가져왔습니다.`;
}

/**
 * 공유 결과 알림 — 모두 성공이면 success, 하나라도 실패면 error 와 실패 사유. names 는 userId → 표시 이름.
 * 받는 사람마다 탭 이름 꼬리(「(공유) 이름 2」)가 다를 수 있어 성공 문구에는 탭 이름 대신 사람 수만 적는다.
 */
export function shareResultMessage(
  results: readonly WidgetShareResult[],
  names: Readonly<Record<string, string>> = {}
): { kind: "success" | "error"; text: string } {
  const who = (id: string) => names[id] || id;
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  if (results.length === 0) return { kind: "error", text: "공유한 사람이 없습니다." };
  if (failed.length === 0) return { kind: "success", text: `${ok.length}명에게 공유했습니다.` };
  const reasons = failed.map((f) => `${who(f.userId)}: ${f.message || "보내지 못했습니다"}`).join(" / ");
  return {
    kind: "error",
    text: ok.length > 0 ? `${ok.length}명에게 공유했고 ${failed.length}명은 보내지 못했습니다. ${reasons}` : `공유하지 못했습니다. ${reasons}`,
  };
}
