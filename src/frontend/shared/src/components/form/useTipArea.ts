"use client";

/**
 * 툴팁 트리거 범위를 라벨 글자에서 라벨 칸 전체로 넓히는 내부 훅(2026-10-05) — `FormGroup`(라벨 박스)·`MdmFieldLabel`(th·td·검색 라벨 칸)이 쓴다.
 * 그리드 머리글 `MdmHeaderLabel` 과 같은 방식이다: 카드 위치(앵커)는 라벨 글자 기준 그대로, hover 감지만 칸 전체에 건다.
 * 칸 안 이동은 `mouseover`·`mouseout` 의 relatedTarget 이 칸 안이면 무시하고(들어옴·나감이 아니다), 칸 안을 누르면(pointerdown) 닫는다.
 * 키보드 focus 로 여는 경로는 이 훅이 다루지 않는다(각 부품이 그대로 둔다). 이벤트는 칸에 직접 걸므로 입력칸(.form-group-field·td 입력)에는 걸리지 않는다.
 */
import { useEffect, type RefObject } from "react";

export interface TipAreaHandlers {
  showTip: (e?: { type?: string }) => void;
  hideTip: (e?: { type?: string }) => void;
  closeTip: () => void;
}

/** 라벨 앵커에서 칸을 찾는다 — 못 찾으면 null(호출자가 앵커 자신으로 대신한다). */
export type FindTipCell = (anchor: HTMLElement) => HTMLElement | null;

/**
 * @param anchorRef 툴팁 앵커(글자 span 또는 라벨 박스)
 * @param active 트리거가 DOM 에 있을 때만 true — 켜질 때 칸을 찾아 리스너를 건다
 * @param findCell 앵커에서 칸 찾기. 기본은 앵커 자신.
 */
export function useTipArea(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
  { showTip, hideTip, closeTip }: TipAreaHandlers,
  findCell?: FindTipCell
): void {
  useEffect(() => {
    if (!active) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const cell = (findCell ? findCell(anchor) : null) ?? anchor;
    const onOver = (e: MouseEvent) => {
      if (e.relatedTarget instanceof Node && cell.contains(e.relatedTarget)) return;
      showTip(e);
    };
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget instanceof Node && cell.contains(e.relatedTarget)) return;
      hideTip(e);
    };
    const onDown = () => closeTip();
    cell.addEventListener("mouseover", onOver);
    cell.addEventListener("mouseout", onOut);
    cell.addEventListener("pointerdown", onDown);
    return () => {
      cell.removeEventListener("mouseover", onOver);
      cell.removeEventListener("mouseout", onOut);
      cell.removeEventListener("pointerdown", onDown);
    };
  }, [active, anchorRef, findCell, showTip, hideTip, closeTip]);
}
