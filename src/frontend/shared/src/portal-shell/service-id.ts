import { getPortalMenuItemPageId } from "./menu-search";
import type { PortalShellMenuItem } from "./types";

/**
 * pageId → serviceId. menu tree 에서 page 의 가장 가까운 상위 dir 메뉴 id(권한관리 endpoint `/api/{module}/{serviceId}/{objId}/{action}` 의 service segment).
 * root 직계 page 면 빈 문자열. 포털 셸과 단독 창(PortalPageWindow)이 같이 쓴다.
 */
export function buildServiceIdByPageId(items: PortalShellMenuItem[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(list: PortalShellMenuItem[], parentDirId: string) {
    for (const item of list) {
      if (item.type === "page") {
        const pageId = getPortalMenuItemPageId(item);
        if (pageId) map.set(pageId, parentDirId);
      }
      // dir 메뉴면 자기 자신을 자식의 serviceId 로 전달, 아니면 상위 dir 유지
      if (item.items.length > 0) walk(item.items, item.type === "dir" ? item.id : parentDirId);
    }
  }
  walk(items, "");
  return map;
}
