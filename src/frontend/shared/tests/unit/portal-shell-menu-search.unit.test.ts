import { describe, expect, it } from "vitest";
import {
  buildRecentMenuSearchItems,
  buildMenuSearchItems,
  filterMenuSearchItems,
  getPortalMenuItemPageId,
  updateRecentMenuPageIds,
} from "../../src/portal-shell/menu-search";
import type { PortalShellMenuItem } from "../../src/portal-shell/types";

function menuNode(
  overrides: Partial<PortalShellMenuItem> & Pick<PortalShellMenuItem, "id" | "displayText" | "type">
): PortalShellMenuItem {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    displayText: overrides.displayText,
    type: overrides.type,
    items: overrides.items ?? [],
    parentId: overrides.parentId ?? null,
    expended: overrides.expended ?? null,
    path: overrides.path ?? "/",
    moduleId: overrides.moduleId ?? null,
    pageName: overrides.pageName ?? null,
    componentPath: overrides.componentPath ?? null,
  };
}

const menuItems: PortalShellMenuItem[] = [
  menuNode({
    id: "mcm",
    displayText: "공통관리",
    type: "dir",
    items: [
      menuNode({
        id: "csa",
        displayText: "권한관리",
        type: "dir",
        items: [
          menuNode({
            id: "commUserMng",
            displayText: "사용자 관리",
            type: "page",
            path: "/legacy/ignored",
            moduleId: "mcm",
            pageName: "commUserMng",
            componentPath: "csa/commUserMng",
          }),
          menuNode({
            id: "commMenuMng",
            displayText: "메뉴 관리",
            type: "page",
            path: "/csa",
            moduleId: "mcm",
            pageName: "commMenuMng",
          }),
        ],
      }),
    ],
  }),
];

describe("portal-shell menu search", () => {
  it("uses componentPath before legacy path when resolving pageId", () => {
    const item = menuItems[0].items[0].items[0];

    expect(getPortalMenuItemPageId(item)).toBe("mcm:csa/commUserMng");
  });

  it("builds page-only search items with parent path labels", () => {
    const items = buildMenuSearchItems(menuItems);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      pageId: "mcm:csa/commUserMng",
      title: "사용자 관리",
      parentPathText: "공통관리 / 권한관리",
    });
  });

  it("matches menu name with or without spaces", () => {
    const items = buildMenuSearchItems(menuItems);

    expect(filterMenuSearchItems(items, "사용자관리").map((item) => item.pageId)).toEqual([
      "mcm:csa/commUserMng",
    ]);
    expect(filterMenuSearchItems(items, "메뉴 관리").map((item) => item.pageId)).toEqual([
      "mcm:csa/commMenuMng",
    ]);
  });

  it("matches parent path and pageId tokens", () => {
    const items = buildMenuSearchItems(menuItems);

    expect(filterMenuSearchItems(items, "권한 사용자").map((item) => item.pageId)).toEqual([
      "mcm:csa/commUserMng",
    ]);
    expect(filterMenuSearchItems(items, "commMenuMng").map((item) => item.pageId)).toEqual([
      "mcm:csa/commMenuMng",
    ]);
  });

  it("updates recent menu page ids as a move-to-front list", () => {
    expect(updateRecentMenuPageIds(["mcm:csa/commUserMng"], "mcm:csa/commMenuMng")).toEqual([
      "mcm:csa/commMenuMng",
      "mcm:csa/commUserMng",
    ]);
    expect(
      updateRecentMenuPageIds(["mcm:csa/commMenuMng", "mcm:csa/commUserMng"], "mcm:csa/commUserMng")
    ).toEqual(["mcm:csa/commUserMng", "mcm:csa/commMenuMng"]);
  });

  it("builds recent items in stored order and skips missing pages", () => {
    const items = buildMenuSearchItems(menuItems);

    expect(
      buildRecentMenuSearchItems(items, [
        "missing:page",
        "mcm:csa/commMenuMng",
        "mcm:csa/commUserMng",
      ]).map((item) => item.pageId)
    ).toEqual(["mcm:csa/commMenuMng", "mcm:csa/commUserMng"]);
  });
});
