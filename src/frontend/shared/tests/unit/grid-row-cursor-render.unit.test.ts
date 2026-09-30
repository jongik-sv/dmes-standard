/** @vitest-environment happy-dom */

// AgDataGrid 행 커서 기본 기능 — 화면이 아무것도 넘기지 않아도 클릭한 행에 커서가 붙고 ↑/↓ 로 옮겨 간다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgDataGrid } from "../../src/components/grid/AgDataGrid";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const columns = [{ key: "name", header: "이름" }];
const data = [
  { id: 1, name: "가" },
  { id: 2, name: "나" },
  { id: 3, name: "다" },
];
let container: HTMLDivElement;
let root: Root | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function render(props: Record<string, unknown>) {
  await act(async () => {
    root!.render(createElement(AgDataGrid, { columns, data, height: "auto", ...props } as never));
  });
  await settle();
}

const gridEl = () => container.querySelector(".cm-data-grid") as HTMLDivElement;
const cursorRows = () =>
  Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row-highlighted")).map((el) =>
    el.getAttribute("row-id")
  );

async function clickRow(rowId: string) {
  const cell = container.querySelector(`.ag-center-cols-container [row-id="${rowId}"] .ag-cell`) as HTMLElement;
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

async function press(key: "ArrowUp" | "ArrowDown") {
  await act(async () => {
    gridEl().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

describe("AgDataGrid 행 커서 (자체 관리)", () => {
  it("클릭한 행에 커서가 붙고 ↑/↓ 로 옮겨 가며 끝에서 멈춘다 — 숫자 키 행 포함", async () => {
    const onRowClick = vi.fn();
    await render({ onRowClick });
    expect(cursorRows()).toEqual([]);

    await clickRow("2");
    expect(cursorRows()).toEqual(["2"]);

    await press("ArrowDown");
    expect(cursorRows()).toEqual(["3"]);
    expect(onRowClick).toHaveBeenLastCalledWith(data[2], expect.any(KeyboardEvent));

    await press("ArrowDown");
    expect(cursorRows()).toEqual(["3"]);

    await press("ArrowUp");
    await press("ArrowUp");
    expect(cursorRows()).toEqual(["1"]);
  });

  it("onRowClick 없이도 ↓ 를 누르면 첫 행부터 커서가 선다", async () => {
    await render({});
    gridEl().focus();
    await press("ArrowDown");
    expect(cursorRows()).toEqual(["1"]);
  });
});

describe("AgDataGrid 행 커서 (화면 제어)", () => {
  it("화면이 넘긴 값이 커서이고, undefined 로 바꾸면 커서를 지운다", async () => {
    await render({ highlightedRowKey: 2 });
    expect(cursorRows()).toEqual(["2"]);

    await render({ highlightedRowKey: undefined });
    expect(cursorRows()).toEqual([]);
  });

  it("화면이 커서를 쥐고 있으면 클릭만으로 커서를 옮기지 않는다", async () => {
    await render({ highlightedRowKey: 1, onRowClick: () => {} });
    await clickRow("3");
    expect(cursorRows()).toEqual(["1"]);
  });
});

describe("AgDataGrid 행 커서 (편집 가능한 그리드)", () => {
  const editColumns = [
    { key: "name", header: "이름" },
    { key: "grade", header: "등급", editable: true, cellEditor: "select", cellEditorValues: ["A", "B"] },
  ];
  const cell = (rowId: string, colId: string) =>
    container.querySelector(`.ag-center-cols-container [row-id="${rowId}"] [col-id="${colId}"]`) as HTMLElement;

  async function pressOn(el: HTMLElement, key: "ArrowUp" | "ArrowDown") {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
    await settle();
  }

  it("칸에서 ↓ 를 한 번 누르면 커서가 정확히 한 행 내려간다", async () => {
    await render({ columns: editColumns });
    await clickRow("1");
    expect(cursorRows()).toEqual(["1"]);

    await pressOn(cell("1", "name"), "ArrowDown");
    expect(cursorRows()).toEqual(["2"]);
  });

  it("선택 목록 편집기 안에서 ↓ 는 커서를 옮기지 않는다", async () => {
    await render({ columns: editColumns });
    await clickRow("1");
    await act(async () => {
      cell("1", "grade").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await settle();
    const select = container.querySelector(".ag-cell-inline-editing select") as HTMLSelectElement | null;
    expect(select).not.toBeNull();

    await pressOn(select!, "ArrowDown");
    expect(cursorRows()).toEqual(["1"]);
  });
});
