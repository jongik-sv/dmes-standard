import { createContext, useContext, type Context } from "react";

export interface TabPageContextValue {
  pageId: string;
  /**
   * 화면이 속한 dir 메뉴(폴더)의 식별자 — 권한관리 endpoint 양식
   * `/api/{module}/{serviceId}/{objId}/{action}` 의 service segment 와 동일.
   * 현재는 dir 메뉴 menuId(UUID), 추후 의미 있는 id (mpa/mpb/mpc 등) 로 마이그레이션 예정.
   * Active page 가 menu tree 의 root 직계면 빈 문자열.
   */
  serviceId: string;
  /**
   * 화면이 들어 있는 포털 탭 id — `portal-tab-activated` 이벤트의 `detail.tabId` 와 비교해 자기 탭이 활성화될 때만
   * 반응할 때 쓴다(Screen-Performance-Guide R10·K5). 포털 밖이면 없다.
   */
  tabId?: string;
}

/**
 * Shared 패키지가 tsup 에서 layout/portal-shell 등 여러 entry 로 분리 빌드되며
 * (splitting: false) 각 entry 가 동일 모듈을 inline 하면 createContext 인스턴스가
 * 중복 생성된다 (Provider 와 Consumer 가 서로 다른 Context 를 참조 → 값 전달 실패).
 *
 * globalThis 에 캐싱하여 어떤 entry 가 먼저 로드되든 동일 Context 인스턴스를 공유한다.
 */
const GLOBAL_KEY = "__dkOasisTabPageContext__";

interface GlobalCache {
  [GLOBAL_KEY]?: Context<TabPageContextValue>;
}

const cache = globalThis as unknown as GlobalCache;

export const TabPageContext: Context<TabPageContextValue> =
  cache[GLOBAL_KEY] ??
  (cache[GLOBAL_KEY] = createContext<TabPageContextValue>({ pageId: "", serviceId: "" }));

export function useTabPage(): TabPageContextValue {
  return useContext(TabPageContext);
}

/**
 * 현재 active page 의 serviceId 만 반환 — api client 의 path 조립용 편의 hook.
 * `/api/{module}/{serviceId}/{objId}/{action}` 양식 호출 시 사용한다.
 */
export function useTabService(): string {
  return useContext(TabPageContext).serviceId;
}
