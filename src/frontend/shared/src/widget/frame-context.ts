"use client";

/** 위젯 틀 맥락 — 위젯 본체가 틀에 상태를 알리고, 제목 줄 자리에 내용을 넣고, 본문 크기를 읽는다(스펙 §2.2). */
import { createContext, createElement, Fragment, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WidgetStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry?: () => void };

export interface WidgetFrameApi {
  setStatus: (status: WidgetStatus) => void;
  /**
   * 틀 제목을 덮어쓴다(null = 등록부 제목으로 되돌림). 선택 — 이 함수가 없는 맥락(틀 밖)에서는 {@link useWidgetTitle} 이 아무 일도 하지 않는다.
   * 틀이 위젯 ID 별로 값을 기억하므로 같은 칸에 다른 위젯이 오면 덮어쓰기는 저절로 풀린다.
   */
  setTitle?: (title: string | null) => void;
  bodySize: { width: number; height: number | null };
  actionsSlot: HTMLElement | null;
  titleSlot: HTMLElement | null;
}

const NOOP_API: WidgetFrameApi = {
  setStatus: () => {},
  bodySize: { width: 0, height: null },
  actionsSlot: null,
  titleSlot: null,
};

export const WidgetFrameContext = createContext<WidgetFrameApi>(NOOP_API);

export function useWidgetStatus(): (status: WidgetStatus) => void {
  return useContext(WidgetFrameContext).setStatus;
}

export function useWidgetBodySize(): { width: number; height: number | null } {
  return useContext(WidgetFrameContext).bodySize;
}

/**
 * 위젯 본체가 틀 제목 줄의 제목을 바꾼다 — 사용자가 이름을 붙인 칸처럼 칸마다 제목이 다른 위젯용이다(예: 개인 메모장).
 * 제목 줄 `h3` 와 틀의 `aria-label` 만 바뀌고, 본체에 넘어가는 `props.title`(등록부 이름)은 그대로다.
 * `null`·`undefined`·공백뿐인 값은 「덮어쓰지 않음」(등록부 제목)이다. 값이 바뀌거나 본체가 사라지면 이전 덮어쓰기를 되돌린다.
 * 이 훅을 쓰지 않는 위젯은 제목 줄·DOM·동작이 이전과 같다.
 */
export function useWidgetTitle(title: string | null | undefined): void {
  const setTitle = useContext(WidgetFrameContext).setTitle;
  useEffect(() => {
    if (!setTitle) return;
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [setTitle, title]);
}

/** 제목 줄 오른쪽(버튼 앞)에 위젯 고유 버튼·배지를 넣는다. */
export function WidgetHeaderActions({ children }: { children?: ReactNode }) {
  const slot = useContext(WidgetFrameContext).actionsSlot;
  return slot ? createPortal(createElement(Fragment, null, children), slot) : null;
}

/** 제목 바로 옆에 동적 부제·배지를 넣는다(예: "안읽음 3건"). */
export function WidgetTitleExtra({ children }: { children?: ReactNode }) {
  const slot = useContext(WidgetFrameContext).titleSlot;
  return slot ? createPortal(createElement(Fragment, null, children), slot) : null;
}

/** 포털 셸이 듣는 화면 열기 이벤트(m-mcm home types.ts openPortalTab 과 같은 계약). */
export function openPortalPage(pageId: string): void {
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
}
