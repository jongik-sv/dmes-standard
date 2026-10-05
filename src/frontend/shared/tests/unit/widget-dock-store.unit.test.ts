/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readSecureJson, writeSecureJson } from "../../src/secure-storage";
import {
  createBrowserDockStore,
  DOCK_MAX_WINDOWS,
  dockStorageKey,
  parseDockWindows,
} from "../../src/widget-dock";
import type { DockWindow } from "../../src/widget-dock";

// Node 의 실험용 localStorage 가 happy-dom 것을 가리는 환경이 있다 — portal-shell-tab-order 시험과 같은 대체 저장소.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

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

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("browser-dock-store", () => {
  it("사용자 ID 를 키에 넣어 저장하고 그대로 불러온다", async () => {
    const store = createBrowserDockStore("u1");
    await store.save([win("a", { collapsed: true }), win("b", { widgetId: "def.memo", z: 2 })]);
    expect(localStorage.getItem(dockStorageKey("u1"))).not.toBeNull();
    expect(await store.load()).toEqual([
      win("a", { collapsed: true }),
      win("b", { widgetId: "def.memo", z: 2 }),
    ]);
    // 다른 사용자는 보지 못한다.
    expect(await createBrowserDockStore("u2").load()).toEqual([]);
  });

  it("사용자 ID 가 비어 있으면 읽지도 쓰지도 않는다", async () => {
    const store = createBrowserDockStore("");
    await store.save([win("a")]);
    expect(localStorage.length).toBe(0);
    expect(await store.load()).toEqual([]);
  });

  it("창의 모르는 칸은 저장하지 않는다", async () => {
    await createBrowserDockStore("u1").save([{ ...win("a"), extra: "x" } as DockWindow]);
    const raw = readSecureJson<{ windows: Record<string, unknown>[] }>(dockStorageKey("u1"));
    expect(Object.keys(raw!.windows[0]).sort()).toEqual([
      "collapsed",
      "h",
      "id",
      "w",
      "widgetId",
      "x",
      "y",
      "z",
    ]);
  });

  it("손상된 저장값(해석 불가·버전 다름·모양 틀림)은 빈 목록이다", async () => {
    const key = dockStorageKey("u1");
    localStorage.setItem(key, "%%% not base64 json");
    expect(await createBrowserDockStore("u1").load()).toEqual([]);
    writeSecureJson(key, { version: 2, windows: [win("a")] });
    expect(await createBrowserDockStore("u1").load()).toEqual([]);
    writeSecureJson(key, [win("a")]);
    expect(await createBrowserDockStore("u1").load()).toEqual([]);
    writeSecureJson(key, { version: 1, windows: "x" });
    expect(await createBrowserDockStore("u1").load()).toEqual([]);
  });

  it("항목 중 모양이 틀린 것만 버린다(ID 규칙·숫자·겹침·크기)", () => {
    const parsed = parseDockWindows({
      version: 1,
      windows: [
        win("ok-1"),
        { ...win("bad id!") },
        { ...win("ok-2"), x: "10" },
        { ...win("ok-3"), w: 0 },
        { ...win("ok-4"), z: Number.NaN },
        { ...win("ok-5"), widgetId: "" },
        win("ok-1"),
        null,
        "x",
        { ...win("ok-6"), collapsed: "yes" },
      ],
    });
    expect(parsed.map((w) => w.id)).toEqual(["ok-1", "ok-6"]);
    expect(parsed[1].collapsed).toBe(false);
  });

  it("창 수 한도를 넘는 저장값은 앞에서부터 한도까지만 쓴다", () => {
    const windows = Array.from({ length: 12 }, (_, i) => win(`w${i}`));
    expect(parseDockWindows({ version: 1, windows })).toHaveLength(DOCK_MAX_WINDOWS);
  });

  it("저장 실패(용량 초과 등)는 조용히 무시한다", async () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    await expect(createBrowserDockStore("u1").save([win("a")])).resolves.toBeUndefined();
  });

  it("읽기 실패(저장소 막힘)는 빈 목록이다", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(createBrowserDockStore("u1").load()).resolves.toEqual([]);
  });
});
