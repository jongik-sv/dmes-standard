/** @vitest-environment happy-dom */

// 원 차트(shared charts PieChart) — 범례 값 뒤 단위: 기본 「건」, unit 로 바꾸기, 빈 문자열이면 단위 없음. 같은 이름 조각의 key 중복 없음.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("PieChart 같은 이름 항목", () => {
  it("이름이 같은 조각이 둘이어도 모두 그려지고 key 중복 경고가 없다", () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    try {
      const dup: PieSlice[] = [
        { label: "생산", value: 10, color: "var(--color-chart-1)" },
        { label: "생산", value: 30, color: "var(--color-chart-2)" },
        { label: "품질", value: 60, color: "var(--color-chart-3)" },
      ];
      act(() => root.render(createElement(PieChart, { data: dup })));
      // 조각(path) 3개, 범례 3줄 — 같은 이름도 하나로 합쳐지거나 빠지지 않는다.
      expect(host.querySelectorAll("path")).toHaveLength(3);
      const legend = Array.from(host.querySelectorAll("span")).map((el) => el.textContent ?? "");
      expect(legend).toEqual(["생산: 10건 (10.0%)", "생산: 30건 (30.0%)", "품질: 60건 (60.0%)"]);
      // 값이 바뀌어 다시 그려도 경고가 없다(key 가 겹치면 갱신도 어긋난다).
      act(() =>
        root.render(
          createElement(PieChart, {
            data: [
              { label: "생산", value: 40, color: "var(--color-chart-1)" },
              { label: "생산", value: 20, color: "var(--color-chart-2)" },
              { label: "품질", value: 40, color: "var(--color-chart-3)" },
            ],
          })
        )
      );
      expect(Array.from(host.querySelectorAll("span")).map((el) => el.textContent ?? "")).toEqual([
        "생산: 40건 (40.0%)",
        "생산: 20건 (20.0%)",
        "품질: 40건 (40.0%)",
      ]);
      const keyWarnings = errors.filter((args) => args.some((a) => typeof a === "string" && /same key|unique "key"/i.test(a)));
      expect(keyWarnings).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
