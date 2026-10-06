/** @vitest-environment happy-dom */

// AgDataGrid → 화면 문맥 자동 게시(screen-context D3): 선택 행(없으면 포커스 행)을 탭 문맥으로 낸다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgDataGrid } from "../../src/components/grid/AgDataGrid";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { screenApplyStore, screenContextStore } from "../../src/screen-context";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const columns = [
  { key: "name", header: "이름" },
  { key: "COIL_WIDTH", header: "폭" },
  { key: "note", header: "비고" },
];
const data = [
  { id: 1, name: "가", COIL_WIDTH: 1250, note: null },
  { id: 2, name: "나", COIL_WIDTH: 1300, note: "메모" },
  { id: 3, name: "다", COIL_WIDTH: 900, note: "" },
];
const ctxValue = { pageId: "p1", serviceId: "", tabId: "t1" };
let container: HTMLDivElement;
let root: Root | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

async function render(props: Record<string, unknown>, inDialog = false) {
  const grid = createElement(AgDataGrid, { columns, data, height: "auto", ...props } as never);
  const tree = createElement(TabPageContext.Provider, { value: ctxValue, children: grid });
  if (inDialog) {
    container.setAttribute("role", "dialog");
  }
  await act(async () => {
    root!.render(tree);
  });
  await settle();
}

async function clickRow(rowId: string) {
  const cell = container.querySelector(`.ag-center-cols-container [row-id="${rowId}"] .ag-cell`) as HTMLElement;
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
  screenContextStore.clearTab("t1");
});

describe("AgDataGrid 선택 행 자동 게시", () => {
  it("행을 고르면 colDef field 기준 값을 grid 문맥으로 게시한다", async () => {
    await render({ selectable: true, enableRowClickSelect: true });
    expect(screenContextStore.get("t1")).toBeNull();
    await clickRow("2");
    const ctx = screenContextStore.get("t1");
    expect(ctx?.source).toBe("grid");
    expect(ctx?.tabId).toBe("t1");
    expect(ctx?.pageId).toBe("p1");
    expect(ctx?.values).toEqual({ name: "나", COIL_WIDTH: 1300, note: "메모" });
  });

  it("여럿 선택하면 마지막으로 고른 행의 값을 낸다", async () => {
    await render({ selectable: true, multiSelect: true, enableRowClickSelect: true });
    await clickRow("1");
    expect(screenContextStore.get("t1")?.values.name).toBe("가");
    await clickRow("3");
    // 여럿 선택이면 마지막으로 고른 행이 이긴다.
    expect(screenContextStore.get("t1")?.values.name).toBe("다");
  });

  it("선택 행의 데이터가 갱신되면 값을 다시 낸다", async () => {
    await render({ selectable: true, enableRowClickSelect: true });
    await clickRow("2");
    const next = data.map((r) => (r.id === 2 ? { ...r, COIL_WIDTH: 1400 } : r));
    await render({ selectable: true, enableRowClickSelect: true, data: next });
    expect(screenContextStore.get("t1")?.values.COIL_WIDTH).toBe(1400);
  });

  it("그리드가 둘이면 마지막으로 행을 고른 그리드가 이기고, 이긴 쪽이 아닌 데이터 갱신은 빼앗지 않는다", async () => {
    const other = [{ id: 7, name: "다른", COIL_WIDTH: 1, note: null }];
    const two = (a: typeof data, b: typeof other) =>
      createElement(TabPageContext.Provider, {
        value: ctxValue,
        children: createElement(
          "div",
          null,
          createElement("div", { id: "ga" }, createElement(AgDataGrid, { columns, data: a, height: "auto", selectable: true, enableRowClickSelect: true } as never)),
          createElement("div", { id: "gb" }, createElement(AgDataGrid, { columns, data: b, height: "auto", selectable: true, enableRowClickSelect: true } as never))
        ),
      });
    await act(async () => {
      root!.render(two(data, other));
    });
    await settle();
    const clickIn = async (gridId: string, rowId: string) => {
      const cell = container.querySelector(`#${gridId} .ag-center-cols-container [row-id="${rowId}"] .ag-cell`) as HTMLElement;
      await act(async () => {
        cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await settle();
    };
    await clickIn("ga", "2");
    expect(screenContextStore.get("t1")?.values.name).toBe("나");
    await clickIn("gb", "7");
    expect(screenContextStore.get("t1")?.values.name).toBe("다른");
    // A 그리드 데이터가 갱신돼도(소유자가 B) B 의 문맥을 빼앗지 않는다.
    await act(async () => {
      root!.render(two(data.map((r) => ({ ...r })), other));
    });
    await settle();
    expect(screenContextStore.get("t1")?.values.name).toBe("다른");
  });

  it("비어 있는 값은 null, 빈 문자열은 그대로 낸다", async () => {
    await render({ selectable: true, enableRowClickSelect: true });
    await clickRow("1");
    expect(screenContextStore.get("t1")?.values.note).toBeNull();
    await clickRow("3");
    expect(screenContextStore.get("t1")?.values.note).toBe("");
  });

  it("publishScreenContext={false} 면 게시하지 않는다", async () => {
    await render({ selectable: true, enableRowClickSelect: true, publishScreenContext: false });
    await clickRow("2");
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("대화 상자 안 그리드는 게시하지 않는다", async () => {
    await render({ selectable: true, enableRowClickSelect: true }, true);
    await clickRow("2");
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("그리드를 닫으면(언마운트) 문맥을 거둔다", async () => {
    await render({ selectable: true, enableRowClickSelect: true });
    await clickRow("2");
    expect(screenContextStore.get("t1")).not.toBeNull();
    await act(async () => root!.unmount());
    root = createRoot(container);
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("포털 탭 밖(문맥 없음)이어도 오류 없이 지나간다", async () => {
    await act(async () => {
      root!.render(createElement(AgDataGrid, { columns, data, height: "auto", selectable: true, enableRowClickSelect: true } as never));
    });
    await settle();
    await clickRow("2");
    expect(screenContextStore.get("")).toBeNull();
  });
});

describe("AgDataGrid 위젯 값 받기(acceptScreenApply)", () => {
  const editableColumns = [
    { key: "name", header: "이름" },
    { key: "COIL_WIDTH", header: "폭", editable: true },
    { key: "note", header: "비고", editable: true },
  ];
  const baseProps = { columns: editableColumns, selectable: true, enableRowClickSelect: true };

  it("기본(끔)이면 받는 쪽으로 등록하지 않는다", async () => {
    await render(baseProps);
    expect(screenApplyStore.has("t1")).toBe(false);
  });

  it("켜면 선택 행의 편집 가능한 칸에 넣고, 편집 불가·없는 키는 skipped 로 돌려준다", async () => {
    const changes: Array<{ field: string; newValue: unknown }> = [];
    await render({ ...baseProps, acceptScreenApply: true, onCellValueChanged: (p: { field: string; newValue: unknown }) => changes.push(p) });
    expect(screenApplyStore.has("t1")).toBe(true);
    await clickRow("2");
    let result: { applied: string[]; skipped: string[] } | null = null;
    await act(async () => {
      result = await screenApplyStore.apply("t1", { coilWidth: "1450", NAME: "바꿈", missing: 1, note: "계산 결과" });
    });
    expect(result).toEqual({ applied: ["coilWidth", "note"], skipped: ["NAME", "missing"] });
    // 기존 편집 경로(onCellValueChanged)를 탄다. 숫자 칸에는 숫자 문자열이 숫자로 들어간다.
    expect(changes.map((c) => [c.field, c.newValue])).toEqual([
      ["COIL_WIDTH", 1450],
      ["note", "계산 결과"],
    ]);
    // 값이 바뀌면 문맥도 다시 게시된다.
    expect(screenContextStore.get("t1")?.values.COIL_WIDTH).toBe(1450);
  });

  it("행이 없으면 전부 skipped", async () => {
    await render({ ...baseProps, acceptScreenApply: true });
    expect(await screenApplyStore.apply("t1", { note: "x" })).toEqual({ applied: [], skipped: ["note"] });
  });

  it("대화 상자 안 그리드는 받지 않는다", async () => {
    await render({ ...baseProps, acceptScreenApply: true }, true);
    await clickRow("2");
    expect(await screenApplyStore.apply("t1", { note: "x" })).toEqual({ applied: [], skipped: ["note"] });
  });

  it("언마운트하면 등록을 거둔다", async () => {
    await render({ ...baseProps, acceptScreenApply: true });
    await act(async () => root!.unmount());
    root = createRoot(container);
    expect(screenApplyStore.has("t1")).toBe(false);
  });

  const typedData = [
    { id: 1, num: null, txt: "가", flag: false, hid: "h", other: "x" },
    { id: 2, num: 5, txt: "나", flag: true, hid: "h", other: "y" },
  ];
  const typedColumns = [
    { key: "id", header: "ID" },
    { key: "num", header: "수", editable: true, cellEditor: "number" },
    { key: "txt", header: "글", editable: true },
    { key: "flag", header: "여부", editable: true },
    { key: "hid", header: "숨김", editable: true, hide: true },
    { key: "other", header: "다름" },
  ];
  /** 위젯이 값을 보낸다. ag-grid 가 cellValueChanged 를 비동기로 내므로 act 안에서 기다린 뒤 돌려준다. */
  async function sendApply(values: Record<string, string | number | null>) {
    let result: { applied: string[]; skipped: string[] } | null = null;
    await act(async () => {
      result = await screenApplyStore.apply("t1", values);
    });
    await settle();
    return result;
  }
  const typedProps = { columns: typedColumns, data: typedData, selectable: true, enableRowClickSelect: true, acceptScreenApply: true };

  it("빈 숫자 칸에 숫자 문자열을 숫자로 넣고, 글자 칸에 숫자를 글자로, 여부 칸에 true 문자열을 불리언으로 넣는다", async () => {
    const changes: Array<[string, unknown]> = [];
    await render({ ...typedProps, onCellValueChanged: (p: { field: string; newValue: unknown }) => changes.push([p.field, p.newValue]) });
    await clickRow("1");
    const result = await sendApply({ NUM: "12", txt: 5, flag: "true" });
    expect(result).toEqual({ applied: ["NUM", "txt", "flag"], skipped: [] });
    expect(changes).toEqual([
      ["num", 12],
      ["txt", "5"],
      ["flag", true],
    ]);
  });

  it("형이 맞지 않아 칸이 받지 않는 값은 넣었다고 알리지 않는다", async () => {
    const changes: unknown[] = [];
    await render({ ...typedProps, onCellValueChanged: (p: unknown) => changes.push(p) });
    await clickRow("1");
    const result = await sendApply({ num: "abc", flag: "예" });
    expect(result).toEqual({ applied: [], skipped: ["num", "flag"] });
    expect(changes).toEqual([]);
  });

  it("숨긴 열과 같은 칸을 가리키는 두 번째 키는 넣지 않는다", async () => {
    const changes: Array<[string, unknown]> = [];
    await render({ ...typedProps, onCellValueChanged: (p: { field: string; newValue: unknown }) => changes.push([p.field, p.newValue]) });
    await clickRow("1");
    const result = await sendApply({ hid: "z", txt: "첫째", TXT: "둘째" });
    expect(result).toEqual({ applied: ["txt"], skipped: ["hid", "TXT"] });
    expect(changes).toEqual([["txt", "첫째"]]);
  });

  it("publishScreenContext 를 도중에 끄면 이미 낸 문맥을 거둔다", async () => {
    await render({ selectable: true, enableRowClickSelect: true });
    await clickRow("2");
    expect(screenContextStore.get("t1")).not.toBeNull();
    await render({ selectable: true, enableRowClickSelect: true, publishScreenContext: false });
    expect(screenContextStore.get("t1")).toBeNull();
  });

  it("행마다 선택 이벤트가 오는 전체 선택은 한 번으로 모아 게시한다", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: `행${i + 1}`, COIL_WIDTH: i, note: null }));
    await render({ selectable: true, multiSelect: true, data: many, selectedRows: [] });
    let emits = 0;
    const off = screenContextStore.subscribe(() => emits++);
    await render({ selectable: true, multiSelect: true, data: many, selectedRows: many.map((r) => String(r.id)) });
    off();
    expect(emits).toBe(1);
    expect(screenContextStore.get("t1")?.values.name).toBe("행60");
  });
});
