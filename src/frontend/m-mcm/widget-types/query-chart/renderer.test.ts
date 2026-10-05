/** @vitest-environment happy-dom */
/**
 * 쿼리 차트 렌더러 동작 시험 — 원 차트가 shared PieChart 에 넘기는 범례 단위(unit) 연결.
 * useQueryData(서버 호출)·shared 의 차트·본문 크기 훅은 대역으로 바꾼다. 단위를 고르는 규칙(_query/format.ts 의 pieUnitOf)과
 * 설정 읽기(chartConfigOf)·원 차트 조각 계산은 실물이다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryResult } from "../_query/format";

interface PieProps {
  data: { label: string; value: number; color: string }[];
  size: number;
  unit?: string;
}

const h = vi.hoisted(() => ({
  useQueryData: vi.fn(),
  /** useQueryData 가 돌려줄 조건 — 기본은 조건 없음. */
  condition: { current: null as null | Record<string, unknown> },
  /** PieChart 가 받은 props — 마지막 그림. 그려지지 않았으면 null. */
  pie: { current: null as PieProps | null },
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

vi.mock("@dk-oasis/shared/widget", () => ({
  useWidgetBodySize: () => ({ width: 400, height: 300 }),
}));

vi.mock("@dk-oasis/shared/charts", async () => {
  const { createElement: el } = await import("react");
  return {
    PieChart: (p: PieProps) => {
      h.pie.current = p;
      return el("div", { "data-testid": "pie" });
    },
    LineChart: () => el("div", { "data-testid": "line" }),
    StackedColumnChart: () => el("div", { "data-testid": "bar" }),
  };
});

const { default: QueryChartRenderer } = await import("./renderer");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.useQueryData.mockReset();
  h.condition.current = { ...NO_COND };
  h.pie.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const NO_COND = { params: [], draft: {}, setDraft: () => {}, search: () => {}, needInput: false, error: null };

const q = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

const result = (rows: Record<string, unknown>[]): QueryResult => ({ columns: ["MON", "QTY"], rows, truncated: false });

const sample = () => [
  { MON: "1월", QTY: 34 },
  { MON: "2월", QTY: 12 },
];

/** 원 차트 정의 — 계열 하나(이름 label), 설정 단위 unit. 키를 빼려면 undefined 가 아니라 over 로 덮는다. */
const pieDefinition = (series: { field: string; label?: string }[], over: Record<string, unknown> = {}) => ({
  sql: "select 1",
  chartType: "pie",
  xField: "MON",
  series,
  ...over,
});

async function renderChart(data: QueryResult | null, definition: unknown, refreshKey = 5) {
  h.useQueryData.mockReturnValue({ data, condition: h.condition.current });
  const props = {
    instanceId: "inst-1",
    widgetId: "def.chart123",
    definition,
    refreshKey,
    title: "월별 수량",
    size: { w: 12, h: 12 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(QueryChartRenderer, props as never));
  });
  return props;
}

describe("쿼리 차트 — 데이터 전달", () => {
  it("정의·widgetId·refreshKey 로 useQueryData 를 부른다", async () => {
    const props = await renderChart(result(sample()), pieDefinition([{ field: "QTY" }]), 7);
    expect(h.useQueryData).toHaveBeenCalledWith(props.definition, "def.chart123", 7);
  });

  it("원 차트는 첫 계열의 조각과 본문 크기에 맞춘 지름을 PieChart 에 넘긴다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "수량" }]));
    expect(q("pie")).not.toBeNull();
    expect(h.pie.current?.data.map((s) => [s.label, s.value])).toEqual([
      ["1월", 34],
      ["2월", 12],
    ]);
    expect(h.pie.current?.size).toBe(192);
  });
});

describe("쿼리 차트 — 원 차트 범례 단위(unit)", () => {
  it("설정 unit 이 있으면 그 값을 넘긴다(계열 이름에 괄호가 있어도 설정이 먼저)", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "수량(분)" }], { unit: "건" }));
    expect(h.pie.current?.unit).toBe("건");
  });

  it("설정 unit 의 앞뒤 공백은 뺀다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "수량" }], { unit: "  개 " }));
    expect(h.pie.current?.unit).toBe("개");
  });

  it("설정 unit 이 없으면 첫 계열 이름 끝 괄호의 단위를 넘긴다(반각·전각)", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "사용 시간(분)" }]));
    expect(h.pie.current?.unit).toBe("분");
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "사용 시간（분）" }]));
    expect(h.pie.current?.unit).toBe("분");
  });

  it("설정 unit 이 공백뿐이면 없는 것으로 보고 괄호 단위를 쓴다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "금액(원)" }], { unit: "   " }));
    expect(h.pie.current?.unit).toBe("원");
  });

  it("설정 unit 도 괄호도 없으면 빈 글자를 넘긴다 — 안 넘기면(undefined) shared 기본 「건」이 붙는다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "수량" }]));
    expect(h.pie.current).not.toBeNull();
    expect(h.pie.current?.unit).toBe("");
    expect(Object.prototype.hasOwnProperty.call(h.pie.current, "unit")).toBe(true);
  });

  it("계열 이름을 안 정하면 필드 이름이 계열 이름이다 — 괄호 없으면 빈 글자", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY" }]));
    expect(h.pie.current?.unit).toBe("");
  });

  it("설정 unit 이 너무 길면 10자까지만 넘긴다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY" }], { unit: "가나다라마바사아자차카" }));
    expect(h.pie.current?.unit).toBe("가나다라마바사아자차");
  });

  it("괄호 단위가 11자면 단위로 보지 않는다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY", label: "수량(12345678901)" }]));
    expect(h.pie.current?.unit).toBe("");
  });
});

describe("쿼리 차트 — 원 차트가 아닐 때·그릴 값이 없을 때", () => {
  it("원 차트의 양수 합이 0 이면 PieChart 대신 「표시할 데이터가 없습니다」", async () => {
    await renderChart(result([{ MON: "1월", QTY: 0 }, { MON: "2월", QTY: -3 }]), pieDefinition([{ field: "QTY" }], { unit: "건" }));
    expect(q("pie")).toBeNull();
    expect(h.pie.current).toBeNull();
    expect(q("wq-empty")?.textContent).toBe("표시할 데이터가 없습니다");
  });

  it("막대 차트는 PieChart 를 쓰지 않는다(설정 unit 이 있어도)", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY" }], { chartType: "bar", unit: "건" }));
    expect(q("wq-chart-bar")).not.toBeNull();
    expect(h.pie.current).toBeNull();
  });

  it("결과가 아직 없으면(null) 아무 차트도 그리지 않는다", async () => {
    await renderChart(null, pieDefinition([{ field: "QTY" }], { unit: "건" }));
    expect(h.pie.current).toBeNull();
    expect(q("wq-empty")).toBeNull();
  });
});

describe("쿼리 차트 — 조회 조건 줄", () => {
  const cond = (over: Record<string, unknown> = {}) => ({
    ...NO_COND,
    params: [{ name: "dept", label: "부서", type: "text" }],
    draft: { dept: "" },
    ...over,
  });

  it("조건이 없으면 틀로 감싸지 않는다", async () => {
    await renderChart(result(sample()), pieDefinition([{ field: "QTY" }]));
    expect(q("wq-shell")).toBeNull();
    expect(h.pie.current?.size).toBe(192);
  });

  it("조건 줄이 차지한 높이만큼 뺀 본문 높이로 그림 크기를 정한다", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    try {
      h.condition.current = cond();
      await renderChart(result(sample()), pieDefinition([{ field: "QTY" }]));
      expect(q("wq-cond-bar")).not.toBeNull();
      // 본문 300 - 줄 200 = 100 → 지름 min(92, 192) 를 최소 100 으로 맞춘다.
      expect(h.pie.current?.size).toBe(100);
    } finally {
      spy.mockRestore();
    }
  });

  it("필수 값이 비어 있으면 차트 대신 안내를 보인다", async () => {
    h.condition.current = cond({ needInput: true });
    await renderChart(null, pieDefinition([{ field: "QTY" }]));
    expect(q("wq-need-input")).not.toBeNull();
    expect(h.pie.current).toBeNull();
  });
});
