/** @vitest-environment happy-dom */

// AgDataGrid `excelExport` — 속성이 없으면 지금과 똑같고(아래 줄 없음), 있으면 「N행」·[엑셀] 단추를 바닥에 붙이고
// 누르면 그리드에 지금 보이는 컬럼 순서·제목과 행의 원래 값으로 exportToExcel 을 부른다.
// 실제 그리드를 happy-dom 에 띄운다. 파일 쓰기(exportToExcel)와 오늘 날짜만 대역으로 바꾼다.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ exportToExcel: vi.fn() }));

vi.mock("../../src/utils/libExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libExcel")>()),
  exportToExcel: h.exportToExcel,
}));
vi.mock("../../src/utils/libDate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libDate")>()),
  today: () => "20261003",
}));

import { AgDataGrid, type GridColumn } from "../../src/components/grid/AgDataGrid";
import {
  AgDataGridExcelFrame,
  displayedExcelColumns,
  displayedExcelRows,
} from "../../src/components/grid/AgDataGridExcel";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";
import { TITLE, fakeMetaFetch, settle as settleMs } from "./mdm-meta-fixtures";

const columns: GridColumn[] = [
  { key: "woNo", header: "작업지시번호" },
  { key: "qty", header: "수량(t)", type: "number" },
  { key: "secret", header: "숨김", hide: true },
  { key: "status", header: "상태", render: (v) => createElement("b", null, `[${String(v)}]`) },
];
const data = [
  { woNo: "W-2", qty: 20, secret: "x", status: "run" },
  { woNo: "W-1", qty: 10, secret: "y", status: "done" },
  { woNo: "W-3", qty: 30, secret: "z", status: "run" },
];

// [엑셀] 단추가 Mantine Button 이라 MantineProvider 로 감싼다(포털에서는 늘 감싸져 있다).
let r: Rendered | null = null;
let container: HTMLDivElement;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function render(props: Record<string, unknown> = {}) {
  const element = createElement(AgDataGrid, { columns, data, rowKey: "woNo", ...props } as never);
  if (r) rerender(r, element);
  else {
    r = renderWithMantine(element);
    container = r.host;
  }
  await settle();
}

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const gridEl = () => container.querySelector<HTMLElement>(".cm-data-grid")!;
const button = (testId = "grid-excel") => q(testId) as HTMLButtonElement | null;

async function clickExcel(testId = "grid-excel") {
  await act(async () => {
    button(testId)!.click();
  });
}

beforeEach(() => {
  h.exportToExcel.mockReset();
  h.exportToExcel.mockResolvedValue(undefined);
});

afterEach(() => {
  r?.unmount();
  r = null;
});

describe("AgDataGrid excelExport — 속성이 없을 때", () => {
  it("아래 줄도 [엑셀] 단추도 감싸개도 없고 그리드가 컨테이너 바로 아래에 있다", async () => {
    await render({ height: 240 });
    expect(q("grid-foot")).toBeNull();
    expect(button()).toBeNull();
    expect(q("grid-excel-frame")).toBeNull();
    expect(container.querySelector(".cm-grid-excel")).toBeNull();
    expect(gridEl().parentElement).toBe(container);
    // height 는 그리드 상자에 그대로 걸린다(예전과 같다)
    expect(gridEl().style.height).toBe("240px");
  });
});

describe("AgDataGrid excelExport — 아래 줄", () => {
  it("「N행」(천 단위 쉼표)과 [엑셀] 단추가 그리드 다음(바닥)에 온다", async () => {
    await render({ excelExport: {} });
    const frame = q("grid-excel-frame")!;
    const foot = q("grid-foot")!;
    expect(frame.className).toBe("cm-grid-excel");
    expect(q("grid-foot-note")!.textContent).toBe("3행");
    expect(button()!.disabled).toBe(false);
    // 감싸개 → [그리드 칸, 아래 줄] 순서, 아래 줄이 맨 끝
    const grow = frame.querySelector(".cm-grid-excel__grow")!;
    expect(grow.contains(gridEl())).toBe(true);
    expect(foot.parentElement).toBe(frame);
    expect(frame.lastElementChild).toBe(foot);
    expect(frame.firstElementChild).toBe(grow);
  });

  it("행이 천 건이 넘으면 쉼표가 붙는다", async () => {
    const many = Array.from({ length: 1234 }, (_, i) => ({ woNo: `W${i}`, qty: i, status: "run" }));
    await render({ excelExport: {}, data: many });
    expect(q("grid-foot-note")!.textContent).toBe("1,234행");
  });

  it("note 와 testId 를 바꿀 수 있다", async () => {
    await render({ excelExport: { note: "상위 500행만 표시합니다", testId: "wq-excel" } });
    expect(q("grid-foot-note")!.textContent).toBe("상위 500행만 표시합니다");
    expect(button("wq-excel")).not.toBeNull();
    expect(button("grid-excel")).toBeNull();
  });

  it("0행이면 단추가 비활성이고 눌러도 내려받지 않는다", async () => {
    await render({ excelExport: {}, data: [] });
    expect(q("grid-foot-note")!.textContent).toBe("0행");
    expect(button()!.disabled).toBe(true);
    await clickExcel();
    expect(h.exportToExcel).not.toHaveBeenCalled();
  });
});

describe("AgDataGrid excelExport — 높이", () => {
  it("height 는 바깥 상자에 걸리고 그리드는 남은 높이를 채운다(100%)", async () => {
    await render({ excelExport: {}, height: 240 });
    expect(q("grid-excel-frame")!.style.height).toBe("240px");
    expect(gridEl().style.height).toBe("100%");
  });

  it("height 를 주지 않으면 바깥 상자도 부모 높이(100%)를 채운다", async () => {
    await render({ excelExport: {} });
    expect(q("grid-excel-frame")!.style.height).toBe("100%");
    expect(gridEl().style.height).toBe("100%");
  });

  it('height="auto" 면 flex 로 묶지 않고 그리드 높이를 auto 로 둔다(행 수만큼 늘어난다)', async () => {
    await render({ excelExport: {}, height: "auto" });
    const frame = q("grid-excel-frame")!;
    expect(frame.classList.contains("cm-grid-excel--auto")).toBe(true);
    expect(frame.style.height).toBe("auto");
    expect(gridEl().style.height).toBe("auto");
    expect(gridEl().querySelector(".ag-layout-auto-height")).not.toBeNull();
  });

  it("스타일은 컴포넌트가 새 href(cm-grid-excel-frame)의 <style> 로 직접 넣는다", async () => {
    await render({ excelExport: {} });
    const styles = [...document.querySelectorAll("style")].filter((s) => s.textContent?.includes(".cm-grid-excel "));
    expect(styles.length).toBeGreaterThanOrEqual(1);
    const css = styles[0].textContent ?? "";
    expect(css).toMatch(/\.cm-grid-excel \{[^}]*display: flex;[^}]*flex-direction: column;/);
    expect(css).toMatch(/\.cm-grid-excel__grow \{[^}]*flex: 1 1 0;[^}]*min-height: 0;/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("AgDataGrid excelExport — [엑셀] 내려받기", () => {
  it("보이는 컬럼 순서·제목, 행의 원래 값, 「{title}_{날짜}.xlsx」·Sheet1 로 exportToExcel 을 부른다", async () => {
    await render({ excelExport: { title: "금일 작업지시 현황" } });
    await clickExcel();

    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    const [rows, fileName, sheetName, cols] = h.exportToExcel.mock.calls[0] as [
      Record<string, unknown>[],
      string,
      string | undefined,
      { key: string; header: string; width: number }[],
    ];
    expect(fileName).toBe("금일 작업지시 현황_20261003.xlsx");
    expect(sheetName).toBeUndefined(); // 기본 Sheet1 은 exportToExcel 이 채운다
    // 숨긴 열(secret)은 빠지고, 머리글 순서 그대로다. rowKey 로 쓴 woNo 는 화면에 보이는 열이라 남는다.
    expect(cols.map((c) => [c.key, c.header])).toEqual([
      ["woNo", "작업지시번호"],
      ["qty", "수량(t)"],
      ["status", "상태"],
    ]);
    expect(cols.every((c) => c.width >= 8 && c.width <= 50)).toBe(true);
    // 값은 render 결과가 아니라 행의 원래 값(숫자는 숫자)
    expect(rows.map((r) => r.woNo)).toEqual(["W-2", "W-1", "W-3"]);
    expect(rows[0].qty).toBe(20);
    expect(typeof rows[0].qty).toBe("number");
    expect(rows[0].status).toBe("run");
  });

  it("title 이 없으면 fallbackName, 둘 다 없으면 「목록」; sheetName 을 넘기면 그대로 쓴다", async () => {
    await render({ excelExport: { fallbackName: "작업지시", sheetName: "WO" } });
    await clickExcel();
    expect(h.exportToExcel.mock.calls[0][1]).toBe("작업지시_20261003.xlsx");
    expect(h.exportToExcel.mock.calls[0][2]).toBe("WO");

    h.exportToExcel.mockClear();
    await render({ excelExport: { title: "   " } });
    await clickExcel();
    expect(h.exportToExcel.mock.calls[0][1]).toBe("목록_20261003.xlsx");
  });

  it("행 번호·선택 체크박스 같은 그리드 내부 열은 빼고 데이터 열만 내보낸다", async () => {
    await render({ excelExport: {}, rowNumber: true, selectable: true, multiSelect: true });
    // 내부 열이 실제로 화면에 있다
    expect(container.querySelector('.ag-header-cell[col-id="__rowNo"]')).not.toBeNull();
    expect(container.querySelector(".ag-header-cell[col-id^='ag-Grid-']")).not.toBeNull();
    await clickExcel();
    const cols = h.exportToExcel.mock.calls[0][3] as { key: string }[];
    expect(cols.map((c) => c.key)).toEqual(["woNo", "qty", "status"]);
  });

  it("열 그룹 안의 잎 열도 순서대로 내보낸다", async () => {
    await render({
      excelExport: {},
      columns: [
        { key: "woNo", header: "번호" },
        {
          key: "grp",
          header: "수량",
          children: [
            { key: "qty", header: "지시" },
            { key: "done", header: "실적" },
          ],
        },
      ],
      data: [{ woNo: "W-1", qty: 1, done: 2 }],
    });
    await clickExcel();
    expect((h.exportToExcel.mock.calls[0][3] as { key: string }[]).map((c) => c.key)).toEqual(["woNo", "qty", "done"]);
  });

  it("겹치는 제목은 「(2)」로 구분해 값이 덮이지 않게 한다", async () => {
    await render({
      excelExport: {},
      columns: [
        { key: "a", header: "값" },
        { key: "b", header: "값" },
      ],
      rowKey: "a",
      data: [{ a: 1, b: 2 }],
    });
    await clickExcel();
    expect((h.exportToExcel.mock.calls[0][3] as { header: string }[]).map((c) => c.header)).toEqual(["값", "값(2)"]);
  });
});

describe("AgDataGrid excelExport — 실제 그리드의 화면 상태를 따른다", () => {
  const rowIds = () =>
    [...container.querySelectorAll(".ag-center-cols-container .ag-row")]
      .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")))
      .map((el) => el.getAttribute("row-id"));
  const exportedRowKeys = () => (h.exportToExcel.mock.calls[0][0] as { woNo: string }[]).map((r) => r.woNo);

  async function clickHeader(colId: string) {
    const label = container.querySelector(`.ag-header-cell[col-id="${colId}"] .ag-header-cell-label`)!;
    await act(async () => {
      label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
  }

  it("머리글을 눌러 정렬하면 내려받는 행도 화면 순서를 따른다(data 순서와 다르다)", async () => {
    await render({ excelExport: {} });
    expect(rowIds()).toEqual(["W-2", "W-1", "W-3"]); // 정렬 전: data 순서
    await clickHeader("woNo");
    expect(rowIds()).toEqual(["W-1", "W-2", "W-3"]); // 오름차순
    await clickExcel();
    expect(exportedRowKeys()).toEqual(["W-1", "W-2", "W-3"]);
    expect(exportedRowKeys()).not.toEqual(data.map((r) => r.woNo));

    // 한 번 더 누르면 내림차순
    h.exportToExcel.mockClear();
    await clickHeader("woNo");
    expect(rowIds()).toEqual(["W-3", "W-2", "W-1"]);
    await clickExcel();
    expect(exportedRowKeys()).toEqual(["W-3", "W-2", "W-1"]);
  });

  it("pinned 열은 화면 순서(왼쪽 고정이 맨 앞, 오른쪽 고정이 맨 뒤)를 따른다", async () => {
    await render({
      excelExport: {},
      columns: [
        { key: "woNo", header: "작업지시번호" },
        { key: "qty", header: "수량(t)", pinned: "right" },
        { key: "status", header: "상태", pinned: "left" },
        { key: "etc", header: "비고" },
      ],
      data: [{ woNo: "W-1", qty: 1, status: "run", etc: "e" }],
    });
    await clickExcel();
    expect((h.exportToExcel.mock.calls[0][3] as { key: string }[]).map((c) => c.key)).toEqual([
      "status",
      "woNo",
      "etc",
      "qty",
    ]);
  });

  it("excludeKeys 에 든 열은 화면에 보여도 엑셀에서 뺀다", async () => {
    await render({
      excelExport: { excludeKeys: ["action", "status"] },
      columns: [
        { key: "woNo", header: "작업지시번호" },
        { key: "action", header: "", render: () => createElement("button", null, "상세") },
        { key: "qty", header: "수량(t)" },
        { key: "status", header: "상태" },
      ],
      data: [{ woNo: "W-1", qty: 1, status: "run", action: null }],
    });
    expect(container.querySelector('.ag-header-cell[col-id="action"]')).not.toBeNull();
    await clickExcel();
    expect((h.exportToExcel.mock.calls[0][3] as { key: string }[]).map((c) => c.key)).toEqual(["woNo", "qty"]);
  });

  it("MDM 공급자 안에서 header 를 비운 열은 MDM 캡션이 엑셀 제목이 된다", async () => {
    resetMdmMetaStore();
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    try {
      // MDM 공급자(포털 탭이 본문을 감싸는 것과 같다) 안에서 그린다
      const element = createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(AgDataGrid, {
          columns: [{ key: "title" }, { key: "category", header: "분류(화면)" }],
          rowKey: "title",
          data: [{ title: "가", category: "A" }],
          excelExport: {},
        } as never)
      );
      r = renderWithMantine(element);
      container = r.host;
      await settle();
      await act(async () => {
        await settleMs(80);
      });
      await clickExcel();
      expect((h.exportToExcel.mock.calls[0][3] as { key: string; header: string }[]).map((c) => [c.key, c.header])).toEqual([
        ["title", "제목"],
        ["category", "분류(화면)"],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AgDataGridExcelFrame — 그리드 API 가 없을 때의 대체 경로", () => {
  it("화면 순서의 대체 행(fallbackRows)과 props 열(숨긴 열 제외, 열 그룹 잎)을 내보내고, 행 수·비활성은 data 로 정한다", async () => {
    const sortedRows = [{ woNo: "W-1", qty: 1 }, { woNo: "W-2", qty: 2 }];
    r = renderWithMantine(
      createElement(
        AgDataGridExcelFrame,
        {
          options: { title: "대체", excludeKeys: ["skip"] },
          columns: [
            { key: "woNo", header: "번호" },
            { key: "hidden", header: "숨김", hide: true },
            { key: "skip", header: "뺌" },
            { key: "grp", header: "수량", children: [{ key: "qty" }] },
          ] as GridColumn[],
          data: [{ woNo: "W-2", qty: 2 }, { woNo: "W-1", qty: 1 }, { woNo: "W-3", qty: 3 }],
          fallbackRows: sortedRows,
          getApi: () => null,
        },
        createElement("div", { "data-testid": "child" })
      )
    );
    container = r.host;
    expect(q("grid-foot-note")!.textContent).toBe("3행"); // 전체 data 수
    expect(button()!.disabled).toBe(false);
    await clickExcel();
    const [rows, fileName, , cols] = h.exportToExcel.mock.calls[0] as [unknown[], string, unknown, { key: string; header: string }[]];
    expect(rows).toEqual(sortedRows);
    expect(fileName).toBe("대체_20261003.xlsx");
    expect(cols.map((c) => [c.key, c.header])).toEqual([
      ["woNo", "번호"],
      ["qty", "qty"],
    ]);
  });
});

describe("displayedExcelColumns / displayedExcelRows — 그리드 API 읽기", () => {
  const col = (field: string | undefined, headerName?: string) => ({
    getColDef: () => ({ field, headerName }),
  });

  it("보이는 열을 API 가 돌려주는 순서대로(사용자가 끌어 바꾼 순서) 읽고, field 없는 열은 뺀다", () => {
    const api = {
      getAllDisplayedColumns: () =>
        [col(undefined, "No"), col("b", "둘째"), col("a", "첫째"), col("c", "")] as never,
    };
    expect(displayedExcelColumns(api)).toEqual([
      { key: "b", header: "둘째" },
      { key: "a", header: "첫째" },
      { key: "c", header: "" },
    ]);
  });

  it("머리글이 정해지지 않은 열은 field 를 제목으로 쓴다", () => {
    expect(displayedExcelColumns({ getAllDisplayedColumns: () => [col("x")] as never })).toEqual([
      { key: "x", header: "x" },
    ]);
  });

  it("행은 정렬·필터 뒤의 순서(forEachNodeAfterFilterAndSort)를 따른다", () => {
    const sorted = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const api = {
      isDestroyed: () => false,
      forEachNodeAfterFilterAndSort: (cb: (node: { data: unknown }) => void) => sorted.forEach((d) => cb({ data: d })),
    };
    expect(displayedExcelRows(api as never, [{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual(sorted);
  });

  it("API 가 없거나 닫혔으면 data 순서를 쓴다", () => {
    const fallback = [{ id: 1 }, { id: 2 }];
    expect(displayedExcelRows(null, fallback)).toEqual(fallback);
    expect(displayedExcelRows(undefined, fallback)).toEqual(fallback);
    const closed = { isDestroyed: () => true, forEachNodeAfterFilterAndSort: () => { throw new Error("닫힌 그리드"); } };
    expect(displayedExcelRows(closed as never, fallback)).toEqual(fallback);
  });
});
