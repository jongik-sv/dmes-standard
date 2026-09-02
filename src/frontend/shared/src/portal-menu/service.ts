import { composePageName, isValidPagePath } from "../portal-shell/core";
import type { PortalShellMenuItem, PortalShellMenuResponse } from "../portal-shell/types";
import type {
  PortalFavoriteMenuRecord,
  PortalFavoriteMenuRepository,
  PortalFavoriteMenuService,
  PortalMenuRecord,
  PortalMenuRepository,
  PortalMenuService,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MENU_MAX_DEPTH = 3;
const PORTAL_ACCESS_MANAGEMENT_DIR_ID = "33b9ac55-7682-45d0-a9e1-605f296554f6";
const PORTAL_USER_MANAGEMENT_PAGE_ID = "84e5fbf4-0b70-43b8-bc2e-4ec0e44518ef";
const PORTAL_ACCESS_MANAGEMENT_PATH = "/access-management";
const PORTAL_USER_MANAGEMENT_PAGE_NAME = "user-management";

interface MenuTreeNode {
  id: string;
  name: string;
  displayText: string;
  type: "dir" | "page" | "folder";
  expended: boolean | null;
  path: string;
  moduleId: string | null;
  pageName: string | null;
  parentId: string | null;
  sortOrder: number;
  children: MenuTreeNode[];
}

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function assertMenuCommonFields(item: PortalShellMenuItem, expectedParentId: string | null): void {
  if (!isValidUuid(item.id)) {
    throw new Error(`유효하지 않은 메뉴 id(uuid) 입니다: ${item.id}`);
  }

  if (!item.name) {
    throw new Error(`menu.name은 필수입니다: ${item.id}`);
  }

  if (!item.displayText) {
    throw new Error(`menu.displayText는 필수입니다: ${item.id}`);
  }

  if (item.type !== "dir" && item.type !== "page") {
    throw new Error(`유효하지 않은 menu.type 입니다: ${item.id}`);
  }

  if (!Array.isArray(item.items)) {
    throw new Error(`menu.items는 배열이어야 합니다: ${item.id}`);
  }

  if (item.parentId !== expectedParentId) {
    throw new Error(`menu.parentId가 트리 구조와 일치하지 않습니다: ${item.id}`);
  }

  if (item.expended !== true && item.expended !== false && item.expended !== null) {
    throw new Error(`menu.expended는 true/false/null만 허용됩니다: ${item.id}`);
  }

  if (!isValidPagePath(item.path)) {
    throw new Error(`유효하지 않은 menu.path 입니다: ${item.id}`);
  }
}

function assertPageFields(item: PortalShellMenuItem): void {
  if (item.items.length > 0) {
    throw new Error(`page 타입은 하위 items를 가질 수 없습니다: ${item.id}`);
  }

  if (!item.moduleId) {
    throw new Error(`page 타입은 moduleId가 필요합니다: ${item.id}`);
  }

  if (!item.pageName) {
    throw new Error(`page 타입은 pageName이 필요합니다: ${item.id}`);
  }

  const mappedPageName = composePageName(item.path, item.pageName);
  if (!mappedPageName) {
    throw new Error(`path/pageName 매핑이 올바르지 않습니다: ${item.id}`);
  }
}

function assertDirFields(item: PortalShellMenuItem): void {
  if (item.pageName !== null) {
    throw new Error(`dir 타입은 pageName이 null이어야 합니다: ${item.id}`);
  }
}

function assertMenuDepthContract(itemId: string, type: "dir" | "page" | "folder", depth: number): void {
  if (depth > MENU_MAX_DEPTH) {
    throw new Error(`메뉴 depth는 ${MENU_MAX_DEPTH}단계까지만 허용됩니다: ${itemId}`);
  }

  if (depth <= 2 && type !== "dir") {
    throw new Error(`메뉴 ${depth}단계는 dir 타입만 허용됩니다: ${itemId}`);
  }

  if (depth === 3 && type !== "page") {
    throw new Error(`메뉴 3단계는 page 타입만 허용됩니다: ${itemId}`);
  }
}

export function toPortalMenuRecords(
  items: PortalShellMenuItem[],
  parentId: string | null = null,
  depth: number = 1
): PortalMenuRecord[] {
  return items.flatMap((item, index) => {
    assertMenuCommonFields(item, parentId);
    assertMenuDepthContract(item.id, item.type, depth);

    if (item.type === "page") {
      assertPageFields(item);
    } else {
      assertDirFields(item);
    }

    const currentRecord: PortalMenuRecord = {
      id: item.id,
      name: item.name,
      displayText: item.displayText,
      type: item.type,
      parentId,
      expended: item.expended,
      path: item.path,
      moduleId: item.moduleId,
      pageName: item.pageName,
      sortOrder: (index + 1) * 10,
    };

    if (item.items.length === 0) {
      return [currentRecord];
    }

    return [currentRecord, ...toPortalMenuRecords(item.items, item.id, depth + 1)];
  });
}

function sortNodes(nodes: MenuTreeNode[]): void {
  nodes.sort((left, right) => left.sortOrder - right.sortOrder);
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      sortNodes(node.children);
    }
  });
}

function hasPortalPage(node: MenuTreeNode): boolean {
  if (node.type === "page") {
    return node.moduleId === "portal";
  }

  return node.children.some((child) => hasPortalPage(child));
}

function resolvePortalRootNode(nodes: MenuTreeNode[]): MenuTreeNode | null {
  const portalRootByName = nodes.find((node) => node.type === "dir" && node.name === "portal");
  if (portalRootByName) {
    return portalRootByName;
  }

  return nodes.find((node) => node.type === "dir" && hasPortalPage(node)) ?? null;
}

function findNextSortOrder(nodes: MenuTreeNode[]): number {
  if (nodes.length === 0) {
    return 10;
  }

  const maxSortOrder = nodes.reduce(
    (currentMax, node) => (node.sortOrder > currentMax ? node.sortOrder : currentMax),
    0
  );

  return maxSortOrder + 10;
}

function hasPortalUserManagementPage(node: MenuTreeNode): boolean {
  if (node.type === "page") {
    return (
      node.moduleId === "portal" &&
      node.path === PORTAL_ACCESS_MANAGEMENT_PATH &&
      node.pageName === PORTAL_USER_MANAGEMENT_PAGE_NAME
    );
  }

  return node.children.some((child) => hasPortalUserManagementPage(child));
}

function ensurePortalUserManagementMenu(nodes: MenuTreeNode[]): void {
  const portalRootNode = resolvePortalRootNode(nodes);
  if (!portalRootNode) {
    return;
  }

  if (hasPortalUserManagementPage(portalRootNode)) {
    return;
  }

  let accessManagementDirectory = portalRootNode.children.find(
    (child) => child.type === "dir" && child.path === PORTAL_ACCESS_MANAGEMENT_PATH
  );

  if (!accessManagementDirectory) {
    accessManagementDirectory = {
      id: PORTAL_ACCESS_MANAGEMENT_DIR_ID,
      name: "access-management",
      displayText: "권한관리",
      type: "dir",
      expended: false,
      path: PORTAL_ACCESS_MANAGEMENT_PATH,
      moduleId: null,
      pageName: null,
      parentId: portalRootNode.id,
      sortOrder: findNextSortOrder(portalRootNode.children),
      children: [],
    };
    portalRootNode.children.push(accessManagementDirectory);
  }

  const hasUserManagementPage = accessManagementDirectory.children.some(
    (child) =>
      child.type === "page" &&
      child.moduleId === "portal" &&
      child.path === PORTAL_ACCESS_MANAGEMENT_PATH &&
      child.pageName === PORTAL_USER_MANAGEMENT_PAGE_NAME
  );

  if (!hasUserManagementPage) {
    accessManagementDirectory.children.push({
      id: PORTAL_USER_MANAGEMENT_PAGE_ID,
      name: "user-management",
      displayText: "사용자관리",
      type: "page",
      expended: null,
      path: PORTAL_ACCESS_MANAGEMENT_PATH,
      moduleId: "portal",
      pageName: PORTAL_USER_MANAGEMENT_PAGE_NAME,
      parentId: accessManagementDirectory.id,
      sortOrder: findNextSortOrder(accessManagementDirectory.children),
      children: [],
    });
  }

  sortNodes(nodes);
  assertTreeDepthContract(nodes);
}

function assertRecordContract(record: PortalMenuRecord | PortalFavoriteMenuRecord): void {
  if (!isValidUuid(record.id)) {
    throw new Error(`유효하지 않은 메뉴 id(uuid) 입니다: ${record.id}`);
  }

  if (!record.name) {
    throw new Error(`menu.name은 필수입니다: ${record.id}`);
  }

  if (!record.displayText) {
    throw new Error(`menu.displayText는 필수입니다: ${record.id}`);
  }

  if (record.type !== "dir" && record.type !== "page") {
    throw new Error(`유효하지 않은 menu.type 입니다: ${record.id}`);
  }

  if (record.expended !== true && record.expended !== false && record.expended !== null) {
    throw new Error(`menu.expended는 true/false/null만 허용됩니다: ${record.id}`);
  }

  if (!isValidPagePath(record.path)) {
    throw new Error(`유효하지 않은 menu.path 입니다: ${record.id}`);
  }

  if (record.type === "page") {
    if (!record.moduleId || !record.pageName) {
      throw new Error(`page 타입은 moduleId/pageName이 필요합니다: ${record.id}`);
    }

    if (!composePageName(record.path, record.pageName)) {
      throw new Error(`path/pageName 매핑이 올바르지 않습니다: ${record.id}`);
    }
  } else if (record.pageName !== null) {
    throw new Error(`dir 타입은 pageName이 null이어야 합니다: ${record.id}`);
  }
}

function assertFavoriteRecordContract(records: PortalFavoriteMenuRecord[]): void {
  const seenIds = new Set<string>();
  const recordsById = new Map<string, PortalFavoriteMenuRecord>();

  records.forEach((record) => {
    assertRecordContract(record);
    if (!record.userId || record.userId.trim().length === 0) {
      throw new Error(`favorite.userId는 필수입니다: ${record.id}`);
    }
    if (seenIds.has(record.id)) {
      throw new Error(`중복 즐겨찾기 ID가 존재합니다: ${record.id}`);
    }

    seenIds.add(record.id);
    recordsById.set(record.id, record);
  });

  records.forEach((record) => {
    if (record.parentId === null) {
      return;
    }

    if (!isValidUuid(record.parentId)) {
      throw new Error(`유효하지 않은 즐겨찾기 parentId(uuid) 입니다: ${record.id}`);
    }

    if (!recordsById.has(record.parentId)) {
      throw new Error(`부모 즐겨찾기를 찾을 수 없습니다: ${record.parentId}`);
    }
  });

  const resolved = new Set<string>();
  const processing = new Set<string>();

  const validateParentChain = (recordId: string): void => {
    if (resolved.has(recordId)) {
      return;
    }

    if (processing.has(recordId)) {
      throw new Error(`즐겨찾기 부모 참조에 사이클이 존재합니다: ${recordId}`);
    }

    const current = recordsById.get(recordId);
    if (!current) {
      throw new Error(`유효하지 않은 즐겨찾기 id 입니다: ${recordId}`);
    }

    processing.add(recordId);

    if (current.parentId) {
      validateParentChain(current.parentId);
    }

    processing.delete(recordId);
    resolved.add(recordId);
  };

  records.forEach((record) => {
    validateParentChain(record.id);
  });
}

function sortFavoriteMenuRecords(records: PortalFavoriteMenuRecord[]): PortalFavoriteMenuRecord[] {
  return records
    .map((record, index) => ({ record: { ...record }, index }))
    .sort((left, right) => {
      if (left.record.sortOrder === right.record.sortOrder) {
        return left.index - right.index;
      }

      return left.record.sortOrder - right.record.sortOrder;
    })
    .map((item) => item.record);
}

function toPortalFavoriteMenuRecords(
  records: PortalFavoriteMenuRecord[]
): PortalFavoriteMenuRecord[] {
  assertFavoriteRecordContract(records);

  return sortFavoriteMenuRecords(records);
}

class DefaultPortalFavoriteMenuService implements PortalFavoriteMenuService {
  constructor(private readonly repository: PortalFavoriteMenuRepository) {}

  async getFavorites(): Promise<PortalFavoriteMenuRecord[]> {
    const records = await this.repository.findAll();
    return toPortalFavoriteMenuRecords(records);
  }
}

function toPortalShellMenuItems(nodes: MenuTreeNode[]): PortalShellMenuItem[] {
  return nodes.map((node) => {
    const mapped: PortalShellMenuItem = {
      id: node.id,
      name: node.name,
      displayText: node.displayText,
      type: node.type,
      parentId: node.parentId,
      expended: node.expended,
      path: node.path,
      moduleId: node.moduleId,
      pageName: node.pageName,
      items: [],
    };

    if (node.type === "page") {
      if (node.children.length > 0) {
        throw new Error(`page 타입은 하위 메뉴를 가질 수 없습니다: ${node.id}`);
      }

      if (!node.moduleId || !node.pageName) {
        throw new Error(`page 타입은 moduleId/pageName이 필요합니다: ${node.id}`);
      }

      if (!composePageName(node.path, node.pageName)) {
        throw new Error(`path/pageName 매핑이 올바르지 않습니다: ${node.id}`);
      }
    } else if (node.pageName !== null) {
      throw new Error(`dir 타입은 pageName이 null이어야 합니다: ${node.id}`);
    }

    if (node.children.length > 0) {
      mapped.items = toPortalShellMenuItems(node.children);
    }

    return mapped;
  });
}

function assertTreeDepthContract(nodes: MenuTreeNode[], depth: number = 1): void {
  nodes.forEach((node) => {
    assertMenuDepthContract(node.id, node.type, depth);

    if (node.type === "page" && node.children.length > 0) {
      throw new Error(`page 타입은 하위 메뉴를 가질 수 없습니다: ${node.id}`);
    }

    if (node.children.length > 0) {
      assertTreeDepthContract(node.children, depth + 1);
    }
  });
}

function buildMenuTree(records: PortalMenuRecord[]): MenuTreeNode[] {
  const nodesById = new Map<string, MenuTreeNode>();
  const rootNodes: MenuTreeNode[] = [];

  records.forEach((record) => {
    assertRecordContract(record);

    if (nodesById.has(record.id)) {
      throw new Error(`중복 메뉴 ID가 존재합니다: ${record.id}`);
    }

    nodesById.set(record.id, {
      ...record,
      children: [],
    });
  });

  nodesById.forEach((node) => {
    if (!node.parentId) {
      rootNodes.push(node);
      return;
    }

    const parentNode = nodesById.get(node.parentId);
    if (!parentNode) {
      throw new Error(`부모 메뉴를 찾을 수 없습니다: ${node.parentId}`);
    }

    parentNode.children.push(node);
  });

  sortNodes(rootNodes);
  assertTreeDepthContract(rootNodes);

  return rootNodes;
}

class DefaultPortalMenuService implements PortalMenuService {
  constructor(private readonly repository: PortalMenuRepository) {}

  async getMenu(): Promise<PortalShellMenuResponse> {
    const records = await this.repository.findAll();
    const tree = buildMenuTree(records);
    ensurePortalUserManagementMenu(tree);

    return {
      items: toPortalShellMenuItems(tree),
    };
  }
}

export function createPortalMenuService(repository: PortalMenuRepository): PortalMenuService {
  return new DefaultPortalMenuService(repository);
}

export function createPortalFavoriteMenuService(
  repository: PortalFavoriteMenuRepository
): PortalFavoriteMenuService {
  return new DefaultPortalFavoriteMenuService(repository);
}

export function createMockPortalMenuRepositoryFromItems(
  items: PortalShellMenuItem[]
): PortalMenuRepository {
  return {
    async findAll(): Promise<PortalMenuRecord[]> {
      return toPortalMenuRecords(items);
    },
  };
}
