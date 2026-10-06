/** @vitest-environment happy-dom */
/**
 * 화면 문맥 D2: 저장소(탭별·소유자별)와 게시·구독 훅.
 */
import { act, createElement, memo, useRef, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import {
  screenContextStore,
  useScreenContext,
  usePublishScreenContext,
  type ScreenContext,
  type ScreenContextValue,
} from "../../src/screen-context";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  for (const k of ["t1", "t2", "p1"]) screenContextStore.clearTab(k);
});

/** 렌더마다 같은 context 값 객체를 쓰게 캐시한다(값 객체가 바뀌면 구독자가 저장소와 상관없이 다시 그려진다). */
const pageValues = new Map<string, { pageId: string; serviceId: string; tabId: string | undefined }>();
function page(tabId: string | undefined, pageId: string, child: ReactElement): ReactElement {
  const k = `${tabId}|${pageId}`;
  let value = pageValues.get(k);
  if (!value) pageValues.set(k, (value = { pageId, serviceId: "", tabId }));
  return createElement(TabPageContext.Provider, { value, children: child });
}

describe("screenContextStore", () => {
  it("globalThis 에 단일 인스턴스를 둔다", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    expect(g.__dkOasisScreenContextStore__).toBe(screenContextStore);
  });

  it("같은 값을 다시 게시해도 구독자를 부르지 않는다", () => {
    let calls = 0;
    const off = screenContextStore.subscribe(() => calls++);
    const base = { source: "grid", tabId: "t1", pageId: "p1", values: { a: 1 } };
    expect(screenContextStore.publish("t1", "o1", base)).toBe(true);
    expect(screenContextStore.publish("t1", "o1", { ...base, values: { a: 1 } })).toBe(false);
    expect(calls).toBe(1);
    off();
  });

  it("마지막 게시자가 소유자가 되고, 옛 소유자의 clear 는 남의 문맥을 지우지 않는다", () => {
    const base = { source: "grid", tabId: "t1", pageId: "p1" };
    screenContextStore.publish("t1", "o1", { ...base, values: { a: 1 } });
    screenContextStore.publish("t1", "o2", { ...base, values: { a: 2 } });
    expect(screenContextStore.clear("t1", "o1")).toBe(false);
    expect(screenContextStore.get("t1")?.values).toEqual({ a: 2 });
    expect(screenContextStore.clear("t1", "o2")).toBe(true);
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("값이 같아도 다른 게시자가 게시하면 소유자는 넘어간다", () => {
    const base = { source: "grid", tabId: "t1", pageId: "p1", values: { a: 1 } };
    screenContextStore.publish("t1", "o1", base);
    screenContextStore.publish("t1", "o2", base);
    expect(screenContextStore.clear("t1", "o1")).toBe(false);
    expect(screenContextStore.get("t1")).not.toBeNull();
  });

  it("탭이 닫히면 소유자와 상관없이 지운다", () => {
    screenContextStore.publish("t1", "o1", { source: "grid", tabId: "t1", pageId: "p1", values: {} });
    expect(screenContextStore.clearTab("t1")).toBe(true);
    expect(screenContextStore.clearTab("t1")).toBe(false);
  });
});

describe("usePublishScreenContext · useScreenContext", () => {
  function Publisher({ values, enabled }: { values: Record<string, ScreenContextValue> | null; enabled?: boolean }) {
    usePublishScreenContext(values, { source: "form", enabled });
    return null;
  }

  function Reader({ tabId, onRender }: { tabId?: string | null; onRender: (ctx: ScreenContext | null) => void }) {
    const ctx = useScreenContext(tabId);
    const renders = useRef(0);
    renders.current++;
    onRender(ctx);
    return createElement("i", { "data-renders": renders.current });
  }

  it("게시한 값을 같은 탭 구독자가 받는다", () => {
    let seen: ScreenContext | null = null;
    rendered = renderWithMantine(
      page("t1", "p1", createElement("div", null, createElement(Publisher, { values: { THK: 2.3 } }), createElement(Reader, { onRender: (c) => (seen = c) })))
    );
    expect(seen).not.toBeNull();
    const ctx = seen as unknown as ScreenContext;
    expect(ctx.source).toBe("form");
    expect(ctx.tabId).toBe("t1");
    expect(ctx.pageId).toBe("p1");
    expect(ctx.values).toEqual({ THK: 2.3 });
  });

  it("구독자는 tabId 를 주면 그 탭의 문맥만 본다", () => {
    let seen: ScreenContext | null = null;
    rendered = renderWithMantine(
      createElement(
        "div",
        null,
        page("t1", "p1", createElement(Publisher, { values: { a: 1 } })),
        createElement(Reader, { tabId: "t2", onRender: (c) => (seen = c) })
      )
    );
    expect(seen).toBeNull();
    rerender(
      rendered,
      createElement(
        "div",
        null,
        page("t1", "p1", createElement(Publisher, { values: { a: 1 } })),
        createElement(Reader, { tabId: "t1", onRender: (c) => (seen = c) })
      )
    );
    expect((seen as unknown as ScreenContext).values).toEqual({ a: 1 });
  });

  it("내용이 같은 새 객체를 계속 넘겨도 구독자가 다시 그려지지 않는다", () => {
    const MemoReader = memo(Reader);
    const onRender = () => {};
    const tree = (v: Record<string, ScreenContextValue>) =>
      page("t1", "p1", createElement("div", null, createElement(Publisher, { values: v }), createElement(MemoReader, { onRender })));
    rendered = renderWithMantine(tree({ a: 1 }));
    const before = rendered.host.querySelector("i")!.getAttribute("data-renders");
    rerender(rendered, tree({ a: 1 }));
    rerender(rendered, tree({ a: 1 }));
    expect(rendered.host.querySelector("i")!.getAttribute("data-renders")).toBe(before);
    rerender(rendered, tree({ a: 2 }));
    expect(Number(rendered.host.querySelector("i")!.getAttribute("data-renders"))).toBeGreaterThan(Number(before));
  });

  it("언마운트(탭 닫힘)하면 문맥을 거둔다", () => {
    rendered = renderWithMantine(page("t1", "p1", createElement(Publisher, { values: { a: 1 } })));
    expect(screenContextStore.get("t1")).not.toBeNull();
    rendered.unmount();
    rendered = null;
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("enabled=false 로 바뀌면 거두고, values 가 null 이면 게시하지 않는다", () => {
    rendered = renderWithMantine(page("t1", "p1", createElement(Publisher, { values: { a: 1 } })));
    rerender(rendered, page("t1", "p1", createElement(Publisher, { values: { a: 1 }, enabled: false })));
    expect(screenContextStore.get("t1")).toBeNull();
    rerender(rendered, page("t1", "p1", createElement(Publisher, { values: null })));
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("탭 id 가 없으면 pageId 를 키로 쓴다", () => {
    rendered = renderWithMantine(page(undefined, "p1", createElement(Publisher, { values: { a: 1 } })));
    expect(screenContextStore.get("p1")?.values).toEqual({ a: 1 });
  });

  it("포털 탭 밖(탭·화면 id 없음)이면 게시하지 않는다", () => {
    rendered = renderWithMantine(createElement(Publisher, { values: { a: 1 } }));
    expect(screenContextStore.get("")).toBeNull();
  });

  it("act 밖 게시 호출도 구독자에게 전달한다", () => {
    let seen: ScreenContext | null = null;
    rendered = renderWithMantine(createElement(Reader, { tabId: "t1", onRender: (c) => (seen = c) }));
    act(() => {
      screenContextStore.publish("t1", "x", { source: "grid", tabId: "t1", pageId: "p1", values: { z: 9 } });
    });
    expect((seen as unknown as ScreenContext).values).toEqual({ z: 9 });
  });
});
