/**
 * 메모 크기 손잡이 — 손잡이 이름·끌기 계산·끌기 저장소·문맥. 그리기는 nodes.tsx(NoteNodeView), 끌기 연결은 FlowCanvas 가 한다.
 * 노드 크기(node-size.ts)와 같은 방식 — 끄는 동안은 저장소에만 두고 놓을 때 onNoteChange({w,h}) 를 한 번 부른다(되돌리기 한 칸).
 * 왼쪽 위 자리는 고정이다. 기본 크기는 160×80(flow-edit 의 NOTE_W·NOTE_H), 범위는 80~640 × 40~480.
 */
import { createContext, type PointerEvent as ReactPointerEvent } from "react";

export const NOTE_W_MIN = 80;
export const NOTE_W_MAX = 640;
export const NOTE_H_MIN = 40;
export const NOTE_H_MAX = 480;

export interface NoteSize {
  w: number;
  h: number;
}
/** 오른쪽 변(e)·아래 변(s)·오른쪽 아래 모서리(se). */
export type NoteGrip = "e" | "s" | "se";
export const NOTE_GRIPS: readonly NoteGrip[] = ["e", "s", "se"];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 크기 — 정수로 반올림해 범위로 자른다. */
export function dragNoteSize(base: NoteSize, grip: NoteGrip, dx: number, dy: number): NoteSize {
  return {
    w: grip.includes("e") ? clamp(base.w + dx, NOTE_W_MIN, NOTE_W_MAX) : base.w,
    h: grip.includes("s") ? clamp(base.h + dy, NOTE_H_MIN, NOTE_H_MAX) : base.h,
  };
}
export const sameNoteSize = (a: NoteSize, b: NoteSize) => a.w === b.w && a.h === b.h;

export interface NoteSizeDrag {
  noteId: string;
  size: NoteSize;
}
/** 끄는 동안의 크기 — FlowCanvas(Inner)만 구독한다(page 는 다시 그리지 않고 dagre 도 다시 돌지 않는다). */
export interface NoteSizeStore {
  drag: NoteSizeDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
export function createNoteSizeStore(): NoteSizeStore {
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

export interface NoteSizeApi {
  startDrag(e: ReactPointerEvent, noteId: string, grip: NoteGrip): void;
}
/** 노드 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16). */
export const NoteSizeContext = createContext<NoteSizeApi | null>(null);
