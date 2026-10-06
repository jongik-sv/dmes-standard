import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type Context,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";

/*
 * 포털 탭 「새 창으로 분리」 때 화면 상태를 이어받는 장치(설계 2026-10-06-popout-carry-state-design §4).
 *
 * - 화면은 useState 대신 useCarryState 를 쓴다. 컨텍스트 밖(포털·분리 창이 아닌 곳, 시험)에서는 useState 와 똑같다.
 * - 상태를 상시 기록하지 않는다. 화면이 "지금 값을 돌려주는 함수(getter)" 를 탭 단위 등록소에 ref 로 올려 두고,
 *   셸이 분리 버튼을 누른 순간에 동기로 한 번 모은다(collect). 그래서 렌더가 늘지 않고 탭 snapshot 저장소에도 쓰지 않는다.
 * - 값은 light(조건·선택 키 등 작은 값)와 bulky(조회 결과 행 등 큰 값)로 나뉜다. bulky 는 같은 브라우저의 opener 메모리로만 가고,
 *   opener 를 못 쓰면 빠진 채 복원되어 useCarryRefetch 가 한 번 재조회한다.
 * - 옮길 수 있는 값은 JSON 으로 표현되는 것뿐이다. 세 경로(opener·handoff·새로고침) 모두 JSON 왕복으로 값 타입을 같게 한다 — 함수·Map·Set 은 사라지고
 *   Date 는 문자열로 바뀐다. Date·Set·Map·클래스 인스턴스를 상태에 두지 말고 일반 객체·배열·원시값(날짜는 문자열)으로 둔다.
 *   개발 모드에서는 collect 때 그런 값을 key 이름과 함께 console.warn 한다.
 * - 같은 key 는 한 번만 복원한다. 복원값을 쓴 key 는 이후 마운트되는 같은 key 가 일반 초기값으로 시작한다(화면 안 목록 재마운트가 옛 값을 되살리지 않게).
 * - 미저장 편집 중인 행도 화면 상태에 있으면 그대로 옮긴다(분리는 원래 탭을 닫는 "옮기기"다). 열려 있는 셀 편집기의 값은 그리드 안에만 있어 빠질 수 있다.
 */

export interface CarryEntry {
  /** 지금 값을 돌려준다. 렌더 중이 아니라 collect 때 불린다. */
  get: () => unknown;
  /** true 면 조회 결과 같은 큰 값 — localStorage handoff 에 담지 않는다. */
  bulky: boolean;
  /** true 면 getter 가 null·undefined 를 돌려줄 때 collect 결과에 그 key 를 넣지 않는다(useCarryValue — 담을 값이 없는 부품이 빈 carry 를 만들지 않게). */
  omitNullish?: boolean;
}

export interface CarryCollected {
  light: Record<string, unknown>;
  bulky: Record<string, unknown>;
}

/** 분리 창이 이어받은 값. bulky 가 null 이면 큰 값이 오지 못한 것이고, hadBulky 는 원래 큰 값이 있었는지다. */
export interface CarryRestore {
  light: Record<string, unknown> | null;
  bulky: Record<string, unknown> | null;
  hadBulky: boolean;
}

/**
 * 원래 탭에 "조회한 결과" 가 있었는가. null·undefined·빈 배열은 조회한 적 없는(또는 비어 있는) 것으로 보고 세지 않는다 —
 * 조회하지 않은 탭을 분리했는데 새 창이 전체 조회를 시작하지 않게 한다. 그 밖의 값은 센다.
 */
export function hasCarriedBulky(bulky: Record<string, unknown>): boolean {
  return Object.values(bulky).some((value) => value != null && !(Array.isArray(value) && value.length === 0));
}

/** JSON 으로 그대로 옮길 수 있는 모양인가(원시값·배열·일반 객체). 아니면 그 종류 이름을, 맞으면 null 을 돌려준다. */
function nonJsonKind(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return null;
  if (type !== "object") return type === "function" ? "함수" : type;
  if (Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value) as object | null;
  // 다른 창(realm)의 Object.prototype 도 일반 객체로 본다.
  if (proto === null || proto === Object.prototype || Object.getPrototypeOf(proto) === null) return null;
  return (value as { constructor?: { name?: string } }).constructor?.name || "클래스 인스턴스";
}

/** 개발 모드 점검 — 값 자체와 배열이면 첫 원소만 본다(비용을 작게). */
function warnIfNotJson(key: string, value: unknown): void {
  const kind = nonJsonKind(value) ?? (Array.isArray(value) && value.length > 0 ? nonJsonKind(value[0]) : null);
  if (kind) {
    console.warn(
      `[carry-state] "${key}" 에 JSON 으로 옮길 수 없는 값(${kind})이 있다 — 새 창에서 사라지거나 모양이 바뀐다. 일반 객체·배열·원시값(날짜는 문자열)으로 둔다`
    );
  }
}

export interface CarryRegistry {
  /** key 를 등록하고 해제 함수를 돌려준다. 같은 key 를 두 번 등록하면 개발 모드에서 경고하고 나중 것이 이긴다. */
  register: (key: string, entry: CarryEntry) => () => void;
  /** 등록된 getter 를 모두 불러 light·bulky 로 나눈다. getter 가 던지면 그 key 만 뺀다. */
  collect: () => CarryCollected;
  /** (분리 창) key 의 복원값을 돌려준다. 이미 쓴 key·없는 key 는 null. 쓴 것으로 표시하지 않는다 — markRestoredUsed 로 한다. */
  peekRestored: (key: string, bulky: boolean) => { value: unknown } | null;
  /** (분리 창) 이 key 가 복원값을 썼다고 표시한다. 큰 값(bulky) key 가 모두 쓰였으면 복원값 참조를 놓는다. */
  markRestoredUsed: (key: string) => void;
  /** (분리 창) 아직 어떤 key 도 복원값을 쓰지 않은 처음 마운트인가. */
  isFreshRestore: () => boolean;
  /** (분리 창) 큰 값이 빠진 채 복원됐고 아직 재조회를 시작하지 않았으면 시작으로 표시하고 true. */
  startRefetch: () => boolean;
  /** (분리 창) 재조회가 끝났다고 표시한다. */
  settleRefetch: () => void;
  /** (분리 창) 새로고침용으로 저장할 hadBulky — 지금 큰 값이 있거나, 이어받은 hadBulky 의 재조회가 아직 안 끝났으면 true. */
  hadBulkyForReload: (collectedBulky: Record<string, unknown>) => boolean;
}

/** restore 는 분리 창에서만 준다(포털 탭은 null — 등록만 하고 복원은 없다). */
export function createCarryRegistry(restore: CarryRestore | null = null): CarryRegistry {
  const entries = new Map<string, CarryEntry>();
  let current = restore;
  const inheritedHadBulky = restore?.hadBulky === true;
  const used = new Set<string>();
  let refetchStarted = false;
  let refetchPending = false;

  const releaseBulkyIfAllUsed = () => {
    const bulky = current?.bulky;
    if (!current || !bulky) return;
    const keys = Object.keys(bulky);
    if (keys.length === 0 || !keys.every((k) => used.has(k))) return;
    // 큰 값(행 등)을 장기 보유하지 않는다 — state 가 값을 들고 있으니 복원 쪽 참조는 놓는다.
    current = { light: current.light, bulky: {}, hadBulky: current.hadBulky };
  };

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
      const dev = process.env.NODE_ENV !== "production";
      for (const [key, entry] of entries) {
        try {
          const value = entry.get();
          if (entry.omitNullish && value == null) continue;
          if (dev) warnIfNotJson(key, value);
          (entry.bulky ? bulky : light)[key] = value;
        } catch (err) {
          console.warn(`[carry-state] "${key}" 값을 모으지 못해 뺀다`, err);
        }
      }
      return { light, bulky };
    },
    peekRestored(key, bulky) {
      if (!current || used.has(key)) return null;
      const source = bulky ? current.bulky : current.light;
      if (source && Object.prototype.hasOwnProperty.call(source, key)) return { value: source[key] };
      return null;
    },
    markRestoredUsed(key) {
      if (!current) return;
      used.add(key);
      releaseBulkyIfAllUsed();
    },
    isFreshRestore() {
      return current != null && used.size === 0 && (current.light !== null || current.bulky !== null);
    },
    startRefetch() {
      if (!current || !current.hadBulky || current.bulky !== null || refetchStarted) return false;
      refetchStarted = true;
      refetchPending = true;
      return true;
    },
    settleRefetch() {
      refetchPending = false;
    },
    hadBulkyForReload(collectedBulky) {
      return hasCarriedBulky(collectedBulky) || (inheritedHadBulky && refetchPending);
    },
  };
}

/**
 * 탭 id → 그 탭 화면의 등록소. 셸이 탭마다 하나씩 들고 있다가 분리 순간에 그 탭의 값을 모은다.
 * prune 은 열린 탭 목록에서 사라진 탭의 등록소를 지운다.
 */
export interface CarryRegistryMap {
  /** 없으면 만든다(렌더 중 불려도 같은 탭에는 늘 같은 객체). */
  get: (tabId: string) => CarryRegistry;
  /** 만들지 않고 찾는다. */
  peek: (tabId: string) => CarryRegistry | undefined;
  prune: (openTabIds: Iterable<string>) => void;
  readonly size: number;
}

export function createCarryRegistryMap(): CarryRegistryMap {
  const map = new Map<string, CarryRegistry>();
  return {
    get(tabId) {
      let registry = map.get(tabId);
      if (!registry) {
        registry = createCarryRegistry();
        map.set(tabId, registry);
      }
      return registry;
    },
    peek: (tabId) => map.get(tabId),
    prune(openTabIds) {
      const open = new Set(openTabIds);
      for (const id of [...map.keys()]) if (!open.has(id)) map.delete(id);
    },
    get size() {
      return map.size;
    },
  };
}

/**
 * shared 는 tsup 에서 여러 entry 로 나뉘어 빌드되고(splitting: false) 각 entry 가 이 모듈을 inline 하면 createContext 인스턴스가 중복된다
 * (Provider 와 Consumer 가 다른 Context 를 참조 → 값 전달 실패). tab-page-context.ts 와 같이 globalThis 에 캐시해 하나를 공유한다.
 */
const GLOBAL_KEY = "__dkOasisCarryStateContext__";

interface GlobalCache {
  [GLOBAL_KEY]?: Context<CarryRegistry | null>;
}

const cache = globalThis as unknown as GlobalCache;

const CarryStateContext: Context<CarryRegistry | null> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createContext<CarryRegistry | null>(null));

export interface CarryStateProviderProps {
  /** 화면 하나의 등록소. 분리 창은 이어받은 값을 넣어 만든 것(createCarryRegistry(restore)), 포털 탭은 값 없이 만든 것이다. 마운트 동안 같은 객체를 넘긴다. */
  registry: CarryRegistry;
  children?: ReactNode;
}

export function CarryStateProvider({ registry, children }: CarryStateProviderProps): ReactNode {
  return createElement(CarryStateContext.Provider, { value: registry }, children);
}

/**
 * useState 와 같다. 분리 창에서는 원래 탭의 값으로 시작한다(같은 key 는 한 번만 — 그 뒤 마운트되는 같은 key 는 일반 초기값).
 * key 는 화면 안에서만 유일하면 된다. opts.bulky 는 사용자가 조회한 결과 배열 같은 큰 값에 켠다(마운트 때 다시 받는 목록은 켜지 않는다).
 */
export function useCarryState<T>(
  key: string,
  initial: T | (() => T),
  opts?: { bulky?: boolean }
): [T, Dispatch<SetStateAction<T>>] {
  const registry = useContext(CarryStateContext);
  const bulky = opts?.bulky === true;
  const [value, setValue] = useState<T>(() => {
    const restored = registry?.peekRestored(key, bulky);
    if (restored) return restored.value as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  // getter 가 읽을 최신 값 — ref 에만 두므로 등록이 렌더를 늘리지 않는다.
  // 커밋된 값만 담는다(렌더 중에 쓰면 버려진 동시성 렌더의 값이 분리 순간에 모일 수 있다).
  const valueRef = useRef(value);
  useIsomorphicLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    if (!registry) return undefined;
    // "썼다" 표시는 렌더가 아니라 등록 effect 에서 한다 — StrictMode 이중 렌더·이중 effect 에서도 첫 마운트가 복원값을 받는다.
    registry.markRestoredUsed(key);
    return registry.register(key, { get: () => valueRef.current, bulky });
  }, [registry, key, bulky]);
  return [value, setValue];
}

/**
 * 화면 상태(useState)를 따로 두지 않는 공통 부품(AgDataGrid 등)이 쓰는 저수준 훅. 값 자체는 부품 안에 있으므로 getter 만 light 로 등록하고,
 * 분리 창에서는 그 key 의 복원값을 돌려준다(없으면 undefined). 복원값은 마운트 때 한 번 읽어 그 컴포넌트가 계속 들고 있다 —
 * useCarryState 와 같은 규칙으로 key 당 한 번만 쓰이고(StrictMode 이중 effect 에서도 첫 마운트가 받는다), 컨텍스트 밖에서는 등록도 복원도 없다.
 * key 가 null 이면 아무것도 하지 않는다. opts.accept 는 마운트 effect 에서 한 번 불러 false 면 등록하지 않는다(DOM 위치로 판정할 때).
 * getter 는 collect 때 불린다 — 렌더 중이 아니고, 던지면 그 key 만 빠진다. null·undefined 를 돌려주면 그 key 도 collect 결과에 넣지 않는다
 * (담을 값이 없는 부품만 있는 화면이 분리 때 빈 carry 를 만들지 않게 — useCarryState 는 null 도 값이라 그대로 담는다). 반환값은 JSON 으로 옮길 수 있어야 한다.
 */
export function useCarryValue<T>(
  key: string | null | undefined,
  getter: () => T,
  opts?: { accept?: () => boolean }
): T | undefined {
  const registry = useContext(CarryStateContext);
  const [restored] = useState<{ value: unknown } | null>(() => (key && registry ? registry.peekRestored(key, false) : null));
  const getterRef = useRef(getter);
  getterRef.current = getter;
  const acceptRef = useRef(opts?.accept);
  acceptRef.current = opts?.accept;
  useEffect(() => {
    if (!registry || !key) return undefined;
    if (acceptRef.current && !acceptRef.current()) return undefined;
    registry.markRestoredUsed(key);
    return registry.register(key, { get: () => getterRef.current(), bulky: false, omitNullish: true });
  }, [registry, key]);
  return (restored?.value ?? undefined) as T | undefined;
}

/**
 * 큰 값(행 등)이 빠진 채 복원됐을 때 마운트 뒤 한 번 refetch 를 부른다(원래 큰 값이 있었던 경우만).
 * 화면당 한 번만 둔다 — 호출 여부는 등록소 단위 표시로 막으므로 둘째 호출은 불리지 않는다.
 * refetch 는 매 렌더 새 함수여도 된다(최신 것을 ref 로 읽는다). Promise 를 돌려주면 끝난 때를 알아 새로고침 저장에 쓴다.
 */
export function useCarryRefetch(refetch: () => void | Promise<unknown>): void {
  const registry = useContext(CarryStateContext);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (!registry || !registry.startRefetch()) return;
    let result: void | Promise<unknown>;
    try {
      result = refetchRef.current();
    } catch (err) {
      registry.settleRefetch();
      throw err;
    }
    // 끝났다고 알 수 없는 refetch(Promise 가 아님)는 끝나지 않은 것으로 둔다 — 새로고침 때 한 번 더 조회하는 쪽이 안전하다.
    if (result && typeof (result as Promise<unknown>).then === "function") {
      const settle = () => registry.settleRefetch();
      (result as Promise<unknown>).then(settle, settle);
    }
  }, [registry]);
}

/** 이번 마운트가 이어받은 값으로 시작했는가 — 마운트 자동 조회·초기화 effect 를 건너뛸 때 쓴다. */
export function useCarryRestored(): boolean {
  const registry = useContext(CarryStateContext);
  const [restored] = useState(() => registry?.isFreshRestore() ?? false);
  return restored;
}
