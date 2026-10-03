/**
 * @file menuPathUtils.ts
 * @description 메뉴 경로(Breadcrumb) 계산 유틸리티
 *
 * @example
 * import { getMenuPath } from '@dk-oasis/shared/lib';
 * const path = getMenuPath(menuList, 'menu-001', '사용자 관리');
 * // "공통관리 > 권한관리 > 사용자 관리"
 */

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface MenuPathItem {
  MENU_ID: string;
  MENU_NM: string;
  PARENT_MENU_ID?: string | null;
  FULL_ID?: string;
  OBJECT_ID?: string;
  MENU_SEQ?: number;
  [key: string]: unknown;
}

/**
 * 메뉴 경로(Breadcrumb) 계산
 * @param menuInfo - 전체 메뉴 정보 배열
 * @param menuId - 현재 메뉴 ID
 * @param screenName - 현재 화면명 (선택)
 * @returns 메뉴 경로 문자열 (예: "공통관리 > 권한관리 > 사용자 관리")
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */
export function getMenuPath(menuInfo: MenuPathItem[], menuId: string, screenName?: string): string {
  if (!menuInfo || !Array.isArray(menuInfo) || !menuId) {
    return screenName || "";
  }

  const pathParts: string[] = [];
  let currentMenu = menuInfo.find((m) => m.MENU_ID === menuId);

  while (currentMenu) {
    pathParts.unshift(currentMenu.MENU_NM);
    if (currentMenu.PARENT_MENU_ID) {
      currentMenu = menuInfo.find((m) => m.MENU_ID === currentMenu!.PARENT_MENU_ID);
    } else {
      break;
    }
  }

  if (screenName && pathParts[pathParts.length - 1] !== screenName) {
    pathParts.push(screenName);
  }

  return pathParts.join(" > ");
}

/**
 * 컴포넌트 경로 계산
 * @param fullId - FULL_ID (예: "csa/csa::CommUserMng")
 * @returns 컴포넌트 경로 문자열
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */
export function getObjectPath(fullId: string | null | undefined): string {
  if (!fullId) return "";
  return fullId;
}

/**
 * menuInfo에서 필요한 필드를 보완하여 enriched item 반환
 * @param item - 원본 메뉴 아이템
 * @param menuInfo - 전체 메뉴 정보 배열
 * @returns 보완된 메뉴 아이템
 * @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다.
 */
export function enrichMenuItem(item: MenuPathItem, menuInfo: MenuPathItem[]): MenuPathItem {
  if (!menuInfo || !Array.isArray(menuInfo)) return item;

  const fullId = item.FULL_ID;
  if (!fullId) return item;

  const matchedMenu = menuInfo.find((m) => m.FULL_ID === fullId);
  if (!matchedMenu) return item;

  return {
    ...item,
    OBJECT_ID: item.OBJECT_ID || matchedMenu.OBJECT_ID,
    MENU_ID: item.MENU_ID || matchedMenu.MENU_ID,
    MENU_SEQ: item.MENU_SEQ || matchedMenu.MENU_SEQ,
    FULL_ID: item.FULL_ID || matchedMenu.FULL_ID,
  };
}
