/** @vitest-environment happy-dom */
/**
 * 그리드 툴팁을 그리드 밖(body)에 띄우는 훅(useGridTooltipOutside, 2026-10-05).
 * 머리글·셀 위에 마우스가 오르면 popupParent 를 body 로 바꾸고, 눌림·키 입력·그리드를 떠남·tooltipHide 에서 되돌린다.
 * 그 밖의 자리(머리글·셀이 아닌 곳)에서는 건드리지 않는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgGridReact } from "ag-grid-react";
import { useGridTooltipOutside } from "../../src/components/grid/grid-tooltip-parent";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function setup() {
  const listeners: Record<string, () => void> = {};
  const api = {
    isDestroyed: () => false,
    getGridOption: vi.fn((): unknown => undefined),
    addEventListener: vi.fn((name: string, fn: () => void) => {
      listeners[name] = fn;
    }),
    setGridOption: vi.fn(),
  };
  const gridRef = { current: { api } } as unknown as RefObject<AgGridReact | null>;
  const containerRef = createRef<HTMLDivElement>();
  function Probe() {
    useGridTooltipOutside(containerRef, gridRef);
    return createElement(
      "div",
      { ref: containerRef },
      createElement("div", { className: "ag-header-cell", "data-testid": "hc" }),
      createElement("div", { className: "ag-cell", "data-testid": "cell" }),
      createElement("div", { className: "ag-overlay", "data-testid": "other" })
    );
  }
  act(() => root!.render(createElement(Probe)));
  const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const fire = (el: Element, type: string, init: object = { bubbles: true }) =>
    act(() => {
      el.dispatchEvent(type.startsWith("key") ? new KeyboardEvent(type, init) : new MouseEvent(type, init));
    });
  return { api, listeners, q, fire, container: containerRef };
}

describe("useGridTooltipOutside", () => {
  it("머리글 위에 마우스가 오르면 popupParent 를 body 로 바꾸고 한 번만 바꾼다", () => {
    const { api, q, fire } = setup();
    fire(q("hc"), "mouseover");
    fire(q("cell"), "mouseover");
    expect(api.setGridOption).toHaveBeenCalledTimes(1);
    expect(api.setGridOption).toHaveBeenCalledWith("popupParent", document.body);
  });

  it("머리글·셀이 아닌 자리는 건드리지 않는다", () => {
    const { api, q, fire } = setup();
    fire(q("other"), "mouseover");
    expect(api.setGridOption).not.toHaveBeenCalled();
  });

  it("mousedown(편집·열 끌기·메뉴 시작)이면 바로 되돌린다", () => {
    const { api, q, fire } = setup();
    fire(q("cell"), "mouseover");
    fire(q("cell"), "mousedown");
    expect(api.setGridOption).toHaveBeenLastCalledWith("popupParent", undefined);
  });

  it("키 입력과 그리드를 떠남과 tooltipHide 도 되돌린다", () => {
    const { api, q, fire, listeners, container } = setup();
    for (const how of ["keydown", "mouseleave", "tooltipHide"]) {
      api.setGridOption.mockClear();
      fire(q("cell"), "mouseover");
      expect(api.setGridOption).toHaveBeenLastCalledWith("popupParent", document.body);
      if (how === "tooltipHide") act(() => listeners.tooltipHide());
      else fire(how === "keydown" ? q("cell") : container.current!, how, how === "mouseleave" ? {} : { bubbles: true });
      expect(api.setGridOption).toHaveBeenLastCalledWith("popupParent", undefined);
    }
    expect(api.addEventListener).toHaveBeenCalledTimes(1); // tooltipHide 구독은 api 마다 한 번
  });

  it("호출자가 popupParent 를 줬으면(body 가 아님) 건드리지 않는다", () => {
    const { api, q, fire } = setup();
    api.getGridOption.mockReturnValue(document.createElement("div"));
    fire(q("cell"), "mouseover");
    expect(api.setGridOption).not.toHaveBeenCalled();
  });

  it("툴팁 감싸개 변수는 grid.css 의 body > .ag-popup 선택자로 준다(ag-theme-alpine 클래스에 기대지 않는다)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/grid/grid.css"), "utf8");
    const block = /\.cm-data-grid\.ag-theme-alpine,\s*body > \.ag-popup\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/--ag-tooltip-background-color:\s*var\(--shell-header-bg\)/);
    expect(block).toMatch(/--ag-tooltip-text-color:\s*var\(--shell-header-fg\)/);
    expect(block).toMatch(/--ag-font-family:/);
    expect(block).toMatch(/--ag-font-size:/);
  });

  it("언마운트하면 문서 이벤트를 더 듣지 않는다", () => {
    const { api, q, fire } = setup();
    const cell = q("cell");
    act(() => root!.unmount());
    root = createRoot(host);
    fire(cell, "mouseover");
    expect(api.setGridOption).not.toHaveBeenCalled();
  });
});
