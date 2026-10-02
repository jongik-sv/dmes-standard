"use client";

/**
 * 포털이 이미 받아 둔 "내 메뉴"(secUser/myMenusTree)를 m-mcm 화면이 다시 조회하지 않고 읽게 하는 작은 저장소.
 * - 쓰기: app/portal/page.tsx 가 usePortalMenu 결과를 받을 때마다 publishPortalMenu 로 올린다.
 * - 읽기: 화면은 usePortalMenuPageIds() 로 내가 열 수 있는 화면 pageId 집합을, usePortalMenuItems() 로 메뉴 트리를 받는다(받기 전이면 null).
 * pageId 규칙은 셸 사이드바와 같다: `${moduleId}:${componentPath}`(그룹/화면) 우선, 없으면 path + pageName.
 * 화면 묶음이 여러 번 실려도 같은 저장소를 쓰도록 globalThis 에 둔다(use-user-button-rbac 와 같은 방식).
 */
import { useSyncExternalStore } from "react";
import { composePageName, type PortalShellMenuItem } from "@dk-oasis/shared/portal-shell-core";

interface MenuStore {
  pageIds: ReadonlySet<string> | null;
  /** 메뉴 트리 원본(이름 포함) — 화면 고르기 목록 같은 곳이 다시 조회하지 않고 쓴다. 옛 저장소 객체에는 없을 수 있다. */
  items?: PortalShellMenuItem[] | null;
  listeners: Set<() => void>;
}

const STORE_KEY = "__dmesPortalMenuStore__";

function store(): MenuStore {
  const g = globalThis as unknown as Record<string, MenuStore | undefined>;
  if (!g[STORE_KEY]) g[STORE_KEY] = { pageIds: null, listeners: new Set() };
  return g[STORE_KEY] as MenuStore;
}

/** 메뉴 노드 하나의 pageId(화면이 아니면 null). */
export function menuItemPageId(item: PortalShellMenuItem): string | null {
  if (item.type !== "page" || !item.moduleId || !item.pageName) return null;
  const name =
    item.componentPath && item.componentPath.includes("/")
      ? item.componentPath
      : composePageName(item.path, item.pageName);
  return name ? `${item.moduleId}:${name}` : null;
}

/** 메뉴 트리 → 화면 pageId 집합. */
export function collectMenuPageIds(items: PortalShellMenuItem[]): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: PortalShellMenuItem[]) => {
    for (const n of nodes) {
      const id = menuItemPageId(n);
      if (id) out.add(id);
      if (n.items?.length) walk(n.items);
    }
  };
  walk(items);
  return out;
}

/** 포털 호스트가 받은 메뉴 트리를 올린다(null = 아직 없음). */
export function publishPortalMenu(items: PortalShellMenuItem[] | null): void {
  const s = store();
  s.pageIds = items ? collectMenuPageIds(items) : null;
  s.items = items;
  s.listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  const s = store();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

const getSnapshot = () => store().pageIds;
const getItemsSnapshot = () => store().items ?? null;
const getServerSnapshot = () => null;

/** 내가 열 수 있는 화면 pageId 집합(포털이 메뉴를 받기 전이면 null). */
export function usePortalMenuPageIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 포털이 받아 둔 내 메뉴 트리(받기 전이면 null). 추가 조회 없이 읽는다. */
export function usePortalMenuItems(): PortalShellMenuItem[] | null {
  return useSyncExternalStore(subscribe, getItemsSnapshot, getServerSnapshot);
}
