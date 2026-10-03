/** @vitest-environment happy-dom */

// 원 차트(shared charts PieChart) — 범례 값 뒤 단위: 기본 「건」, unit 로 바꾸기, 빈 문자열이면 단위 없음.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PieChart, type PieSlice } from "../../src/components/charts";

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
});

const DATA: PieSlice[] = [
  { label: "생산", value: 12.9, color: "var(--color-chart-1)" },
  { label: "품질", value: 23.7, color: "var(--color-chart-2)" },
];

function legendTexts(unit?: string): string[] {
  act(() => root.render(createElement(PieChart, unit === undefined ? { data: DATA } : { data: DATA, unit })));
  return Array.from(host.querySelectorAll("span")).map((el) => el.textContent ?? "");
}

describe("PieChart 범례 단위", () => {
  it("unit 을 안 넘기면 값 뒤에 「건」을 붙인다(기존 모습)", () => {
    expect(legendTexts()).toEqual(["생산: 12.9건 (35.2%)", "품질: 23.7건 (64.8%)"]);
  });

  it("unit=\"분\" 이면 「분」을 붙인다", () => {
    expect(legendTexts("분")).toEqual(["생산: 12.9분 (35.2%)", "품질: 23.7분 (64.8%)"]);
  });

  it("unit=\"\" 이면 단위 없이 값과 백분율만 보인다", () => {
    const texts = legendTexts("");
    expect(texts).toEqual(["생산: 12.9 (35.2%)", "품질: 23.7 (64.8%)"]);
    expect(texts.join("")).not.toContain("건");
  });
});
