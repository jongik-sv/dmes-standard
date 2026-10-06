import { screenContextEqual } from "./normalize-key";
import type { ScreenContext } from "./types";

/**
 * 화면 문맥 저장소: 탭(탭 id, 없으면 pageId)마다 문맥 한 건을 보관한다.
 * shared 는 tsup 에서 여러 entry 로 나뉘어(splitting: false) 같은 모듈이 entry 마다 inline 된다.
 * 저장소를 모듈 변수로 두면 화면(grid entry)이 게시한 값을 도크(portal-shell entry)가 못 보므로 tab-page-context.ts 처럼 globalThis 에 단일 인스턴스를 둔다.
 */
export interface ScreenContextStore {
  /** 문맥을 게시한다. 값이 그대로면 아무것도 바꾸지 않고 false 를 돌려준다(재렌더 없음). */
  publish(key: string, owner: string, ctx: Omit<ScreenContext, "at"> & { at?: number }): boolean;
  /** owner 가 게시한 문맥일 때만 지운다. 다른 게시자가 이어받았으면 남긴다. */
  clear(key: string, owner: string): boolean;
  /** 소유자와 상관없이 탭의 문맥을 지운다(탭 닫힘). */
  clearTab(key: string): boolean;
  /** owner 가 지금 그 탭 문맥의 마지막 게시자인가. */
  owns(key: string, owner: string): boolean;
  /** 그 탭 문맥의 마지막 게시자(없으면 null). 받기 처리기를 고를 때 쓴다. */
  ownerOf(key: string): string | null;
  get(key: string): ScreenContext | null;
  subscribe(listener: () => void): () => void;
}

interface Entry {
  owner: string;
  ctx: ScreenContext;
}

function createScreenContextStore(): ScreenContextStore {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of Array.from(listeners)) l();
  };
  return {
    publish(key, owner, ctx) {
      if (!key) return false;
      const prev = entries.get(key);
      const next: ScreenContext = { ...ctx, at: ctx.at ?? Date.now() };
      if (prev && prev.owner === owner && screenContextEqual(prev.ctx, next)) return false;
      // 다른 게시자가 같은 값을 다시 게시해도 소유자는 바뀌어야(마지막 게시자가 이긴다) 하므로 값이 같아도 소유자만 갱신한다.
      if (prev && screenContextEqual(prev.ctx, next)) {
        entries.set(key, { owner, ctx: prev.ctx });
        return false;
      }
      entries.set(key, { owner, ctx: next });
      emit();
      return true;
    },
    clear(key, owner) {
      const prev = entries.get(key);
      if (!prev || prev.owner !== owner) return false;
      entries.delete(key);
      emit();
      return true;
    },
    clearTab(key) {
      if (!entries.delete(key)) return false;
      emit();
      return true;
    },
    ownerOf: (key) => entries.get(key)?.owner ?? null,
    owns: (key, owner) => entries.get(key)?.owner === owner,
    get: (key) => entries.get(key)?.ctx ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const GLOBAL_KEY = "__dkOasisScreenContextStore__";

interface GlobalCache {
  [GLOBAL_KEY]?: ScreenContextStore;
}

const cache = globalThis as unknown as GlobalCache;

export const screenContextStore: ScreenContextStore =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createScreenContextStore());
