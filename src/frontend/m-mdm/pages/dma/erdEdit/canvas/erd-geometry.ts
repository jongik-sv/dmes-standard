/**
 * ERD 캔버스 기하(순수) — 노드 크기, 관계선이 나갈 변, 끝 모양 경로(스펙 2.2: 부모 "1" 이중 막대, 자식 "0..N" 까마귀발).
 * 끝 모양은 선의 끝 점(end, 노드에 닿는 점)과 바로 앞 점(inner)으로 방향을 정한다. 직교 꺾은선이라 끝 구간은 늘 수평이다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import type { ErdColumn } from "../types";

export const NODE_WIDTH = 240;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = 20;
/** 이 확대율 미만이면 노드는 이름만 그린다(스펙 8절). */
export const ZOOM_NAMES_ONLY = 0.5;
/** 손잡이에서 첫 꺾임까지 거리. 끝 모양(최대 22px)이 꺾임에 걸리지 않게 둔다. */
export const END_STUB = 28;

export type NodeSide = "L" | "R";

/** 노드 높이 추정(측정 전 initialHeight·화면 맞춤용). 테두리 2px 포함. */
export function nodeHeight(rows: number, more: boolean): number {
  return HEADER_HEIGHT + rows * ROW_HEIGHT + (more ? ROW_HEIGHT : 0) + 2;
}

/** 관계선이 나갈 변. 자식이 부모 왼쪽(같은 x 포함)이면 자식 오른쪽 → 부모 왼쪽, 아니면 반대. 자기 참조는 둘 다 오른쪽(시안). */
export function relationSides(childX: number, parentX: number, self: boolean): { child: NodeSide; parent: NodeSide } {
  if (self) return { child: "R", parent: "R" };
  return childX <= parentX ? { child: "R", parent: "L" } : { child: "L", parent: "R" };
}

/** 소수 둘째 자리까지. -0 은 0 으로 쓴다. */
const num = (n: number): string => String(Math.round(n * 100) / 100 || 0);

function frame(end: FlowPos, inner: FlowPos): { u: FlowPos; n: FlowPos } {
  const dx = end.x - inner.x;
  const dy = end.y - inner.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  return { u, n: { x: -u.y, y: u.x } };
}

/** 자식 끝 까마귀발(N) — 끝에서 depth 안쪽 한 점에서 끝의 양옆 size 로 벌어지는 두 선. */
export function crowFootPath(end: FlowPos, inner: FlowPos, size = 6, depth = 12): string {
  const { u, n } = frame(end, inner);
  const b = { x: end.x - u.x * depth, y: end.y - u.y * depth };
  return `M ${num(b.x)} ${num(b.y)} L ${num(end.x + n.x * size)} ${num(end.y + n.y * size)} `
    + `M ${num(b.x)} ${num(b.y)} L ${num(end.x - n.x * size)} ${num(end.y - n.y * size)}`;
}

/** 부모 끝 이중 막대("1") — 끝에서 6px·10px 안쪽을 가로지르는 선 둘. */
export function oneBarsPath(end: FlowPos, inner: FlowPos, size = 6): string {
  const { u, n } = frame(end, inner);
  return [6, 10]
    .map((d) => {
      const p = { x: end.x - u.x * d, y: end.y - u.y * d };
      return `M ${num(p.x + n.x * size)} ${num(p.y + n.y * size)} L ${num(p.x - n.x * size)} ${num(p.y - n.y * size)}`;
    })
    .join(" ");
}

/** 자식 쪽 "0"(선택) 원의 가운데 — 까마귀발 바로 바깥. */
export function zeroCirclePos(end: FlowPos, inner: FlowPos, gap = 18): FlowPos {
  const { u } = frame(end, inner);
  return { x: Number(num(end.x - u.x * gap)), y: Number(num(end.y - u.y * gap)) };
}

/** 타입 글자 — VARCHAR2(30), NUMBER(10,2), DATE. */
export function typeText(c: Pick<ErdColumn, "dataType" | "length" | "scale">): string {
  if (!c.dataType) return "";
  if (c.length == null) return c.dataType;
  return c.scale == null ? `${c.dataType}(${c.length})` : `${c.dataType}(${c.length},${c.scale})`;
}
