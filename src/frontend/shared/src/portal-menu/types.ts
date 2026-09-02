import type { PortalShellMenuResponse, PortalShellMenuType } from "../portal-shell/types";

export interface PortalMenuRecord {
  id: string;
  name: string;
  displayText: string;
  type: PortalShellMenuType;
  parentId: string | null;
  expended: boolean | null;
  path: string;
  moduleId: string | null;
  pageName: string | null;
  sortOrder: number;
}

export interface PortalFavoriteMenuRecord {
  id: string;
  userId: string;
  name: string;
  displayText: string;
  type: PortalShellMenuType;
  parentId: string | null;
  expended: boolean | null;
  path: string;
  moduleId: string | null;
  pageName: string | null;
  sortOrder: number;
  /**
   * 메뉴 안정 식별자 (`${PARENT_MENU_ID}/${OBJECT_ID}`) — 메뉴트리 별버튼 pageId 와 동일 조립.
   * 폴더 행이거나 BE 가 미제공이면 null (이때 path/pageName 조립으로 fallback).
   */
  componentPath?: string | null;
}

export interface PortalFavoriteMenuRepository {
  findAll(): Promise<PortalFavoriteMenuRecord[]>;
}

export interface PortalFavoriteMenuService {
  getFavorites(): Promise<PortalFavoriteMenuRecord[]>;
}

export interface PortalMenuRepository {
  findAll(): Promise<PortalMenuRecord[]>;
}

export interface PortalMenuService {
  getMenu(): Promise<PortalShellMenuResponse>;
}
