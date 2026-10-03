/** @vitest-environment happy-dom */
/**
 * 작업 지시 위젯 동작 시험 — 표 아래 줄(「N건」)과 [엑셀] 내려받기.
 * shared 의 그리드·폼 부품·위젯 틀 연결·엑셀 쓰기는 대역으로 바꾼다. 샘플 데이터(page-components/home/sample-data)와
 * 엑셀 파일 이름·컬럼 계산(widget-types/_query/excel.ts)은 실물이다. JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_WORK_ORDERS } from "@/page-components/home/sample-data";

const h = vi.hoisted(() => ({
  exportToExcel: vi.fn(),
  /** 마지막으로 그리드에 넘어간 props. */
  grid: { current: null as null | { columns: { key: string; header: string }[]; data: Record<string, unknown>[] } },
}));

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
    GridBadge: () => null,
  };
});

vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return {
    ProgressBar: () => null,
    Button: (p: { children?: unknown; onClick?: () => void; disabled?: boolean; "data-testid"?: string }) =>
      el(
        "button",
        { type: "button", onClick: p.onClick, disabled: p.disabled, "data-testid": p["data-testid"] },
        p.children as never
      ),
  };
});

vi.mock("@dk-oasis/shared/widget", () => ({ WidgetTitleExtra: () => null }));

vi.mock("@tabler/icons-react", () => ({ IconDownload: () => null }));

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

describe("작업 지시 위젯 — 표 아래 줄", () => {
  it("표 바로 다음에 「N건」(천 단위 쉼표)과 [엑셀] 단추가 온다", async () => {
    await renderWidget(await loadWidget());
    const grid = must("grid");
    const foot = container.querySelector(".wq-foot");
    expect(foot).not.toBeNull();
    // 표 → 아래 줄 순서(아래 줄이 표 다음에 온다)
    expect(grid.compareDocumentPosition(foot!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foot!.querySelector(".wq-foot__note")?.textContent).toBe(`${SAMPLE_WORK_ORDERS.length.toLocaleString()}건`);
    expect(grid.getAttribute("data-rows")).toBe(String(SAMPLE_WORK_ORDERS.length));
    expect((must("wq-excel") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("작업 지시 위젯 — [엑셀]", () => {
  it("표의 행·「{위젯 제목}_{yyyyMMdd}.xlsx」·Sheet1·위젯 컬럼 순서의 컬럼으로 exportToExcel 을 부른다", async () => {
    await renderWidget(await loadWidget());
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
    expect(rows).toBe(h.grid.current!.data); // 그리드가 보여 주는 바로 그 행
    expect(rows).toHaveLength(SAMPLE_WORK_ORDERS.length);
    expect(fileName).toBe("금일 작업지시 현황_20261003.xlsx");
    expect(sheetName).toBe("Sheet1");
    // 위젯 컬럼 순서·제목 그대로
    expect(columns.map((c) => [c.key, c.header])).toEqual([
      ["woNo", "작업지시번호"],
      ["process", "공정"],
      ["steel", "강종"],
      ["spec", "규격"],
      ["orderQty", "지시(t)"],
      ["doneQty", "실적(t)"],
      ["progress", "진행률"],
      ["status", "상태"],
    ]);
    expect(columns.map((c) => c.key)).toEqual(h.grid.current!.columns.map((c) => c.key));
    expect(columns.every((c) => c.width >= 8 && c.width <= 50)).toBe(true);
    // render 로 그리는 컬럼(진행률 막대·상태 배지)도 원래 값(숫자·글)이 그대로 들어 있다
    expect(typeof rows[0].progress).toBe("number");
    expect(typeof rows[0].status).toBe("string");
    expect(typeof rows[0].orderQty).toBe("number");
  });

  it("위젯 제목이 없으면 기본 이름(「쿼리표_날짜.xlsx」)으로 내려받는다", async () => {
    await renderWidget(await loadWidget(), { title: undefined });
    await act(async () => {
      must("wq-excel").click();
    });
    expect(h.exportToExcel.mock.calls[0][1]).toBe("쿼리표_20261003.xlsx");
  });
});

describe("작업 지시 위젯 — 0건", () => {
  afterEach(() => {
    vi.doUnmock("@/page-components/home/sample-data");
    vi.resetModules();
  });

  it("행이 없으면 「0건」이고 [엑셀]은 비활성이라 눌러도 내려받지 않는다", async () => {
    vi.resetModules();
    vi.doMock("@/page-components/home/sample-data", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/page-components/home/sample-data")>()),
      SAMPLE_WORK_ORDERS: [],
    }));
    await renderWidget(await loadWidget());
    expect(container.querySelector(".wq-foot__note")?.textContent).toBe("0건");
    const btn = must("wq-excel") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await act(async () => {
      btn.click();
    });
    expect(h.exportToExcel).not.toHaveBeenCalled();
  });
});
