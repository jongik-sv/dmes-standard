/** @vitest-environment happy-dom */
/**
 * 출하 예정 위젯 동작 시험 — 표가 위젯 본문의 남은 높이를 채우고, 아래 줄(「N건」)·[엑셀] 은 그리드의 excelExport 속성으로 맡긴다.
 * 대역·실물 구분은 작업 지시 위젯 시험(workOrders/widget.test.ts)과 같다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_SHIPMENTS } from "@/page-components/home/sample-data";

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

const { default: ShipmentsWidget } = await import("./widget");

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

async function renderWidget(over: { title?: string } = {}) {
  const props = {
    instanceId: "inst-1",
    widgetId: "home.shipments",
    definition: null,
    refreshKey: 0,
    title: "title" in over ? over.title : "출하 예정",
    size: { w: 24, h: 10 },
    config: null,
  };
  await act(async () => {
    root.render(createElement(ShipmentsWidget, props));
  });
}

describe("출하 예정 위젯 — 표", () => {
  it("표는 별도 감싸개 없이 위젯 본문의 남은 높이(height 100%)를 채운다", async () => {
    await renderWidget();
    const grid = q("grid");
    expect(grid).not.toBeNull();
    // 감싸개·아래 줄은 위젯이 아니라 그리드(excelExport)가 맡는다 — 이 대역 그리드는 아래 줄을 그리지 않는다
    expect(q("home-grid-fill")).toBeNull();
    expect(q("grid-foot")).toBeNull();
    expect(h.grid.current!.height).toBe("100%");
    expect(h.grid.current!.rowKey).toBe("id");
    expect(h.grid.current!.data).toHaveLength(SAMPLE_SHIPMENTS.length);
    expect(grid!.getAttribute("data-rows")).toBe(String(SAMPLE_SHIPMENTS.length));
  });

  it("위젯 컬럼 순서·제목 그대로 그리드에 넘긴다(엑셀도 이 순서를 따른다)", async () => {
    await renderWidget();
    expect(h.grid.current!.columns.map((c) => [c.key, c.header])).toEqual([
      ["shipDate", "출하일"],
      ["customer", "고객사"],
      ["item", "품목"],
      ["qty", "수량(t)"],
      ["status", "상태"],
    ]);
  });

  it("상태 배지 컬럼도 행에는 원래 값(글), 수량은 숫자 그대로 들어 있다", async () => {
    await renderWidget();
    const row = h.grid.current!.data[0];
    expect(typeof row.status).toBe("string");
    expect(typeof row.qty).toBe("number");
  });
});

describe("출하 예정 위젯 — excelExport", () => {
  it("제목·기본 이름(출하)·아래 줄 글(「N건」, 천 단위 쉼표)·단추 testId(wq-excel)를 그리드에 넘긴다", async () => {
    await renderWidget();
    expect(h.grid.current!.excelExport).toEqual({
      title: "출하 예정",
      fallbackName: "출하",
      note: `${SAMPLE_SHIPMENTS.length.toLocaleString()}건`,
      testId: "wq-excel",
    });
  });

  it("위젯 제목이 없으면 title 은 비고 기본 이름(출하)이 남는다", async () => {
    await renderWidget({ title: undefined });
    expect(h.grid.current!.excelExport?.title).toBeUndefined();
    expect(h.grid.current!.excelExport?.fallbackName).toBe("출하");
  });

  it("같은 제목으로 다시 그려도 같은 객체를 넘긴다(그리드 memo 가 깨지지 않는다)", async () => {
    await renderWidget();
    const first = h.grid.current!.excelExport;
    await renderWidget();
    expect(h.grid.current!.excelExport).toBe(first);
    await renderWidget({ title: "다른 제목" });
    expect(h.grid.current!.excelExport).not.toBe(first);
  });
});
