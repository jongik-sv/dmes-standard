/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineChart from "../../src/components/charts/LineChart";
import StackedColumnChart from "../../src/components/charts/StackedColumnChart";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  // happy-dom 은 레이아웃이 없어 clientWidth 가 0 이고 ResizeObserver 도 없다 — 폭 500 으로 흉내 낸다.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(250);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LineChart 크기 측정", () => {
  const data = [
    { label: "a", value: 1 },
    { label: "b", value: 3 },
  ];

  it("빈 데이터로 마운트한 뒤 데이터가 들어오면 svg 를 그린다", () => {
    act(() => root!.render(createElement(LineChart, { data: [] })));
    expect(host!.textContent).toContain("데이터 없음");
    expect(host!.querySelector("svg")).toBeNull();

    act(() => root!.render(createElement(LineChart, { data })));
    expect(host!.querySelector("svg")).not.toBeNull();
    expect(host!.querySelector("svg")!.getAttribute("width")).toBe("500");
  });

  it("처음부터 데이터가 있으면 svg 를 그린다", () => {
    act(() => root!.render(createElement(LineChart, { data })));
    expect(host!.querySelector("svg")).not.toBeNull();
  });
});

describe("StackedColumnChart 크기 측정", () => {
  const filled = {
    categories: ["a", "b"],
    series: [{ key: "s", label: "s", color: "#000", values: [1, 2] }],
  };

  it("빈 데이터로 마운트한 뒤 데이터가 들어오면 측정한 폭으로 그린다", () => {
    act(() => root!.render(createElement(StackedColumnChart, { categories: [], series: [] })));
    expect(host!.textContent).toContain("데이터 없음");

    act(() => root!.render(createElement(StackedColumnChart, filled)));
    expect(host!.querySelector("svg")!.getAttribute("width")).toBe("500");
  });
});
