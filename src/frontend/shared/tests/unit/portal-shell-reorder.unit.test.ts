/** @vitest-environment happy-dom */
/**
 * 사이드바 기본 화면·즐겨찾기 끌어서 순서 바꾸기 — 순수 계산(reorder.ts)과 StartPagesList·FavoritesTree 끌기 동작.
 */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PortalFavoriteMenuRecord } from "../../src/portal-menu";
import {
  applyFavoriteReorder,
  buildFavoriteReorderRows,
  buildStartPageReorderRows,
  favoriteRecordPageId,
  moveRelative,
  reorderStartPages,
} from "../../src/portal-shell/reorder";
import type { PortalStartPageRecord } from "../../src/portal-shell/start-pages";
import { StartPagesList } from "../../src/portal-shell/sidebar/StartPagesList";
import { FavoritesTree } from "../../src/portal-shell/sidebar/FavoritesTree";
import { renderWithMantine } from "./mantine-test-utils";

describe("moveRelative", () => {
  const keys = ["a", "b", "c", "d"];

  it("대상의 앞/뒤로 옮긴다", () => {
    expect(moveRelative(keys, "a", "c", "before")).toEqual(["b", "a", "c", "d"]);
    expect(moveRelative(keys, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    expect(moveRelative(keys, "d", "a", "before")).toEqual(["d", "a", "b", "c"]);
    expect(moveRelative(keys, "d", "a", "after")).toEqual(["a", "d", "b", "c"]);
  });

  it("옮겨도 그대로이거나 키가 없으면 null", () => {
    expect(moveRelative(keys, "a", "a", "after")).toBeNull();
    expect(moveRelative(keys, "a", "b", "before")).toBeNull(); // 이미 b 바로 앞
    expect(moveRelative(keys, "b", "a", "after")).toBeNull();
    expect(moveRelative(keys, "x", "a", "before")).toBeNull();
    expect(moveRelative(keys, "a", "x", "before")).toBeNull();
  });
});

describe("기본 화면 순서 계산", () => {
  const records: PortalStartPageRecord[] = [
    { pageId: "mcm:csa/a", menuId: "M_A", displayText: "A", sortOrder: 1 },
    { pageId: "mcm:csa/b", menuId: "M_B", displayText: "B", sortOrder: 2 },
    { pageId: "mcm:csa/c", menuId: "M_C", displayText: "C", sortOrder: 5 },
  ];

  it("요청 순서대로 sortOrder 를 1..n 으로 다시 매기고 목록에 없는 행은 뒤에 붙인다", () => {
    const next = reorderStartPages(records, ["mcm:csa/c", "mcm:csa/a"]);
    expect(next.map((r) => [r.pageId, r.sortOrder])).toEqual([
      ["mcm:csa/c", 1],
      ["mcm:csa/a", 2],
      ["mcm:csa/b", 3],
    ]);
    expect(records[0].sortOrder).toBe(1); // 원본은 건드리지 않는다
  });

  it("서버로 보낼 행은 {fullId(componentPath), menuId} 를 보이는 순서대로 만든다", () => {
    expect(buildStartPageReorderRows(records, ["mcm:csa/c", "mcm:csa/a", "mcm:none/zz"])).toEqual([
      { fullId: "csa/c", menuId: "M_C" },
      { fullId: "csa/a", menuId: "M_A" },
    ]);
  });
});

function folder(name: string, order: number): PortalFavoriteMenuRecord {
  return {
    id: name,
    userId: "u",
    name,
    displayText: name,
    type: "folder",
    parentId: null,
    expended: null,
    path: "/",
    moduleId: null,
    pageName: null,
    sortOrder: order,
  };
}

function page(menuId: string, parentId: string, order: number): PortalFavoriteMenuRecord {
  return {
    id: `${parentId}/${menuId}`,
    userId: "u",
    name: menuId,
    displayText: menuId,
    type: "page",
    parentId,
    expended: null,
    path: "/",
    moduleId: "mcm",
    pageName: menuId.toLowerCase(),
    sortOrder: order,
    componentPath: `csa/${menuId.toLowerCase()}`,
  };
}

describe("즐겨찾기 순서 계산", () => {
  const records = [
    folder("F1", 1),
    folder("F2", 2),
    page("M_A", "F1", 1),
    page("M_B", "F1", 2),
    page("M_X", "F2", 1),
    page("M_C", "F1", 3),
  ];

  it("pageId 는 componentPath 를 우선해 만든다", () => {
    expect(favoriteRecordPageId(records[2])).toBe("mcm:csa/m_a");
    expect(favoriteRecordPageId(records[0])).toBeNull();
  });

  it("그룹 순서 — 그룹 행끼리 자리를 맞바꾸고 메뉴 행 위치와 순서는 그대로다", () => {
    const next = applyFavoriteReorder(records, { kind: "folders", folderIds: ["F2", "F1"] });
    expect(next.map((r) => r.name)).toEqual(["F2", "F1", "M_A", "M_B", "M_X", "M_C"]);
    expect(next.filter((r) => r.type === "folder").map((r) => r.sortOrder)).toEqual([1, 2]);
    expect(next.slice(2)).toEqual(records.slice(2));
  });

  it("그룹 안 순서 — 그 그룹 메뉴끼리만 바꾸고 다른 그룹·그룹 행은 그대로다", () => {
    const next = applyFavoriteReorder(records, {
      kind: "items",
      folderId: "F1",
      pageIds: ["mcm:csa/m_c", "mcm:csa/m_a", "mcm:csa/m_b"],
    });
    expect(next.map((r) => r.name)).toEqual(["F1", "F2", "M_C", "M_A", "M_X", "M_B"]);
    expect(next.filter((r) => r.parentId === "F1").map((r) => r.sortOrder)).toEqual([1, 2, 3]);
    expect(next.find((r) => r.name === "M_X")).toBe(records[4]);
    expect(next[0]).toBe(records[0]);
  });

  it("서버로 보낼 행 — 그룹은 {fvtFoldId}, 메뉴는 {fvtFoldId, fullId, menuId}", () => {
    expect(buildFavoriteReorderRows(records, { kind: "folders", folderIds: ["F2", "F1"] })).toEqual([
      { fvtFoldId: "F2" },
      { fvtFoldId: "F1" },
    ]);
    expect(
      buildFavoriteReorderRows(records, {
        kind: "items",
        folderId: "F1",
        pageIds: ["mcm:csa/m_c", "mcm:csa/m_a", "mcm:csa/m_x"],
      })
    ).toEqual([
      { fvtFoldId: "F1", fullId: "csa/m_c", menuId: "M_C" },
      { fvtFoldId: "F1", fullId: "csa/m_a", menuId: "M_A" },
    ]); // 다른 그룹의 메뉴(m_x)는 보내지 않는다
  });
});

// happy-dom 에는 DragEvent 가 없어 MouseEvent 로 보낸다(React 는 이름으로 끌기 이벤트를 가려 받는다).
// 행 높이가 0 이라 clientY < 0 이면 "앞", 그 외는 "뒤"다.
function drag(type: "dragstart" | "dragover" | "drop" | "dragend", el: Element, clientY = 1) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
  });
}

function rowByText(host: HTMLElement, text: string): HTMLElement {
  const row = Array.from(host.querySelectorAll<HTMLElement>(".fav-row")).find(
    (el) => el.querySelector(".item-name")?.textContent === text
  );
  if (!row) throw new Error(`행 없음: ${text}`);
  return row;
}

describe("StartPagesList 끌기", () => {
  const pages = [
    { pageId: "p:a", displayText: "A" },
    { pageId: "p:b", displayText: "B" },
    { pageId: "p:c", displayText: "C" },
  ];

  it("행을 다른 행 뒤로 끌어 놓으면 바뀐 전체 순서를 알린다", () => {
    const onReorder = vi.fn();
    const r = renderWithMantine(
      createElement(StartPagesList, {
        pages,
        activePageId: null,
        onMenuItemClick: () => {},
        onReorder,
      })
    );
    const a = rowByText(r.host, "A");
    expect(a.getAttribute("draggable")).toBe("true");
    drag("dragstart", a);
    drag("dragover", rowByText(r.host, "C"));
    expect(rowByText(r.host, "C").className).toContain("fav-row--drop-after");
    drag("drop", rowByText(r.host, "C"));
    expect(onReorder).toHaveBeenCalledWith(["p:b", "p:c", "p:a"]);
    r.unmount();
  });

  it("대상의 위쪽 절반에 놓으면 앞으로 들어가고, 제자리에 놓으면 알리지 않는다", () => {
    const onReorder = vi.fn();
    const r = renderWithMantine(
      createElement(StartPagesList, {
        pages,
        activePageId: null,
        onMenuItemClick: () => {},
        onReorder,
      })
    );
    drag("dragstart", rowByText(r.host, "C"));
    drag("drop", rowByText(r.host, "A"), -1);
    expect(onReorder).toHaveBeenLastCalledWith(["p:c", "p:a", "p:b"]);

    onReorder.mockClear();
    drag("dragstart", rowByText(r.host, "A"));
    drag("drop", rowByText(r.host, "B"), -1); // 이미 B 바로 앞
    expect(onReorder).not.toHaveBeenCalled();
    r.unmount();
  });

  it("끌기를 지원해도 클릭 열기와 ✕ 해제는 그대로 동작한다", () => {
    const onMenuItemClick = vi.fn();
    const onRemove = vi.fn();
    const r = renderWithMantine(
      createElement(StartPagesList, {
        pages,
        activePageId: null,
        onMenuItemClick,
        onRemove,
        onReorder: () => {},
      })
    );
    act(() => rowByText(r.host, "B").click());
    expect(onMenuItemClick).toHaveBeenCalledWith("p:b");
    act(() => rowByText(r.host, "B").querySelector<HTMLElement>(".fav-delete-btn")!.click());
    expect(onRemove).toHaveBeenCalledWith("p:b");
    expect(onMenuItemClick).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it("onReorder 가 없으면 끌 수 없다", () => {
    const r = renderWithMantine(
      createElement(StartPagesList, { pages, activePageId: null, onMenuItemClick: () => {} })
    );
    expect(rowByText(r.host, "A").hasAttribute("draggable")).toBe(false);
    r.unmount();
  });
});

describe("FavoritesTree 끌기", () => {
  const folders = [
    {
      folderId: "F1",
      folderName: "업무",
      children: [
        { pageId: "p:a", displayText: "A" },
        { pageId: "p:b", displayText: "B" },
      ],
    },
    { folderId: "F2", folderName: "기타", children: [{ pageId: "p:x", displayText: "X" }] },
  ];

  function renderTree() {
    const onReorderFolders = vi.fn();
    const onReorderItems = vi.fn();
    const onMenuItemClick = vi.fn();
    const r = renderWithMantine(
      createElement(FavoritesTree, {
        folders,
        activePageId: null,
        onMenuItemClick,
        onReorderFolders,
        onReorderItems,
      })
    );
    return { r, onReorderFolders, onReorderItems, onMenuItemClick };
  }

  it("같은 그룹 안에서 즐겨찾기를 끌면 그 그룹의 전체 순서를 알린다", () => {
    const { r, onReorderItems, onReorderFolders } = renderTree();
    drag("dragstart", rowByText(r.host, "A"));
    drag("drop", rowByText(r.host, "B"));
    expect(onReorderItems).toHaveBeenCalledWith("F1", ["p:b", "p:a"]);
    expect(onReorderFolders).not.toHaveBeenCalled();
    r.unmount();
  });

  it("다른 그룹의 즐겨찾기·그룹 행 위에는 놓을 수 없다(그룹 사이 이동 없음)", () => {
    const { r, onReorderItems, onReorderFolders } = renderTree();
    drag("dragstart", rowByText(r.host, "A"));
    drag("dragover", rowByText(r.host, "X"));
    expect(rowByText(r.host, "X").className).not.toContain("fav-row--drop");
    drag("drop", rowByText(r.host, "X"));
    drag("dragstart", rowByText(r.host, "A"));
    drag("drop", rowByText(r.host, "기타"));
    expect(onReorderItems).not.toHaveBeenCalled();
    expect(onReorderFolders).not.toHaveBeenCalled();
    r.unmount();
  });

  it("그룹을 끌어 다른 그룹 뒤에 놓으면 바뀐 전체 그룹 순서를 알린다", () => {
    const { r, onReorderFolders, onReorderItems } = renderTree();
    drag("dragstart", rowByText(r.host, "업무"));
    drag("drop", rowByText(r.host, "기타"));
    expect(onReorderFolders).toHaveBeenCalledWith(["F2", "F1"]);
    expect(onReorderItems).not.toHaveBeenCalled();
    r.unmount();
  });

  it("그룹 접기·클릭 열기는 끌기를 지원해도 그대로 동작한다", () => {
    const { r, onMenuItemClick } = renderTree();
    act(() => rowByText(r.host, "A").click());
    expect(onMenuItemClick).toHaveBeenCalledWith("p:a");
    act(() => rowByText(r.host, "업무").click());
    expect(Array.from(r.host.querySelectorAll(".item-name")).map((el) => el.textContent)).not.toContain("A");
    r.unmount();
  });

  it("콜백이 없으면 행을 끌 수 없다", () => {
    const r = renderWithMantine(
      createElement(FavoritesTree, { folders, activePageId: null, onMenuItemClick: () => {} })
    );
    expect(rowByText(r.host, "A").hasAttribute("draggable")).toBe(false);
    expect(rowByText(r.host, "업무").hasAttribute("draggable")).toBe(false);
    r.unmount();
  });
});
