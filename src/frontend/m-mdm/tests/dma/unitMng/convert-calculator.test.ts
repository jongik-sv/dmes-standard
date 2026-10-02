/** @vitest-environment happy-dom */

// 환산 계산기(A-PREVIEW) — 값 입력만으로 같은 차원의 모든 단위 환산값을 표로 낸다. 값은 서버 compare 응답을
// 그대로 쓴다(I2). 입력 단위 콤보 선택은 happy-dom 에서 재현되지 않아, 목록 행 선택과 같은 경로인
// selectedUnitCode prop 으로 입력 단위를 넣는다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { ConvertCalculator } from "../../../pages/dma/unitMng/ConvertCalculator";
import type { UnitOption } from "../../../pages/dma/unitMng/types";
import { installDomStorage } from "../../dme/helpers/render";

const UNITS: UnitOption[] = [
  { unitCode: "G", dimension: "MASS" },
  { unitCode: "KG", dimension: "MASS" },
  { unitCode: "TON", dimension: "MASS" },
  { unitCode: "M", dimension: "LENGTH" },
];
const FACTOR: Record<string, number> = { G: 0.001, KG: 1, TON: 1000, M: 1 };

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let compareCalls: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function paramsOf(init?: RequestInit): Record<string, unknown> {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return (body.params ?? body) as Record<string, unknown>;
}

async function render(selectedUnitCode: string) {
  await act(async () => {
    root!.render(
      createElement(DmesUiProvider, null, createElement(ConvertCalculator, { unitOptions: UNITS, selectedUnitCode })),
    );
  });
}

async function typeValue(text: string) {
  const input = container.querySelector('input[aria-label="환산할 값"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function waitDebounce() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 450));
  });
}

function gridRows(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".ag-center-cols-container .ag-row"));
}

/** 결과 목록을 [단위, 환산값] 쌍으로 읽는다(ag-grid 행 순서는 row-index 로 맞춘다). */
function resultRows(): string[][] {
  return gridRows()
    .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")))
    .map((r) => ["unitCode", "display"].map((k) => (r.querySelector(`[col-id="${k}"]`)?.textContent ?? "").trim()));
}

describe("ConvertCalculator", () => {
  beforeEach(() => {
    compareCalls = [];
    installDomStorage(); // apiRequest 가 토큰을 localStorage 에서 읽는다 — 이 happy-dom 환경에는 저장소가 없다.
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/unitMng/compare")) {
        const p = paramsOf(init);
        compareCalls.push(p);
        const from = String(p.fromUnitCode);
        const to = String(p.toUnitCode);
        const value = (Number(p.value) * FACTOR[from]) / FACTOR[to];
        return jsonResponse({ data: { result: { value, fromUnitCode: from, toUnitCode: to } }, meta: { success: true } });
      }
      return jsonResponse({});
    }) as typeof fetch;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    globalThis.fetch = originalFetch;
  });

  it("제목은 '환산 계산기'이고, 입력 단위만 고르면 같은 차원 단위가 빈 환산값으로 나오며 서버는 부르지 않는다", async () => {
    await render("KG");
    await waitDebounce();
    expect(container.textContent).toContain("환산 계산기");
    expect(container.textContent).not.toContain("환산 미리보기");
    expect(compareCalls).toHaveLength(0);
    expect(resultRows()).toEqual([
      ["G", ""],
      ["KG", ""],
      ["TON", ""],
    ]);
  });

  it("입력 단위가 없으면 결과 목록을 그리지 않는다", async () => {
    await render("");
    await typeValue("1");
    await waitDebounce();
    expect(compareCalls).toHaveLength(0);
    expect(gridRows()).toHaveLength(0);
  });

  it("값을 넣으면 [계산] 없이 같은 차원의 모든 단위로 환산값을 표에 낸다", async () => {
    await render("KG");
    await typeValue("2,500");
    await waitDebounce();
    expect(compareCalls.map((c) => c.toUnitCode).sort()).toEqual(["G", "KG", "TON"]);
    expect(compareCalls.every((c) => c.value === "2500" && c.fromUnitCode === "KG")).toBe(true);
    expect(resultRows()).toEqual([
      ["G", "2,500,000"],
      ["KG", "2,500"],
      ["TON", "2.5"],
    ]);
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "계산")).toBe(false);
  });

  it("숫자가 아니면 팝업 없이 칸 아래 안내만 내고 서버를 부르지 않는다", async () => {
    await render("KG");
    await typeValue("12kg");
    await waitDebounce();
    expect(container.textContent).toContain("숫자만 입력할 수 있습니다.");
    expect(compareCalls).toHaveLength(0);
  });

  it("목록에서 고른 단위가 바뀌면 입력 단위를 따라 바꾸고 다시 계산한다", async () => {
    await render("KG");
    await typeValue("1");
    await waitDebounce();
    compareCalls = [];
    await render("M");
    await waitDebounce();
    expect(compareCalls.map((c) => `${c.fromUnitCode}>${c.toUnitCode}`)).toEqual(["M>M"]);
    expect(resultRows()).toEqual([["M", "1"]]);
  });

  it("결과 행을 누르면 그 단위·환산값이 새 입력이 된다", async () => {
    await render("KG");
    await typeValue("2500");
    await waitDebounce();
    const ton = gridRows().find((r) => r.getAttribute("row-id") === "TON");
    expect(ton).toBeTruthy();
    compareCalls = [];
    await act(async () => {
      ton!.querySelector<HTMLElement>('[col-id="unitCode"]')!.click();
    });
    await waitDebounce();
    const input = container.querySelector('input[aria-label="환산할 값"]') as HTMLInputElement;
    expect(input.value).toBe("2.5");
    expect(compareCalls.every((c) => c.fromUnitCode === "TON" && c.value === "2.5")).toBe(true);
    expect(resultRows()).toEqual([
      ["G", "2,500,000"],
      ["KG", "2,500"],
      ["TON", "2.5"],
    ]);
  });

  it("서버 계산이 실패하면 칸에 '계산 실패'를 쓰고 onError 로 한 번만 알린다", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ meta: { success: false, message: "서로 다른 차원끼리는 변환할 수 없습니다." } }),
    ) as typeof fetch;
    const onError = vi.fn();
    await act(async () => {
      root!.render(
        createElement(DmesUiProvider, null, createElement(ConvertCalculator, { unitOptions: UNITS, selectedUnitCode: "KG", onError })),
      );
    });
    await typeValue("1");
    await waitDebounce();
    expect(resultRows().map((r) => r[1])).toEqual(["계산 실패", "계산 실패", "계산 실패"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("서로 다른 차원끼리는 변환할 수 없습니다.");
  });
});
