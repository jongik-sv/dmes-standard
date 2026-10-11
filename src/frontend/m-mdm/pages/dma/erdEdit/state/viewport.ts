/**
 * 첫 viewport·첫 다이어그램·고른 노드가 화면 밖인지(UX 1차 U12·U22·U53). 순수 — React Flow 의 getViewportForBounds 를 쓴다.
 * FIRST_FIT_MIN_ZOOM 은 캔버스 개요 단계 문턱(canvas/erd-geometry ZOOM_OVERVIEW, FE2)과 같은 값이어야 한다. 마감에서 맞춰 본다.
 */
import { getViewportForBounds, type Viewport } from "@dk-oasis/shared/react-flow";

import type { ErdViewport } from "./prefs";

export const FIRST_FIT_MIN_ZOOM = 0.35;
export const FIRST_MARGIN = 40;
export const SMALL_DIAGRAM = 30;
export interface Rect { x: number; y: number; width: number; height: number }

const bounds = (rs: readonly Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
};

/** (1) 저장 viewport (2) 맞춤 배율(상한 1)이 문턱 이상이면 맞춤 (3) 아니면 배율 1 로 묶음 왼쪽 위를 40px 안쪽에. */
export function initialViewport(nodes: readonly Rect[], pane: { width: number; height: number }, saved: ErdViewport | null): Viewport {
  if (saved) return { x: saved.x, y: saved.y, zoom: saved.zoom };
  if (nodes.length === 0) return { x: 0, y: 0, zoom: 1 };
  const b = bounds(nodes);
  const fit = getViewportForBounds(b, pane.width, pane.height, 0.1, 1, 0.1);
  if (fit.zoom >= FIRST_FIT_MIN_ZOOM) return fit;
  return { x: FIRST_MARGIN - b.x, y: FIRST_MARGIN - b.y, zoom: 1 };
}

/** 노드가 캔버스 밖(머리 30px 도 안 보임)으로 나갔는지. */
export function nodeOutside(vp: Viewport, pane: { width: number; height: number }, n: Rect): boolean {
  const l = n.x * vp.zoom + vp.x, t = n.y * vp.zoom + vp.y;
  return l + n.width * vp.zoom > pane.width || t > pane.height || l < 0 || t + 30 * vp.zoom < 0;
}

/** 기억한 다이어그램이 살아 있으면 그것, 없으면 sortSeq 순 표 30개 이하 첫 것, 그것도 없으면 sortSeq 첫 것. */
export function firstDiagram(ds: readonly { id: string; sortSeq: number; tables: number }[], remembered: string | null): string | null {
  if (remembered && ds.some((d) => d.id === remembered)) return remembered;
  const sorted = [...ds].sort((a, b) => a.sortSeq - b.sortSeq || a.id.localeCompare(b.id));
  return sorted.find((d) => d.tables > 0 && d.tables <= SMALL_DIAGRAM)?.id ?? sorted[0]?.id ?? null;
}
