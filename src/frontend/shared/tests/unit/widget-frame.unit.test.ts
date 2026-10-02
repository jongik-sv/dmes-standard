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

  it("useWidgetStatus 의 loading 은 틀이 로딩 표시와 aria-busy 로 보이고 ready 로 바뀌면 사라지며 본체는 유지된다", async () => {
    let setter: ((s: { kind: "ready" } | { kind: "loading" }) => void) | null = null;
    const Body = () => {
      setter = useWidgetStatus();
      return h("p", { "data-testid": "body" }, "본문");
    };
    act(() => root.render(h(WidgetFrame, { item: item(), entry: entry(Body), editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    const bodyEl = host.querySelector('[data-testid="body"]');
    expect(host.querySelector(".cm-widget__loading")).toBeNull();
    act(() => setter!({ kind: "loading" }));
    expect(host.querySelector(".cm-widget__loading")!.textContent).toContain("불러오는 중");
    expect(host.querySelector(".cm-widget__body")!.getAttribute("aria-busy")).toBe("true");
    act(() => setter!({ kind: "ready" }));
    expect(host.querySelector(".cm-widget__loading")).toBeNull();
    expect(host.querySelector(".cm-widget__body")!.getAttribute("aria-busy")).toBeNull();
    expect(host.querySelector('[data-testid="body"]')).toBe(bodyEl);
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

  /* ── 사용 중지 칸(스펙 widget-admin-generic §1.1·§12, W-D20) ── */
  const disabledEntry = (extra: Partial<WidgetRegistryEntry["meta"]> = {}) => {
    const load = vi.fn(async () => ({ default: () => h("p", { "data-testid": "body" }, "본문") }));
    const e: WidgetRegistryEntry = {
      meta: { id: "t.a", title: "샘플 위젯", subtitle: "전일 기준", defaultSize: { w: 6, h: 6 }, disabled: true, refreshSec: 30, linkPageId: "mls:lsh/noticeMgmt", ...extra },
      load,
    };
    return { entry: e, load };
  };

  it("사용 중지 위젯은 본체를 불러오지 않고 「사용 중지된 위젯입니다」 칸을 보인다", async () => {
    const { entry: e, load } = disabledEntry();
    act(() => root.render(h(WidgetFrame, { item: item(), entry: e, editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(load).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="body"]')).toBeNull();
    const cell = host.querySelector('[data-widget-disabled="true"]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toContain("사용 중지된 위젯입니다");
    // 자리를 지킨다 — 보기 모드에서도 틀과 제목이 남는다.
    expect(host.querySelector(".cm-widget")!.getAttribute("data-inst-id")).toBe("i1");
    expect(host.querySelector(".cm-widget__title")!.textContent).toBe("샘플 위젯");
  });

  it("사용 중지 위젯의 제목 줄에는 새로 고침·화면 열기가 없다", async () => {
    const { entry: e } = disabledEntry();
    act(() => root.render(h(WidgetFrame, { item: item(), entry: e, editing: false, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect(host.querySelector('[data-action="refresh"]')).toBeNull();
    expect(host.querySelector('[data-action="open"]')).toBeNull();
    // 제목 줄에는 제목만 — 부제도 보이지 않는다.
    expect(host.querySelector(".cm-widget__head")!.textContent).toBe("샘플 위젯");
  });

  it("사용 중지 위젯은 자동 새로 고침 타이머를 걸지 않는다", async () => {
    const spy = vi.spyOn(window, "setInterval");
    try {
      const { entry: e } = disabledEntry({ refreshSec: 60 });
      act(() => root.render(h(WidgetFrame, { item: item(), entry: e, editing: false, onToggleLock: noop, onRemove: noop })));
      await flush();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("사용 중지 위젯도 편집 모드에서 잠금·✕ 가 평소와 같고 ✕ 는 onRemove(instId) 를 부른다", async () => {
    const onRemove = vi.fn();
    const onToggleLock = vi.fn();
    const { entry: e, load } = disabledEntry();
    act(() => root.render(h(WidgetFrame, { item: item(), entry: e, editing: true, onToggleLock, onRemove })));
    await flush();
    expect(load).not.toHaveBeenCalled();
    expect(host.querySelector('[data-widget-disabled="true"]')).not.toBeNull();
    act(() => (host.querySelector('[data-action="lock"]') as HTMLButtonElement).click());
    expect(onToggleLock).toHaveBeenCalledWith("i1");
    act(() => (host.querySelector('[data-action="remove"]') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledWith("i1");
  });

  it("잠긴 사용 중지 위젯은 평소처럼 ✕ 가 비활성이다", async () => {
    const { entry: e } = disabledEntry();
    act(() => root.render(h(WidgetFrame, { item: item({ locked: true }), entry: e, editing: true, onToggleLock: noop, onRemove: noop })));
    await flush();
    expect((host.querySelector('[data-action="remove"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
