import type { ReactNode } from "react";

/** 메뉴 노드 타입.
 *  - "dir": 일반 메뉴 트리 디렉토리
 *  - "page": 화면 페이지
 *  - "folder": 즐겨찾기 폴더 (사용자가 만든 그룹)
 */
export type PortalShellMenuType = "dir" | "page" | "folder";

export interface PortalShellMenuItem {
  id: string;
  name: string;
  displayText: string;
  type: PortalShellMenuType;
  items: PortalShellMenuItem[];
  parentId: string | null;
  expended: boolean | null;
  path: string;
  moduleId: string | null;
  pageName: string | null;
  /**
   * 2026-06-05 Phase 1+2 — BE myMenusTree 가 derived 로 공급하는 컴포넌트 경로.
   *
   * 형태: `${PARENT_MENU_ID}/${OBJECT_ID}` (예: "csa/commMenuMng").
   *   - leaf 화면 노드: 두 값 모두 있을 때만 채워짐 (BE SecUserService.getMyMenus 정합)
   *   - 폴더 노드 / leaf 인데 OBJECT_ID null: null
   *
   * 사용처: Sidebar 의 page click 시 pageId 조립에 우선 사용.
   *   - non-null: `${moduleId}:${componentPath}` 그대로 라우팅 (정적 module-pages.ts 의 group prefix 부착 우회)
   *   - null: 기존 fallback (sysCd+path+objId 조립) 으로 회귀
   */
  componentPath?: string | null;
}

export interface PortalShellMenuResponse {
  items: PortalShellMenuItem[];
}

export interface PageProps {
  tabId: string;
  snapshot: unknown;
  onSnapshotChange: (snapshot: unknown) => void;
}

export type PortalShellPageComponent = (props: PageProps) => ReactNode;
