/** @vitest-environment happy-dom */
/**
 * 홈 [PDF] 연결 시험 — 홈 화면이 작업 공간에 인쇄 대상(pdfTarget)으로 홈 뿌리 .mcm-home 을 넘기는지 본다.
 * [PDF] 단추 자체(누르면 인쇄 유틸이 대상·「{탭 이름}_{yyyyMMdd}」로 불림, 편집 중 비활성)는
 * shared tests/unit/widget-workspace-pdf.unit.test.ts 가 시험한다. 여기서 WidgetWorkspace 는 받은 props 를 잡는 대역이다.
 * 서버 호출(./api·./widget-defs·./notice-store·./widget-store)과 생성 등록부도 대역으로 바꾼다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** 마지막으로 WidgetWorkspace 에 넘어간 props. */
  ws: { current: null as null | { pdfTarget?: RefObject<HTMLElement | null>; testId?: string; fixedHome?: boolean; mode?: string } },
}));

vi.mock("@dk-oasis/shared/widget", async () => {
  const { createElement: el } = await import("react");
  return {
    mergeWidgetRegistry: () => ({}),
    toWidgetDefRow: () => null,
    WidgetWorkspace: (p: { pdfTarget?: RefObject<HTMLElement | null>; testId?: string; fixedHome?: boolean; mode?: string }) => {
      h.ws.current = p;
      return el("div", { "data-testid": p.testId });
    },
  };
});

vi.mock("@dk-oasis/shared/layout", async () => {
  const { createElement: el } = await import("react");
  return { PageLayout: (p: { children?: unknown }) => el("div", { className: "page-layout" }, p.children as never) };
});

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Badge: (p: { label?: string }) => el("span", null, p.label),
    Button: (p: { children?: unknown; onClick?: () => void }) => el("button", { type: "button", onClick: p.onClick }, p.children as never),
    SegmentedControl: () => el("div"),
  };
});

vi.mock("@/lib/generated/widget-registry", () => ({ WIDGET_REGISTRY: {} }));
vi.mock("@/lib/generated/widget-type-registry", () => ({ WIDGET_TYPE_REGISTRY: {} }));
vi.mock("@/lib/widget-defs-events", () => ({ onWidgetDefsChanged: () => () => {} }));

vi.mock("./api", () => ({ fetchCurrentUser: () => new Promise(() => {}) }));
vi.mock("./notice-store", () => ({
  ensureNoticesLoaded: () => {},
  resetNoticesRequest: () => {},
  selectNotice: () => {},
  useNoticeStore: () => ({ notices: { status: "loading" } }),
  useNotices: () => ({ status: "loading" }),
}));
vi.mock("./widget-defs", () => ({
  INITIAL_DEFS_STATE: { status: "loading", rawDefs: [], homeDefault: null },
  defsReducer: (s: unknown) => s,
  fetchWidgetDefs: () => new Promise(() => {}),
  pickHomeDefault: (_d: unknown, fallback: unknown) => fallback,
  typeTitlesOf: () => ({}),
}));
vi.mock("./widget-store", () => ({ secWidgetStore: {} }));

import PortalHomePage from "./page";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.ws.current = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("홈 [PDF] 인쇄 대상", () => {
  it("작업 공간에 pdfTarget 으로 홈 뿌리 .mcm-home(인사말·공지 띠·탭 줄·보드를 모두 담은 요소)을 넘긴다", () => {
    act(() => root.render(createElement(PortalHomePage, {} as never)));
    const target = h.ws.current?.pdfTarget?.current;
    expect(target).toBeTruthy();
    expect(target!.classList.contains("mcm-home")).toBe(true);
    expect(target!.getAttribute("data-testid")).toBe("portal-home");
    // 인사말과 작업 공간이 모두 대상 안에 있다.
    expect(target!.querySelector('[data-testid="home-greeting"]')).not.toBeNull();
    expect(target!.querySelector('[data-testid="home-widgets"]')).not.toBeNull();
  });
});

describe("홈 고정 탭", () => {
  it("작업 공간에 fixedHome 을 켠다(「홈」은 늘 전사 기본 배치로 그리는 고정 탭, 사용자 모드)", () => {
    act(() => root.render(createElement(PortalHomePage, {} as never)));
    expect(h.ws.current?.fixedHome).toBe(true);
    expect(h.ws.current?.mode).toBeUndefined();
  });
});
