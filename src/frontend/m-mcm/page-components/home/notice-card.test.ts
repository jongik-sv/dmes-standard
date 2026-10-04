/** @vitest-environment happy-dom */
/**
 * 홈 공지 카드 — 목록은 본문 없이 오므로 고른 공지의 본문 상태(불러오는 중·오류·완료)에 따라 본문 칸이 바뀐다.
 * 본문이 도착하면 지금까지와 같은 NoticeBodyView 로 그린다(본문 모습은 그대로).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dk-oasis/shared/layout", async () => {
  const { createElement: el } = await import("react");
  return {
    ContentBody: (p: { children?: unknown }) => el("div", null, p.children as never),
    ContentPanel: (p: { children?: unknown }) => el("div", null, p.children as never),
  };
});
vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Badge: (p: { label?: string }) => el("span", null, p.label),
    Button: (p: { children?: unknown; onClick?: () => void }) =>
      el("button", { type: "button", onClick: p.onClick }, p.children as never),
  };
});
vi.mock("@dk-oasis/shared/widget", async () => {
  const { createElement: el } = await import("react");
  const pass = (p: { children?: unknown }) => el("div", null, p.children as never);
  return { WidgetHeaderActions: pass, WidgetTitleExtra: pass };
});
vi.mock("@dk-oasis/shared/notice-body-view", async () => {
  const { createElement: el } = await import("react");
  return {
    NoticeBodyView: (p: { value: string; format: string; testId?: string }) =>
      el("div", { "data-testid": p.testId, "data-format": p.format }, p.value),
  };
});

import { NoticeCard } from "./NoticeCard";
import type { NoticeDetailState } from "./types";

const rows = [{ NOTICE_ID: "N1", TITLE: "점검 안내", CONTENT_FORMAT: "MD", NOTICE_CATEGORY: "MAINT", PIN_YN: "N", POST_START_DT: null, POST_END_DT: null, C_USR_ID: "u1", C_AT: null }];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(detail: NoticeDetailState | undefined, onRetryDetail = () => {}) {
  act(() => {
    root.render(
      createElement(NoticeCard, {
        state: { status: "ok", rows },
        selectedId: "N1",
        onSelect: () => {},
        onRetry: () => {},
        detail,
        onRetryDetail,
        canManage: false,
      })
    );
  });
}

describe("NoticeCard 본문", () => {
  it("본문이 도착하면 본문 형식 그대로 보인다", () => {
    render({ status: "ok", content: "## 안내\n본문", format: null });
    const body = host.querySelector('[data-testid="home-notice-body"]');
    expect(body?.textContent).toBe("## 안내\n본문");
    expect(body?.getAttribute("data-format")).toBe("MD");
    expect(host.querySelector('[data-testid="home-notice-viewer-title"]')?.textContent).toBe("점검 안내");
  });

  it("상세 응답의 형식이 목록 시점의 형식과 다르면 상세의 형식으로 그린다", () => {
    render({ status: "ok", content: "<p>x</p>", format: "HTML" });
    expect(host.querySelector('[data-testid="home-notice-body"]')?.getAttribute("data-format")).toBe("HTML");
  });

  it("본문이 비어 있으면 빈 값으로 넘긴다(뷰어가 안내 문구를 낸다)", () => {
    render({ status: "ok", content: null, format: null });
    expect(host.querySelector('[data-testid="home-notice-body"]')?.textContent).toBe("");
  });

  it("받는 중이거나 요청 전이면 불러오는 중을 보인다", () => {
    render({ status: "loading" });
    expect(host.querySelector('[data-testid="home-notice-body-loading"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="home-notice-body"]')).toBeNull();
    render(undefined);
    expect(host.querySelector('[data-testid="home-notice-body-loading"]')).not.toBeNull();
  });

  it("실패하면 오류와 다시 시도 단추를 보이고, 누르면 상세를 다시 요청한다", () => {
    const retry = vi.fn();
    render({ status: "error" }, retry);
    expect(host.querySelector('[data-testid="home-notice-body-error"]')).not.toBeNull();
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-testid="home-notice-body-error"] button')?.click();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
