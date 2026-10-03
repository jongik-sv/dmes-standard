/** @vitest-environment happy-dom */
// 화면 길잡이 — 이동 한계 계산(순수)과 ViewportGuard(React Flow 저장소에 한계 넣기·화면 밖 안내).
// happy-dom 은 크기를 재지 않으므로 flow-canvas-fit.test.ts 와 같이 이 파일에서만 offsetWidth/Height·ResizeObserver 를 흉내 낸다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReactFlow, ReactFlowProvider, useStoreApi, type Node } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import { LOST_DELAY_MS, RECHECK_MS, ViewportGuard } from "../../../pages/dme/ruleSetEdit/canvas/ViewportGuard";
import {
  KEEP_VISIBLE_PX, NO_EXTENT, allOutside, boundsOfRects, insideExtent, panExtentOf, sameExtent, visibleRect, type PanExtent,
} from "../../../pages/dme/ruleSetEdit/canvas/viewport-guard";

describe("viewport-guard 계산", () => {
  it("경계 상자", () => {
    expect(boundsOfRects([])).toBeNull();
    expect(boundsOfRects([{ x: 10, y: 20, w: 100, h: 50 }, { x: -30, y: 40, w: 20, h: 100 }])).toEqual({ x: -30, y: 20, w: 140, h: 120 });
  });

  it("이동 한계 — 가장 멀리 가도 경계 상자가 화면에 KEEP_VISIBLE_PX 만큼 남는다", () => {
    const b = { x: 0, y: 0, w: 1000, h: 400 };
    const zoom = 0.5;
    const ext = panExtentOf(b, 800, 600, zoom)!;
    // 화면 폭(흐름 좌표) = 800 / 0.5 = 1600. 보이는 영역을 한계 왼쪽 끝에 붙이면 오른쪽 끝이 경계 상자 안으로 KEEP 만큼(흐름 좌표 KEEP/zoom) 들어온다.
    const viewRight = ext[0][0] + 800 / zoom;
    expect(viewRight - b.x).toBeCloseTo(KEEP_VISIBLE_PX / zoom, 0);
    const viewLeft = ext[1][0] - 800 / zoom;
    expect(b.x + b.w - viewLeft).toBeCloseTo(KEEP_VISIBLE_PX / zoom, 0);
    const viewBottom = ext[0][1] + 600 / zoom;
    expect(viewBottom - b.y).toBeCloseTo(KEEP_VISIBLE_PX / zoom, 0);
  });

  it("이동 한계 — 크기·배율을 모르면 null, 좁은 캔버스는 남길 폭을 절반으로 줄인다", () => {
    const b = { x: 0, y: 0, w: 100, h: 100 };
    expect(panExtentOf(null, 800, 600, 1)).toBeNull();
    expect(panExtentOf(b, 0, 600, 1)).toBeNull();
    expect(panExtentOf(b, 800, 600, 0)).toBeNull();
    const narrow = panExtentOf(b, 100, 100, 1)!;
    expect(narrow).toEqual([[-50, -50], [150, 150]]); // 한계 폭 200 ≥ 화면 폭 100
  });

  it("같은 한계 비교", () => {
    const a: PanExtent = [[0, 0], [10, 10]];
    expect(sameExtent(a, [[0, 0], [10, 10]])).toBe(true);
    expect(sameExtent(a, [[0, 0], [10, 11]])).toBe(false);
    expect(sameExtent(null, null)).toBe(true);
    expect(sameExtent(a, null)).toBe(false);
  });

  it("한계 안 판정 — 보이는 영역이 한계보다 큰 축은 따지지 않는다", () => {
    const ext: PanExtent = [[0, 0], [1000, 1000]];
    expect(insideExtent({ x: 10, y: 10, w: 100, h: 100 }, ext)).toBe(true);
    expect(insideExtent({ x: 950, y: 10, w: 100, h: 100 }, ext)).toBe(false);
    expect(insideExtent({ x: -500, y: 10, w: 2000, h: 100 }, ext)).toBe(true);
  });

  it("화면 밖 판정", () => {
    const view = visibleRect([-1000, -500, 2], 800, 600); // x 500~900, y 250~550
    expect(view).toEqual({ x: 500, y: 250, w: 400, h: 300 });
    expect(allOutside([{ x: 0, y: 0, w: 100, h: 100 }], view)).toBe(true);
    expect(allOutside([{ x: 0, y: 0, w: 100, h: 100 }, { x: 880, y: 540, w: 50, h: 50 }], view)).toBe(false);
    expect(allOutside([], view)).toBe(false);
    expect(allOutside([{ x: 0, y: 0, w: 100, h: 100 }], { x: 0, y: 0, w: 0, h: 0 })).toBe(false);
  });
});

type RoCallback = (entries: Array<{ target: Element; contentRect: { width: number; height: number } }>, ro: unknown) => void;
const win = window as unknown as { ResizeObserver: unknown };
const originalRO = win.ResizeObserver;
const size = (el: HTMLElement, axis: "width" | "height") =>
  /px$/.test(el.style[axis]) ? parseFloat(el.style[axis]) : axis === "width" ? 800 : 600;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get(this: HTMLElement) { return size(this, "width"); } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get(this: HTMLElement) { return size(this, "height"); } });
  win.ResizeObserver = class {
    private queued: HTMLElement[] = [];
    constructor(private cb: RoCallback) {}
    observe(el: HTMLElement) {
      if (this.queued.push(el) > 1) return;
      queueMicrotask(() => {
        const els = this.queued;
        this.queued = [];
        this.cb(els.map((t) => ({ target: t, contentRect: { width: size(t, "width"), height: size(t, "height") } })), this);
      });
    }
    unobserve() {}
    disconnect() {}
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  win.ResizeObserver = originalRO;
  document.body.innerHTML = "";
});

const NODES: Node[] = [
  { id: "a", position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
  { id: "b", position: { x: 400, y: 300 }, data: {}, width: 100, height: 40 },
];
/** 그룹 틀(화면 밖 판정에서 빠지는 형식) — 시험에서는 빈 상자로 그린다. */
const NODE_TYPES = { rsfGroup: () => null };
/** 저장소를 밖으로 내보내는 시험용 자식. */
let api: ReturnType<typeof useStoreApi> | null = null;
function StoreProbe() {
  api = useStoreApi();
  return null;
}
const state = () => api!.getState();
const extentNow = () => state().translateExtent as PanExtent;
async function drawGuard(nodes: Node[], viewport: { x: number; y: number; zoom: number }, onFit: () => void = vi.fn()) {
  await act(async () => {
    root.render(
      createElement(
        ReactFlowProvider,
        null,
        createElement(
          "div",
          { style: { width: "800px", height: "600px" } },
          createElement(
            ReactFlow,
            { nodes, edges: [], nodeTypes: NODE_TYPES, defaultViewport: viewport },
            createElement(ViewportGuard, { onFit, fitKeyLabel: "Shift+1" }),
            createElement(StoreProbe),
          ),
        ),
      ),
    );
  });
  await wait(50);
}
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const lostShown = () => document.querySelector('[data-testid="flow-lost"]') !== null;
/** 지금 보이는 영역이 이동 한계 안인가. */
function viewInsideExtent(): boolean {
  const s = state();
  const [[x0, y0], [x1, y1]] = extentNow();
  const v = visibleRect(s.transform, s.width, s.height);
  return v.x >= x0 - 1 && v.y >= y0 - 1 && v.x + v.w <= x1 + 1 && v.y + v.h <= y1 + 1;
}

describe("ViewportGuard", () => {
  it("흐름도 경계 상자·캔버스 크기·배율로 이동 한계를 넣고, 배율이 바뀌면 다시 넣는다", async () => {
    await drawGuard(NODES, { x: 0, y: 0, zoom: 1 });
    // 경계 상자 x 0~500, y 0~340, 캔버스 800x600, 배율 1 → 넓히는 양 720·520
    expect(extentNow()).toEqual([[-720, -520], [1220, 860]]);
    expect(lostShown()).toBe(false); // 노드가 화면에 있다
    await act(async () => { await state().panZoom!.scaleTo(0.5); });
    await wait(50);
    expect(extentNow()).toEqual([[-1440, -1040], [1940, 1380]]); // 넓히는 양 1440·1040
  });

  it("d3 가 한계를 실제로 지킨다 — 멀리 밀어도(panBy) 경계 상자가 화면 가장자리에 80px 남는다", async () => {
    await drawGuard(NODES, { x: 0, y: 0, zoom: 1 });
    await act(async () => { await state().panBy({ x: 1e6, y: 0 }); });
    await wait(50);
    expect(viewInsideExtent()).toBe(true);
    const v = visibleRect(state().transform, state().width, state().height);
    expect(v.x + v.w).toBeCloseTo(0 + KEEP_VISIBLE_PX, 0); // 화면 오른쪽 끝이 경계 상자 왼쪽(x 0)에서 80px 안쪽
  });

  it("노드가 없거나 크기를 모르면 한계를 걸지 않는다", async () => {
    await drawGuard([], { x: 0, y: 0, zoom: 1 });
    expect(sameExtent(extentNow(), NO_EXTENT)).toBe(true);
  });

  it("경계 상자가 줄어 화면이 한계 밖에 남으면(접기·지우기 등) 잠시 뒤 한계 안으로 맞춘다", async () => {
    const far: Node = { id: "c", position: { x: 4000, y: 0 }, data: {}, width: 100, height: 40 };
    await drawGuard([...NODES, far], { x: -3600, y: 0, zoom: 1 }); // c 를 보는 화면(x 3600~4400)
    expect(viewInsideExtent()).toBe(true);
    await drawGuard(NODES, { x: -3600, y: 0, zoom: 1 }); // c 를 지움 → 한계 오른쪽 끝 1220
    expect(viewInsideExtent()).toBe(false); // 바로는 그대로(d3 는 한계를 바꿔도 화면을 맞추지 않는다)
    await wait(RECHECK_MS + 100);
    expect(viewInsideExtent()).toBe(true);
  });

  it("화면에 걸친 노드가 없으면 안내를 띄우고 [흐름도로 돌아가기] 가 화면 맞춤을 부른다 — 한계 안의 빈 곳(ㄱ자 흐름)", async () => {
    const onFit = vi.fn();
    const corners: Node[] = [
      { id: "a", position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
      { id: "b", position: { x: 3000, y: 3000 }, data: {}, width: 100, height: 40 },
    ];
    await drawGuard(corners, { x: -1500, y: -1500, zoom: 1 }, onFit); // 보이는 영역 x 1500~2300 — 한계 안, 노드 없음
    expect(viewInsideExtent()).toBe(true);
    expect(lostShown()).toBe(false); // 바로 띄우지 않는다(깜빡임 방지)
    await wait(LOST_DELAY_MS + 50);
    const btn = document.querySelector('[data-testid="flow-lost-fit"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("흐름도로 돌아가기");
    expect(btn.closest(".nopan")).not.toBeNull(); // 안내 위에서 끌어도 화면이 움직이지 않는다
    act(() => btn.click());
    expect(onFit).toHaveBeenCalledOnce();
    await act(async () => { await state().panZoom!.setViewport({ x: 0, y: 0, zoom: 1 }); });
    await wait(50);
    expect(lostShown()).toBe(false); // 노드가 다시 보이면 사라진다
  });

  it("그룹 틀만 화면에 걸쳐 있으면 안내를 띄운다(그룹 틀은 세지 않는다)", async () => {
    const nodes: Node[] = [
      { id: "a", position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
      { id: "b", position: { x: 3000, y: 3000 }, data: {}, width: 100, height: 40 },
      { id: "g", type: "rsfGroup", position: { x: 1400, y: 1400 }, data: {}, width: 1200, height: 1000 },
    ];
    await drawGuard(nodes, { x: -1500, y: -1500, zoom: 1 });
    await wait(LOST_DELAY_MS + 50);
    expect(lostShown()).toBe(true);
  });
});
