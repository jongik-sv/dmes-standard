/** @vitest-environment happy-dom */
// 화면 길잡이 — 이동 한계 계산(순수)과 ViewportGuard(React Flow 저장소에 한계 넣기·화면 밖 안내).
// happy-dom 은 크기를 재지 않으므로 flow-canvas-fit.test.ts 와 같이 이 파일에서만 offsetWidth/Height·ResizeObserver 를 흉내 낸다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReactFlow, ReactFlowProvider, useStore, type Node } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import { ViewportGuard } from "../../../pages/dme/ruleSetEdit/canvas/ViewportGuard";
import {
  KEEP_VISIBLE_PX, allOutside, boundsOfRects, panExtentOf, sameExtent, visibleRect, type PanExtent,
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
/** 저장소의 translateExtent 를 밖으로 내보내는 시험용 자식. */
let seen: PanExtent | null = null;
function ExtentProbe() {
  seen = useStore((s) => s.translateExtent) as PanExtent;
  return null;
}
async function drawGuard(viewport: { x: number; y: number; zoom: number }, onFit: () => void) {
  await act(async () => {
    root.render(
      createElement(
        ReactFlowProvider,
        null,
        createElement(
          "div",
          { style: { width: "800px", height: "600px" } },
          createElement(ReactFlow, { nodes: NODES, edges: [], defaultViewport: viewport }, createElement(ViewportGuard, { onFit, fitKeyLabel: "Shift+1" }), createElement(ExtentProbe)),
        ),
      ),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

describe("ViewportGuard", () => {
  it("흐름도 경계 상자·캔버스 크기·배율로 이동 한계를 넣는다", async () => {
    await drawGuard({ x: 0, y: 0, zoom: 1 }, vi.fn());
    // 경계 상자 x 0~500, y 0~340, 캔버스 800x600, 배율 1 → 넓히는 양 720·520
    expect(seen).toEqual([[-720, -520], [1220, 860]]);
    expect(document.querySelector('[data-testid="flow-lost"]')).toBeNull(); // 노드가 화면에 있다
  });

  it("화면에 걸친 노드가 없으면 안내를 띄우고 [흐름도로 돌아가기] 가 화면 맞춤을 부른다", async () => {
    const onFit = vi.fn();
    await drawGuard({ x: 5000, y: 5000, zoom: 1 }, onFit); // 보이는 영역 x -5000~-4200 — 노드 없음
    const btn = document.querySelector('[data-testid="flow-lost-fit"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("흐름도로 돌아가기");
    expect(btn.closest(".nopan")).not.toBeNull(); // 안내 위에서 끌어도 화면이 움직이지 않는다
    act(() => btn.click());
    expect(onFit).toHaveBeenCalledOnce();
  });
});
