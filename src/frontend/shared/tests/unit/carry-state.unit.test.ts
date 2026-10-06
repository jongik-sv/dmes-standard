/** @vitest-environment happy-dom */
/**
 * 새 창 분리 때 화면 상태를 이어받는 장치(설계 2026-10-06-popout-carry-state-design §4.2·§6).
 * 등록소(createCarryRegistry)·useCarryState·useCarryRefetch·useCarryRestored.
 */
import { act, createElement, StrictMode, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CarryStateProvider,
  createCarryRegistry,
  useCarryRefetch,
  useCarryRestored,
  useCarryState,
  type CarryRegistry,
  type CarryRestore,
} from "../../src/portal-shell/carry-state";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

function mount(element: ReactNode, strict = false) {
  rendered = renderWithMantine(strict ? createElement(StrictMode, null, element) : (element as ReactElement));
}

function withProvider(registry: CarryRegistry, restore: CarryRestore | null, child: ReactNode): ReactNode {
  return createElement(CarryStateProvider, { registry, restore, children: child });
}

/** 화면 한 개 — 값은 data-* 로 읽고 setter 는 밖으로 내보낸다. */
interface Probe {
  setFilters?: (v: { q: string }) => void;
  setRows?: (v: number[]) => void;
  restored?: boolean;
}

function makeScreen(probe: Probe, refetch?: () => void) {
  return function Screen() {
    const [filters, setFilters] = useCarryState("filters", { q: "" });
    const [rows, setRows] = useCarryState<number[]>("rows", [], { bulky: true });
    const restored = useCarryRestored();
    useCarryRefetch(refetch ?? (() => undefined));
    probe.setFilters = setFilters;
    probe.setRows = setRows;
    probe.restored = restored;
    return createElement("div", { "data-q": filters.q, "data-rows": rows.join(",") });
  };
}

const q = () => document.querySelector("[data-q]")?.getAttribute("data-q");
const rowsText = () => document.querySelector("[data-q]")?.getAttribute("data-rows");

describe("createCarryRegistry", () => {
  it("collect 는 getter 를 light·bulky 로 가른다", () => {
    const registry = createCarryRegistry();
    registry.register("a", { get: () => 1, bulky: false });
    registry.register("b", { get: () => [1, 2], bulky: true });
    expect(registry.collect()).toEqual({ light: { a: 1 }, bulky: { b: [1, 2] } });
  });

  it("해제 함수를 부르면 그 key 가 빠진다. 나중에 다시 등록된 같은 key 는 지우지 않는다", () => {
    const registry = createCarryRegistry();
    const off = registry.register("a", { get: () => 1, bulky: false });
    off();
    expect(registry.collect()).toEqual({ light: {}, bulky: {} });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const offOld = registry.register("a", { get: () => 1, bulky: false });
    registry.register("a", { get: () => 2, bulky: false });
    offOld();
    expect(registry.collect().light).toEqual({ a: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("개발 모드에서 같은 key 를 두 번 등록하면 console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createCarryRegistry();
    registry.register("dup", { get: () => 1, bulky: false });
    expect(warn).not.toHaveBeenCalled();
    registry.register("dup", { get: () => 2, bulky: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("dup");
  });

  it("getter 가 던지면 그 key 만 빼고 나머지는 모은다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createCarryRegistry();
    registry.register("bad", {
      get: () => {
        throw new Error("boom");
      },
      bulky: false,
    });
    registry.register("ok", { get: () => 7, bulky: false });
    expect(registry.collect()).toEqual({ light: { ok: 7 }, bulky: {} });
  });
});

describe("useCarryState", () => {
  it("컨텍스트 밖에서는 useState 와 같다(초기값·갱신·함수형 초기값)", () => {
    const probe: Probe = {};
    function Plain() {
      const [n, setN] = useCarryState("n", () => 5);
      probe.setRows = () => setN((v) => v + 1);
      return createElement("div", { "data-q": String(n) });
    }
    mount(createElement(Plain));
    expect(q()).toBe("5");
    act(() => probe.setRows?.([]));
    expect(q()).toBe("6");
  });

  it("등록한 값을 collect 가 최신 값으로 돌려주고 light·bulky 를 가른다", () => {
    const registry = createCarryRegistry();
    const probe: Probe = {};
    mount(withProvider(registry, null, createElement(makeScreen(probe))));
    expect(registry.collect()).toEqual({ light: { filters: { q: "" } }, bulky: { rows: [] } });
    act(() => {
      probe.setFilters?.({ q: "abc" });
      probe.setRows?.([1, 2, 3]);
    });
    expect(registry.collect()).toEqual({ light: { filters: { q: "abc" } }, bulky: { rows: [1, 2, 3] } });
  });

  it("값을 바꿔도 등록·해제를 다시 하지 않고(렌더만 한 번), 언마운트하면 등록이 빠진다", () => {
    const registry = createCarryRegistry();
    const register = vi.spyOn(registry, "register");
    const probe: Probe = {};
    mount(withProvider(registry, null, createElement(makeScreen(probe))));
    expect(register).toHaveBeenCalledTimes(2);
    act(() => probe.setFilters?.({ q: "x" }));
    expect(register).toHaveBeenCalledTimes(2);
    rendered!.unmount();
    rendered = null;
    expect(registry.collect()).toEqual({ light: {}, bulky: {} });
  });

  it("StrictMode 이중 effect 에서도 중복 key 경고가 없다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createCarryRegistry();
    mount(withProvider(registry, null, createElement(makeScreen({}))), true);
    expect(warn).not.toHaveBeenCalled();
    expect(Object.keys(registry.collect().light)).toEqual(["filters"]);
  });

  it("같은 key 를 쓰는 두 부품이 있으면 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createCarryRegistry();
    function Dup() {
      useCarryState("same", 1);
      return null;
    }
    mount(withProvider(registry, null, createElement("div", null, createElement(Dup), createElement(Dup))));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("복원값으로 시작한다 — light 는 restore.light, bulky 는 restore.bulky 에서 읽는다", () => {
    const registry = createCarryRegistry();
    const restore: CarryRestore = { light: { filters: { q: "kept" } }, bulky: { rows: [9, 8] }, hadBulky: true };
    const probe: Probe = {};
    mount(withProvider(registry, restore, createElement(makeScreen(probe))));
    expect(q()).toBe("kept");
    expect(rowsText()).toBe("9,8");
    expect(probe.restored).toBe(true);
    expect(registry.collect()).toEqual({ light: { filters: { q: "kept" } }, bulky: { rows: [9, 8] } });
  });

  it("bulky 가 빠진 복원이면 bulky 값은 초기값이다", () => {
    const restore: CarryRestore = { light: { filters: { q: "kept" }, rows: [1] }, bulky: null, hadBulky: true };
    mount(withProvider(createCarryRegistry(), restore, createElement(makeScreen({}))));
    expect(q()).toBe("kept");
    expect(rowsText()).toBe(""); // light 에 같은 이름이 있어도 bulky 는 restore.bulky 에서만 읽는다
  });

  it("복원값에 없는 key 는 초기값이다", () => {
    const restore: CarryRestore = { light: { other: 1 }, bulky: {}, hadBulky: false };
    mount(withProvider(createCarryRegistry(), restore, createElement(makeScreen({}))));
    expect(q()).toBe("");
  });
});

describe("useCarryRestored", () => {
  it("컨텍스트 밖·복원값 없음은 false", () => {
    const probe: Probe = {};
    mount(createElement(makeScreen(probe)));
    expect(probe.restored).toBe(false);
    rendered!.unmount();
    rendered = null;
    const probe2: Probe = {};
    mount(withProvider(createCarryRegistry(), null, createElement(makeScreen(probe2))));
    expect(probe2.restored).toBe(false);
  });

  it("light 만 있어도(bulky null) true", () => {
    const probe: Probe = {};
    mount(withProvider(createCarryRegistry(), { light: { filters: { q: "z" } }, bulky: null, hadBulky: true }, createElement(makeScreen(probe))));
    expect(probe.restored).toBe(true);
  });
});

describe("useCarryRefetch", () => {
  const lightOnly: CarryRestore = { light: { filters: { q: "z" } }, bulky: null, hadBulky: true };

  it("bulky 가 빠졌고 원래 있었으면 마운트 뒤 한 번 부른다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), lightOnly, createElement(makeScreen({}, refetch))));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("StrictMode 이중 effect 에서도 한 번만 부른다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), lightOnly, createElement(makeScreen({}, refetch))), true);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("rerender 해도 다시 부르지 않는다", () => {
    const refetch = vi.fn();
    const probe: Probe = {};
    mount(withProvider(createCarryRegistry(), lightOnly, createElement(makeScreen(probe, refetch))));
    act(() => probe.setFilters?.({ q: "y" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("최신 refetch 를 부른다(매 렌더 새 함수여도)", () => {
    const calls: string[] = [];
    function Screen({ tag }: { tag: string }) {
      useCarryRefetch(() => calls.push(tag));
      return null;
    }
    const registry = createCarryRegistry();
    mount(withProvider(registry, lightOnly, createElement(Screen, { tag: "a" })));
    expect(calls).toEqual(["a"]);
  });

  it("bulky 가 왔으면 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), { light: {}, bulky: { rows: [1] }, hadBulky: true }, createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("원래 bulky 가 없었으면(hadBulky false) 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), { light: { filters: { q: "z" } }, bulky: null, hadBulky: false }, createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("복원값이 없거나 컨텍스트 밖이면 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), null, createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
    rendered!.unmount();
    rendered = null;
    mount(createElement(makeScreen({}, refetch)));
    expect(refetch).not.toHaveBeenCalled();
  });
});
