/**
 * 그룹 크기 손잡이(4단계 G2) — 손잡이 이름·끌기 계산·끌기 저장소·문맥. 그리기는 nodes.tsx(GroupNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 끄는 동안은 저장소에만 두고(캔버스의 그룹 틀만 다시 그린다) 놓을 때 FlowCanvas 가 onGroupPadChange 를 한 번 부른다.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

import { MAX_GROUP_PAD, type GroupPad } from "../flow-edit";

/** 네 모서리(nw·ne·se·sw)와 네 변(n·e·s·w). */
export type GroupGrip = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const GROUP_GRIPS: readonly GroupGrip[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const ZERO_PAD: GroupPad = Object.freeze({ l: 0, t: 0, r: 0, b: 0 });

const clamp = (n: number) => Math.max(0, Math.min(MAX_GROUP_PAD, Math.round(n)));

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 여백. 왼·위 변은 바깥(음수)으로 끌면 커진다. 0~2000 정수로 자른다(소속 노드보다 작아지지 않는다). */
export function dragGroupPad(base: GroupPad, grip: GroupGrip, dx: number, dy: number): GroupPad {
  return {
    l: grip.includes("w") ? clamp(base.l - dx) : base.l,
    t: grip.includes("n") ? clamp(base.t - dy) : base.t,
    r: grip.includes("e") ? clamp(base.r + dx) : base.r,
    b: grip.includes("s") ? clamp(base.b + dy) : base.b,
  };
}

export const samePad = (a: GroupPad, b: GroupPad) => a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b;

export interface GroupPadDrag {
  groupId: string;
  pad: GroupPad;
}
/** 끄는 동안의 여백 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface GroupPadStore {
  drag: GroupPadDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createGroupPadStore(): GroupPadStore {
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

export interface GroupSizeApi {
  /** 손잡이 누르기 — 끄는 동안 저장소를 바꾸고, 놓을 때 바뀌었으면 한 번 올린다. */
  startDrag(e: ReactPointerEvent, groupId: string, grip: GroupGrip): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16 — 데이터 참조가 바뀌면 노드를 모두 다시 그린다). */
export const GroupSizeContext = createContext<GroupSizeApi | null>(null);
