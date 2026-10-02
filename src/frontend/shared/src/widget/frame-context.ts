"use client";

/** 위젯 틀 맥락 — 위젯 본체가 틀에 상태를 알리고, 제목 줄 자리에 내용을 넣고, 본문 크기를 읽는다(스펙 §2.2). */
import { createContext, createElement, Fragment, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type WidgetStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry?: () => void };

export interface WidgetFrameApi {
  setStatus: (status: WidgetStatus) => void;
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
