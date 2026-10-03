/** @vitest-environment happy-dom */

// 세로 누적 막대 차트(shared charts StackedColumnChart) — 눈금, 쌓기, 옅은 구간, 합계 표지, 기준선, 빈 데이터.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StackedColumnChart, type StackedColumnChartProps } from "../../src/components/charts";
import { niceTicks } from "../../src/components/charts/StackedColumnChart";

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
  vi.restoreAllMocks();
});

function render(props: StackedColumnChartProps) {
  act(() => root.render(createElement(StackedColumnChart, { testId: "chart", ...props })));
  return host.querySelector<HTMLElement>('[data-testid="chart"]');
}

const BASE: StackedColumnChartProps = {
  categories: ["1월", "2월", "3월"],
  series: [
    { key: "a", label: "냉연", color: "var(--color-chart-1)", values: [10, 20, 30] },
    { key: "b", label: "도금", color: "var(--color-chart-2)", values: [5, 0, 15] },
  ],
};

describe("niceTicks", () => {
  it("0 부터 최댓값 이상까지 1·2·5 단위 눈금을 만든다", () => {
    expect(niceTicks(270, 4)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(45, 4)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("StackedColumnChart", () => {
  it("0 이 아닌 값마다 막대 조각을 쌓고 툴팁에 항목·계열·값·단위를 싣는다", () => {
    const el = render({ ...BASE, unit: "천 t" })!;
    const rects = el.querySelectorAll("rect");
    expect(rects.length).toBe(5); // 2월 도금 0 은 그리지 않는다
    const titles = Array.from(el.querySelectorAll("rect > title")).map((t) => t.textContent);
    expect(titles).toContain("1월 냉연 10 천 t");
    expect(titles).toContain("3월 도금 15 천 t");
    // 같은 항목에서 두 번째 계열이 첫 번째 위에 놓인다(y 가 더 작다).
    const [first, second] = Array.from(rects); // 1월 냉연, 1월 도금
    expect(Number(second.getAttribute("y"))).toBeLessThan(Number(first.getAttribute("y")));
  });

  it("dimFrom 부터의 막대는 옅게 그리고 툴팁에 (전망)을 붙인다", () => {
    const el = render({ ...BASE, dimFrom: 2, dimLabel: "3월은 전망" })!;
    const dimmed = Array.from(el.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("opacity") === "0.4"
    );
    expect(dimmed.length).toBe(2);
    expect(dimmed[0].querySelector("title")?.textContent).toContain("(전망)");
    expect(el.textContent).toContain("3월은 전망");
  });

  it("totalAt 막대 위에 합계를 적는다", () => {
    const el = render({ ...BASE, totalAt: 2 })!;
    expect(el.querySelector("text[data-total]")?.textContent).toBe("45");
  });

  it("기준선은 점선 경로와 점, 범례 항목을 그린다", () => {
    const el = render({
      ...BASE,
      line: { label: "계획(합계)", color: "var(--color-chart-4)", values: [20, 25, 40] },
    })!;
    const path = el.querySelector('path[stroke="var(--color-chart-4)"]')!;
    expect(path.getAttribute("stroke-dasharray")).toBe("5 3");
    expect(path.getAttribute("d")?.split("L").length).toBe(3);
    expect(el.querySelectorAll('circle[stroke="var(--color-chart-4)"]').length).toBe(3);
    expect(el.textContent).toContain("계획(합계)");
  });

  it("범례를 끌 수 있고, 데이터가 없으면 '데이터 없음' 을 보인다", () => {
    const el = render({ ...BASE, showLegend: false })!;
    expect(el.querySelectorAll(":scope > div").length).toBe(0);
    const withLegend = render(BASE)!;
    expect(withLegend.querySelector(":scope > div")?.textContent).toBe("냉연도금");
    act(() => root.render(createElement(StackedColumnChart, { categories: [], series: [] })));
    expect(host.textContent).toBe("데이터 없음");
  });

  it("색은 넘겨받은 토큰을 그대로 쓴다", () => {
    const el = render(BASE)!;
    const fills = new Set(
      Array.from(el.querySelectorAll("rect")).map((r) => r.getAttribute("fill"))
    );
    expect(fills).toEqual(new Set(["var(--color-chart-1)", "var(--color-chart-2)"]));
  });

  it("부모의 실제 픽셀 폭으로 그리고 글자는 10px 로 고정한다(넓어져도 글자가 커지지 않는다)", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1133);
    const el = render({ ...BASE, height: 300 })!;
    const svg = el.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1133");
    expect(svg.getAttribute("height")).toBe("300");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1133 300");
    const texts = Array.from(svg.querySelectorAll<SVGTextElement>("text"));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t) => t.style.fontSize === "10px")).toBe(true);
  });

  it("폭을 재기 전에는 640px 로 그리고, 높이는 최소 120px 이다", () => {
    const el = render({ ...BASE, height: 40 })!;
    const svg = el.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("640");
    expect(svg.getAttribute("height")).toBe("120");
  });

  it("잰 폭이 여백보다 좁으면(탭이 다시 보이는 순간 등) 재기 전처럼 640px 로 그려 막대 폭이 음수가 되지 않는다", () => {
    // 여백 left 36 + right 10 = 46. 그보다 좁은 양수 폭을 재면 iw·막대 폭이 음수가 되어 <rect width="-1.8"> 콘솔 오류가 났다.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(40);
    const el = render({ ...BASE, height: 300 })!;
    const svg = el.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("640");
    const widths = Array.from(svg.querySelectorAll("rect")).map((r) => Number(r.getAttribute("width")));
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w >= 0)).toBe(true);
  });
});

