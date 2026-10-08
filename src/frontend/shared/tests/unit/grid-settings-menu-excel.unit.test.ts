/** @vitest-environment happy-dom */

// GridPanel 「그리드 설정」 메뉴의 [엑셀 출력] — excelExport 를 켠 그리드가 GridPanel 안에 있으면 아래 줄 [엑셀] 단추는 빠지고
// 메뉴 항목이 같은 내보내기를 부른다. GridPanel 안의 그리드는 excelExport 를 주지 않아도 메뉴 항목이 기본으로 나오고 excelExport={false} 로 끈다. GridPanel 밖의 그리드는 같은 메뉴를 머리글 줄 아이콘으로 달고(grid-settings-overlay 시험), 대상이 아닌 둘째 그리드는 아래 줄 단추를 그대로 둔다.
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
    expect(tid("grid-excel")!.textContent).toBe("엑셀 출력");
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

  it("엑셀(excelExport={false})·개인화·걸러 보기(filter={false})를 모두 끈 그리드도 [컬럼 원래대로] 하나는 있다", async () => {
    await show(panel([gridEl({ personalize: false, excelExport: false, filter: false })]));
    await openMenu();
    expect(tid("grid-columns-reset-button")).not.toBeNull();
    expect(tid("grid-excel")).toBeNull();
    expect(tid("grid-filter-row-item")).toBeNull();
  });

  it("settingsMenu={false} 면 개인화가 꺼져도 메뉴가 없다", async () => {
    await show(panel([gridEl({ personalize: false, settingsMenu: false })]));
    expect(tid("grid-settings-menu")).toBeNull();
  });

  it("엑셀·개인화를 끄고 filter 를 생략한 그리드는 「칸별 필터 보기」 만 있는 메뉴가 생긴다", async () => {
    await show(panel([gridEl({ personalize: false, excelExport: false })]));
    await openMenu();
    expect(tid("grid-filter-row-item")).not.toBeNull();
    expect(tid("grid-excel")).toBeNull();
    expect(tid("grid-columns-button")).toBeNull();
  });
});

describe("GridPanel 안의 기본 켬", () => {
  it("excelExport 를 주지 않아도 메뉴에 [엑셀 출력] 이 나오고, 아래 줄(행 수 안내·단추)은 생기지 않는다", async () => {
    await show(panel([gridEl()]));
    expect(tid("grid-foot")).toBeNull();
    expect(tid("grid-excel-frame")).toBeNull();
    await openMenu();
    expect(tid("grid-excel")!.textContent).toBe("엑셀 출력");
  });

  it("개인화를 끈 그리드도 메뉴 아이콘이 보이고, 개인화 항목 대신 [컬럼 원래대로] 가 있다", async () => {
    await show(panel([gridEl({ personalize: false })]));
    await openMenu();
    expect(tid("grid-excel")).not.toBeNull();
    expect(tid("grid-columns-reset-button")).not.toBeNull();
    expect(tid("grid-columns-button")).toBeNull();
    expect(tid("grid-reset-button")).toBeNull();
  });

  it("파일 이름은 excelExport.title → GridPanel 제목 → 「목록」 순이다", async () => {
    await show(panel([gridEl()]));
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("목록_20261006.xlsx"); // panel() 의 title 은 「목록」

    h.exportToExcel.mockClear();
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        createElement(GridPanel, { key: "t", title: "작업 목록" }, gridEl()),
      ),
    );
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("작업 목록_20261006.xlsx");

    h.exportToExcel.mockClear();
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        createElement(GridPanel, { key: "n" }, gridEl()),
      ),
    );
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("목록_20261006.xlsx");

    h.exportToExcel.mockClear();
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        createElement(GridPanel, { key: "e", title: "패널" }, gridEl({ excelExport: { title: "지정" } })),
      ),
    );
    await openMenu();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("지정_20261006.xlsx");
  });

  it("행이 0 이면 기본 켬 항목도 비활성이다", async () => {
    await show(panel([gridEl({ data: [] })]));
    await openMenu();
    expect(tid("grid-excel")!.hasAttribute("disabled")).toBe(true);
    await click(tid("grid-excel"));
    expect(h.exportToExcel).not.toHaveBeenCalled();
  });

  it("excelExport={false} 인 그리드는 개인화가 켜져 있어도 엑셀 항목이 없다", async () => {
    await show(panel([gridEl({ excelExport: false })]));
    await openMenu();
    expect(tid("grid-columns-button")).not.toBeNull();
    expect(tid("grid-excel")).toBeNull();
  });

  it("GridPanel 밖의 그리드도 excelExport 를 주지 않으면 아래 줄은 없고, 머리줄 설정 메뉴에만 엑셀 출력이 나온다(자세한 것은 grid-header 시험)", async () => {
    await show(
      createElement(TabPageContext.Provider, { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } }, gridEl()),
    );
    expect(tid("grid-foot")).toBeNull();
    // 스스로 그리는 머리줄의 설정 메뉴가 엑셀을 맡는다(머리글 줄 아이콘은 header={false} 일 때만 — grid-settings-overlay 시험)
    expect(tid("grid-settings-overlay")).toBeNull();
    expect(tid("grid-panel-settings-slot")!.contains(tid("grid-settings-menu"))).toBe(true);
    await openMenu();
    expect(tid("grid-excel")!.textContent).toBe("엑셀 출력");
  });

  it("serverPaged 패널은 항목 이름에 「(현재 페이지)」 가 붙는다", async () => {
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        createElement(GridPanel, { key: "sp", title: "목록", serverPaged: true }, gridEl()),
      ),
    );
    await openMenu();
    expect(tid("grid-excel")!.textContent).toBe("엑셀 출력 (현재 페이지)");
  });
});

describe("메뉴 항목 순서", () => {
  it("칸별 필터 보기 → (구분선) → 컬럼 설정… → 자동 설정 저장 → 설정 초기화… → (구분선) → 엑셀 출력 순서이고, 머리글 우클릭 메뉴의 항목은 같은 이름·순서(칸별 필터 보기·엑셀은 없다)다", async () => {
    await show(panel([gridEl()]));
    await openMenu();
    const dropdown = tid("grid-settings-dropdown")!;
    const items = [...dropdown.children].map((el) =>
      el.getAttribute("role") === "separator" || el.tagName === "HR" || el.classList.toString().includes("divider")
        ? "|"
        : (el.textContent ?? "").trim(),
    ).filter((t) => t !== ""); // 드롭다운 맨 앞의 빈 자리(포커스 가드) 제외
    expect(items).toEqual(["칸별 필터 보기", "|", "컬럼 설정…", "자동 설정 저장", "설정 초기화…", "|", "엑셀 출력"]);

    // 머리글 우클릭 메뉴 — 같은 이름·순서(엑셀 항목은 없다)
    await act(async () => {
      document.body.click();
    });
    await wait(60);
    const header = document.querySelector(".ag-header-cell");
    expect(header).not.toBeNull();
    await act(async () => {
      header!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 40 }));
    });
    await wait(60);
    const headerItems = [...tid("grid-header-menu")!.children].map((el) => (el.textContent ?? "").trim()).filter((t) => t !== "");
    expect(headerItems).toEqual(["컬럼 설정…", "자동 설정 저장", "설정 초기화…"]);
  });
});

describe("메뉴가 없는 곳과 대상이 아닌 그리드", () => {
  it("GridPanel 없이 쓰는 그리드도 excelExport 를 주면 아래 줄은 행 수만 남고 [엑셀] 은 머리글 줄 아이콘 메뉴로 옮겨 간다", async () => {
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        gridEl({ excelExport: { title: "작업" } }),
      ),
    );
    expect(tid("grid-foot-note")!.textContent).toBe("2행");
    expect(tid("grid-foot")!.querySelector("button")).toBeNull();
    await openMenu();
    await click(tid("grid-excel"));
    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("작업_20261006.xlsx");
  });

  it("settingsMenu={false} 인 그리드는 아이콘이 없고 아래 줄 [엑셀] 단추가 그대로 남는다", async () => {
    await show(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: "scr-xl", serviceId: "", tabId: "t1" } },
        gridEl({ excelExport: { title: "작업" }, settingsMenu: false }),
      ),
    );
    expect(tid("grid-settings-menu")).toBeNull();
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

describe("대상 선정", () => {
  it("엑셀만 켠 그리드가 먼저 등록돼도 개인화 그리드가 대상이라 컬럼 설정 항목이 남는다", async () => {
    await show(
      panel([
        gridEl({ gridId: "x", personalize: false, excelExport: { title: "엑셀전용", testId: "xl-x" } }, "x"),
        gridEl({ gridId: "p", excelExport: { title: "개인화", testId: "xl-p" } }, "p"),
      ]),
    );
    await openMenu();
    expect(tid("grid-columns-button")).not.toBeNull();
    // 메뉴는 개인화 그리드가 맡으므로 그 그리드의 아래 줄 단추만 빠지고, 엑셀 전용 그리드는 단추가 남는다
    expect(tid("xl-p")).toBeNull();
    expect(tid("xl-x")).not.toBeNull();
    await click(tid("grid-excel"));
    expect((h.exportToExcel.mock.calls[0] as [unknown, string])[1]).toBe("개인화_20261006.xlsx");
  });
});
