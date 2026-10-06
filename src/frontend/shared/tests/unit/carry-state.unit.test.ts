/** @vitest-environment happy-dom */
/**
 * 새 창 분리 때 화면 상태를 이어받는 장치(설계 2026-10-06-popout-carry-state-design §4.2·§6).
 * 등록소(createCarryRegistry)·useCarryState·useCarryRefetch·useCarryRestored.
 */
import { act, createElement, StrictMode, useState, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CarryStateProvider,
  createCarryRegistry,
  createCarryRegistryMap,
  hasCarriedBulky,
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

/** 분리 창은 이어받은 값을 넣어 만든 등록소(createCarryRegistry(restore))를, 포털 탭은 값 없는 등록소를 Provider 에 준다. */
function withProvider(registry: CarryRegistry, child: ReactNode): ReactNode {
  return createElement(CarryStateProvider, { registry, children: child });
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
    mount(withProvider(registry, createElement(makeScreen(probe))));
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
    mount(withProvider(registry, createElement(makeScreen(probe))));
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
    mount(withProvider(registry, createElement(makeScreen({}))), true);
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
    mount(withProvider(registry, createElement("div", null, createElement(Dup), createElement(Dup))));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("복원값으로 시작한다 — light 는 restore.light, bulky 는 restore.bulky 에서 읽는다", () => {
    const restore: CarryRestore = { light: { filters: { q: "kept" } }, bulky: { rows: [9, 8] }, hadBulky: true };
    const registry = createCarryRegistry(restore);
    const probe: Probe = {};
    mount(withProvider(registry, createElement(makeScreen(probe))));
    expect(q()).toBe("kept");
    expect(rowsText()).toBe("9,8");
    expect(probe.restored).toBe(true);
    expect(registry.collect()).toEqual({ light: { filters: { q: "kept" } }, bulky: { rows: [9, 8] } });
  });

  it("bulky 가 빠진 복원이면 bulky 값은 초기값이다", () => {
    const restore: CarryRestore = { light: { filters: { q: "kept" }, rows: [1] }, bulky: null, hadBulky: true };
    mount(withProvider(createCarryRegistry(restore), createElement(makeScreen({}))));
    expect(q()).toBe("kept");
    expect(rowsText()).toBe(""); // light 에 같은 이름이 있어도 bulky 는 restore.bulky 에서만 읽는다
  });

  it("복원값에 없는 key 는 초기값이다", () => {
    const restore: CarryRestore = { light: { other: 1 }, bulky: {}, hadBulky: false };
    mount(withProvider(createCarryRegistry(restore), createElement(makeScreen({}))));
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
    mount(withProvider(createCarryRegistry(), createElement(makeScreen(probe2))));
    expect(probe2.restored).toBe(false);
  });

  it("light 만 있어도(bulky null) true", () => {
    const probe: Probe = {};
    mount(withProvider(createCarryRegistry({ light: { filters: { q: "z" } }, bulky: null, hadBulky: true }), createElement(makeScreen(probe))));
    expect(probe.restored).toBe(true);
  });
});

describe("useCarryRefetch", () => {
  const lightOnly: CarryRestore = { light: { filters: { q: "z" } }, bulky: null, hadBulky: true };

  it("bulky 가 빠졌고 원래 있었으면 마운트 뒤 한 번 부른다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(lightOnly), createElement(makeScreen({}, refetch))));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("StrictMode 이중 effect 에서도 한 번만 부른다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(lightOnly), createElement(makeScreen({}, refetch))), true);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("rerender 해도 다시 부르지 않는다", () => {
    const refetch = vi.fn();
    const probe: Probe = {};
    mount(withProvider(createCarryRegistry(lightOnly), createElement(makeScreen(probe, refetch))));
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
    mount(withProvider(createCarryRegistry(lightOnly), createElement(Screen, { tag: "a" })));
    expect(calls).toEqual(["a"]);
  });

  it("bulky 가 왔으면 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry({ light: {}, bulky: { rows: [1] }, hadBulky: true }), createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("원래 bulky 가 없었으면(hadBulky false) 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry({ light: { filters: { q: "z" } }, bulky: null, hadBulky: false }), createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("복원값이 없거나 컨텍스트 밖이면 부르지 않는다", () => {
    const refetch = vi.fn();
    mount(withProvider(createCarryRegistry(), createElement(makeScreen({}, refetch))));
    expect(refetch).not.toHaveBeenCalled();
    rendered!.unmount();
    rendered = null;
    mount(createElement(makeScreen({}, refetch)));
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe("hasCarriedBulky", () => {
  it("null·undefined·빈 배열은 세지 않고 그 밖의 값은 센다", () => {
    expect(hasCarriedBulky({})).toBe(false);
    expect(hasCarriedBulky({ a: null, b: undefined, c: [] })).toBe(false);
    expect(hasCarriedBulky({ a: [], c: [1] })).toBe(true);
    expect(hasCarriedBulky({ a: {} })).toBe(true); // 객체형 결과는 센다(빈 객체도 — 배열로 두는 것이 규칙)
    expect(hasCarriedBulky({ a: 0 })).toBe(true);
    expect(hasCarriedBulky({ a: "" })).toBe(true);
  });
});

describe("collect 의 JSON 점검(개발 모드)", () => {
  class Box {
    n = 1;
  }
  const collectWarn = (value: unknown) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createCarryRegistry();
    registry.register("k", { get: () => value, bulky: false });
    const collected = registry.collect();
    return { warn, collected };
  };

  it("Date·Set·Map·함수·클래스 인스턴스는 key 이름과 함께 경고하고 값은 그대로 모은다", () => {
    for (const value of [new Date(0), new Set([1]), new Map(), () => 1, new Box()]) {
      const { warn, collected } = collectWarn(value);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('"k"');
      expect(collected.light.k).toBe(value);
      vi.restoreAllMocks();
    }
  });

  it("배열이면 첫 원소를 본다 — 첫 원소가 Date 면 경고, 일반 객체 배열은 경고 없음", () => {
    expect(collectWarn([new Date(0), 1]).warn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    expect(collectWarn([{ a: 1 }, new Date(0)]).warn).not.toHaveBeenCalled(); // 첫 원소만 본다
    vi.restoreAllMocks();
    expect(collectWarn([]).warn).not.toHaveBeenCalled();
  });

  it("원시값·null·일반 객체·Object.create(null) 은 경고하지 않는다", () => {
    for (const value of ["a", 1, true, null, undefined, { a: new Date(0) }, Object.create(null)]) {
      expect(collectWarn(value).warn).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("운영 모드에서는 점검하지 않는다", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(collectWarn(new Date(0)).warn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("같은 key 는 한 번만 복원", () => {
  const restoreOf = (): CarryRestore => ({ light: { filters: { q: "kept" } }, bulky: { rows: [1, 2] }, hadBulky: true });

  function Item({ id }: { id: string }) {
    const [f] = useCarryState("filters", { q: "" });
    const [rows] = useCarryState<number[]>("rows", [], { bulky: true });
    return createElement("div", { "data-item": id, "data-q": f.q, "data-rows": rows.join(",") });
  }
  let remount: (id: string) => void = () => undefined;
  function Host() {
    const [id, setId] = useState("first");
    remount = setId;
    return createElement(Item, { key: id, id });
  }
  const item = () => {
    const el = document.querySelector("[data-item]");
    return { id: el?.getAttribute("data-item"), q: el?.getAttribute("data-q"), rows: el?.getAttribute("data-rows") };
  };

  it("첫 마운트는 복원값을 받고, 그 뒤 마운트되는 같은 key 는 일반 초기값으로 시작한다", () => {
    mount(withProvider(createCarryRegistry(restoreOf()), createElement(Host)));
    expect(item()).toEqual({ id: "first", q: "kept", rows: "1,2" });
    act(() => remount("second"));
    expect(item()).toEqual({ id: "second", q: "", rows: "" });
  });

  it("StrictMode(이중 렌더·이중 effect)에서도 첫 마운트는 복원값을 받는다", () => {
    mount(withProvider(createCarryRegistry(restoreOf()), createElement(Host)), true);
    expect(item()).toEqual({ id: "first", q: "kept", rows: "1,2" });
    act(() => remount("second"));
    expect(item()).toEqual({ id: "second", q: "", rows: "" });
  });

  it("복원값을 쓰지 않은 key 는 나중 마운트가 받을 수 있다(light 와 bulky 는 따로 센다)", () => {
    const registry = createCarryRegistry(restoreOf());
    expect(registry.peekRestored("filters", false)).toEqual({ value: { q: "kept" } });
    registry.markRestoredUsed("filters");
    expect(registry.peekRestored("filters", false)).toBeNull();
    expect(registry.peekRestored("rows", true)).toEqual({ value: [1, 2] });
  });

  it("bulky key 를 모두 쓰면 이어받은 bulky 객체를 더 읽지 않는다(참조를 놓는다)", () => {
    const reads: string[] = [];
    const bulky = new Proxy({ rows: [1], more: [2] } as Record<string, unknown>, {
      has(target, prop) {
        reads.push(String(prop));
        return Reflect.has(target, prop);
      },
      getOwnPropertyDescriptor(target, prop) {
        reads.push(String(prop));
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });
    const registry = createCarryRegistry({ light: {}, bulky, hadBulky: true });
    registry.markRestoredUsed("rows");
    reads.length = 0;
    registry.peekRestored("zzz", true);
    expect(reads.length).toBeGreaterThan(0); // 아직 more 가 남아 있어 bulky 를 들고 있다
    registry.markRestoredUsed("more"); // 모두 썼다
    reads.length = 0;
    expect(registry.peekRestored("zzz", true)).toBeNull();
    expect(reads).toEqual([]);
  });

  it("isFreshRestore 는 어떤 key 도 아직 쓰지 않았을 때만 true", () => {
    const registry = createCarryRegistry(restoreOf());
    expect(registry.isFreshRestore()).toBe(true);
    registry.markRestoredUsed("filters");
    expect(registry.isFreshRestore()).toBe(false);
    expect(createCarryRegistry().isFreshRestore()).toBe(false);
  });
});

describe("재조회 끝남 표시와 새로고침용 hadBulky", () => {
  const lightOnly = (hadBulky: boolean): CarryRestore => ({ light: { filters: { q: "z" } }, bulky: null, hadBulky });

  it("이어받은 hadBulky 의 재조회가 시작됐고 아직 안 끝났으면 지금 행이 없어도 true, 끝나면 지금 값으로만 정한다", () => {
    const registry = createCarryRegistry(lightOnly(true));
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(false); // 아직 시작 전
    expect(registry.startRefetch()).toBe(true);
    expect(registry.startRefetch()).toBe(false);
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(true);
    registry.settleRefetch();
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(false);
    expect(registry.hadBulkyForReload({ rows: [1] })).toBe(true);
  });

  it("이어받은 hadBulky 가 false 면 재조회를 시작하지 않고 빈 배열은 false", () => {
    const registry = createCarryRegistry(lightOnly(false));
    expect(registry.startRefetch()).toBe(false);
    expect(registry.hadBulkyForReload({ rows: [], other: null })).toBe(false);
  });

  it("refetch 가 Promise 를 돌려주면 끝난 뒤 hadBulky 는 지금 값으로만 정해진다", async () => {
    const registry = createCarryRegistry(lightOnly(true));
    let done: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      done = resolve;
    });
    mount(withProvider(registry, createElement(makeScreen({}, () => pending))));
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(true);
    await act(async () => {
      done();
      await pending;
    });
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(false);
  });

  it("Promise 가 아닌 refetch 는 끝났다고 알 수 없어 true 로 둔다", () => {
    const registry = createCarryRegistry(lightOnly(true));
    mount(withProvider(registry, createElement(makeScreen({}, () => undefined))));
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(true);
  });

  it("refetch 가 reject 해도 끝난 것으로 본다", async () => {
    const registry = createCarryRegistry(lightOnly(true));
    const failing = Promise.reject(new Error("x"));
    failing.catch(() => undefined);
    mount(withProvider(registry, createElement(makeScreen({}, () => failing))));
    await act(async () => {
      await failing.catch(() => undefined);
    });
    expect(registry.hadBulkyForReload({ rows: [] })).toBe(false);
  });
});

describe("createCarryRegistryMap", () => {
  it("get 은 탭마다 같은 등록소를 돌려주고 peek 은 만들지 않는다", () => {
    const map = createCarryRegistryMap();
    expect(map.peek("a")).toBeUndefined();
    expect(map.size).toBe(0);
    const a = map.get("a");
    expect(map.get("a")).toBe(a);
    expect(map.peek("a")).toBe(a);
    expect(map.get("b")).not.toBe(a);
    expect(map.size).toBe(2);
  });

  it("prune 은 열린 탭 목록에 없는 탭의 등록소를 지운다", () => {
    const map = createCarryRegistryMap();
    map.get("a");
    map.get("b");
    map.prune(["b", "c"]);
    expect(map.peek("a")).toBeUndefined();
    expect(map.peek("b")).toBeDefined();
    expect(map.size).toBe(1);
  });
});
