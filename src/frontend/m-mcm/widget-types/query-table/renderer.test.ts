/** @vitest-environment happy-dom */
/**
 * 쿼리 표 렌더러 동작 시험 — 아래 줄(행 수·잘림 안내)과 [엑셀] 내려받기.
 * useQueryData(서버 호출)·shared 의 그리드·아래 줄(GridExcelFoot)·엑셀 쓰기는 대역으로 바꾼다(shared 는 dist 를 쓰는데 시험은 소스만 본다). 엑셀 파일 이름·컬럼 계산(_query/excel.ts)과
 * 행 수 문구(_query/format.ts)는 실물이다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TABLE_ROW_KEY, type QueryResult } from "../_query/format";

const h = vi.hoisted(() => ({
  useQueryData: vi.fn(),
  exportToExcel: vi.fn(),
  /** 마지막으로 그리드에 넘어간 props. */
  grid: { current: null as null | { columns: { key: string; header: string }[]; data: Record<string, unknown>[] } },
}));

vi.mock("../_query/useQueryData", () => ({ useQueryData: h.useQueryData }));

vi.mock("@dk-oasis/shared/utils", () => ({
  exportToExcel: h.exportToExcel,
  today: () => "20261003",
}));

vi.mock("@dk-oasis/shared/grid", async () => {
  const { createElement: el } = await import("react");
  return {
    AgDataGrid: (p: { columns: { key: string; header: string }[]; data: Record<string, unknown>[] }) => {
      h.grid.current = { columns: p.columns, data: p.data };
      return el("div", { "data-testid": "grid", "data-rows": String(p.data.length) });
    },
    // shared GridExcelFoot 와 같은 계약(안내 글 + testId 기본 wq-excel 의 [엑셀] 단추)만 흉내 낸다. 모습·동작은 shared 시험이 본다.
    GridExcelFoot: (p: { note: string; onExcel: () => void; disabled?: boolean; testId?: string }) =>
      el(
        "div",
        { "data-testid": "grid-foot" },
        el("span", { "data-testid": "grid-foot-note" }, p.note),
        el("button", { type: "button", onClick: p.onExcel, disabled: p.disabled, "data-testid": p.testId ?? "wq-excel" }, "엑셀")
      ),
  };
});

const { default: QueryTableRenderer } = await import("./renderer");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.useQueryData.mockReset();
  h.exportToExcel.mockReset();
  h.exportToExcel.mockResolvedValue(undefined);
  h.grid.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const must = (testId: string) => {
  const found = q(testId);
  if (!found) throw new Error(`[data-testid="${testId}"] 가 없습니다. 지금 화면: ${container.innerHTML.slice(0, 400)}`);
  return found;
};

const result = (rows: Record<string, unknown>[], over: Partial<QueryResult> = {}): QueryResult => ({
  columns: ["SCREEN_NM", "SEC"],
  rows,
  truncated: false,
  ...over,
});

const sample = () => [
  { SCREEN_NM: "화면 사용 통계", SEC: 58 },
  { SCREEN_NM: "공지 관리", SEC: 12 },
  { SCREEN_NM: "위젯관리", SEC: 340 },
];

async function renderTable(data: QueryResult | null, over: { definition?: unknown; title?: string | undefined } = {}) {
  h.useQueryData.mockReturnValue(data);
  const definition = over.definition ?? { sql: "select 1", columns: [] };
  const props = {
    instanceId: "inst-1",
    widgetId: "def.table123",
    definition,
    refreshKey: 3,
    title: "title" in over ? over.title : "내 최근 화면",
    size: { w: 12, h: 12 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(QueryTableRenderer, props as never));
  });
  return props;
}

async function clickExcel() {
  await act(async () => {
    must("wq-excel").click();
  });
}

describe("쿼리 표 — 데이터 전달", () => {
  it("정의·widgetId·refreshKey 로 useQueryData 를 부른다", async () => {
    const props = await renderTable(result(sample()));
    expect(h.useQueryData).toHaveBeenCalledWith(props.definition, "def.table123", 3);
  });

  it("결과가 아직 없으면(null) 표도 [엑셀]도 그리지 않는다", async () => {
    await renderTable(null);
    expect(q("wq-table")).toBeNull();
    expect(q("wq-excel")).toBeNull();
  });
});

describe("쿼리 표 — 0행", () => {
  it("[엑셀] 단추도 아래 줄도 없고 「표시할 데이터가 없습니다」만 보인다", async () => {
    await renderTable(result([]));
    expect(q("wq-excel")).toBeNull();
    expect(q("wq-table")).toBeNull();
    expect(must("wq-empty").textContent).toBe("표시할 데이터가 없습니다");
    expect(h.exportToExcel).not.toHaveBeenCalled();
  });

  it("잘림 표시(truncated)가 켜져 있어도 0행이면 [엑셀]이 없다", async () => {
    await renderTable(result([], { truncated: true }));
    expect(q("wq-excel")).toBeNull();
  });
});

describe("쿼리 표 — 아래 줄의 행 수·잘림 안내", () => {
  it("잘리지 않았으면 「N행」(천 단위 쉼표)", async () => {
    await renderTable(result(sample()));
    expect(must("wq-table").querySelector('[data-testid="grid-foot-note"]')?.textContent).toBe("3행");
    expect(must("grid").getAttribute("data-rows")).toBe("3");
    expect(q("wq-excel")).not.toBeNull();
  });

  it("행이 많으면 천 단위 쉼표가 붙는다", async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ SCREEN_NM: `화면${i}`, SEC: i }));
    await renderTable(result(rows));
    expect(must("wq-table").querySelector('[data-testid="grid-foot-note"]')?.textContent).toBe("1,234행");
  });

  it("잘렸으면 「상위 500행만 표시합니다」", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ SCREEN_NM: `화면${i}`, SEC: i }));
    await renderTable(result(rows, { truncated: true }));
    expect(must("wq-table").querySelector('[data-testid="grid-foot-note"]')?.textContent).toBe("상위 500행만 표시합니다");
    expect(q("wq-excel")).not.toBeNull();
  });
});

describe("쿼리 표 — [엑셀]", () => {
  it("보이는 행(data.rows)·「{위젯 제목}_{yyyyMMdd}.xlsx」·Sheet1·그리드 컬럼 순서의 컬럼으로 exportToExcel 을 부른다", async () => {
    const data = result(sample());
    await renderTable(data, {
      title: "내 최근 화면",
      // 컬럼 설정이 결과 컬럼 순서와 다르다 — 그리드(와 엑셀)는 설정 순서를 따른다.
      definition: { sql: "select 1", columns: [{ field: "SEC", header: "사용(초)" }, { field: "SCREEN_NM", header: "화면" }] },
    });
    await clickExcel();

    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    const [rows, fileName, sheetName, columns] = h.exportToExcel.mock.calls[0] as [
      Record<string, unknown>[],
      string,
      string,
      { key: string; header: string; width: number }[],
    ];
    expect(rows).toBe(data.rows); // 서버가 준 원래 행 — 값은 그대로(숫자는 숫자), 그리드용 행 키는 없다
    expect(rows[0]).not.toHaveProperty(TABLE_ROW_KEY);
    expect(fileName).toBe("내 최근 화면_20261003.xlsx");
    expect(sheetName).toBe("Sheet1");
    expect(columns.map((c) => [c.key, c.header])).toEqual([
      ["SEC", "사용(초)"],
      ["SCREEN_NM", "화면"],
    ]);
    // 그리드에 넘긴 컬럼과 같은 순서(그리드의 행 키 컬럼은 엑셀에서 뺀다)
    const gridKeys = h.grid.current!.columns.map((c) => c.key).filter((k) => k !== TABLE_ROW_KEY);
    expect(columns.map((c) => c.key)).toEqual(gridKeys);
    expect(columns.every((c) => c.width >= 8 && c.width <= 50)).toBe(true);
  });

  it("컬럼 설정이 없으면 결과 컬럼 순서·이름 그대로", async () => {
    const data = result(sample(), { columns: ["SEC", "SCREEN_NM"] });
    await renderTable(data);
    await clickExcel();
    const columns = h.exportToExcel.mock.calls[0][3] as { key: string; header: string }[];
    expect(columns.map((c) => [c.key, c.header])).toEqual([
      ["SEC", "SEC"],
      ["SCREEN_NM", "SCREEN_NM"],
    ]);
  });

  it("위젯 제목이 없으면 「쿼리표_날짜.xlsx」, 파일 이름에 못 쓰는 글자는 _ 로 바꾼다", async () => {
    await renderTable(result(sample()), { title: undefined });
    await clickExcel();
    expect(h.exportToExcel.mock.calls[0][1]).toBe("쿼리표_20261003.xlsx");

    h.exportToExcel.mockClear();
    await renderTable(result(sample()), { title: "생산/품질: 현황" });
    await clickExcel();
    expect(h.exportToExcel.mock.calls[0][1]).toBe("생산_품질_ 현황_20261003.xlsx");
  });

  it("잘린 결과도 지금 보이는 행만 내려받는다", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ SCREEN_NM: `화면${i}`, SEC: i }));
    const data = result(rows, { truncated: true });
    await renderTable(data);
    await clickExcel();
    expect((h.exportToExcel.mock.calls[0][0] as unknown[]).length).toBe(500);
  });
});
