/** @vitest-environment happy-dom */
import { act, createElement as h, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame, WidgetHeaderActions, useWidgetStatus } from "../../src/widget";
import type { WidgetItem, WidgetRegistryEntry } from "../../src/widget";

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

const item = (extra: Partial<WidgetItem> = {}): WidgetItem => ({
  instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null, ...extra,
});
const entry = (component: unknown, extra: Partial<WidgetRegistryEntry["meta"]> = {}): WidgetRegistryEntry => ({
  meta: { id: "t.a", title: "샘플 위젯", defaultSize: { w: 6, h: 6 }, ...extra },
  load: async () => ({ default: component }),
});
const noop = () => {};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe("WidgetFrame", () => {
  it("제목을 그리고 지연 로딩한 본체를 보인다", async () => {
    const Body = () => h("p", { "data-testid": "body" }, "본문");
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.querySelector(".cm-widget__title")!.textContent).toBe("샘플 위젯");
    expect(host.querySelector('[data-testid="body"]')!.textContent).toBe("본문");
    expect(host.querySelector(".cm-widget")!.getAttribute("data-widget-id")).toBe("t.a");
  });

  it("본체가 렌더 중 예외를 던져도 틀 안에 안내와 [다시 시도]만 보인다", async () => {
    const Broken = () => {
      throw new Error("boom");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Broken), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.textContent).toContain("위젯을 불러오지 못했습니다.");
    expect(host.querySelector('[data-action="retry"]')).not.toBeNull();
    spy.mockRestore();
  });

  it("useWidgetStatus 의 error 를 틀이 공통 모양으로 그린다", async () => {
    const retry = vi.fn();
    const Body = () => {
      const setStatus = useWidgetStatus();
      useEffect(() => setStatus({ kind: "error", message: "조회 실패", retry }), [setStatus]);
      return h("p", null, "본문");
    };
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.textContent).toContain("조회 실패");
    act(() => (host.querySelector('[data-action="retry"]') as HTMLButtonElement).click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("WidgetHeaderActions 내용은 제목 줄로 옮겨진다", async () => {
    const Body = () => h(WidgetHeaderActions, null, h("span", { "data-testid": "act" }, "배지"));
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.querySelector(".cm-widget__head [data-testid='act']")).not.toBeNull();
  });

  it("보기 모드에서는 새로 고침·화면 열기만, 편집 모드에서는 잠금·빼기만 보인다", async () => {
    const Body = () => h("p", null, "본문");
    const props = { item: item(), entry: entry(Body, { linkPageId: "mls:lsh/noticeMgmt" }), onToggleLock: noop, onRemove: noop };
    act(() => root.render(h(WidgetFrame, { ...props, editing: false })));
    await flush();
    expect(host.querySelector('[data-action="refresh"]')).not.toBeNull();
    expect(host.querySelector('[data-action="open"]')).not.toBeNull();
    expect(host.querySelector('[data-action="remove"]')).toBeNull();
    act(() => root.render(h(WidgetFrame, { ...props, editing: true })));
    expect(host.querySelector('[data-action="refresh"]')).toBeNull();
    expect(host.querySelector('[data-action="lock"]')).not.toBeNull();
    expect(host.querySelector('[data-action="remove"]')).not.toBeNull();
  });

  it("「화면 열기」는 portal-open-tab 이벤트를 보낸다", async () => {
    const Body = () => h("p", null, "본문");
    const seen: string[] = [];
    const onOpen = (e: Event) => seen.push((e as CustomEvent<{ pageId: string }>).detail.pageId);
    window.addEventListener("portal-open-tab", onOpen);
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body, { linkPageId: "mls:lsh/noticeMgmt" }), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    act(() => (host.querySelector('[data-action="open"]') as HTMLButtonElement).click());
    window.removeEventListener("portal-open-tab", onOpen);
    expect(seen).toEqual(["mls:lsh/noticeMgmt"]);
  });

  it("잠긴 위젯은 편집 모드에서 빼기 버튼이 비활성이다", async () => {
    const onRemove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item({ locked: true }), entry: entry(() => null), editing: true, onToggleLock: noop, onRemove })));
    await flush();
    const btn = host.querySelector('[data-action="remove"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("등록부에 없는 위젯은 「없는 위젯」 칸과 ✕ 만 보인다", () => {
    const onRemove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item({ widgetId: "gone.x" }), entry: undefined, editing: true, onToggleLock: noop, onRemove })));
    expect(host.textContent).toContain("없는 위젯");
    expect(host.textContent).toContain("gone.x");
    act(() => (host.querySelector('[data-action="remove"]') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledWith("i1");
  });

  it("편집 모드에서 제목 줄 키보드로 이동·크기 조절을 알린다", async () => {
    const onKeyMove = vi.fn();
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(() => null), editing: true, onToggleLock: noop, onRemove: noop, onKeyMove })));
    await flush();
    const head = host.querySelector(".cm-widget__head") as HTMLElement;
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true })));
    expect(onKeyMove.mock.calls).toEqual([
      ["i1", "right", "move"],
      ["i1", "down", "resize"],
    ]);
  });
});
