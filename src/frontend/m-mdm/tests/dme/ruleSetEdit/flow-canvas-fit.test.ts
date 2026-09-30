/** @vitest-environment happy-dom */
// 캔버스 화면 맞춤(fitView) — 브라우저 확인 2·3번. happy-dom 은 크기를 재지 않으므로 이 파일에서만 offsetWidth/Height 와
// ResizeObserver(observe 하면 곧바로 한 번 알림)를 흉내 낸다(전역 setup 에 넣으면 다른 화면 테스트가 깨진다).
// 노드는 React Flow 가 준 style width/height 로, 그 밖의 요소(캔버스 틀)는 800x600 으로 잰다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { insertSplit, setPositions, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { installDomStorage } from "../helpers/render";

type RoCallback = (entries: Array<{ target: Element; contentRect: { width: number; height: number } }>, ro: unknown) => void;

const win = window as unknown as { ResizeObserver: unknown };
const originalRO = win.ResizeObserver;
/** style 에 px 크기가 있으면(React Flow 노드) 그 값, 없으면 캔버스 틀 크기 800x600. */
const size = (el: HTMLElement, axis: "width" | "height") =>
  /px$/.test(el.style[axis]) ? parseFloat(el.style[axis]) : axis === "width" ? 800 : 600;

let host: HTMLDivElement;
let root: Root;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
}
function unmount() {
  act(() => root.unmount());
  host.remove();
}

beforeEach(() => {
  installDomStorage();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get(this: HTMLElement) { return size(this, "width"); } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get(this: HTMLElement) { return size(this, "height"); } });
  // 브라우저처럼 한 틀(frame) 안에 observe 한 요소를 한 번의 알림으로 모아 보낸다.
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
  mount();
});
afterEach(() => {
  unmount();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  win.ResizeObserver = originalRO;
  document.body.innerHTML = "";
});

const noop = () => {};
function ifFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** 모든 노드를 1.5배 벌려 옮긴 흐름(자동 배치 좌표를 저장 위치로 덮는다). */
function spread(f: EditFlow): EditFlow {
  return setPositions(f, Object.fromEntries(Object.entries(positionsOf(f)).map(([k, p]) => [k, { x: p.x * 1.5 + 200, y: p.y * 1.5 + 300 }])));
}
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: ifFlow(), rules: {}, checks: [], mode: "view", showVars: false, selectedId: null, selectedEdgeId: null, overlay: null,
    focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDeleteEdge: noop, onDropPalette: noop, onNoteChange: noop, ...over,
  };
}
const draw = (p: FlowCanvasProps) => act(async () => { root.render(createElement(DmesUiProvider, null, createElement(FlowCanvas, p))); });
/** fitView 애니메이션(200ms)과 대기열(requestAnimationFrame)이 끝나기를 기다린다. */
const settle = (ms = 500) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const viewport = () => (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;

/** 이 흐름을 새 캔버스에 처음 그렸을 때의 화면(처음 맞춤) — 기댓값. */
async function freshFit(p: FlowCanvasProps): Promise<string> {
  unmount();
  mount();
  await draw(p);
  await settle();
  return viewport();
}

describe("FlowCanvas 화면 맞춤", () => {
  it("노드 배열을 다시 만든 뒤(끌기·선택 등)에도 [화면 맞춤] 이 지금 배치에 맞춘다 — 잰 크기를 되돌려 준다", async () => {
    const a = ifFlow();
    const moved = spread(a);
    await draw(props({ flow: a, fitSignal: 0 }));
    await settle();
    const before = viewport();
    await draw(props({ flow: moved, fitSignal: 0, selectedId: "r1" })); // 노드 객체를 새로 만든다
    await settle(100);
    expect(viewport()).toBe(before); // 옮기기만으로는 화면이 바뀌지 않는다
    await draw(props({ flow: moved, fitSignal: 1, selectedId: "r1" }));
    await settle();
    const fitted = viewport();
    expect(fitted).not.toBe(before);
    expect(fitted).toBe(await freshFit(props({ flow: moved, selectedId: "r1" })));
  });

  it("fitKey(세트 ID)가 바뀌면 새 흐름을 그린 뒤 화면을 맞춘다 — 이전 세트의 확대·이동이 남지 않는다", async () => {
    const a = ifFlow();
    const b = spread(toEditFlow(null, ["R_A", "R_B", "R_C", "R_D"])); // start·r1·end 는 A 와 ID 가 겹친다
    await draw(props({ flow: a, fitKey: "SET_A" }));
    await settle();
    const before = viewport();
    await draw(props({ flow: b, fitKey: "SET_B" }));
    await settle();
    const after = viewport();
    expect(after).not.toBe(before);
    expect(after).toBe(await freshFit(props({ flow: b, fitKey: "SET_B" })));
  });

  it("같은 fitKey 로 흐름만 바뀌면(편집·저장) 화면을 다시 맞추지 않는다", async () => {
    const a = ifFlow();
    await draw(props({ flow: a, fitKey: "SET_A" }));
    await settle();
    const before = viewport();
    await draw(props({ flow: spread(a), fitKey: "SET_A" }));
    await settle();
    expect(viewport()).toBe(before);
  });
});
