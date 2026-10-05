"use client";

/** 위젯 틀 맥락 — 위젯 본체가 틀에 상태를 알리고, 제목 줄 자리에 내용을 넣고, 본문 크기를 읽는다(스펙 §2.2). */
import { createContext, createElement, Fragment, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WidgetStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry?: () => void };

/**
 * 틀 제목 줄에서 이름을 바꿀 때 틀이 부르는 저장 처리기. 앞뒤 공백을 자른 새 이름(빈 문자열 = 등록부 제목으로 되돌림)을 받아 저장하고,
 * 저장하지 못하면 사용자에게 보일 문장을 담은 Error 를 던진다 — 던지면 틀은 입력칸을 열어 둔 채 그 문장을 알린다.
 */
export type WidgetRenameHandler = (title: string) => Promise<void>;

export interface WidgetFrameApi {
  setStatus: (status: WidgetStatus) => void;
  /**
   * 틀 제목을 덮어쓴다(null = 등록부 제목으로 되돌림). 선택 — 이 함수가 없는 맥락(틀 밖)에서는 {@link useWidgetTitle} 이 아무 일도 하지 않는다.
   * 틀이 위젯 ID 별로 값을 기억하므로 같은 칸에 다른 위젯이 오면 덮어쓰기는 저절로 풀린다.
   */
  setTitle?: (title: string | null) => void;
  /**
   * 틀 제목 줄의 이름 바꾸기 처리기를 등록한다(null = 등록 해제). 선택 — 등록된 위젯에서만 틀이 연필 버튼·제목 더블클릭을 켠다.
   * 이 함수가 없는 맥락(틀 밖)에서는 {@link useWidgetRename} 이 아무 일도 하지 않는다.
   */
  setRenameHandler?: (handler: WidgetRenameHandler | null) => void;
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

/**
 * 위젯 본체가 틀 제목 줄의 이름 바꾸기를 켠다 — 제목 줄에 연필 버튼(`data-action="rename"`)이 생기고 제목을 더블클릭해도 입력칸이 열린다.
 * 보기 모드에서만 보이고(배치 편집 모드에서는 숨는다), 처리기는 새 이름을 저장하는 일을 맡는다({@link WidgetRenameHandler}).
 * 저장이 성공했을 때 틀 제목을 바꾸는 일은 처리기(보통 {@link useWidgetTitle} 에 넘기는 저장된 값)가 맡는다.
 * `null`·`undefined` 를 넘기면 꺼진다(예: 저장할 수 없는 상태). 처리기 함수가 렌더마다 새로 만들어져도 등록은 다시 하지 않는다.
 * 이 훅을 쓰지 않는 위젯의 제목 줄·DOM·동작은 이전과 같다. **틀 하나에 한 곳에서만 부른다.**
 */
export function useWidgetRename(handler: WidgetRenameHandler | null | undefined): void {
  const setRenameHandler = useContext(WidgetFrameContext).setRenameHandler;
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const enabled = !!handler;
  useEffect(() => {
    if (!setRenameHandler || !enabled) return;
    setRenameHandler((title) => (latest.current ? latest.current(title) : Promise.resolve()));
    return () => setRenameHandler(null);
  }, [setRenameHandler, enabled]);
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
