/** @vitest-environment happy-dom */
/** useGridDataManager.handleRowClick — 행을 누르면 그 행의 값으로 폼이 채워진다(갱신 함수 안 부수효과 없이 ref 로 최신 행을 읽는다). */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useGridDataManager, type GridDataManager } from "../../src/components/grid/useGridDataManager";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type Form = { code: string; name: string };
const EMPTY: Form = { code: "", name: "" };
let host: HTMLDivElement | null = null;

function mount() {
  let manager!: GridDataManager<Form>;
  const renders = { n: 0 };
  function Probe() {
    renders.n += 1;
    manager = useGridDataManager<Form>({
      rowKey: "code",
      emptyForm: EMPTY,
      rowToForm: (row) => ({ code: String(row.code), name: String(row.name) }),
      formFieldToRow: (field, value) => ({ [field]: value }),
      saveHandler: async () => {},
    });
    return null;
  }
  host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  return { get: () => manager, renders, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  host = null;
});

describe("useGridDataManager.handleRowClick", () => {
  it("조회한 행을 누르면 폼이 그 행 값으로 채워지고 행 목록은 그대로다", () => {
    const m = mount();
    act(() => m.get().setRows([{ code: "A", name: "가" }, { code: "B", name: "나" }]));
    const rowsBefore = m.get().rows;
    act(() => m.get().handleRowClick("B"));
    expect(m.get().formData).toEqual({ code: "B", name: "나" });
    expect(m.get().selectedRowKey).toBe("B");
    expect(m.get().rows).toBe(rowsBefore);
    m.unmount();
  });

  it("없는 행을 누르면 폼을 건드리지 않는다", () => {
    const m = mount();
    act(() => m.get().setRows([{ code: "A", name: "가" }]));
    act(() => m.get().handleRowClick("A"));
    act(() => m.get().handleRowClick("Z"));
    expect(m.get().formData).toEqual({ code: "A", name: "가" });
    m.unmount();
  });
});
