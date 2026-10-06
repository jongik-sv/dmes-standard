"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";

import { useTabPage } from "../portal-shell/tab-page-context";
import { screenApplyStore } from "./apply-store";
import { screenContextStore } from "./store";
import type {
  ScreenApply,
  ScreenApplyHandler,
  ScreenContext,
  ScreenContextSource,
  ScreenContextValue,
} from "./types";

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
  /** 이 게시자의 소유자 id. 받기 처리기를 같은 소유자로 등록하면(`useScreenApplyHandler` 의 owner) 이 게시자가 마지막으로 고른 곳일 때 우선한다. */
  owner: string;
  /** 문맥을 게시한다. 포털 탭 밖(탭 id·pageId 모두 없음)이면 아무것도 하지 않는다. */
  publish(values: Record<string, ScreenContextValue>, source?: ScreenContextSource): void;
  /** 이 게시자가 지금 이 탭 문맥의 마지막 게시자인가(다른 곳이 이어받았으면 false). 사용자 조작이 아닌 갱신(데이터 새로 고침 등)이 남의 문맥을 빼앗지 않게 거른다. */
  owned(): boolean;
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
  const owned = useCallback(() => !!ref.current.key && screenContextStore.owns(ref.current.key, owner), [owner]);
  const clear = useCallback(() => {
    if (ref.current.key) screenContextStore.clear(ref.current.key, owner);
  }, [owner]);

  // 키(탭)가 바뀌거나 언마운트하면 옛 키에 남긴 문맥을 거둔다.
  useEffect(() => {
    return () => {
      if (key) screenContextStore.clear(key, owner);
    };
  }, [key, owner]);

  return useMemo(() => ({ owner, publish, owned, clear }), [owner, publish, owned, clear]);
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
  const { tabId, pageId } = useTabPage();
  const active = enabled && values != null;
  // 마지막으로 게시한 내용을 기억해 내용이 바뀔 때만 다시 게시한다. 같은 내용을 렌더마다 다시 게시하면, 그 사이 다른 게시자(그리드의 행 선택)가
  // 가져간 소유권을 값이 같다는 이유로 되가져와 그리드의 후속 갱신·받기 우선권을 깬다.
  const lastRef = useRef<{ key: string; source: string; values: Record<string, ScreenContextValue> } | null>(null);
  const key = screenContextKey(tabId, pageId);
  // 효과 정리(탭 바뀜·언마운트·StrictMode 의 모의 언마운트)로 저장소 쪽 문맥이 거둬지므로 기억도 함께 지워 다시 게시하게 한다.
  useEffect(
    () => () => {
      lastRef.current = null;
    },
    [key]
  );
  useEffect(() => {
    if (!active) {
      lastRef.current = null;
      return;
    }
    const last = lastRef.current;
    const v = values as Record<string, ScreenContextValue>;
    if (last && last.key === key && last.source === source && shallowEqualValues(last.values, v)) return;
    lastRef.current = { key, source, values: { ...v } };
    publish(v, source);
  });
  useEffect(() => {
    if (!active) clear();
  }, [active, clear]);
}

function shallowEqualValues(a: Record<string, ScreenContextValue>, b: Record<string, ScreenContextValue>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (!Object.prototype.hasOwnProperty.call(b, k) || a[k] !== b[k]) return false;
  return true;
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

export interface ScreenApplyHandlerOptions {
  /** false 면 등록하지 않는다(기본 true). */
  enabled?: boolean;
  /** 소유자 id. 그리드처럼 문맥도 게시하는 곳은 게시자의 `owner` 를 넘겨 「마지막으로 고른 곳」 의 처리기가 먼저 쓰이게 한다. 없으면 훅이 하나 만든다. */
  owner?: string;
}

/**
 * 화면이 위젯의 값 넣기 요청을 받는다(역방향 통로). 처리기는 ref 로 읽으므로 렌더마다 새 함수를 넘겨도 다시 등록하지 않는다.
 * 활성 탭의 위젯만 부를 수 있고(도크가 활성 탭의 처리기만 연결), 언마운트(탭 닫힘)하면 등록을 거둔다. 포털 탭 밖이면 하는 일이 없다.
 */
export function useScreenApplyHandler(handler: ScreenApplyHandler | null | undefined, opts: ScreenApplyHandlerOptions = {}): void {
  const { tabId, pageId } = useTabPage();
  const ownId = useId();
  const { enabled = true, owner = ownId } = opts;
  const key = screenContextKey(tabId, pageId);
  const ref = useRef(handler);
  ref.current = handler;
  const active = enabled && !!handler && !!key;
  useEffect(() => {
    if (!active) return;
    return screenApplyStore.register(key, owner, (values, o) =>
      ref.current ? ref.current(values, o) : { applied: [], skipped: Object.keys(values) }
    );
  }, [active, key, owner]);
}

/**
 * 역방향 통로를 구독한다. tabId 는 도크 호스트가 활성 탭 id 를 넘긴다(없으면 이 화면의 탭). 받는 쪽이 없으면 available=false.
 * 받는 쪽이 생기거나 사라질 때만 새 값을 돌려주고, apply 는 부르는 순간의 처리기에 값을 넘긴다.
 */
export function useScreenApply(tabId?: string | null): ScreenApply {
  const page = useTabPage();
  const key = tabId === undefined ? screenContextKey(page.tabId, page.pageId) : tabId || "";
  const getSnapshot = useCallback(() => (key ? screenApplyStore.has(key) : false), [key]);
  const available = useSyncExternalStore(screenApplyStore.subscribe, getSnapshot, () => false);
  return useMemo<ScreenApply>(
    () => ({ available, apply: (values, o) => screenApplyStore.apply(key, values, o) }),
    [available, key]
  );
}
