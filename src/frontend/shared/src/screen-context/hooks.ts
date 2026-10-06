"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";

import { useTabPage } from "../portal-shell/tab-page-context";
import { screenContextStore } from "./store";
import type { ScreenContext, ScreenContextSource, ScreenContextValue } from "./types";

export interface PublishScreenContextOptions {
  /** 문맥 출처. 기본 "form". 그리드가 자동 게시할 때는 "grid". */
  source?: ScreenContextSource;
  /** false 면 게시하지 않고 이미 게시한 것도 거둔다(기본 true). */
  enabled?: boolean;
}

/** 저장소 키: 탭 id 가 있으면 탭 id, 없으면 pageId. 같은 화면을 탭 두 개로 열어도 문맥이 섞이지 않는다. */
export function screenContextKey(tabId: string | undefined, pageId: string): string {
  return tabId || pageId;
}

export interface ScreenContextPublisher {
  /** 문맥을 게시한다. 포털 탭 밖(탭 id·pageId 모두 없음)이면 아무것도 하지 않는다. */
  publish(values: Record<string, ScreenContextValue>, source?: ScreenContextSource): void;
  /** 이 게시자가 게시한 문맥을 거둔다(다른 게시자가 이어받았으면 남긴다). */
  clear(): void;
}

/**
 * 명령형 게시자. 그리드처럼 이벤트(행 선택)마다 게시하는 곳이 쓴다. 게시자별로 소유자 id 를 하나 갖고,
 * 언마운트(탭 닫힘 포함)하면 자기가 게시한 문맥을 거둔다.
 */
export function useScreenContextPublisher(): ScreenContextPublisher {
  const { tabId, pageId } = useTabPage();
  const owner = useId();
  const key = screenContextKey(tabId, pageId);
  const ref = useRef({ key, tabId: tabId ?? "", pageId });
  ref.current = { key, tabId: tabId ?? "", pageId };

  const publish = useCallback(
    (values: Record<string, ScreenContextValue>, source: ScreenContextSource = "form") => {
      const cur = ref.current;
      if (!cur.key) return;
      screenContextStore.publish(cur.key, owner, { source, tabId: cur.tabId, pageId: cur.pageId, values });
    },
    [owner]
  );
  const clear = useCallback(() => {
    if (ref.current.key) screenContextStore.clear(ref.current.key, owner);
  }, [owner]);

  // 키(탭)가 바뀌거나 언마운트하면 옛 키에 남긴 문맥을 거둔다.
  useEffect(() => {
    return () => {
      if (key) screenContextStore.clear(key, owner);
    };
  }, [key, owner]);

  return { publish, clear };
}

/**
 * 화면이 직접 문맥을 게시한다. values 의 내용이 바뀔 때만 다시 게시하고(얕은 비교), 언마운트하면 거둔다.
 * 객체를 렌더마다 새로 만들어 넘겨도 내용이 같으면 저장소·구독자가 다시 그려지지 않는다.
 */
export function usePublishScreenContext(
  values: Record<string, ScreenContextValue> | null | undefined,
  opts: PublishScreenContextOptions = {}
): void {
  const { source = "form", enabled = true } = opts;
  const { publish, clear } = useScreenContextPublisher();
  const active = enabled && values != null;
  useEffect(() => {
    if (!active) return;
    publish(values as Record<string, ScreenContextValue>, source);
    // values 객체 참조가 아니라 내용으로 비교한다 — 저장소가 같은 값 게시를 걸러낸다.
  });
  useEffect(() => {
    if (!active) clear();
  }, [active, clear]);
}

/**
 * 문맥을 구독한다. tabId 를 주면 그 탭의 문맥(도크 호스트가 활성 탭 id 를 넘긴다), 없으면 이 화면이 속한 탭의 문맥이다.
 * 탭을 찾을 수 없거나 게시된 문맥이 없으면 null.
 */
export function useScreenContext(tabId?: string | null): ScreenContext | null {
  const page = useTabPage();
  const key = tabId === undefined ? screenContextKey(page.tabId, page.pageId) : tabId || "";
  const getSnapshot = useCallback(() => (key ? screenContextStore.get(key) : null), [key]);
  return useSyncExternalStore(screenContextStore.subscribe, getSnapshot, () => null);
}
