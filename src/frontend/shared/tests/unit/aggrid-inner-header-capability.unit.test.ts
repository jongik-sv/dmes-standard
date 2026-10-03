/** @vitest-environment happy-dom */
/**
 * ag-grid 33.3.2 기본 머리글의 innerHeaderComponent 가능성 확인(설명 HTML 카드 리뷰 반영 결정 0단계).
 * 그리드 HTML 머리글 카드를 ag-grid 툴팁 대신 "안쪽 머리글 라벨 + 포털 카드"로 옮기기 전에, 설치본 ag-grid 가 다음을 해 주는지 본다.
 *  1. React innerHeaderComponent 가 기본 머리글 글자 자리(.ag-header-cell-text)에 그려지고 정렬·메뉴·필터 아이콘이 그대로 있다.
 *  2. 안쪽 컴포넌트가 있으면 ag-grid 는 글자를 갱신하지 않는다 — 머리글 이름이 바뀌면 안쪽 컴포넌트가 새 displayName 을 받는다.
 *  3. 그리드를 만든 뒤 colDef 에 innerHeaderComponent 가 생기면: ag-grid 가 스스로 다시 만들지 않으면 refreshHeader 한 번으로 생긴다.
 *  4. 안쪽 라벨을 누르면 정렬된다. 라벨 mousedown 은 머리글 칸 끌기 원천(드래그 소스)에 닿는다.
 * ag-grid 판이 바뀌어 이 시험이 깨지면 MdmHeaderLabel(그리드 HTML 머리글 카드)이 기대는 전제가 무너진 것이다.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
// AllCommunityModule 등록(AgDataGrid 모듈이 한다).
import "../../src/components/grid/AgDataGrid";
import { settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function Inner(props: { displayName?: string }) {
  return createElement("span", { className: "probe-inner" }, props.displayName);
}

let container: HTMLDivElement;
let root: Root | null = null;
let api: GridApi | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  api = null;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
});

async function render(columnDefs: ColDef[], rowData: unknown[] = [{ a: 2 }, { a: 1 }]) {
  const el: ReactNode = createElement(AgGridReact, {
    columnDefs,
    rowData,
    domLayout: "autoHeight",
    onGridReady: (e: { api: GridApi }) => {
      api = e.api;
    },
  });
  await act(async () => root!.render(el));
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await settle(40);
    });
  }
}

const cell = (colId: string) =>
  container.querySelector<HTMLElement>(`.ag-header-cell[col-id="${colId}"]`)!;
const inner = (colId: string) => cell(colId)?.querySelector<HTMLElement>(".probe-inner") ?? null;
/** 머리글 칸 안 아이콘 자리(정렬·메뉴·필터) 클래스 목록. */
const iconSlots = (colId: string) =>
  [...cell(colId).querySelectorAll("[data-ref]")].map((el) => el.getAttribute("data-ref")).sort();

describe("ag-grid innerHeaderComponent 가능성(0단계)", () => {
  it("1. 기본 머리글 글자 자리에 그려지고 정렬·메뉴·필터 아이콘 자리가 안쪽 컴포넌트 없는 열과 같다", async () => {
    await render([
      {
        field: "a",
        headerName: "에이",
        sortable: true,
        filter: true,
        headerComponentParams: { innerHeaderComponent: Inner },
      },
      { field: "b", headerName: "비", sortable: true, filter: true },
    ]);
    const label = inner("a");
    expect(label?.textContent).toBe("에이");
    expect(label!.closest(".ag-header-cell-text")).not.toBeNull();
    expect(label!.closest(".ag-header-cell-label")).not.toBeNull();
    expect(iconSlots("a")).toEqual(iconSlots("b"));
    expect(iconSlots("a")).toEqual(
      expect.arrayContaining(["eSortIndicator", "eFilterButton", "eLabel", "eText"])
    );
  });

  it("2. 머리글 이름이 바뀌면 ag-grid 는 글자를 직접 고치지 않고 안쪽 컴포넌트가 새 displayName 을 받는다", async () => {
    const inn = { innerHeaderComponent: Inner };
    await render([{ field: "a", headerName: "처음", headerComponentParams: inn }]);
    expect(inner("a")?.textContent).toBe("처음");
    await render([{ field: "a", headerName: "MDM 캡션", headerComponentParams: inn }]);
    expect(inner("a")?.textContent).toBe("MDM 캡션");
    expect(cell("a").querySelector(".ag-header-cell-text")?.textContent).toBe("MDM 캡션");
  });

  it("3. 만든 뒤 innerHeaderComponent 가 생기면 ag-grid 는 스스로 다시 만들지 않고, refreshHeader 한 번이면 생긴다(빠질 때도 같다)", async () => {
    await render([{ field: "a", headerName: "에이" }]);
    expect(inner("a")).toBeNull();
    await render([
      { field: "a", headerName: "에이", headerComponentParams: { innerHeaderComponent: Inner } },
    ]);
    expect(inner("a"), "colDef 갱신만으로는 생기지 않는다").toBeNull();
    await act(async () => api!.refreshHeader());
    await act(async () => {
      await settle(40);
    });
    expect(inner("a")?.textContent).toBe("에이");
    await render([{ field: "a", headerName: "에이" }]);
    await act(async () => api!.refreshHeader());
    await act(async () => {
      await settle(40);
    });
    expect(inner("a")).toBeNull();
    expect(cell("a").querySelector(".ag-header-cell-text")?.textContent).toBe("에이");
  });

  it("4. 안쪽 라벨을 누르면 정렬되고, 라벨은 머리글 칸(끌기 원천) 안에 있어 mousedown 이 끌기 원천에 닿는다", async () => {
    await render([
      {
        field: "a",
        headerName: "에이",
        sortable: true,
        headerComponentParams: { innerHeaderComponent: Inner },
      },
      { field: "b", headerName: "비" },
    ]);
    const label = inner("a")!;
    await act(async () => {
      label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api!.getColumn("a")!.getSort()).toBe("asc");
    // 끌기: ag-grid 는 머리글 칸 eGui 에 mousedown 을 걸어 끌기를 시작한다. 라벨의 mousedown 이 거기까지 올라가는지 본다.
    let reached = false;
    cell("a").addEventListener("mousedown", () => (reached = true));
    await act(async () => {
      label.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 10 })
      );
    });
    expect(reached).toBe(true);
    // 실제 끌기 시작(문서 mousemove 임계값 넘김)
    await act(async () => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 80, clientY: 12 })
      );
    });
    const moving = api!.getColumn("a")!.isMoving();
    await act(async () => {
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, clientX: 80, clientY: 12 })
      );
    });
    expect(moving, "라벨에서 시작한 끌기가 열 이동을 시작한다").toBe(true);
  });
});
