/**
 * 받는 노드 옮기기(D-142) — 끌기 저장소·문맥. 받는 노드는 React Flow 끌기 대상이 아니다(여러 개를 함께 끌 때 위치로 적히지 않게).
 * 원을 누르고 끌면 붙은 룰 테두리를 따라 미끄러지고(`catchSpotAt`), 놓을 때 한 번 올린다. 그리기는 nodes.tsx(FlowNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 노드 크기 손잡이(node-size.ts)와 같은 방식 — 끄는 동안은 저장소에만 두어 캔버스만 다시 그린다.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

import type { CatchSpot } from "../flow-edit";

export interface CatchMoveDrag {
  catchId: string;
  spot: CatchSpot;
}
/** 끄는 동안의 자리 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface CatchMoveStore {
  drag: CatchMoveDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createCatchMoveStore(): CatchMoveStore {
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

/** 누르고 이만큼(화면 px) 움직여야 옮기기로 본다 — 그보다 적으면 누르기(고르기)·우클릭이 그대로다. */
export const CATCH_MOVE_THRESHOLD_PX = 4;

export interface CatchMoveApi {
  /** 받는 노드 누르기 — 문턱을 넘어 끌면 저장소를 바꾸고, 놓을 때 자리가 바뀌었으면 한 번 올린다. */
  startDrag(e: ReactPointerEvent, catchId: string): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16). */
export const CatchMoveContext = createContext<CatchMoveApi | null>(null);
