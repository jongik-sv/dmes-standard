/** @vitest-environment happy-dom */
/**
 * 쿼리 표 렌더러 동작 시험 — 결과를 그리드에 넘기는 모양과 excelExport(아래 줄 글·파일 이름·단추 testId).
 * useQueryData(서버 호출)와 shared 의 그리드는 대역으로 바꾼다(shared 는 dist 를 쓰는데 시험은 소스만 본다). 그리드가 받은 props 를 보고,
 * 아래 줄 그리기·엑셀 내려받기 동작 자체는 shared 시험이 실제 그리드로 본다. 행 수 문구(_query/format.ts)는 실물이다.
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TABLE_ROW_KEY, type QueryResult } from "../_query/format";

type GridProps = {
  rowKey?: string;
  columns: { key: string; header: string }[];
  data: Record<string, unknown>[];
  height?: string | number;
  emptyMessage?: string;
  emptyTestId?: string;
  excelExport?: { title?: string; fallbackName?: string; note?: string; sheetName?: string; testId?: string };
};

const h = vi.hoisted(() => ({
  useQueryData: vi.fn(),
  /** useQueryData 가 돌려줄 조건 — 기본은 조건 없음. */
  condition: { current: null as null | Record<string, unknown> },
  /** 마지막으로 그리드에 넘어간 props. */
  grid: { current: null as null | GridProps },
}));

vi.mock("../_query/useQueryData", () => ({ useQueryData: h.useQueryData }));

// 조건 줄이 쓰는 shared 입력 부품 — 간단한 대역(실제 부품은 shared 시험이 본다).
vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    Button: (p: { children?: unknown; onClick?: () => void; "data-testid"?: string }) =>
      el("button", { type: "button", onClick: p.onClick, "data-testid": p["data-testid"] }, p.children as never),
    Input: (p: { value?: string; onChange?: (v: string) => void; "data-testid"?: string }) =>
      el("input", { value: p.value ?? "", onChange: (e: { currentTarget: { value: string } }) => p.onChange?.(e.currentTarget.value), "data-testid": p["data-testid"] }),
    Select: (p: { value?: string; "data-testid"?: string }) => el("select", { value: p.value ?? "", onChange: () => {}, "data-testid": p["data-testid"] }),
    DatePicker: (p: { value?: string }) => el("input", { value: p.value ?? "", onChange: () => {}, "data-testid": "date" }),
  };
});

vi.mock("@dk-oasis/shared/grid", async () => {
  const { createElement: el } = await import("react");
  return {
    AgDataGrid: (p: GridProps) => {
      h.grid.current = p;
      // 실물 그리드처럼 0행이면 빈 오버레이 문구(emptyMessage)를 emptyTestId 로 보인다.
      return el(
        "div",
        { "data-testid": "grid", "data-rows": String(p.data.length) },
        p.data.length === 0 ? el("span", { "data-testid": p.emptyTestId }, p.emptyMessage) : null
      );
    },
  };
});

const { default: QueryTableRenderer } = await import("./renderer");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.useQueryData.mockReset();
  h.condition.current = { ...NO_COND };
  h.grid.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const NO_COND = { params: [], draft: {}, setDraft: () => {}, search: () => {}, needInput: false };

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
  h.useQueryData.mockReturnValue({ data, condition: h.condition.current });
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

describe("쿼리 표 — 데이터 전달", () => {
  it("정의·widgetId·refreshKey 로 useQueryData 를 부른다", async () => {
    const props = await renderTable(result(sample()));
    expect(h.useQueryData).toHaveBeenCalledWith(props.definition, "def.table123", 3);
  });

  it("결과가 아직 없으면(null) 표를 그리지 않는다", async () => {
    await renderTable(null);
    expect(q("grid")).toBeNull();
    expect(h.grid.current).toBeNull();
  });

  it("표는 별도 감싸개 없이 남은 높이(height 100%)를 채우고, 아래 줄·[엑셀]은 위젯이 그리지 않는다(그리드 몫)", async () => {
    await renderTable(result(sample()));
    expect(must("grid").getAttribute("data-rows")).toBe("3");
    expect(h.grid.current!.height).toBe("100%");
    expect(h.grid.current!.rowKey).toBe(TABLE_ROW_KEY);
    expect(q("wq-table")).toBeNull();
    expect(q("grid-foot")).toBeNull();
    expect(q("wq-excel")).toBeNull();
  });

  it("그리드 컬럼은 컬럼 설정 순서·제목을 따르고(엑셀도 이 순서), 행에는 서버가 준 원래 값(숫자는 숫자)이 있다", async () => {
    await renderTable(result(sample()), {
      // 컬럼 설정이 결과 컬럼 순서와 다르다 — 그리드(와 엑셀)는 설정 순서를 따른다.
      definition: { sql: "select 1", columns: [{ field: "SEC", header: "사용(초)" }, { field: "SCREEN_NM", header: "화면" }] },
    });
    expect(h.grid.current!.columns.map((c) => [c.key, c.header])).toEqual([
      ["SEC", "사용(초)"],
      ["SCREEN_NM", "화면"],
    ]);
    const row = h.grid.current!.data[0];
    expect(row.SEC).toBe(58);
    expect(typeof row.SEC).toBe("number");
    expect(row.SCREEN_NM).toBe("화면 사용 통계");
    expect(row[TABLE_ROW_KEY]).toBe("0");
  });

  it("컬럼 설정이 없으면 결과 컬럼 순서·이름 그대로", async () => {
    await renderTable(result(sample(), { columns: ["SEC", "SCREEN_NM"] }));
    expect(h.grid.current!.columns.map((c) => [c.key, c.header])).toEqual([
      ["SEC", "SEC"],
      ["SCREEN_NM", "SCREEN_NM"],
    ]);
  });
});

describe("쿼리 표 — 0행", () => {
  it("그리드는 마운트한 채 빈 오버레이에 「표시할 데이터가 없습니다」가 보인다", async () => {
    await renderTable(result([]));
    expect(q("grid")).not.toBeNull();
    expect(h.grid.current!.data).toEqual([]);
    expect(must("wq-empty").textContent).toBe("표시할 데이터가 없습니다");
  });

  it("잘림 표시(truncated)가 켜져 있어도 0행이면 빈 문구가 보인다", async () => {
    await renderTable(result([], { truncated: true }));
    expect(q("grid")).not.toBeNull();
    expect(must("wq-empty")).not.toBeNull();
  });

  it("0행 → N행 전환 때 그리드가 다시 마운트되지 않는다(같은 DOM 노드)", async () => {
    const props = await renderTable(result([]));
    const before = must("grid");
    h.useQueryData.mockReturnValue({ data: result(sample()), condition: h.condition.current });
    await act(async () => {
      root.render(createElement(QueryTableRenderer, props as never));
    });
    expect(must("grid")).toBe(before);
    expect(q("wq-empty")).toBeNull();
  });
});

describe("쿼리 표 — excelExport", () => {
  it("제목·기본 이름(쿼리표)·단추 testId(wq-excel)를 넘기고, 잘리지 않았으면 note 를 주지 않아 그리드 기본 「N행」이 나온다", async () => {
    await renderTable(result(sample()));
    expect(h.grid.current!.excelExport).toEqual({
      title: "내 최근 화면",
      fallbackName: "쿼리표",
      note: undefined,
      testId: "wq-excel",
    });
    expect(h.grid.current!.excelExport!.note).toBeUndefined();
  });

  it("행이 많아도 note 는 비워 둔다(천 단위 쉼표 「1,234행」은 그리드 기본)", async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ SCREEN_NM: `화면${i}`, SEC: i }));
    await renderTable(result(rows));
    expect(h.grid.current!.excelExport!.note).toBeUndefined();
    expect(must("grid").getAttribute("data-rows")).toBe("1234");
  });

  it("잘렸으면 note 가 「상위 500행만 표시합니다」", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ SCREEN_NM: `화면${i}`, SEC: i }));
    await renderTable(result(rows, { truncated: true }));
    expect(h.grid.current!.excelExport!.note).toBe("상위 500행만 표시합니다");
    // 잘린 결과도 지금 보이는 500행 전부가 그리드에 있다(엑셀은 이 행을 내려받는다)
    expect(h.grid.current!.data).toHaveLength(500);
  });

  it("위젯 제목이 없으면 title 은 비고 기본 이름(쿼리표)이 남는다", async () => {
    await renderTable(result(sample()), { title: undefined });
    expect(h.grid.current!.excelExport!.title).toBeUndefined();
    expect(h.grid.current!.excelExport!.fallbackName).toBe("쿼리표");
  });

  it("값이 같으면 다시 그려도 같은 객체를 넘긴다(그리드 memo 가 깨지지 않는다)", async () => {
    const data = result(sample());
    await renderTable(data);
    const first = h.grid.current!.excelExport;
    await renderTable(data);
    expect(h.grid.current!.excelExport).toBe(first);
    await renderTable(data, { title: "다른 제목" });
    expect(h.grid.current!.excelExport).not.toBe(first);
  });
});

describe("쿼리 표 — 조회 조건 줄", () => {
  const withParams = (over: Record<string, unknown> = {}) => ({
    ...NO_COND,
    params: [{ name: "dept", label: "부서", type: "text", required: true }],
    draft: { dept: "A" },
    ...over,
  });

  it("조건이 없으면 틀(wq-shell)로 감싸지 않고 조건 줄도 없다 — 모습이 이전과 같다", async () => {
    await renderTable(result(sample()));
    expect(q("wq-shell")).toBeNull();
    expect(q("wq-cond-bar")).toBeNull();
    expect(q("grid")).not.toBeNull();
  });

  it("조건이 있으면 위(조건 줄)와 아래(표)로 나눠 그린다", async () => {
    h.condition.current = withParams();
    await renderTable(result(sample()));
    const shell = must("wq-shell");
    expect(shell.firstElementChild).toBe(must("wq-cond-bar"));
    expect(must("wq-cond-dept")).not.toBeNull();
    expect(must("wq-cond-search").textContent).toBe("검색");
    expect(shell.querySelector(".wq-main [data-testid=grid]")).not.toBeNull();
  });

  it("필수 값이 비어 서버를 부르지 않는 중이면 표 대신 「조건을 입력하고 검색하세요」", async () => {
    h.condition.current = withParams({ needInput: true });
    await renderTable(null);
    expect(must("wq-need-input").textContent).toBe("조건을 입력하고 검색하세요");
    expect(q("grid")).toBeNull();
    expect(q("wq-cond-bar")).not.toBeNull();
  });

  it("[검색] 단추는 search 를 부른다", async () => {
    const search = vi.fn();
    h.condition.current = withParams({ search });
    await renderTable(result(sample()));
    await act(async () => {
      must("wq-cond-search").click();
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("글자 칸 Enter 는 검색한다", async () => {
    const search = vi.fn();
    h.condition.current = withParams({ search });
    await renderTable(result(sample()));
    await act(async () => {
      must("wq-cond-dept-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
