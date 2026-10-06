/** @vitest-environment happy-dom */
/**
 * 화면 문맥 D5: 역방향(위젯 → 업무 화면) 통로 — 받기 처리기 저장소·훅·도크 전달.
 */
import { act, createElement as h, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import {
  screenApplyStore,
  screenContextStore,
  useScreenApply,
  useScreenApplyHandler,
  type ScreenApply,
  type ScreenApplyHandler,
} from "../../src/screen-context";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;
afterEach(() => {
  rendered?.unmount();
  rendered = null;
  screenContextStore.clearTab("t1");
});

const pageValue = { pageId: "p1", serviceId: "", tabId: "t1" };
const page = (child: ReactElement) => h(TabPageContext.Provider, { value: pageValue, children: child });

function Receiver({ handler, enabled }: { handler: ScreenApplyHandler | null; enabled?: boolean }) {
  useScreenApplyHandler(handler, { enabled });
  return null;
}

describe("screenApplyStore", () => {
  it("globalThis 에 단일 인스턴스를 둔다", () => {
    expect((globalThis as Record<string, unknown>).__dkOasisScreenApplyStore__).toBe(screenApplyStore);
  });

  it("처리기가 없으면 모든 키를 skipped 로 돌려준다", async () => {
    expect(await screenApplyStore.apply("t1", { a: 1, b: 2 })).toEqual({ applied: [], skipped: ["a", "b"] });
  });

  it("마지막 게시자(소유자)의 처리기를 먼저 쓰고, 없으면 마지막 등록을 쓴다", async () => {
    const h1 = vi.fn(() => ({ applied: ["h1"], skipped: [] }));
    const h2 = vi.fn(() => ({ applied: ["h2"], skipped: [] }));
    const off1 = screenApplyStore.register("t1", "o1", h1);
    const off2 = screenApplyStore.register("t1", "o2", h2);
    expect((await screenApplyStore.apply("t1", {})).applied).toEqual(["h2"]);
    screenContextStore.publish("t1", "o1", { source: "grid", tabId: "t1", pageId: "p1", values: {} });
    expect((await screenApplyStore.apply("t1", {})).applied).toEqual(["h1"]);
    off1();
    expect((await screenApplyStore.apply("t1", {})).applied).toEqual(["h2"]);
    off2();
    expect(screenApplyStore.has("t1")).toBe(false);
  });

  it("처리기가 던지면 위젯까지 올리지 않고 모두 skipped 로 돌려준다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const off = screenApplyStore.register("t1", "o1", () => {
      throw new Error("boom");
    });
    expect(await screenApplyStore.apply("t1", { a: 1, b: 2 })).toEqual({ applied: [], skipped: ["a", "b"] });
    expect(spy).toHaveBeenCalled();
    off();
    spy.mockRestore();
  });

  it("처음 등록·마지막 해제 때만 구독자를 부른다", () => {
    const l = vi.fn();
    const off = screenApplyStore.subscribe(l);
    const a = screenApplyStore.register("t1", "o1", () => ({ applied: [], skipped: [] }));
    const b = screenApplyStore.register("t1", "o2", () => ({ applied: [], skipped: [] }));
    expect(l).toHaveBeenCalledTimes(1);
    a();
    expect(l).toHaveBeenCalledTimes(1);
    b();
    expect(l).toHaveBeenCalledTimes(2);
    off();
  });
});

describe("useScreenApplyHandler · useScreenApply", () => {
  function Reader({ tabId, out }: { tabId?: string | null; out: { cur?: ScreenApply } }) {
    out.cur = useScreenApply(tabId);
    return null;
  }

  it("화면이 등록하면 활성 탭 구독자가 available 을 받고 apply 가 처리기에 닿는다", async () => {
    const out: { cur?: ScreenApply } = {};
    const handler = vi.fn(() => ({ applied: ["THK"], skipped: [] }));
    rendered = renderWithMantine(h("div", null, page(h(Receiver, { handler })), h(Reader, { tabId: "t1", out })));
    expect(out.cur!.available).toBe(true);
    expect(await out.cur!.apply({ THK: 2.3 }, { label: "계산" })).toEqual({ applied: ["THK"], skipped: [] });
    expect(handler).toHaveBeenCalledWith({ THK: 2.3 }, { label: "계산" });
  });

  it("다른 탭 구독자는 받는 쪽이 없다고 본다", () => {
    const out: { cur?: ScreenApply } = {};
    rendered = renderWithMantine(h("div", null, page(h(Receiver, { handler: () => ({ applied: [], skipped: [] }) })), h(Reader, { tabId: "t2", out })));
    expect(out.cur!.available).toBe(false);
  });

  it("렌더마다 새 처리기를 넘겨도 다시 등록하지 않고 최신 처리기를 부른다", async () => {
    const out: { cur?: ScreenApply } = {};
    const l = vi.fn();
    const off = screenApplyStore.subscribe(l);
    const first = vi.fn(() => ({ applied: ["a"], skipped: [] }));
    const second = vi.fn(() => ({ applied: ["b"], skipped: [] }));
    const tree = (hd: ScreenApplyHandler) => h("div", null, page(h(Receiver, { handler: hd })), h(Reader, { tabId: "t1", out }));
    rendered = renderWithMantine(tree(first));
    const before = l.mock.calls.length;
    rerender(rendered, tree(second));
    expect(l.mock.calls.length).toBe(before);
    expect((await out.cur!.apply({})).applied).toEqual(["b"]);
    off();
  });

  it("언마운트(탭 닫힘)하면 등록을 거두고 enabled=false 면 등록하지 않는다", () => {
    const out: { cur?: ScreenApply } = {};
    rendered = renderWithMantine(h("div", null, page(h(Receiver, { handler: () => ({ applied: [], skipped: [] }), enabled: false })), h(Reader, { tabId: "t1", out })));
    expect(out.cur!.available).toBe(false);
    rerender(rendered, h("div", null, page(h(Receiver, { handler: () => ({ applied: [], skipped: [] }) })), h(Reader, { tabId: "t1", out })));
    expect(out.cur!.available).toBe(true);
    rerender(rendered, h("div", null, h(Reader, { tabId: "t1", out })));
    expect(out.cur!.available).toBe(false);
  });

  it("act 밖 등록도 구독자에게 전달한다", () => {
    const out: { cur?: ScreenApply } = {};
    rendered = renderWithMantine(h(Reader, { tabId: "t1", out }));
    let off = () => {};
    act(() => {
      off = screenApplyStore.register("t1", "x", () => ({ applied: [], skipped: [] }));
    });
    expect(out.cur!.available).toBe(true);
    act(() => off());
    expect(out.cur!.available).toBe(false);
  });
});
