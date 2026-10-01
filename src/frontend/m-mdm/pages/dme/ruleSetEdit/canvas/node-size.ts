/**
 * 노드 크기 손잡이(S1 §2.2) — 손잡이 이름·끌기 계산·끌기 저장소·문맥. 그리기는 nodes.tsx(FlowNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 4단계 그룹 크기(group-size.ts)와 같은 방식 — 끄는 동안은 저장소에만 두고(캔버스의 그 노드·그룹 틀만 다시 그린다) 놓을 때 한 번 올린다.
 * 왼쪽 위 자리는 고정이다(S-D4). 범위는 232~640 × 68~320.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

import { NODE_H_MAX, NODE_H_MIN, NODE_W_MAX, NODE_W_MIN, type NodeSize } from "../node-style";

/** 오른쪽 변(e)·아래 변(s)·오른쪽 아래 모서리(se). */
export type NodeGrip = "e" | "s" | "se";
export const NODE_GRIPS: readonly NodeGrip[] = ["e", "s", "se"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 크기 — 정수로 반올림해 범위로 자른다. */
export function dragNodeSize(base: NodeSize, grip: NodeGrip, dx: number, dy: number): NodeSize {
  return {
    w: grip.includes("e") ? clamp(base.w + dx, NODE_W_MIN, NODE_W_MAX) : base.w,
    h: grip.includes("s") ? clamp(base.h + dy, NODE_H_MIN, NODE_H_MAX) : base.h,
  };
}
export const sameSize = (a: NodeSize, b: NodeSize) => a.w === b.w && a.h === b.h;

export interface NodeSizeDrag {
  nodeId: string;
  size: NodeSize;
}
/** 끄는 동안의 크기 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface NodeSizeStore {
  drag: NodeSizeDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createNodeSizeStore(): NodeSizeStore {
  const listeners = new Set<() => void>();
  return {
    drag: null,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => listeners.forEach((cb) => cb()),
  };
}

export interface NodeSizeApi {
  /** 손잡이 누르기 — 끄는 동안 저장소를 바꾸고, 놓을 때 바뀌었으면 한 번 올린다. */
  startDrag(e: ReactPointerEvent, nodeId: string, grip: NodeGrip): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16). */
export const NodeSizeContext = createContext<NodeSizeApi | null>(null);
