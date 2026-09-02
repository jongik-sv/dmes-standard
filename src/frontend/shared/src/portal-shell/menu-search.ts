import { composePageName } from "./module";
import type { PortalShellMenuItem } from "./types";

export interface PortalMenuSearchItem {
  pageId: string;
  title: string;
  menuId: string;
  moduleId: string;
  parentPathText: string;
  fullPathText: string;
  searchText: string;
  compactSearchText: string;
}

const LOCALE = "ko-KR";
export const DEFAULT_RECENT_MENU_LIMIT = 5;

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase(LOCALE).replace(/\s+/g, " ");
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function getPortalMenuItemPageId(menuItem: PortalShellMenuItem): string | null {
  if (menuItem.type !== "page" || !menuItem.moduleId || !menuItem.pageName) {
    return null;
  }

  const composedPageName =
    menuItem.componentPath && menuItem.componentPath.includes("/")
      ? menuItem.componentPath
      : composePageName(menuItem.path, menuItem.pageName);

  if (!composedPageName) {
    return null;
  }

  return `${menuItem.moduleId}:${composedPageName}`;
}

export function buildMenuSearchItems(items: PortalShellMenuItem[]): PortalMenuSearchItem[] {
  const byPageId = new Map<string, PortalMenuSearchItem>();

  function walk(nodes: PortalShellMenuItem[], parentLabels: string[]) {
    for (const node of nodes) {
      const label = node.displayText?.trim() || node.name?.trim() || node.id;
      const nextLabels = label ? [...parentLabels, label] : parentLabels;

      if (node.type === "page") {
        const pageId = getPortalMenuItemPageId(node);
        if (pageId && !byPageId.has(pageId)) {
          const parentPathText = parentLabels.join(" / ");
          const fullPathText = nextLabels.join(" / ");
          const searchSource = [
            node.displayText,
            node.name,
            node.id,
            node.pageName,
            node.componentPath,
            pageId,
            fullPathText,
          ]
            .filter(Boolean)
            .join(" ");

          byPageId.set(pageId, {
            pageId,
            title: label,
            menuId: node.id,
            moduleId: node.moduleId ?? "",
            parentPathText,
            fullPathText,
            searchText: normalizeSearchText(searchSource),
            compactSearchText: compactSearchText(searchSource),
          });
        }
      }

      if (node.items.length > 0) {
        walk(node.items, nextLabels);
      }
    }
  }

  walk(items, []);
  return Array.from(byPageId.values());
}

function matchesQuery(item: PortalMenuSearchItem, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  return normalizedQuery.split(" ").every((token) => {
    if (!token) {
      return true;
    }

    return item.searchText.includes(token) || item.compactSearchText.includes(token);
  });
}

function scoreMenuSearchItem(item: PortalMenuSearchItem, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const compactQuery = compactSearchText(query);
  const title = normalizeSearchText(item.title);
  const compactTitle = compactSearchText(item.title);
  const fullPath = normalizeSearchText(item.fullPathText);
  const pageId = normalizeSearchText(item.pageId);
  let score = 0;

  if (title === normalizedQuery || compactTitle === compactQuery) {
    score += 120;
  } else if (title.startsWith(normalizedQuery) || compactTitle.startsWith(compactQuery)) {
    score += 90;
  } else if (title.includes(normalizedQuery) || compactTitle.includes(compactQuery)) {
    score += 70;
  }

  if (fullPath.includes(normalizedQuery)) {
    score += 35;
  }

  if (pageId.includes(normalizedQuery) || pageId.includes(compactQuery)) {
    score += 25;
  }

  return score - item.fullPathText.length / 1000;
}

export function filterMenuSearchItems(
  items: PortalMenuSearchItem[],
  query: string,
  limit = 80
): PortalMenuSearchItem[] {
  return items
    .filter((item) => matchesQuery(item, query))
    .map((item, index) => ({ item, index, score: scoreMenuSearchItem(item, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function updateRecentMenuPageIds(
  currentPageIds: string[],
  nextPageId: string,
  limit = DEFAULT_RECENT_MENU_LIMIT
): string[] {
  const normalizedPageId = nextPageId.trim();
  if (!normalizedPageId) {
    return currentPageIds.slice(0, limit);
  }

  return [
    normalizedPageId,
    ...currentPageIds.filter((pageId) => pageId !== normalizedPageId),
  ].slice(0, limit);
}

export function buildRecentMenuSearchItems(
  items: PortalMenuSearchItem[],
  recentPageIds: string[],
  limit = DEFAULT_RECENT_MENU_LIMIT
): PortalMenuSearchItem[] {
  const itemsByPageId = new Map(items.map((item) => [item.pageId, item]));
  const seen = new Set<string>();
  const recentItems: PortalMenuSearchItem[] = [];

  for (const pageId of recentPageIds) {
    if (seen.has(pageId)) {
      continue;
    }

    const item = itemsByPageId.get(pageId);
    if (!item) {
      continue;
    }

    seen.add(pageId);
    recentItems.push(item);
    if (recentItems.length >= limit) {
      break;
    }
  }

  return recentItems;
}
