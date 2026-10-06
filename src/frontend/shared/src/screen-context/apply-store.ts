import { screenContextStore } from "./store";
import type { ScreenApplyHandler, ScreenApplyOptions, ScreenApplyResult, ScreenContextValue } from "./types";

/**
 * 받기 처리기 저장소: 탭(탭 id, 없으면 pageId)마다 화면이 등록한 처리기를 보관한다(역방향 통로).
 * 한 탭에 처리기가 여럿이면(그리드 여러 개) 그 탭 문맥의 마지막 게시자(= 사용자가 마지막으로 행을 고른 그리드)의 처리기를 먼저 쓰고,
 * 없으면 마지막으로 등록한 처리기를 쓴다. 저장소 단일 인스턴스는 store.ts 와 같은 이유로 globalThis 에 둔다.
 */
export interface ScreenApplyStore {
  /** 처리기를 등록한다. 돌려주는 함수가 등록을 거둔다. */
  register(key: string, owner: string, handler: ScreenApplyHandler): () => void;
  has(key: string): boolean;
  /** 탭의 처리기에 값을 넘긴다. 처리기가 없으면 모든 키를 skipped 로 돌려준다. */
  apply(key: string, values: Record<string, ScreenContextValue>, opts?: ScreenApplyOptions): Promise<ScreenApplyResult>;
  subscribe(listener: () => void): () => void;
}

function createScreenApplyStore(): ScreenApplyStore {
  // key → (owner → handler). Map 은 삽입 순서를 지키므로 마지막 항목이 마지막 등록이다.
  const handlers = new Map<string, Map<string, ScreenApplyHandler>>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of Array.from(listeners)) l();
  };
  return {
    register(key, owner, handler) {
      if (!key) return () => {};
      let byOwner = handlers.get(key);
      if (!byOwner) handlers.set(key, (byOwner = new Map()));
      const hadAny = byOwner.size > 0;
      byOwner.delete(owner);
      byOwner.set(owner, handler);
      if (!hadAny) emit();
      return () => {
        const cur = handlers.get(key);
        if (!cur || cur.get(owner) !== handler) return;
        cur.delete(owner);
        if (cur.size === 0) {
          handlers.delete(key);
          emit();
        }
      };
    },
    has: (key) => (handlers.get(key)?.size ?? 0) > 0,
    async apply(key, values, opts) {
      const byOwner = handlers.get(key);
      if (!byOwner || byOwner.size === 0) return { applied: [], skipped: Object.keys(values) };
      const preferred = screenContextStore.ownerOf(key);
      const handler = (preferred != null ? byOwner.get(preferred) : undefined) ?? Array.from(byOwner.values()).pop()!;
      return handler(values, opts);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const GLOBAL_KEY = "__dkOasisScreenApplyStore__";

interface GlobalCache {
  [GLOBAL_KEY]?: ScreenApplyStore;
}

const cache = globalThis as unknown as GlobalCache;

export const screenApplyStore: ScreenApplyStore = cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createScreenApplyStore());
