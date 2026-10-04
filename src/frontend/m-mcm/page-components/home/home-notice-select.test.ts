/** @vitest-environment happy-dom */
/**
 * 공지 행 선택이 홈 페이지·보드로 번지지 않는지(widget-render-findings W8) — 홈 페이지는 공지 목록만 구독해야 한다.
 * 실제 공지 저장소(notice-store)를 쓰고, WidgetWorkspace 는 렌더 횟수만 세는 대역이다(home-pdf.test 와 같은 대역 구성).
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ wsRenders: 0 }));

vi.mock("@dk-oasis/shared/widget", async () => {
  const { createElement: el } = await import("react");
  return {
    mergeWidgetRegistry: () => ({}),
    toWidgetDefRow: () => null,
    WidgetWorkspace: (p: { testId?: string }) => {
      h.wsRenders += 1;
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

vi.mock("./api", () => ({
  fetchCurrentUser: () => new Promise(() => {}),
  fetchNoticeDetail: async () => null,
  searchNoticeBoard: async () => [
    { NOTICE_ID: 1, TITLE: "긴급 점검", CONTENT: null, NOTICE_CATEGORY: "URGENT" },
    { NOTICE_ID: 2, TITLE: "일반 공지", CONTENT: null, NOTICE_CATEGORY: "NORMAL" },
  ],
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
import { selectNotice } from "./notice-store";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.wsRenders = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("홈 — 공지 행 선택(W8)", () => {
  it("공지 행을 골라도 홈 페이지(작업 공간)가 다시 그려지지 않는다", async () => {
    await act(async () => {
      root.render(createElement(PortalHomePage, {} as never));
    });
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    // 목록이 도착해 긴급 공지 띠가 보인다(목록 구독은 살아 있다).
    expect(host.querySelector('[data-testid="home-urgent"]')).not.toBeNull();
    const before = h.wsRenders;
    act(() => selectNotice("2"));
    act(() => selectNotice("1"));
    expect(h.wsRenders).toBe(before);
  });
});
