/** @vitest-environment happy-dom */
/**
 * 떠 있는 창(FloatingWindow)·창 층(WidgetDockLayer)·도크 훅(useWidgetDock) 동작 — 접기·펼치기·닫기·끌기 자르기·4px 임계·저장.
 */
import { act, createElement as h, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame } from "../../src/widget";
import type { WidgetMeta, WidgetRegistry, WidgetRegistryEntry } from "../../src/widget";
import { FloatingWindow, useWidgetDock, WidgetDockLayer } from "../../src/widget-dock";
import type {
  DockWindow,
  FloatingWindowProps,
  WidgetDockApi,
  WidgetDockStore,
} from "../../src/widget-dock";

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
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function pointer(el: Element, type: string, x: number, y: number) {
  act(() => {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        button: 0,
      })
    );
  });
}

function drag(el: Element, from: [number, number], to: [number, number]) {
  pointer(el, "pointerdown", from[0], from[1]);
  pointer(el, "pointermove", to[0], to[1]);
  pointer(el, "pointerup", to[0], to[1]);
}

const BOUNDS = { width: 1000, height: 700 };

function renderWindow(extra: Partial<FloatingWindowProps> = {}) {
  const props: FloatingWindowProps = {
    title: "계산기",
    x: 100,
    y: 80,
    width: 300,
    height: 240,
    collapsed: false,
    bounds: BOUNDS,
    onMove: vi.fn(),
    onResize: vi.fn(),
    onToggleCollapse: vi.fn(),
    onClose: vi.fn(),
    onFocus: vi.fn(),
    children: h("p", { "data-testid": "body" }, "본문"),
    ...extra,
  };
  act(() => root.render(h(FloatingWindow, props)));
  return props;
}

const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T;

describe("FloatingWindow", () => {
  it("창 막대에 제목·접기·닫기 버튼이 있고, 버튼이 각 콜백을 부른다", () => {
    const p = renderWindow();
    expect(q(".cm-float-win__title").textContent).toBe("계산기");
    expect(q('[role="dialog"]').getAttribute("aria-label")).toBe("계산기");
    act(() => q<HTMLButtonElement>('button[aria-label="접기"]').click());
    act(() => q<HTMLButtonElement>('button[aria-label="닫기"]').click());
    expect(p.onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onMove).not.toHaveBeenCalled();
  });

  it("접히면 본문은 마운트한 채 숨기고, 같은 자리에 제목 첫 글자 아이콘을 보이며 누르면 펼친다", () => {
    const p = renderWindow({ collapsed: true });
    expect(q<HTMLElement>(".cm-float-win").style.display).toBe("none");
    expect(q('[data-testid="body"]')).not.toBeNull();
    const icon = q<HTMLButtonElement>(".cm-float-win__icon");
    expect(icon.textContent).toBe("계");
    expect(icon.getAttribute("aria-label")).toBe("계산기 펼치기");
    expect(icon.style.left).toBe("100px");
    expect(icon.style.top).toBe("80px");
    act(() => icon.click());
    expect(p.onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("막대를 끌면 놓을 때 한 번 onMove 를 부른다", () => {
    const p = renderWindow();
    drag(q(".cm-float-win__bar"), [200, 90], [250, 120]);
    expect(p.onMove).toHaveBeenCalledTimes(1);
    expect(p.onMove).toHaveBeenCalledWith(150, 110);
  });

  it("끄는 동안 창이 따라오고 영역 밖으로는 나가지 않게 자른다", () => {
    const p = renderWindow();
    const bar = q(".cm-float-win__bar");
    pointer(bar, "pointerdown", 200, 90);
    pointer(bar, "pointermove", 2000, -500);
    expect(q<HTMLElement>(".cm-float-win").style.left).toBe(`${BOUNDS.width - 300}px`);
    expect(q<HTMLElement>(".cm-float-win").getAttribute("data-dragging")).toBe("true");
    pointer(bar, "pointerup", 2000, -500);
    expect(p.onMove).toHaveBeenCalledWith(BOUNDS.width - 300, 0);
  });

  it("4px 미만 움직임은 끌기가 아니다", () => {
    const p = renderWindow();
    drag(q(".cm-float-win__bar"), [200, 90], [203, 92]);
    expect(p.onMove).not.toHaveBeenCalled();
  });

  it("막대의 버튼에서 시작한 누름은 끌기가 아니다", () => {
    const p = renderWindow();
    drag(q('button[aria-label="닫기"]'), [200, 90], [260, 130]);
    expect(p.onMove).not.toHaveBeenCalled();
  });

  it("접힌 아이콘은 4px 미만이면 클릭(펼치기), 넘게 끌면 옮기기만 하고 뒤따르는 click 은 무시한다", () => {
    const p = renderWindow({ collapsed: true });
    const icon = q<HTMLButtonElement>(".cm-float-win__icon");
    drag(icon, [110, 90], [112, 91]);
    act(() => icon.click());
    expect(p.onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(p.onMove).not.toHaveBeenCalled();

    drag(icon, [110, 90], [140, 130]);
    act(() => icon.click());
    expect(p.onMove).toHaveBeenCalledWith(130, 120);
    expect(p.onToggleCollapse).toHaveBeenCalledTimes(1);

    // 끌기 뒤 click 이 오지 않았어도 다음 누름에서 막힘이 풀린다.
    drag(icon, [110, 90], [150, 130]);
    pointer(icon, "pointerdown", 110, 90);
    pointer(icon, "pointerup", 110, 90);
    act(() => icon.click());
    expect(p.onToggleCollapse).toHaveBeenCalledTimes(2);
  });

  it("접힌 아이콘을 끌면 아이콘 크기(44)로 영역 안에 자른다", () => {
    const p = renderWindow({ collapsed: true });
    drag(q(".cm-float-win__icon"), [110, 90], [5000, 5000]);
    expect(p.onMove).toHaveBeenCalledWith(BOUNDS.width - 44, BOUNDS.height - 44);
  });

  it("오른쪽 아래 손잡이로 크기를 바꾸고 최소 크기·영역으로 자른다", () => {
    const p = renderWindow();
    const handle = q(".cm-float-win__resize");
    drag(handle, [400, 320], [500, 370]);
    expect(p.onResize).toHaveBeenLastCalledWith(400, 290);
    drag(handle, [400, 320], [0, 0]);
    expect(p.onResize).toHaveBeenLastCalledWith(220, 160);
    drag(handle, [400, 320], [9000, 9000]);
    expect(p.onResize).toHaveBeenLastCalledWith(BOUNDS.width - 100, BOUNDS.height - 80);
  });

  describe("키보드 포커스", () => {
    function renderControlled(initialCollapsed = false) {
      let setCollapsed: (v: boolean) => void = () => {};
      const Controlled = () => {
        const [collapsed, set] = useState(initialCollapsed);
        setCollapsed = set;
        return h(FloatingWindow, {
          title: "계산기",
          x: 100,
          y: 80,
          width: 300,
          height: 240,
          collapsed,
          bounds: BOUNDS,
          onMove: vi.fn(),
          onResize: vi.fn(),
          onToggleCollapse: () => set(!collapsed),
          onClose: vi.fn(),
          children: h("p", null, "본문"),
        });
      };
      act(() => root.render(h(Controlled)));
      return { set: (v: boolean) => act(() => setCollapsed(v)) };
    }
    const collapseBtn = () => q<HTMLButtonElement>('button[aria-label="접기"]');
    const icon = () => q<HTMLButtonElement>(".cm-float-win__icon");

    it("접기 버튼을 누르면 아이콘으로, 아이콘을 누르면 접기 버튼으로 포커스가 옮겨 간다", () => {
      renderControlled();
      collapseBtn().focus();
      act(() => collapseBtn().click());
      expect(icon()).not.toBeNull();
      expect(document.activeElement).toBe(icon());
      act(() => icon().click());
      expect(icon()).toBeNull();
      expect(document.activeElement).toBe(collapseBtn());
    });

    it("바깥에서 접힘이 바뀌어도(「도구」 메뉴로 펼치기·저장값 복원) 포커스를 가져오지 않는다", () => {
      const view = renderControlled(true);
      const other = document.createElement("button");
      document.body.appendChild(other);
      other.focus();
      view.set(false);
      expect(document.activeElement).toBe(other);
      view.set(true);
      expect(document.activeElement).toBe(other);
      other.remove();
    });
  });

  it("창 안을 누르면 onFocus(맨 앞으로)를 부른다", () => {
    const p = renderWindow();
    pointer(q('[data-testid="body"]'), "pointerdown", 150, 150);
    expect(p.onFocus).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────── 창 층

const entry = (id: string, extra: Partial<WidgetMeta> = {}): WidgetRegistryEntry => ({
  meta: {
    id,
    title: id === "def.calc" ? "계산기" : id,
    defaultSize: { w: 6, h: 8 },
    floatable: true,
    ...extra,
  },
  load: async () => ({
    default: (p: { instanceId: string }) =>
      h("p", { "data-testid": `body-${p.instanceId}` }, "본문"),
  }),
});

const win = (id: string, extra: Partial<DockWindow> = {}): DockWindow => ({
  id,
  widgetId: "def.calc",
  x: 10,
  y: 20,
  w: 300,
  h: 240,
  collapsed: false,
  z: 1,
  ...extra,
});

describe("WidgetDockLayer", () => {
  const handlers = () => ({
    onMove: vi.fn(),
    onResize: vi.fn(),
    onToggleCollapse: vi.fn(),
    onClose: vi.fn(),
    onFocus: vi.fn(),
  });

  it("등록부에서 띄울 수 있는 위젯 창만 위젯 틀로 그리고, 창 ID 를 instanceId 로 넘긴다", async () => {
    const registry: WidgetRegistry = {
      "def.calc": entry("def.calc"),
      "def.off": entry("def.off", { disabled: true }),
    };
    const windows = [
      win("a"),
      win("b", { widgetId: "def.off" }),
      win("c", { widgetId: "def.loading" }),
    ];
    act(() =>
      root.render(
        h(WidgetDockLayer, {
          windows,
          registry,
          frame: WidgetFrame,
          viewport: { width: 1200, height: 800 },
          ...handlers(),
        })
      )
    );
    await flush();
    expect(host.querySelectorAll(".cm-float-win")).toHaveLength(1);
    expect(q(".cm-widget").getAttribute("data-inst-id")).toBe("a");
    expect(q('[data-testid="body-a"]').textContent).toBe("본문");
    expect(q(".cm-widget-dock").getAttribute("data-testid")).toBe("widget-dock");
  });

  it("뷰포트가 줄면 그릴 때 창을 화면 안으로 자르고, 닫기는 창 ID 로 알린다", async () => {
    const hs = handlers();
    act(() =>
      root.render(
        h(WidgetDockLayer, {
          windows: [win("a", { x: 900, y: 700 })],
          registry: { "def.calc": entry("def.calc") },
          frame: WidgetFrame,
          viewport: { width: 800, height: 600 },
          ...hs,
        })
      )
    );
    await flush();
    const el = q<HTMLElement>(".cm-float-win");
    expect(el.style.left).toBe("500px");
    expect(el.style.top).toBe("360px");
    act(() => q<HTMLButtonElement>('.cm-float-win button[aria-label="닫기"]').click());
    expect(hs.onClose).toHaveBeenCalledWith("a");
  });

  it("접힌 아이콘은 저장 z 가 낮아도 펼친 창보다 위에 그린다", async () => {
    act(() =>
      root.render(
        h(WidgetDockLayer, {
          windows: [win("open", { z: 20 }), win("icon", { z: 1, collapsed: true, x: 50, y: 50 })],
          registry: { "def.calc": entry("def.calc") },
          frame: WidgetFrame,
          viewport: { width: 1200, height: 800 },
          ...handlers(),
        })
      )
    );
    await flush();
    const z = (sel: string) => Number(q<HTMLElement>(sel).style.zIndex);
    expect(z('[data-testid="widget-dock-window-icon-icon"]')).toBeGreaterThan(
      z('[data-testid="widget-dock-window-open"]')
    );
  });

  it("viewport 를 안 주면 창이 있는 동안 화면 크기를 직접 구독하고(rAF 로 묶어), 창이 없으면 구독하지 않는다", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const resizeListeners = () => add.mock.calls.filter(([type]) => type === "resize").length;
    const baseProps = {
      registry: { "def.calc": entry("def.calc") },
      frame: WidgetFrame,
      ...handlers(),
    };
    Object.assign(window, { innerWidth: 1200, innerHeight: 800 });
    act(() => root.render(h(WidgetDockLayer, { ...baseProps, windows: [] })));
    await flush();
    expect(resizeListeners()).toBe(0);

    act(() => root.render(h(WidgetDockLayer, { ...baseProps, windows: [win("a", { x: 900, y: 700 })] })));
    await flush();
    expect(resizeListeners()).toBe(1);
    expect(q<HTMLElement>(".cm-float-win").style.left).toBe("900px");

    Object.assign(window, { innerWidth: 800, innerHeight: 600 });
    act(() => void window.dispatchEvent(new Event("resize")));
    act(() => void window.dispatchEvent(new Event("resize")));
    // rAF 로 묶는다 — 이벤트 직후에는 아직 그대로, 한 프레임 뒤에 한 번 반영.
    expect(q<HTMLElement>(".cm-float-win").style.left).toBe("900px");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(q<HTMLElement>(".cm-float-win").style.left).toBe("500px");
    expect(q<HTMLElement>(".cm-float-win").style.top).toBe("360px");
    add.mockRestore();
    Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  });
});

// ─────────────────────────────────────────────────────────── 도크 훅

function memoryStore(initial: DockWindow[] = []) {
  let saved = initial;
  const store: WidgetDockStore & { saves: DockWindow[][] } = {
    saves: [],
    load: vi.fn(async () => saved),
    save: vi.fn(async (windows: DockWindow[]) => {
      saved = windows;
      store.saves.push(windows);
    }),
  };
  return store;
}

const REGISTRY: WidgetRegistry = { "def.calc": entry("def.calc"), "def.memo": entry("def.memo") };

function Harness(props: {
  userId: string;
  store: WidgetDockStore;
  registry?: WidgetRegistry;
  status?: "loading" | "ready" | "error";
  blocked?: () => boolean;
  onApi: (api: WidgetDockApi) => void;
  onRender?: () => void;
}) {
  const api = useWidgetDock({
    enabled: true,
    userId: props.userId,
    registry: props.registry ?? REGISTRY,
    registryStatus: props.status ?? "ready",
    store: props.store,
    isSaveBlocked: props.blocked,
  });
  props.onRender?.();
  useEffect(() => props.onApi(api));
  return null;
}

describe("useWidgetDock", () => {
  let api: WidgetDockApi;
  const onApi = (a: WidgetDockApi) => {
    api = a;
  };

  it("저장값을 불러오고, 조작은 400ms 늦춰 한 번만 저장한다", async () => {
    vi.useFakeTimers();
    const store = memoryStore([win("a")]);
    act(() => root.render(h(Harness, { userId: "u1", store, onApi })));
    await flush();
    expect(api.loaded).toBe(true);
    expect(api.windows.map((w) => w.id)).toEqual(["a"]);
    expect(store.save).not.toHaveBeenCalled();

    act(() => void api.open("def.memo"));
    act(() => api.toggleCollapse("a"));
    expect(api.windows).toHaveLength(2);
    act(() => vi.advanceTimersByTime(399));
    expect(store.save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0].find((w) => w.id === "a")!.collapsed).toBe(true);
  });

  it("화면 크기가 바뀌어도 훅을 쓰는 컴포넌트(셸)는 다시 그려지지 않는다", async () => {
    const store = memoryStore([win("a")]);
    let renders = 0;
    act(() =>
      root.render(h(Harness, { userId: "u1", store, onApi, onRender: () => void (renders += 1) }))
    );
    await flush();
    const before = renders;
    Object.assign(window, { innerWidth: 700, innerHeight: 500 });
    act(() => void window.dispatchEvent(new Event("resize")));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(renders).toBe(before);
    expect("viewport" in api).toBe(false);
    Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  });

  it("한 번만 놓는 위젯이 이미 펼쳐져 맨 앞이면 열기가 아무것도 바꾸지 않아 저장도 하지 않는다", async () => {
    vi.useFakeTimers();
    const store = memoryStore([win("a")]);
    const registry: WidgetRegistry = { "def.calc": entry("def.calc", { multiple: false }) };
    act(() => root.render(h(Harness, { userId: "u1", store, registry, onApi })));
    await flush();
    const before = api.windows;
    let kind = "";
    act(() => void (kind = api.open("def.calc")));
    expect(kind).toBe("focused");
    expect(api.windows).toBe(before);
    act(() => vi.advanceTimersByTime(1000));
    expect(store.save).not.toHaveBeenCalled();
  });

  it("언마운트 때 남은 저장을 보낸다", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    act(() => root.render(h(Harness, { userId: "u1", store, onApi })));
    await flush();
    act(() => void api.open("def.calc"));
    act(() => root.unmount());
    expect(store.saves).toHaveLength(1);
    root = createRoot(host);
  });

  it("사용자 ID 가 없으면 불러오지도 저장하지도 않고 열지 않는다", async () => {
    const store = memoryStore([win("a")]);
    act(() => root.render(h(Harness, { userId: "", store, onApi })));
    await flush();
    expect(store.load).not.toHaveBeenCalled();
    expect(api.loaded).toBe(false);
    let kind: string = "";
    act(() => void (kind = api.open("def.calc")));
    expect(kind).toBe("missing");
    expect(api.windows).toEqual([]);
  });

  it("로그아웃 중(isSaveBlocked)이면 저장하지 않는다", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    let blocked = false;
    act(() => root.render(h(Harness, { userId: "u1", store, blocked: () => blocked, onApi })));
    await flush();
    act(() => void api.open("def.calc"));
    blocked = true;
    act(() => vi.advanceTimersByTime(500));
    act(() => root.render(h(Harness, { userId: "", store, blocked: () => blocked, onApi })));
    expect(store.save).not.toHaveBeenCalled();
  });

  it("사용자가 바뀌면 그 렌더부터 앞 사용자 창을 보이지 않고 새 사용자 것을 불러온다", async () => {
    const a = memoryStore([win("a")]);
    const b = memoryStore([win("b", { widgetId: "def.memo" })]);
    const seen: string[][] = [];
    const record = (x: WidgetDockApi) => {
      api = x;
      seen.push(x.windows.map((w) => w.id));
    };
    act(() => root.render(h(Harness, { userId: "u1", store: a, onApi: record })));
    await flush();
    seen.length = 0;
    act(() => root.render(h(Harness, { userId: "u2", store: b, onApi: record })));
    await flush();
    expect(seen.every((ids) => !ids.includes("a"))).toBe(true);
    expect(api.windows.map((w) => w.id)).toEqual(["b"]);
    expect(a.save).not.toHaveBeenCalled();
  });

  it("등록부가 ready 가 되면 없는 위젯 창을 정리해 저장하고, loading 동안은 남겨 둔다", async () => {
    vi.useFakeTimers();
    const store = memoryStore([win("a"), win("gone", { widgetId: "def.gone" })]);
    act(() => root.render(h(Harness, { userId: "u1", store, status: "loading", onApi })));
    await flush();
    expect(api.windows.map((w) => w.id)).toEqual(["a", "gone"]);
    act(() => root.render(h(Harness, { userId: "u1", store, status: "ready", onApi })));
    await flush();
    expect(api.windows.map((w) => w.id)).toEqual(["a"]);
    act(() => vi.advanceTimersByTime(400));
    expect(store.saves.at(-1)!.map((w) => w.id)).toEqual(["a"]);
  });

  it("창을 끝까지 쓰면 열기가 limit 을 돌려준다", async () => {
    const store = memoryStore(
      Array.from({ length: 8 }, (_, i) => win(`w${i}`, { widgetId: "def.memo", z: i + 1 }))
    );
    act(() => root.render(h(Harness, { userId: "u1", store, onApi })));
    await flush();
    let kind: string = "";
    act(() => void (kind = api.open("def.calc")));
    expect(kind).toBe("limit");
    expect(api.windows).toHaveLength(8);
  });
});

// 위젯 본체가 틀 컨텍스트(useWidgetTitle 등)를 쓰는 경우도 창 안에서 그대로 동작하는지 — 틀을 frame 으로 받으므로 같은 컨텍스트다.
describe("WidgetDockLayer + 위젯 틀 컨텍스트", () => {
  it("본체 상태가 창을 옮겨도 유지된다(창 막대 끌기 뒤에도 같은 본체)", async () => {
    let mounts = 0;
    const Counter = () => {
      const [n, setN] = useState(0);
      useEffect(() => {
        mounts += 1;
      }, []);
      return h("button", { "data-testid": "count", onClick: () => setN(n + 1) }, String(n));
    };
    const registry: WidgetRegistry = {
      "def.calc": { meta: entry("def.calc").meta, load: async () => ({ default: Counter }) },
    };
    const props = {
      registry,
      frame: WidgetFrame,
      viewport: { width: 1200, height: 800 },
      onMove: vi.fn(),
      onResize: vi.fn(),
      onToggleCollapse: vi.fn(),
      onClose: vi.fn(),
      onFocus: vi.fn(),
    };
    act(() => root.render(h(WidgetDockLayer, { ...props, windows: [win("a")] })));
    await flush();
    act(() => q<HTMLButtonElement>('[data-testid="count"]').click());
    act(() =>
      root.render(
        h(WidgetDockLayer, { ...props, windows: [win("a", { x: 200, collapsed: true })] })
      )
    );
    act(() => root.render(h(WidgetDockLayer, { ...props, windows: [win("a", { x: 200 })] })));
    await flush();
    expect(q('[data-testid="count"]').textContent).toBe("1");
    expect(mounts).toBe(1);
  });
});
