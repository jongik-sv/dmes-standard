/**
 * 위젯 도크 상태 계산 — 순수 함수만 둔다(단위 시험으로 고정). 바뀐 것이 없으면 들어온 배열·객체를 그대로 돌려준다.
 * 창 크기는 위젯 메타 defaultSize(격자 칸)를 칸당 가로 40px·세로 30px 로 바꾸고 최소 220×160 을 지킨다.
 */
import type { WidgetMeta, WidgetRegistry, WidgetRegistryEntry } from "../widget/types";
import type { DockRegistryStatus, DockViewport, DockWindow } from "./types";

/** 격자 한 칸의 px — 가로·세로. */
export const DOCK_CELL_PX = { w: 40, h: 30 } as const;
/** 펼친 창 최소 크기(px). 뷰포트가 더 작으면 뷰포트에 맞춘다. */
export const DOCK_MIN_SIZE = { w: 220, h: 160 } as const;
/** 한 사용자가 띄울 수 있는 창 수. */
export const DOCK_MAX_WINDOWS = 8;
/** 접힌 아이콘 한 변(px). */
export const DOCK_ICON_SIZE = 44;
/** 새 창 계단식 배치 — 오른쪽 위에서 시작해 한 칸씩 왼쪽 아래로. */
const CASCADE = { right: 32, top: 72, step: 28 } as const;
/** 창 ID = 위젯 본체 instanceId — 메모 서버 키 규칙(WidgetMemoService INST_ID)과 같다. */
export const DOCK_WINDOW_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** 도구 창으로 띄울 수 있는 위젯인지 — floatable 이고 사용 중지가 아니다. */
export function isDockableEntry(
  entry: WidgetRegistryEntry | undefined
): entry is WidgetRegistryEntry {
  return !!entry && entry.meta.floatable === true && !entry.meta.disabled;
}

/** 「도구」 메뉴 목록 — 띄울 수 있는 위젯을 제목순(한국어)으로. */
export function listDockableEntries(registry: WidgetRegistry): WidgetRegistryEntry[] {
  return Object.values(registry)
    .filter(isDockableEntry)
    .sort(
      (a, b) => a.meta.title.localeCompare(b.meta.title, "ko") || a.meta.id.localeCompare(b.meta.id)
    );
}

/** 메타 defaultSize(칸) → 창 크기(px). 최소 220×160. */
export function windowSizeFor(meta: Pick<WidgetMeta, "defaultSize">): { w: number; h: number } {
  return {
    w: Math.max(DOCK_MIN_SIZE.w, Math.round(meta.defaultSize.w * DOCK_CELL_PX.w)),
    h: Math.max(DOCK_MIN_SIZE.h, Math.round(meta.defaultSize.h * DOCK_CELL_PX.h)),
  };
}

/** 창 크기(px) → 위젯 본체에 넘길 격자 칸 수(WidgetProps.size). */
export function dockItemSize(win: Pick<DockWindow, "w" | "h">): { w: number; h: number } {
  return {
    w: Math.max(1, Math.round(win.w / DOCK_CELL_PX.w)),
    h: Math.max(1, Math.round(win.h / DOCK_CELL_PX.h)),
  };
}

function hash36(text: string): string {
  // FNV-1a 32bit — 같은 위젯 ID 는 늘 같은 값.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 위젯·자리(slot)마다 고정된 창 ID — 첫 창은 `dk-{위젯ID}-{해시}`, 같은 위젯 두 번째부터 `…-2`~`…-8`.
 * 메모처럼 instanceId 로 서버에 저장하는 위젯이 닫았다 다시 열어도 같은 내용을 보이고, 서버 행이 위젯당 최대 8개로 묶인다
 * (창마다 새 ID 면 다시 열 때마다 빈 메모가 되고 메모 수 한도(사용자당 100)를 갉아먹는다). 해시로 다른 위젯 ID 와 겹치지 않게 한다.
 * 길이는 최대 38자 — 메모 서버 키 규칙 `[A-Za-z0-9_-]{1,40}` 안이다.
 */
export function dockWindowSlotId(widgetId: string, slot: number): string {
  const safe = widgetId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 25);
  const base = `dk-${safe}-${hash36(widgetId)}`;
  return slot <= 1 ? base : `${base}-${slot}`;
}

/** 위젯의 첫 창 ID(자리 1). */
export function stableDockWindowId(widgetId: string): string {
  return dockWindowSlotId(widgetId, 1);
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/** 뷰포트에 맞춘 창 크기 — 최소(뷰포트가 작으면 뷰포트)~뷰포트. */
function fitSize(w: number, h: number, viewport: DockViewport): { w: number; h: number } {
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);
  return {
    w: Math.round(clamp(w, Math.min(DOCK_MIN_SIZE.w, vw), vw)),
    h: Math.round(clamp(h, Math.min(DOCK_MIN_SIZE.h, vh), vh)),
  };
}

/**
 * 창을 뷰포트 안으로 자른 **표시용** 값 — 크기는 최소(뷰포트가 작으면 뷰포트)~뷰포트, 위치는 보이는 크기(접혔으면 아이콘)가 다 들어오게.
 * 그릴 때만 쓴다. 상태·저장값은 이 값으로 바꾸지 않는다(좁은 화면을 한 번 거쳤다고 저장 크기가 영구히 줄지 않게 — placeDockWindow).
 * 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
export function clampDockWindow(win: DockWindow, viewport: DockViewport): DockWindow {
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);
  const { w, h } = fitSize(win.w, win.h, viewport);
  const shownW = win.collapsed ? DOCK_ICON_SIZE : w;
  const shownH = win.collapsed ? DOCK_ICON_SIZE : h;
  const x = Math.round(clamp(win.x, 0, vw - shownW));
  const y = Math.round(clamp(win.y, 0, vh - shownH));
  if (x === win.x && y === win.y && w === win.w && h === win.h) return win;
  return { ...win, x, y, w, h };
}

/**
 * 위치만 화면 안으로 맞춘다 — 저장 w·h 는 그대로 둔다. 위치는 뷰포트로 줄인 표시 크기 기준이라 지금 화면에서 창이 다 보인다.
 * 저장 크기가 바뀌는 때는 사용자가 크기를 조절할 때(resizeDockWindow)와 새 창의 메타 기본 크기뿐이다.
 * 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
export function placeDockWindow(win: DockWindow, viewport: DockViewport): DockWindow {
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);
  const { w, h } = fitSize(win.w, win.h, viewport);
  const shownW = win.collapsed ? DOCK_ICON_SIZE : w;
  const shownH = win.collapsed ? DOCK_ICON_SIZE : h;
  const x = Math.round(clamp(win.x, 0, vw - shownW));
  const y = Math.round(clamp(win.y, 0, vh - shownH));
  if (x === win.x && y === win.y) return win;
  return { ...win, x, y };
}

function topZ(windows: readonly DockWindow[]): number {
  return windows.reduce((m, w) => Math.max(m, w.z), 0);
}

/** 창 하나를 맨 앞으로. 쌓임 순서를 1..n 으로 다시 매겨 z 가 끝없이 커지지 않게 한다. 이미 홀로 맨 앞이면 그대로. */
export function bringDockWindowToFront(windows: DockWindow[], id: string): DockWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return windows;
  const top = topZ(windows);
  if (target.z === top && windows.every((w) => w.id === id || w.z < top)) return windows;
  const order = windows
    .filter((w) => w.id !== id)
    .sort((a, b) => a.z - b.z)
    .map((w) => w.id);
  order.push(id);
  const zOf = new Map(order.map((wid, i) => [wid, i + 1]));
  return windows.map((w) => (w.z === zOf.get(w.id) ? w : { ...w, z: zOf.get(w.id)! }));
}

export type OpenDockResult =
  | { kind: "opened"; windows: DockWindow[]; id: string }
  /** multiple===false 위젯이 이미 열려 있어 그 창을 펼쳐 앞으로 가져왔다. */
  | { kind: "focused"; windows: DockWindow[]; id: string }
  /** 창 수 한도(DOCK_MAX_WINDOWS). windows 는 그대로다. */
  | { kind: "limit"; windows: DockWindow[] };

/**
 * 위젯 창을 연다. multiple===false 이고 이미 열려 있으면 새로 만들지 않고 펼쳐서 앞으로 가져온다.
 * 새 창은 메타 크기로 오른쪽 위에서 계단식으로 놓고 맨 앞에 둔다. 창 ID 는 비어 있는 첫 자리의 고정 ID(dockWindowSlotId).
 */
export function openDockWindow(
  windows: DockWindow[],
  entry: WidgetRegistryEntry,
  viewport: DockViewport
): OpenDockResult {
  const widgetId = entry.meta.id;
  if (entry.meta.multiple === false) {
    const open = windows.find((w) => w.widgetId === widgetId);
    if (open) {
      const placed = placeDockWindow(open.collapsed ? { ...open, collapsed: false } : open, viewport);
      // 이미 펼쳐져 맨 앞에 있고 자리도 그대로면 바뀐 것이 없다 — 같은 배열을 돌려준다(상태·저장이 움직이지 않게).
      const expanded = placed === open ? windows : windows.map((w) => (w === open ? placed : w));
      return { kind: "focused", windows: bringDockWindowToFront(expanded, open.id), id: open.id };
    }
  }
  if (windows.length >= DOCK_MAX_WINDOWS) return { kind: "limit", windows };
  // 창이 8개 미만이므로 1~8 자리 중 빈 자리가 늘 있다.
  const used = new Set(windows.map((w) => w.id));
  let slot = 1;
  while (used.has(dockWindowSlotId(widgetId, slot))) slot += 1;
  const id = dockWindowSlotId(widgetId, slot);
  const size = windowSizeFor(entry.meta);
  const k = windows.length;
  const win = placeDockWindow(
    {
      id,
      widgetId,
      x: viewport.width - size.w - CASCADE.right - k * CASCADE.step,
      y: CASCADE.top + k * CASCADE.step,
      w: size.w,
      h: size.h,
      collapsed: false,
      z: topZ(windows) + 1,
    },
    viewport
  );
  return { kind: "opened", windows: bringDockWindowToFront([...windows, win], id), id };
}

/** 창 닫기(목록에서 뺀다). */
export function closeDockWindow(windows: DockWindow[], id: string): DockWindow[] {
  return windows.some((w) => w.id === id) ? windows.filter((w) => w.id !== id) : windows;
}

/** 접기 ↔ 펼치기. 펼치면 펼친 크기로 위치를 맞추고 맨 앞으로 가져온다(저장 크기는 그대로). */
export function toggleDockCollapse(
  windows: DockWindow[],
  id: string,
  viewport: DockViewport
): DockWindow[] {
  const target = windows.find((w) => w.id === id);
  if (!target) return windows;
  const next = placeDockWindow({ ...target, collapsed: !target.collapsed }, viewport);
  const replaced = windows.map((w) => (w.id === id ? next : w));
  return next.collapsed ? replaced : bringDockWindowToFront(replaced, id);
}

/** 창 옮기기(위치만 뷰포트 안으로 맞춘다 — 저장 크기는 그대로). */
export function moveDockWindow(
  windows: DockWindow[],
  id: string,
  x: number,
  y: number,
  viewport: DockViewport
): DockWindow[] {
  return patch(windows, id, (w) => placeDockWindow({ ...w, x, y }, viewport));
}

/** 창 크기 바꾸기 — 사용자가 조절한 값이므로 저장 크기가 바뀐다(최소 크기·뷰포트 안으로 자르고, 커진 만큼 위치도 맞춘다). */
export function resizeDockWindow(
  windows: DockWindow[],
  id: string,
  w: number,
  h: number,
  viewport: DockViewport
): DockWindow[] {
  return patch(windows, id, (win) => {
    const size = fitSize(w, h, viewport);
    return placeDockWindow({ ...win, w: size.w, h: size.h }, viewport);
  });
}

function patch(windows: DockWindow[], id: string, fn: (w: DockWindow) => DockWindow): DockWindow[] {
  let changed = false;
  const out = windows.map((w) => {
    if (w.id !== id) return w;
    const next = fn(w);
    if (
      next.x === w.x &&
      next.y === w.y &&
      next.w === w.w &&
      next.h === w.h &&
      next.collapsed === w.collapsed
    )
      return w;
    changed = true;
    return next;
  });
  return changed ? out : windows;
}

/**
 * 저장값 정리 — ID 겹침·창 수 한도는 늘, 등록부 판단(없는 위젯·floatable 아님·사용 중지·multiple===false 중복)은 등록부가
 * ready 일 때만 한다. 정의 위젯(계산기·메모 등)은 정의 조회가 끝나기 전 등록부에 없으므로 그 전에 지우면 저장값을 잃는다.
 * 바뀐 것이 없으면 같은 배열을 돌려준다.
 */
export function sanitizeDockWindows(
  windows: DockWindow[],
  registry: WidgetRegistry,
  status: DockRegistryStatus
): DockWindow[] {
  const ready = status === "ready";
  const ids = new Set<string>();
  const singles = new Set<string>();
  const out: DockWindow[] = [];
  for (const w of windows) {
    if (out.length >= DOCK_MAX_WINDOWS) break;
    if (ids.has(w.id)) continue;
    if (ready) {
      const entry = registry[w.widgetId];
      if (!isDockableEntry(entry)) continue;
      if (entry.meta.multiple === false) {
        if (singles.has(w.widgetId)) continue;
        singles.add(w.widgetId);
      }
    }
    ids.add(w.id);
    out.push(w);
  }
  return out.length === windows.length ? windows : out;
}
