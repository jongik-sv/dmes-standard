/** @vitest-environment happy-dom */
/**
 * 출하 예정 위젯 동작 시험 — 표가 남은 높이를 채우는 구조, 표 아래 줄(「N건」)과 [엑셀] 내려받기.
 * 대역·실물 구분은 작업 지시 위젯 시험(workOrders/widget.test.ts)과 같다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_SHIPMENTS } from "@/page-components/home/sample-data";

import { GRID_FILL_CSS } from "../_shared/grid-fill";

const h = vi.hoisted(() => ({
  exportToExcel: vi.fn(),
  /** 마지막으로 그리드에 넘어간 props. */
  grid: {
    current: null as null | {
      columns: { key: string; header: string }[];
      data: Record<string, unknown>[];
      height?: string | number;
    },
  },
}));

vi.mock("@dk-oasis/shared/utils", () => ({
  exportToExcel: h.exportToExcel,
  today: () => "20261003",
}));

vi.mock("@dk-oasis/shared/grid", async () => {
  const { createElement: el } = await import("react");
  return {
    AgDataGrid: (p: {
      columns: { key: string; header: string }[];
      data: Record<string, unknown>[];
      height?: string | number;
    }) => {
      h.grid.current = { columns: p.columns, data: p.data, height: p.height };
      return el("div", { "data-testid": "grid", "data-rows": String(p.data.length) });
    },
    GridBadge: () => null,
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

const { default: ShipmentsWidget } = await import("./widget");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

describe("출하 예정 위젯 — 표 감싸개가 남은 높이를 채우는 구조", () => {
  it("표(height 100%)는 grow 칸 안에, 아래 줄은 그 칸 바로 다음(바닥)에 있다", async () => {
    await renderWidget();
    const fill = must("home-grid-fill");
    const grow = must("home-grid-fill-grow");
    const grid = must("grid");
    const foot = must("grid-foot");

    expect(fill.className).toBe("mcm-home-gridfill");
    expect(grow.className).toBe("mcm-home-gridfill__grow");
    // 감싸개 → [grow(표), 아래 줄] 순서 — 표가 먼저, 아래 줄이 맨 끝
    expect(grow.parentElement).toBe(fill);
    expect(grid.parentElement).toBe(grow);
    expect(foot.parentElement).toBe(fill);
    expect([...fill.children].filter((c) => c.tagName !== "STYLE")).toEqual([grow, foot]);
    // 표는 감싸개가 정한 높이를 채운다(height="auto" 면 아래 줄이 위젯 가운데 뜬다)
    expect(h.grid.current!.height).toBe("100%");
  });

  it("감싸개 스타일: 세로 flex 에 높이 100%, 표 칸은 남은 높이를 차지(flex 1 1 0, min-height 0)", () => {
    expect(GRID_FILL_CSS).toMatch(
      /\.mcm-home-gridfill \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*height: 100%;[^}]*min-height: 0;/
    );
    expect(GRID_FILL_CSS).toMatch(/\.mcm-home-gridfill__grow \{[^}]*flex: 1 1 0;[^}]*min-height: 0;/);
  });
});

describe("출하 예정 위젯 — 표 아래 줄", () => {
  it("표 바로 다음에 「N건」(천 단위 쉼표)과 [엑셀] 단추가 온다", async () => {
    await renderWidget();
    const grid = must("grid");
    const foot = container.querySelector('[data-testid="grid-foot"]');
    expect(foot).not.toBeNull();
    expect(grid.compareDocumentPosition(foot!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foot!.querySelector('[data-testid="grid-foot-note"]')?.textContent).toBe(`${SAMPLE_SHIPMENTS.length.toLocaleString()}건`);
    expect(grid.getAttribute("data-rows")).toBe(String(SAMPLE_SHIPMENTS.length));
    expect((must("wq-excel") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("출하 예정 위젯 — [엑셀]", () => {
  it("표의 행·「{위젯 제목}_{yyyyMMdd}.xlsx」·Sheet1·위젯 컬럼 순서의 컬럼으로 exportToExcel 을 부른다", async () => {
    await renderWidget();
    await act(async () => {
      must("wq-excel").click();
    });

    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    const [rows, fileName, sheetName, columns] = h.exportToExcel.mock.calls[0] as [
      Record<string, unknown>[],
      string,
      string,
      { key: string; header: string; width: number }[],
    ];
    expect(rows).toBe(h.grid.current!.data);
    expect(rows).toHaveLength(SAMPLE_SHIPMENTS.length);
    expect(fileName).toBe("출하 예정_20261003.xlsx");
    expect(sheetName).toBe("Sheet1");
    expect(columns.map((c) => [c.key, c.header])).toEqual([
      ["shipDate", "출하일"],
      ["customer", "고객사"],
      ["item", "품목"],
      ["qty", "수량(t)"],
      ["status", "상태"],
    ]);
    expect(columns.map((c) => c.key)).toEqual(h.grid.current!.columns.map((c) => c.key));
    // 상태 배지 컬럼도 원래 값(글), 수량은 숫자 그대로
    expect(typeof rows[0].status).toBe("string");
    expect(typeof rows[0].qty).toBe("number");
  });

  it("위젯 제목이 없으면 기본 이름(「출하_날짜.xlsx」)으로 내려받는다", async () => {
    await renderWidget({ title: undefined });
    await act(async () => {
      must("wq-excel").click();
    });
    expect(h.exportToExcel.mock.calls[0][1]).toBe("출하_20261003.xlsx");
  });
});
