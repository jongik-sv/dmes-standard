/** @vitest-environment happy-dom */

// GridPanel 「그리드 설정」 메뉴의 [엑셀 내려받기] — excelExport 를 켠 그리드가 GridPanel 안에 있으면 아래 줄 [엑셀] 단추는 빠지고
// 메뉴 항목이 같은 내보내기를 부른다. GridPanel 밖의 그리드·대상이 아닌 둘째 그리드는 아래 줄 단추를 그대로 둔다.
// 파일 쓰기(exportToExcel)와 오늘 날짜만 대역으로 바꾸고 실제 그리드를 happy-dom 에 띄운다.
import { act, createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ exportToExcel: vi.fn() }));

vi.mock("../../src/utils/libExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libExcel")>()),
  exportToExcel: h.exportToExcel,
}));
vi.mock("../../src/utils/libDate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libDate")>()),
  today: () => "20261006",
}));

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

installMemoryLocalStorage();

const COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호" },
  { key: "qty", header: "수량", type: "number" },
];
const DATA = [
  { woNo: "W-2", qty: 20 },
  { woNo: "W-1", qty: 10 },
];

let r: Rendered | null = null;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());

function gridEl(props: Partial<AgDataGridProps> = {}, key?: string) {
  return createElement(AgDataGrid, {
    key,
    columns: COLUMNS,
    rowKey: "woNo",
    data: DATA,
    columnSizing: "fixed",
    height: "auto",
    ...props,
  });
}
function panel(children: ReactElement[], key = "p") {
  return createElement(
    TabPageContext.Provider,
    { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
    createElement(GridPanel, { key, title: "목록" }, ...children),
  );
}
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}

beforeEach(async () => {
  localStorage.clear();
  h.exportToExcel.mockReset();
  h.exportToExcel.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`그리드가 요청을 보냈다: ${String(input)}`);
    }),
  );
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("GridPanel 안의 excelExport 그리드", () => {
  it("아래 줄에는 행 수 안내만 남고 [엑셀] 단추는 메뉴 항목으로 옮겨 간다", async () => {
    await show(panel([gridEl({ excelExport: { title: "작업" } })]));
    expect(tid("grid-foot-note")!.textContent).toBe("2행");
    expect(tid("grid-foot")!.querySelector("button")).toBeNull();
    expect(tid("grid-excel")).toBeNull(); // 메뉴가 닫혀 있으면 항목도 없다
    await openMenu();
    expect(tid("grid-excel")!.textContent).toBe("엑셀 내려받기");
  });

  it("항목을 누르면 아래 줄 단추와 같은 내보내기를 부른다(파일 이름·행 순서)", async () => {
    await show(panel([gridEl({ excelExport: { title: "작업" } })]));
    await openMenu();
    await click(tid("grid-excel"));
    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    const [rows, fileName] = h.exportToExcel.mock.calls[0] as [unknown[], string];
    expect(rows).toEqual(DATA);
    expect(fileName).toBe("작업_20261006.xlsx");
  });

  it("행이 0 이면 항목이 비활성이다", async () => {
    await show(panel([gridEl({ excelExport: { title: "작업" }, data: [] })]));
    await openMenu();
    expect(tid("grid-excel")!.hasAttribute("disabled")).toBe(true);
    await click(tid("grid-excel"));
    expect(h.exportToExcel).not.toHaveBeenCalled();
  });

  it("개인화를 끈 그리드도 엑셀을 켰으면 메뉴가 생기고, 개인화 항목은 없다", async () => {
    await show(panel([gridEl({ excelExport: { title: "작업" }, personalize: false })]));
    await openMenu();
    expect(tid("grid-excel")).not.toBeNull();
    expect(tid("grid-columns-button")).toBeNull();
    expect(tid("grid-autosave-switch")).toBeNull();
    expect(tid("grid-reset-button")).toBeNull();
  });

  it("엑셀을 켜지 않고 개인화도 끈 그리드에는 메뉴가 없다", async () => {
    await show(panel([gridEl({ personalize: false })]));
    expect(tid("grid-settings-menu")).toBeNull();
  });
});

describe("메뉴가 없는 곳과 대상이 아닌 그리드", () => {
  it("GridPanel 없이 쓰는 그리드는 아래 줄 [엑셀] 단추가 그대로 있다", async () => {
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        gridEl({ excelExport: { title: "작업" } }),
      ),
    );
    expect(tid("grid-excel")).not.toBeNull();
    await click(tid("grid-excel"));
    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
  });

  it("한 패널에 그리드가 둘이면 첫 그리드만 메뉴가 맡고, 둘째 그리드의 아래 줄 단추는 남는다", async () => {
    await show(
      panel([
        gridEl({ gridId: "a", excelExport: { title: "첫째", testId: "xl-a" } }, "a"),
        gridEl({ gridId: "b", excelExport: { title: "둘째", testId: "xl-b" } }, "b"),
      ]),
    );
    expect(tid("xl-a")).toBeNull();
    expect(tid("xl-b")).not.toBeNull();
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("첫째_20261006.xlsx");
  });

  it("첫 그리드가 사라지면 둘째 그리드가 대상이 되어 아래 줄 단추가 빠진다", async () => {
    await show(
      panel([
        gridEl({ gridId: "a", excelExport: { title: "첫째", testId: "xl-a" } }, "a"),
        gridEl({ gridId: "b", excelExport: { title: "둘째", testId: "xl-b" } }, "b"),
      ]),
    );
    await show(panel([gridEl({ gridId: "b", excelExport: { title: "둘째", testId: "xl-b" } }, "b")]));
    expect(tid("xl-b")).toBeNull();
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("둘째_20261006.xlsx");
  });
});
