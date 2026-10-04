"use client";

/**
 * 포털이 이미 받아 둔 즐겨찾기 목록(secFavorite/search)을 홈 위젯이 다시 조회하지 않고 읽게 하는 작은 저장소.
 * - 쓰기: app/portal/page.tsx 가 usePortalFavorites 결과를 받을 때마다 publishPortalFavorites 로 올린다(사이드바와 같은 목록).
 * - 읽기: 바로가기 위젯이 usePublishedPortalFavorites() 로 받는다(포털 밖이거나 받기 전이면 null — 위젯이 직접 조회한다).
 * 진입 때 사이드바·위젯이 같은 목록을 따로 부르던 중복을 없앤다(widget-render-findings W4, Screen-Performance-Guide R16).
 * 화면 묶음이 여러 번 실려도 같은 저장소를 쓰도록 globalThis 에 둔다(portal-menu-store 와 같은 방식).
 */
import { useSyncExternalStore } from "react";
import type { PortalFavoriteMenuRecord } from "@dk-oasis/shared/portal-menu";

interface FavoritesStore {
  favorites: readonly PortalFavoriteMenuRecord[] | null;
  listeners: Set<() => void>;
}

const STORE_KEY = "__dmesPortalFavoritesStore__";

function store(): FavoritesStore {
  const g = globalThis as unknown as Record<string, FavoritesStore | undefined>;
  if (!g[STORE_KEY]) g[STORE_KEY] = { favorites: null, listeners: new Set() };
  return g[STORE_KEY] as FavoritesStore;
}

/** 포털 호스트가 받은 즐겨찾기 목록을 올린다(null = 아직 없음·포털이 내려감). */
export function publishPortalFavorites(favorites: readonly PortalFavoriteMenuRecord[] | null): void {
  const s = store();
  if (s.favorites === favorites) return;
  s.favorites = favorites;
  s.listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  const s = store();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

const getSnapshot = () => store().favorites;
const getServerSnapshot = () => null;

/** 포털이 받아 둔 즐겨찾기 목록(포털 밖이거나 받기 전이면 null). 추가 조회 없이 읽는다. */
export function usePublishedPortalFavorites(): readonly PortalFavoriteMenuRecord[] | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
