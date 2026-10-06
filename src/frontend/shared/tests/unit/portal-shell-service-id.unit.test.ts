import { describe, expect, it } from "vitest";
import { buildServiceIdByPageId } from "../../src/portal-shell/service-id";
import type { PortalShellMenuItem } from "../../src/portal-shell/types";

function node(partial: Partial<PortalShellMenuItem> & Pick<PortalShellMenuItem, "id" | "type">): PortalShellMenuItem {
  return {
    name: partial.id,
    displayText: partial.id,
    items: [],
    parentId: null,
    expended: null,
    path: "",
    moduleId: null,
    pageName: null,
    ...partial,
  };
}

function page(id: string, pageName: string): PortalShellMenuItem {
  return node({ id, type: "page", moduleId: "x", pageName, componentPath: `grp/${pageName}` });
}

describe("buildServiceIdByPageId", () => {
  it("page 의 serviceId 는 가장 가까운 상위 dir id 이고 root 직계 page 는 빈 문자열이다", () => {
    const items = [
      page("m0", "p0"),
      node({ id: "d1", type: "dir", items: [page("m1", "p1")] }),
      node({ id: "d2", type: "dir", items: [page("m2", "p2")] }),
    ];
    const map = buildServiceIdByPageId(items);
    expect(Object.fromEntries(map)).toEqual({ "x:grp/p0": "", "x:grp/p1": "d1", "x:grp/p2": "d2" });
  });

  it("dir 아래 folder 를 거쳐도 상위 dir id 를 유지한다", () => {
    const items = [node({ id: "d1", type: "dir", items: [node({ id: "f1", type: "folder", items: [page("m1", "p1")] })] })];
    expect(buildServiceIdByPageId(items).get("x:grp/p1")).toBe("d1");
  });
});
