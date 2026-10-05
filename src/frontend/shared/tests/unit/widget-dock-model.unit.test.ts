import { describe, expect, it } from "vitest";

import { defWidgetMeta } from "../../src/widget";
import type {
  WidgetDefRow,
  WidgetMeta,
  WidgetRegistry,
  WidgetRegistryEntry,
  WidgetTypeRegistryEntry,
} from "../../src/widget";
import {
  bringDockWindowToFront,
  clampDockWindow,
  closeDockWindow,
  DOCK_MAX_WINDOWS,
  DOCK_WINDOW_ID_PATTERN,
  dockItemSize,
  isDockableEntry,
  listDockableEntries,
  moveDockWindow,
  openDockWindow,
  resizeDockWindow,
  sanitizeDockWindows,
  stableDockWindowId,
  toggleDockCollapse,
  windowSizeFor,
} from "../../src/widget-dock";
import type { DockWindow } from "../../src/widget-dock";

const VP = { width: 1600, height: 900 };

const entry = (id: string, extra: Partial<WidgetMeta> = {}): WidgetRegistryEntry => ({
  meta: { id, title: id, defaultSize: { w: 6, h: 8 }, floatable: true, ...extra },
  load: async () => ({ default: () => null }),
});

const win = (id: string, extra: Partial<DockWindow> = {}): DockWindow => ({
  id,
  widgetId: "def.calc",
  x: 100,
  y: 100,
  w: 300,
  h: 240,
  collapsed: false,
  z: 1,
  ...extra,
});

describe("dock-model — 목록·크기", () => {
  it("floatable 이고 사용 중지가 아닌 위젯만 띄울 수 있다", () => {
    expect(isDockableEntry(entry("a"))).toBe(true);
    expect(isDockableEntry(entry("a", { floatable: false }))).toBe(false);
    expect(isDockableEntry(entry("a", { floatable: undefined }))).toBe(false);
    expect(isDockableEntry(entry("a", { disabled: true }))).toBe(false);
    expect(isDockableEntry(undefined)).toBe(false);
  });

  it("「도구」 목록은 띄울 수 있는 위젯만 제목순(한국어)이다", () => {
    const registry: WidgetRegistry = {
      m: entry("m", { title: "메모" }),
      c: entry("c", { title: "계산기" }),
      u: entry("u", { title: "단위 변환" }),
      x: entry("x", { title: "가나다 표", floatable: false }),
      d: entry("d", { title: "가 사용 중지", disabled: true }),
    };
    expect(listDockableEntries(registry).map((e) => e.meta.title)).toEqual([
      "계산기",
      "단위 변환",
      "메모",
    ]);
  });

  it("메타 칸 크기를 칸당 40×30px 로 바꾸고 최소 220×160 을 지킨다", () => {
    expect(windowSizeFor({ defaultSize: { w: 8, h: 10 } })).toEqual({ w: 320, h: 300 });
    expect(windowSizeFor({ defaultSize: { w: 2, h: 2 } })).toEqual({ w: 220, h: 160 });
    expect(dockItemSize({ w: 320, h: 300 })).toEqual({ w: 8, h: 10 });
    expect(dockItemSize({ w: 10, h: 10 })).toEqual({ w: 1, h: 1 });
  });

  it("첫 창 ID 는 위젯마다 고정이고 메모 서버 키 규칙에 맞는다", () => {
    const a = stableDockWindowId("def.memo-1");
    expect(a).toBe(stableDockWindowId("def.memo-1"));
    expect(a).not.toBe(stableDockWindowId("def_memo-1"));
    expect(DOCK_WINDOW_ID_PATTERN.test(a)).toBe(true);
    const long = stableDockWindowId(`def.${"x".repeat(80)}`);
    expect(DOCK_WINDOW_ID_PATTERN.test(long)).toBe(true);
  });
});

describe("dock-model — 열기", () => {
  it("새 창은 메타 크기로 오른쪽 위에 놓이고 맨 앞이며 첫 창 ID 는 고정 ID 다", () => {
    const r = openDockWindow([], entry("def.calc", { defaultSize: { w: 8, h: 10 } }), VP);
    expect(r.kind).toBe("opened");
    if (r.kind !== "opened") return;
    const w = r.windows[0];
    expect(w).toMatchObject({
      id: stableDockWindowId("def.calc"),
      widgetId: "def.calc",
      w: 320,
      h: 300,
      collapsed: false,
      z: 1,
    });
    expect(w.x).toBe(VP.width - 320 - 32);
    expect(w.y).toBe(72);
  });

  it("두 번째 창은 계단식으로 비켜 놓이고 같은 위젯이면 무작위 ID 를 쓴다", () => {
    const first = openDockWindow([], entry("def.calc"), VP);
    const second = openDockWindow(first.windows, entry("def.calc"), VP, () => "dk-rand-1");
    expect(second.kind).toBe("opened");
    const [a, b] = second.windows;
    expect(b.id).toBe("dk-rand-1");
    expect(b.x).toBe(a.x - 28);
    expect(b.y).toBe(a.y + 28);
    expect(b.z).toBeGreaterThan(a.z);
  });

  it("multiple===false 위젯이 이미 열려 있으면 새로 만들지 않고 펼쳐서 앞으로 가져온다", () => {
    const e = entry("def.calc", { multiple: false });
    const ws = [
      win(stableDockWindowId("def.calc"), { collapsed: true, z: 1 }),
      win("other", { widgetId: "def.memo", z: 2 }),
    ];
    const r = openDockWindow(ws, e, VP);
    expect(r.kind).toBe("focused");
    expect(r.windows).toHaveLength(2);
    const target = r.windows.find((w) => w.widgetId === "def.calc")!;
    expect(target.collapsed).toBe(false);
    expect(target.z).toBe(2);
  });

  it("창 수 한도(8)면 열지 않고 그대로 돌려준다", () => {
    const ws = Array.from({ length: DOCK_MAX_WINDOWS }, (_, i) => win(`w${i}`, { z: i + 1 }));
    const r = openDockWindow(ws, entry("def.memo"), VP);
    expect(r.kind).toBe("limit");
    expect(r.windows).toBe(ws);
  });

  it("좁은 화면에서도 새 창이 화면 안에 들어온다", () => {
    const r = openDockWindow([], entry("def.calc", { defaultSize: { w: 20, h: 30 } }), {
      width: 500,
      height: 400,
    });
    const w = r.windows[0];
    expect(w.w).toBe(500);
    expect(w.h).toBe(400);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
  });
});

describe("dock-model — 자르기·앞으로·접기·닫기·옮기기", () => {
  it("화면 밖 위치를 화면 안으로 자르고, 바뀐 게 없으면 같은 객체다", () => {
    const inside = win("a");
    expect(clampDockWindow(inside, VP)).toBe(inside);
    expect(clampDockWindow(win("a", { x: -50, y: 2000 }), VP)).toMatchObject({
      x: 0,
      y: VP.height - 240,
    });
    expect(clampDockWindow(win("a", { w: 100, h: 50 }), VP)).toMatchObject({ w: 220, h: 160 });
  });

  it("접힌 창은 아이콘(44px) 크기로 위치를 자른다", () => {
    const c = clampDockWindow(win("a", { collapsed: true, x: 5000, y: 5000 }), VP);
    expect(c).toMatchObject({ x: VP.width - 44, y: VP.height - 44, w: 300, h: 240 });
  });

  it("맨 앞으로 가져오면 쌓임 순서를 1..n 으로 다시 매기고, 이미 홀로 맨 앞이면 같은 배열이다", () => {
    const ws = [win("a", { z: 5 }), win("b", { z: 9 }), win("c", { z: 7 })];
    expect(bringDockWindowToFront(ws, "b")).toBe(ws);
    const r = bringDockWindowToFront(ws, "a");
    expect(r.map((w) => [w.id, w.z])).toEqual([
      ["a", 3],
      ["b", 2],
      ["c", 1],
    ]);
    expect(bringDockWindowToFront(ws, "none")).toBe(ws);
  });

  it("접기 토글 — 접으면 자리를 지키고, 펼치면 앞으로 오며 펼친 크기로 다시 자른다", () => {
    const ws = [win("a", { z: 1, x: 1500 }), win("b", { z: 2 })];
    const collapsed = toggleDockCollapse(ws, "a", VP);
    expect(collapsed[0]).toMatchObject({ collapsed: true, x: 1500, z: 1 });
    const expanded = toggleDockCollapse(collapsed, "a", VP);
    expect(expanded[0]).toMatchObject({ collapsed: false, x: VP.width - 300, z: 2 });
    expect(toggleDockCollapse(ws, "none", VP)).toBe(ws);
  });

  it("닫기는 그 창만 뺀다", () => {
    const ws = [win("a"), win("b")];
    expect(closeDockWindow(ws, "a").map((w) => w.id)).toEqual(["b"]);
    expect(closeDockWindow(ws, "none")).toBe(ws);
  });

  it("옮기기·크기 바꾸기는 화면 안·최소 크기로 자르고, 같은 값이면 같은 배열이다", () => {
    const ws = [win("a")];
    expect(moveDockWindow(ws, "a", 100, 100, VP)).toBe(ws);
    expect(moveDockWindow(ws, "a", -10, -10, VP)[0]).toMatchObject({ x: 0, y: 0 });
    expect(resizeDockWindow(ws, "a", 50, 9999, VP)[0]).toMatchObject({ w: 220, h: VP.height });
  });
});

describe("dock-model — 저장값 정리", () => {
  const registry: WidgetRegistry = {
    "def.calc": entry("def.calc", { multiple: false }),
    "def.memo": entry("def.memo"),
    "def.off": entry("def.off", { disabled: true }),
    "def.grid": entry("def.grid", { floatable: false }),
  };

  it("등록부가 ready 면 없는·사용 중지·floatable 아닌 위젯 창과 한 번만 놓는 위젯의 중복 창을 뺀다", () => {
    const ws = [
      win("a", { widgetId: "def.calc" }),
      win("b", { widgetId: "def.calc" }),
      win("c", { widgetId: "def.memo" }),
      win("d", { widgetId: "def.off" }),
      win("e", { widgetId: "def.grid" }),
      win("f", { widgetId: "def.gone" }),
    ];
    expect(sanitizeDockWindows(ws, registry, "ready").map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("등록부가 loading·error 면 등록부 판단으로 지우지 않는다(정의 위젯이 아직 없다)", () => {
    const ws = [win("a", { widgetId: "def.gone" }), win("b", { widgetId: "def.off" })];
    expect(sanitizeDockWindows(ws, {}, "loading")).toBe(ws);
    expect(sanitizeDockWindows(ws, {}, "error")).toBe(ws);
  });

  it("ID 겹침과 창 수 한도는 늘 정리하고, 바뀐 게 없으면 같은 배열이다", () => {
    const many = Array.from({ length: 10 }, (_, i) => win(`w${i}`, { widgetId: "def.memo" }));
    expect(sanitizeDockWindows(many, registry, "loading")).toHaveLength(DOCK_MAX_WINDOWS);
    const dup = [win("a", { widgetId: "def.memo" }), win("a", { widgetId: "def.memo" })];
    expect(sanitizeDockWindows(dup, registry, "loading")).toHaveLength(1);
    const ok = [win("a", { widgetId: "def.memo" })];
    expect(sanitizeDockWindows(ok, registry, "ready")).toBe(ok);
  });
});

describe("defWidgetMeta — floatable 전달", () => {
  const row: WidgetDefRow = {
    widgetId: "def.calc",
    srcTp: "D",
    typeId: "calculator",
    title: "계산기",
    subtitle: null,
    description: null,
    defW: null,
    defH: null,
    minW: null,
    minH: null,
    maxW: null,
    maxH: null,
    refreshSec: null,
    linkPageId: null,
    multipleYn: null,
    useYn: "Y",
    dataSrc: null,
    config: null,
  };
  const type = (floatable?: boolean): WidgetTypeRegistryEntry => ({
    meta: {
      id: "calculator",
      title: "계산기",
      defaultSize: { w: 6, h: 8 },
      initialConfig: {},
      ...(floatable === undefined ? {} : { floatable }),
    },
    loadRenderer: async () => ({ default: () => null }),
    loadEditor: async () => ({ default: () => null }),
  });

  it("유형이 floatable 이면 정의 위젯 메타도 floatable 이다", () => {
    expect(defWidgetMeta(row, type(true)).floatable).toBe(true);
  });

  it("유형에 floatable 이 없거나 false 면 메타에 싣지 않는다", () => {
    expect(defWidgetMeta(row, type()).floatable).toBeUndefined();
    expect(defWidgetMeta(row, type(false)).floatable).toBeUndefined();
  });
});
