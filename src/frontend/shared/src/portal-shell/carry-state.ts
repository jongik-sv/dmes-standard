import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/*
 * 포털 탭 「새 창으로 분리」 때 화면 상태를 이어받는 장치(설계 2026-10-06-popout-carry-state-design §4).
 *
 * - 화면은 useState 대신 useCarryState 를 쓴다. 컨텍스트 밖(포털·분리 창이 아닌 곳, 시험)에서는 useState 와 똑같다.
 * - 상태를 상시 기록하지 않는다. 화면이 "지금 값을 돌려주는 함수(getter)" 를 탭 단위 등록소에 ref 로 올려 두고,
 *   셸이 분리 버튼을 누른 순간에 동기로 한 번 모은다(collect). 그래서 렌더가 늘지 않고 탭 snapshot 저장소에도 쓰지 않는다.
 * - 값은 light(조건·선택 키 등 작은 값)와 bulky(조회 결과 행 등 큰 값)로 나뉜다. bulky 는 같은 브라우저의 opener 메모리로만 가고,
 *   opener 를 못 쓰면 빠진 채 복원되어 useCarryRefetch 가 한 번 재조회한다.
 * - 옮길 수 있는 값은 JSON 으로 표현되는 것뿐이다. 함수·Map·Set 은 옮기지 않고, Date 는 문자열로 바뀐다(opener 경로는 structuredClone 이라 Date 가
 *   남지만 handoff·새로고침 경로는 JSON 이다 — Date 를 상태에 두지 말고 문자열로 둔다).
 * - 미저장 편집 중인 행도 화면 상태에 있으면 그대로 옮긴다(분리는 원래 탭을 닫는 "옮기기"다). 열려 있는 셀 편집기의 값은 그리드 안에만 있어 빠질 수 있다.
 */

export interface CarryEntry {
  /** 지금 값을 돌려준다. 렌더 중이 아니라 collect 때 불린다. */
  get: () => unknown;
  /** true 면 조회 결과 같은 큰 값 — localStorage handoff 에 담지 않는다. */
  bulky: boolean;
}

export interface CarryCollected {
  light: Record<string, unknown>;
  bulky: Record<string, unknown>;
}

export interface CarryRegistry {
  /** key 를 등록하고 해제 함수를 돌려준다. 같은 key 를 두 번 등록하면 개발 모드에서 경고하고 나중 것이 이긴다. */
  register: (key: string, entry: CarryEntry) => () => void;
  /** 등록된 getter 를 모두 불러 light·bulky 로 나눈다. getter 가 던지면 그 key 만 뺀다. */
  collect: () => CarryCollected;
}

export function createCarryRegistry(): CarryRegistry {
  const entries = new Map<string, CarryEntry>();
  return {
    register(key, entry) {
      if (entries.has(key) && process.env.NODE_ENV !== "production") {
        console.warn(`[carry-state] 같은 key 를 두 번 등록했다: "${key}" — 화면 안에서 key 는 유일해야 한다`);
      }
      entries.set(key, entry);
      return () => {
        // 나중에 같은 key 로 다시 등록된 것을 지우지 않는다.
        if (entries.get(key) === entry) entries.delete(key);
      };
    },
    collect() {
      const light: Record<string, unknown> = {};
      const bulky: Record<string, unknown> = {};
      for (const [key, entry] of entries) {
        try {
          (entry.bulky ? bulky : light)[key] = entry.get();
        } catch (err) {
          console.warn(`[carry-state] "${key}" 값을 모으지 못해 뺀다`, err);
        }
      }
      return { light, bulky };
    },
  };
}

/** 분리 창이 이어받은 값. bulky 가 null 이면 큰 값이 오지 못한 것이고, hadBulky 는 원래 큰 값이 있었는지다. */
export interface CarryRestore {
  light: Record<string, unknown> | null;
  bulky: Record<string, unknown> | null;
  hadBulky: boolean;
}

interface CarryContextValue {
  registry: CarryRegistry;
  restore: CarryRestore | null;
  /** provider 단위 — StrictMode 이중 effect·화면 재마운트에서도 자동 재조회를 한 번만 한다. */
  flags: { refetched: boolean };
}

/**
 * shared 는 tsup 에서 여러 entry 로 나뉘어 빌드되고(splitting: false) 각 entry 가 이 모듈을 inline 하면 createContext 인스턴스가 중복된다
 * (Provider 와 Consumer 가 다른 Context 를 참조 → 값 전달 실패). tab-page-context.ts 와 같이 globalThis 에 캐시해 하나를 공유한다.
 */
const GLOBAL_KEY = "__dkOasisCarryStateContext__";

interface GlobalCache {
  [GLOBAL_KEY]?: Context<CarryContextValue | null>;
}

const cache = globalThis as unknown as GlobalCache;

const CarryStateContext: Context<CarryContextValue | null> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createContext<CarryContextValue | null>(null));

export interface CarryStateProviderProps {
  registry: CarryRegistry;
  /** 이어받은 값. 포털 탭에서는 null — 등록만 하고 복원은 없다. 마운트 동안 바뀌지 않는 값을 넘긴다. */
  restore: CarryRestore | null;
  children?: ReactNode;
}

export function CarryStateProvider({ registry, restore, children }: CarryStateProviderProps): ReactNode {
  const value = useMemo<CarryContextValue>(() => ({ registry, restore, flags: { refetched: false } }), [registry, restore]);
  return createElement(CarryStateContext.Provider, { value }, children);
}

/**
 * useState 와 같다. 분리 창에서는 원래 탭의 값으로 시작한다.
 * key 는 화면 안에서만 유일하면 된다. opts.bulky 는 조회 결과 행 같은 큰 값에 켠다.
 */
export function useCarryState<T>(
  key: string,
  initial: T | (() => T),
  opts?: { bulky?: boolean }
): [T, Dispatch<SetStateAction<T>>] {
  const ctx = useContext(CarryStateContext);
  const bulky = opts?.bulky === true;
  const [value, setValue] = useState<T>(() => {
    const source = ctx?.restore ? (bulky ? ctx.restore.bulky : ctx.restore.light) : null;
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key] as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  // getter 가 읽을 최신 값 — ref 에만 두므로 등록이 렌더를 늘리지 않는다.
  const valueRef = useRef(value);
  valueRef.current = value;
  const registry = ctx?.registry ?? null;
  useEffect(() => {
    if (!registry) return undefined;
    return registry.register(key, { get: () => valueRef.current, bulky });
  }, [registry, key, bulky]);
  return [value, setValue];
}

/**
 * 큰 값(행 등)이 빠진 채 복원됐을 때 마운트 뒤 한 번 refetch 를 부른다(원래 큰 값이 있었던 경우만).
 * 화면당 한 번만 둔다 — 호출 여부는 provider 단위 플래그로 막으므로 둘째 호출은 불리지 않는다.
 * refetch 는 매 렌더 새 함수여도 된다(최신 것을 ref 로 읽는다).
 */
export function useCarryRefetch(refetch: () => void): void {
  const ctx = useContext(CarryStateContext);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    const restore = ctx?.restore;
    if (!ctx || !restore || !restore.hadBulky || restore.bulky !== null) return;
    if (ctx.flags.refetched) return;
    ctx.flags.refetched = true;
    refetchRef.current();
  }, [ctx]);
}

/** 이번 마운트가 이어받은 값으로 시작했는가 — 마운트 자동 조회·초기화 effect 를 건너뛸 때 쓴다. */
export function useCarryRestored(): boolean {
  const restore = useContext(CarryStateContext)?.restore;
  return restore != null && (restore.light !== null || restore.bulky !== null);
}
