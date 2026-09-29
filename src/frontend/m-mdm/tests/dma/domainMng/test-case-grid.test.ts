/** @vitest-environment happy-dom */

// A-TEST 테스트 케이스 그리드(L-001~L-005, B-006, GB-001). 칸을 눌러 편집하면 케이스 목록이 바뀌고(기대는 true/false 선택),
// 결과 칸은 자기 케이스 결과와 메시지(title)를 보이며, 읽기 전용이면 편집기·삭제·추가가 없다.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { DomainTestCaseGrid } from "../../../pages/dma/domainMng/components/DomainTestCaseGrid";
import { resultLabel } from "../../../pages/dma/domainMng/change-view";
import type { TestCaseRow, TestResultRow } from "../../../pages/dma/domainMng/types";
import { findButton, selectValue, typeInto } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
let latest: TestCaseRow[] = [];

const CASES: TestCaseRow[] = [
  { VALUE: "A1", EXPECT: true, VARS: "", MEMO: "첫 케이스" },
  { VALUE: "ZZ", EXPECT: false, VARS: "", MEMO: "" },
];

const RESULTS = [
  { DOMAIN_ID: 1, DOMAIN_NAME: "코드", OWN: true, IDX: 0, VALUE: "A1", EXPECT: true, ACTUAL: false, RESULT: "MISMATCH", MESSAGE: "형식 불일치" },
] as unknown as TestResultRow[];

function Harness(props: { readOnly?: boolean; showVars?: boolean; cases?: TestCaseRow[] }) {
  const [cases, setCases] = useState<TestCaseRow[]>(props.cases ?? CASES);
  return createElement(DomainTestCaseGrid, {
    cases, results: RESULTS, readOnly: props.readOnly ?? false, showVars: props.showVars ?? false,
    onChange: (next: TestCaseRow[]) => { latest = next; setCases(next); },
  });
}

async function wait(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(props: Parameters<typeof Harness>[0] = {}) {
  latest = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(Harness, props)));
  });
  await wait();
}

const cellOf = (rowKey: number, col: string) =>
  container.querySelector(`.ag-center-cols-container .ag-row[row-id='${rowKey}'] [col-id='${col}']`) as HTMLElement | null;

/** 칸을 눌러 편집기를 연다(singleClickEdit 은 칸의 mousedown·click 으로 편집을 연다). */
async function openEditor(cell: HTMLElement) {
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await wait();
}

describe("DomainTestCaseGrid", () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
  });

  it("케이스마다 한 행이고 결과 칸은 자기 결과와 메시지를 보인다", async () => {
    await render();
    expect(cellOf(1, "VALUE")?.textContent).toBe("A1");
    expect(cellOf(2, "EXPECT")?.textContent).toBe("false");
    const result = cellOf(1, "RESULT_TEXT")?.querySelector("span[title]");
    expect(result?.textContent).toBe(resultLabel("MISMATCH"));
    expect(result?.getAttribute("title")).toBe("형식 불일치");
    expect(cellOf(2, "RESULT_TEXT")?.textContent).toBe("-");
    // 변수가 필요 없는 도메인이면 변수 칸이 없다
    expect(container.querySelector("[col-id='VARS']")).toBeNull();
  });

  it("입력 칸을 눌러 고치면 그 케이스 값이 바뀐다", async () => {
    await render();
    const cell = cellOf(2, "VALUE")!;
    await openEditor(cell);
    const input = cell.querySelector("input") as HTMLInputElement;
    expect(input, "입력 칸 편집기가 열리지 않았다").not.toBeNull();
    await typeInto(input, "B2");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await wait();
    expect(latest).toEqual([CASES[0], { ...CASES[1], VALUE: "B2" }]);
    expect(cellOf(2, "VALUE")?.textContent).toBe("B2");
  });

  it("기대 칸은 true/false 에서 고르고 불리언으로 돌려준다", async () => {
    await render();
    const cell = cellOf(1, "EXPECT")!;
    await openEditor(cell);
    const select = cell.querySelector("select") as HTMLSelectElement;
    expect(select, "기대 칸 편집기가 열리지 않았다").not.toBeNull();
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["true", "false"]);
    await selectValue(select, "false");
    await wait();
    expect(latest[0]).toEqual({ ...CASES[0], EXPECT: false });
  });

  it("삭제는 그 케이스를 빼고, 케이스 추가는 빈 케이스를 붙인다", async () => {
    await render({ showVars: true });
    expect(container.querySelector("[col-id='VARS']")).not.toBeNull();
    await act(async () => findButton(cellOf(1, "DELETE")!, "삭제").click());
    await wait();
    expect(latest).toEqual([CASES[1]]);
    await act(async () => findButton(container, "케이스 추가").click());
    await wait();
    expect(latest).toEqual([CASES[1], { VALUE: "", EXPECT: true, VARS: "", MEMO: "" }]);
  });

  it("읽기 전용이면 칸을 눌러도 편집기가 열리지 않고 삭제·추가 버튼이 없다", async () => {
    await render({ readOnly: true });
    const cell = cellOf(1, "VALUE")!;
    await openEditor(cell);
    expect(cell.querySelector("input")).toBeNull();
    expect(container.querySelector("[col-id='DELETE']")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "케이스 추가")).toBe(false);
  });

  it("케이스가 없으면 빈 상태 문구를 보인다", async () => {
    await render({ cases: [] });
    // 빈 상태 안내는 ag-grid 가 비동기로 띄우므로 나타날 때까지 기다린다(고정 대기는 부하에 따라 흔들렸다).
    await vi.waitFor(() => expect(container.textContent).toContain("테스트 케이스가 없습니다"));
  });
});
