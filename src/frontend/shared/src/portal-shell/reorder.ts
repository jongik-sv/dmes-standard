/**
 * 사이드바 '기본 화면'·'즐겨찾기' 목록을 끌어서 순서를 바꿀 때 쓰는 순수 계산.
 * 컴포넌트(StartPagesList·FavoritesTree)·서버 조회 훅·호스트 페이지가 같이 쓰고, 단위 테스트가 직접 검증한다.
 */
import type { PortalFavoriteMenuRecord } from "../portal-menu";
import { composePageName } from "./module";
import type { PortalStartPageRecord } from "./start-pages";

/** 끌던 행을 놓을 위치 — 대상 행의 위쪽 절반이면 앞, 아래쪽 절반이면 뒤. */
export type DropPlace = "before" | "after";

/**
 * `keys` 에서 `fromKey` 를 빼 `targetKey` 의 앞/뒤로 옮긴 새 순서. 옮겨도 그대로이거나 키가 없으면 null(할 일 없음).
 */
export function moveRelative(
  keys: readonly string[],
  fromKey: string,
  targetKey: string,
  place: DropPlace
): string[] | null {
  if (fromKey === targetKey) return null;
  if (!keys.includes(fromKey) || !keys.includes(targetKey)) return null;
  const rest = keys.filter((key) => key !== fromKey);
  const targetIndex = rest.indexOf(targetKey);
  const next = [...rest];
  next.splice(place === "before" ? targetIndex : targetIndex + 1, 0, fromKey);
  return next.every((key, index) => key === keys[index]) ? null : next;
}

// ──────────────────────────────────────────────────────────── 기본 화면

/** `orderedPageIds` 순서대로 sortOrder 를 1..n 으로 다시 매긴다. 목록에 없는 행은 기존 순서로 뒤에 붙는다. */
export function reorderStartPages(
  records: readonly PortalStartPageRecord[],
  orderedPageIds: readonly string[]
): PortalStartPageRecord[] {
  const byId = new Map<string, PortalStartPageRecord>();
  for (const record of records) if (!byId.has(record.pageId)) byId.set(record.pageId, record);
  const ordered: PortalStartPageRecord[] = [];
  const used = new Set<string>();
  for (const pageId of orderedPageIds) {
    const record = byId.get(pageId);
    if (!record || used.has(pageId)) continue;
    used.add(pageId);
    ordered.push(record);
  }
  for (const record of records) {
    if (used.has(record.pageId)) continue;
    used.add(record.pageId);
    ordered.push(record);
  }
  return ordered.map((record, index) => ({ ...record, sortOrder: index + 1 }));
}

/** 서버 `secStartPgm/reorder` 의 `grids.items.rows` — `{fullId(=componentPath), menuId}` 를 보이는 순서대로. */
export function buildStartPageReorderRows(
  records: readonly PortalStartPageRecord[],
  orderedPageIds: readonly string[]
): Array<{ fullId: string; menuId: string }> {
  const byId = new Map(records.map((record) => [record.pageId, record] as const));
  const rows: Array<{ fullId: string; menuId: string }> = [];
  for (const pageId of orderedPageIds) {
    const record = byId.get(pageId);
    if (!record) continue;
    rows.push({ fullId: pageId.slice(pageId.indexOf(":") + 1), menuId: record.menuId ?? "" });
  }
  return rows;
}

// ──────────────────────────────────────────────────────────── 즐겨찾기

/** 즐겨찾기 끌기 결과 — 폴더끼리의 순서 또는 한 폴더 안 메뉴 순서(폴더 사이 이동은 없다). */
export type FavoriteReorder =
  | { kind: "folders"; folderIds: string[] }
  | { kind: "items"; folderId: string; pageIds: string[] };

/** 즐겨찾기 메뉴 행의 portal-shell pageId. 메뉴 트리 별 버튼과 같은 조립이라 하이라이트·탭 라우팅이 맞는다. */
export function favoriteRecordPageId(menuItem: PortalFavoriteMenuRecord): string | null {
  if (menuItem.type !== "page" || !menuItem.moduleId || !menuItem.pageName) {
    return null;
  }
  // toPageId(메뉴트리 별버튼)와 동기화 — componentPath(${PARENT_MENU_ID}/${OBJECT_ID}) 우선.
  // 미스매치 시 즐겨찾기 pageId 가 별버튼 pageId 와 달라 하이라이트/탭 라우팅이 깨진다.
  let composedPageName: string | null;
  if (menuItem.componentPath && menuItem.componentPath.includes("/")) {
    composedPageName = menuItem.componentPath;
  } else {
    composedPageName = composePageName(menuItem.path, menuItem.pageName);
  }
  if (!composedPageName) {
    return null;
  }
  return `${menuItem.moduleId}:${composedPageName}`;
}

/**
 * 끌어서 바꾼 순서를 즐겨찾기 행 배열에 반영한 새 배열(낙관적 갱신용). 배열 안의 자리는 그대로 두고 같은 종류 행끼리
 * 자리를 맞바꾸며, 바뀐 쪽 sortOrder 를 1..n 으로 다시 매긴다. 목록에 없는 행은 기존 순서로 뒤에 붙는다.
 */
export function applyFavoriteReorder(
  records: readonly PortalFavoriteMenuRecord[],
  change: FavoriteReorder
): PortalFavoriteMenuRecord[] {
  const isTarget =
    change.kind === "folders"
      ? (record: PortalFavoriteMenuRecord) => record.type === "folder"
      : (record: PortalFavoriteMenuRecord) =>
          record.type !== "folder" && record.parentId === change.folderId;
  const keyOf =
    change.kind === "folders"
      ? (record: PortalFavoriteMenuRecord) => record.name
      : (record: PortalFavoriteMenuRecord) => favoriteRecordPageId(record);
  const orderedKeys = change.kind === "folders" ? change.folderIds : change.pageIds;

  const targets = records.filter(isTarget);
  const byKey = new Map<string, PortalFavoriteMenuRecord>();
  for (const record of targets) {
    const key = keyOf(record);
    if (key && !byKey.has(key)) byKey.set(key, record);
  }
  const ordered: PortalFavoriteMenuRecord[] = [];
  const used = new Set<PortalFavoriteMenuRecord>();
  for (const key of orderedKeys) {
    const record = byKey.get(key);
    if (!record || used.has(record)) continue;
    used.add(record);
    ordered.push(record);
  }
  for (const record of targets) {
    if (used.has(record)) continue;
    used.add(record);
    ordered.push(record);
  }

  let cursor = 0;
  return records.map((record) => {
    if (!isTarget(record)) return record;
    const next = ordered[cursor];
    cursor += 1;
    return { ...next, sortOrder: cursor };
  });
}

/**
 * 서버 `secFavorite/reorder` 의 `grids.items.rows`. 폴더 순서는 `{fvtFoldId}`, 메뉴 순서는
 * `{fvtFoldId, fullId(=componentPath), menuId}` 를 보이는 순서대로.
 */
export function buildFavoriteReorderRows(
  records: readonly PortalFavoriteMenuRecord[],
  change: FavoriteReorder
): Array<Record<string, string>> {
  if (change.kind === "folders") {
    return change.folderIds.map((fvtFoldId) => ({ fvtFoldId }));
  }
  const byPageId = new Map<string, PortalFavoriteMenuRecord>();
  for (const record of records) {
    if (record.type === "folder" || record.parentId !== change.folderId) continue;
    const pageId = favoriteRecordPageId(record);
    if (pageId && !byPageId.has(pageId)) byPageId.set(pageId, record);
  }
  const rows: Array<Record<string, string>> = [];
  for (const pageId of change.pageIds) {
    const record = byPageId.get(pageId);
    if (!record?.componentPath) continue;
    rows.push({ fvtFoldId: change.folderId, fullId: record.componentPath, menuId: record.name });
  }
  return rows;
}
