/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/portal-shell/use-current-user-id", () => ({ useCurrentUserId: () => "u1" }));
vi.mock("../../src/portal-shell/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/portal-shell/current-user")>()),
  peekCurrentUser: () => null,
}));

import { ContentBody, LayoutContextBoundary } from "../../src/layout/ContentBody";
import { ContentPanel } from "../../src/layout/ContentPanel";
import { WidgetFrame } from "../../src/widget";
import { renderWithMantine } from "./mantine-test-utils";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
if (typeof window !== "undefined") Object.defineProperty(window, "localStorage", { value: ls, configurable: true });

describe("LayoutContextBoundary", () => {
  afterEach(() => localStorage.clear());

  const inner = () => h(ContentBody, { resizable: true, storageKey: "inner" }, h(ContentPanel, { key: "a", minSize: 200 }, "A"), h(ContentPanel, { key: "b", minSize: 240 }, "B"));

  it("resizable 바깥 패널 안의 ContentBody 는 nested 로 판정되어 바깥 규격 flex·min-width 를 받는다", () => {
    const r = renderWithMantine(h(ContentBody, { root: true, resizable: true }, h(ContentPanel, { key: "p", width: "35%" }, h(ContentBody, null, "x")), h(ContentPanel, { key: "q" }, "Q")));
    const body = document.querySelector<HTMLElement>(".content-panel .content-body")!;
    expect(body.classList.contains("content-body--nested")).toBe(true);
    expect(body.style.minWidth).toBe("200px");
    r.unmount();
  });

  it("경계 안의 ContentBody 는 nested 가 아니고 바깥 저장 비율·min-width 인라인을 받지 않는다", () => {
    const r = renderWithMantine(
      h(
        ContentBody,
        { root: true, resizable: true },
        h(ContentPanel, { key: "p", width: "35%" }, h(LayoutContextBoundary, null, h(ContentBody, null, "x"))),
        h(ContentPanel, { key: "q" }, "Q"),
      ),
    );
    const body = document.querySelector<HTMLElement>(".content-panel .content-body")!;
    expect(body.classList.contains("content-body--nested")).toBe(false);
    expect(body.style.flex).toBe("");
    expect(body.style.minWidth).toBe("");
    r.unmount();
  });

  it("경계 안에서도 자기 resizable 분할은 그대로 동작한다(막대·최소 크기)", () => {
    const r = renderWithMantine(
      h(
        ContentBody,
        { root: true, resizable: true },
        h(ContentPanel, { key: "p", width: "35%" }, h(LayoutContextBoundary, null, inner())),
        h(ContentPanel, { key: "q" }, "Q"),
      ),
    );
    const nested = document.querySelector(".content-panel .content-body")!;
    expect(nested.classList.contains("content-body--nested")).toBe(false);
    expect(nested.querySelectorAll(".content-split-bar").length).toBe(1);
    const panels = nested.querySelectorAll<HTMLElement>(".content-panel");
    expect([panels[0].style.minWidth, panels[1].style.minWidth]).toEqual(["200px", "240px"]);
    r.unmount();
  });

  it("WidgetFrame 본체 안 ContentBody 는 바깥 resizable 패널 안에 그려져도 nested 가 아니다", async () => {
    const Body = () => h(ContentBody, null, h("p", null, "본문"));
    const item = { instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null };
    const entry = { meta: { id: "t.a", title: "샘플", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: Body }) };
    const noop = () => {};
    const frame = h(WidgetFrame, { item, entry, editing: false, onToggleLock: noop, onRemove: noop });
    const r = renderWithMantine(h(ContentBody, { root: true, resizable: true }, h(ContentPanel, { key: "a", width: "35%" }, frame), h(ContentPanel, { key: "b" }, "B")));
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const inner = document.querySelector<HTMLElement>(".cm-widget__body .content-body")!;
    expect(inner).not.toBeNull();
    expect(inner.classList.contains("content-body--nested")).toBe(false);
    expect(inner.style.flex).toBe("");
    expect(inner.style.minWidth).toBe("");
    r.unmount();
  });
});
