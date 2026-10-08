/** @vitest-environment happy-dom */
/**
 * 작업 지시 위젯 동작 시험 — 표가 위젯 본문의 남은 높이를 채우고, 아래 줄(「N건」)·[엑셀] 은 그리드의 excelExport 속성으로 맡긴다.
 * shared 의 그리드·폼 부품·위젯 틀 연결은 대역으로 바꾸고, 그리드가 받은 props 를 본다(아래 줄·엑셀 내려받기 동작 자체는 shared 시험이
 * 실제 그리드로 본다). 샘플 데이터(page-components/home/sample-data)는 실물이다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_WORK_ORDERS } from "@/page-components/home/sample-data";

type GridProps = {
  rowKey?: string;
  columns: { key: string; header: string }[];
  data: Record<string, unknown>[];
  height?: string | number;
  excelExport?: { title?: string; fallbackName?: string; note?: string; sheetName?: string; testId?: string };
};

const h = vi.hoisted(() => ({
  /** 마지막으로 그리드에 넘어간 props. */
  grid: { current: null as null | GridProps },
}));

vi.mock("@dk-oasis/shared/grid", async () => {
  const { createElement: el } = await import("react");
  return {
    AgDataGrid: (p: GridProps) => {
      h.grid.current = p;
      return el("div", { "data-testid": "grid", "data-rows": String(p.data.length) });
    },
    GridBadge: () => null,
  };
});

vi.mock("@dk-oasis/shared/form", () => ({ ProgressBar: () => null }));

vi.mock("@dk-oasis/shared/widget", () => ({ WidgetTitleExtra: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

async function renderWidget(Widget: (props: never) => unknown, over: { title?: string } = {}) {
  const props = {
    instanceId: "inst-1",
    widgetId: "home.workOrders",
    definition: null,
    refreshKey: 0,
    title: "title" in over ? over.title : "금일 작업지시 현황",
    size: { w: 14, h: 14 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(Widget as never, props));
  });
}

async function loadWidget() {
  return (await import("./widget")).default;
}

describe("작업 지시 위젯 — 표", () => {
  it("표는 별도 감싸개 없이 위젯 본문의 남은 높이(height 100%)를 채운다", async () => {
    await renderWidget(await loadWidget());
    const grid = q("grid");
    expect(grid).not.toBeNull();
    // 감싸개·아래 줄은 위젯이 아니라 그리드(excelExport)가 맡는다 — 이 대역 그리드는 아래 줄을 그리지 않는다
    expect(q("home-grid-fill")).toBeNull();
    expect(q("grid-foot")).toBeNull();
    expect(container.contains(grid)).toBe(true);
    expect(h.grid.current!.height).toBe("100%");
    expect(h.grid.current!.rowKey).toBe("woNo");
    expect(h.grid.current!.data).toHaveLength(SAMPLE_WORK_ORDERS.length);
    expect(grid!.getAttribute("data-rows")).toBe(String(SAMPLE_WORK_ORDERS.length));
  });

  it("위젯 컬럼 순서·제목 그대로 그리드에 넘긴다(엑셀도 이 순서를 따른다)", async () => {
    await renderWidget(await loadWidget());
    expect(h.grid.current!.columns.map((c) => [c.key, c.header])).toEqual([
      ["woNo", "작업지시번호"],
      ["process", "공정"],
      ["steel", "강종"],
      ["spec", "규격"],
      ["orderQty", "지시(t)"],
      ["doneQty", "실적(t)"],
      ["progress", "진행률"],
      ["status", "상태"],
    ]);
  });

  it("render 로 그리는 컬럼(진행률 막대·상태 배지)도 행에는 원래 값(숫자·글)이 들어 있다", async () => {
    await renderWidget(await loadWidget());
    const row = h.grid.current!.data[0];
    expect(typeof row.progress).toBe("number");
    expect(typeof row.status).toBe("string");
    expect(typeof row.orderQty).toBe("number");
  });
});

describe("작업 지시 위젯 — excelExport", () => {
  it("제목·기본 이름(작업지시)·단추 testId(wq-excel)를 그리드에 넘긴다", async () => {
    await renderWidget(await loadWidget());
    expect(h.grid.current!.excelExport).toEqual({
      title: "금일 작업지시 현황",
      fallbackName: "작업지시",
      testId: "wq-excel",
    });
  });

  it("위젯 제목이 없으면 title 은 비고 기본 이름(작업지시)이 남는다", async () => {
    await renderWidget(await loadWidget(), { title: undefined });
    expect(h.grid.current!.excelExport?.title).toBeUndefined();
    expect(h.grid.current!.excelExport?.fallbackName).toBe("작업지시");
  });

  it("같은 제목으로 다시 그려도 같은 객체를 넘긴다(그리드 memo 가 깨지지 않는다)", async () => {
    const Widget = await loadWidget();
    await renderWidget(Widget);
    const first = h.grid.current!.excelExport;
    await renderWidget(Widget);
    expect(h.grid.current!.excelExport).toBe(first);
    await renderWidget(Widget, { title: "다른 제목" });
    expect(h.grid.current!.excelExport).not.toBe(first);
    expect(h.grid.current!.excelExport?.title).toBe("다른 제목");
  });
});

describe("작업 지시 위젯 — 0건", () => {
  afterEach(() => {
    vi.doUnmock("@/page-components/home/sample-data");
    vi.resetModules();
  });

  it("행이 없으면 표 행도 0이다(단추 비활성은 그리드가 맡는다)", async () => {
    vi.resetModules();
    vi.doMock("@/page-components/home/sample-data", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/page-components/home/sample-data")>()),
      SAMPLE_WORK_ORDERS: [],
    }));
    await renderWidget(await loadWidget());
    expect(h.grid.current!.data).toHaveLength(0);
    expect(h.grid.current!.excelExport?.note).toBeUndefined();
  });
});
