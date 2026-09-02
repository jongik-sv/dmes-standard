"use client";

import { useEffect, useState } from "react";

/**
 * Two-tier RBAC 의 button-level 가시성 hook.
 *
 * BE `/api/mcm/oasis/secUser/myButtonEndpoints` 를 호출해 현재 사용자의
 * (objId × action × endpoint) 평탄 목록을 가져온다. PageLayout 이 본 hook 으로
 * 각 버튼의 활성/비활성을 판정한다.
 *
 * 다중 인스턴스 캐싱: module-scoped singleton 으로 같은 페이지 내 여러 PageLayout 이
 * 동시에 사용해도 fetch 1회만 발생.
 *
 * SYSADMIN 케이스: BE 가 `{objId:"*", action:"*"}` 와일드카드 row 를 반환 → 모든 버튼 통과.
 */

export interface ButtonRbacRow {
  objId: string;
  action: string;
  endpoint: string;
  httpMethod: string;
}

export interface ButtonRbacState {
  rows: ButtonRbacRow[];
  isLoading: boolean;
  isSysadmin: boolean;
  errorMessage: string | null;
  /** fetch 시점의 사용자 ID — 다른 사용자로 재로그인 감지에 사용. */
  userId: string;
}

const initialState: ButtonRbacState = {
  rows: [],
  isLoading: true,
  isSysadmin: false,
  errorMessage: null,
  userId: "",
};

/**
 * 캐시 store — globalThis 에 보관해 module instance 가 chunk 별로 분리돼도 같은 store 를 공유.
 *
 * <p>monorepo + Turbopack 환경에서 m-mpn / m-mcm 등 패키지 chunk 가 별도로 로드되면 shared 의
 * `useUserButtonRbac` 도 chunk 마다 별도 instance 가 되어 module-scoped 변수가 분리된다. 한
 * 페이지에서 fetch 한 결과가 다른 페이지에선 isLoading=false + rows=[] 빈 상태로 보여
 * 모든 button 이 비활성으로 잘못 판정되는 증상을 막기 위해 globalThis 단일 store 사용.
 */
interface RbacStore {
  cachedState: ButtonRbacState | null;
  inflight: Promise<ButtonRbacState> | null;
  subscribers: Set<(s: ButtonRbacState) => void>;
}
const STORE_KEY = "__dkOasisButtonRbacStore__";
function getStore(): RbacStore {
  const g = globalThis as unknown as Record<string, RbacStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { cachedState: null, inflight: null, subscribers: new Set() };
  }
  return g[STORE_KEY] as RbacStore;
}

async function fetchCurrentUserId(): Promise<string> {
  try {
    const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!meRes.ok) return "";
    const me = await meRes.json();
    return String(me.user?.id ?? "");
  } catch {
    return "";
  }
}

async function fetchButtonRbac(): Promise<ButtonRbacState> {
  try {
    const userId = await fetchCurrentUserId();
    if (!userId) {
      return {
        rows: [],
        isLoading: false,
        isSysadmin: false,
        errorMessage: "userId 없음",
        userId: "",
      };
    }

    const res = await fetch("/api/mcm/oasis/secUser/myButtonEndpoints", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: { userId, menuId: "RBAC" }, params: { userId } }),
    });
    if (!res.ok) {
      return {
        rows: [],
        isLoading: false,
        isSysadmin: false,
        errorMessage: `RBAC 조회 실패 (${res.status})`,
        userId,
      };
    }
    const body = await res.json();
    const rows: ButtonRbacRow[] = body.grids?.buttons?.rows ?? [];
    const isSysadmin = rows.some((r) => r.objId === "*" && r.action === "*");
    return { rows, isLoading: false, isSysadmin, errorMessage: null, userId };
  } catch (e) {
    return {
      rows: [],
      isLoading: false,
      isSysadmin: false,
      errorMessage: e instanceof Error ? e.message : "RBAC 조회 오류",
      userId: "",
    };
  }
}

function notify(state: ButtonRbacState) {
  const store = getStore();
  store.cachedState = state;
  store.subscribers.forEach((cb) => cb(state));
}

/**
 * 캐시된 RBAC 상태를 반환. 미적재 / 다른 사용자로 재로그인 시 fetch 트리거.
 *
 * <p>한번 채워진 cachedState 가 다른 사용자로 재로그인 후에도 그대로 사용되는 stale 문제를 막기 위해,
 * mount 시 가벼운 `/api/auth/me` 호출로 현재 세션의 userId 를 받아 캐시의 userId 와 비교한다.
 * 다르면 cachedState 를 무효화하고 새로 fetch.
 */
export function useUserButtonRbac(enabled: boolean = true): ButtonRbacState {
  // useState 초기값은 항상 initialState — 절대 cachedState 로 시작하지 않는다.
  //   - 다른 사용자로 재로그인 후의 stale wildcard 캐시가 첫 렌더에 새어 나오는 것을 차단.
  //   - 약간의 깜빡임 (isLoading=true 동안 모든 RBAC 버튼 비활성) 은 보안 default 로 수용.
  // 같은 사용자의 두 번째 mount (탭 전환 등) 에서는 useEffect 가 me 확인 후 cached 사용 → 즉시 갱신.
  const [state, setState] = useState<ButtonRbacState>(
    enabled ? initialState : { ...initialState, isLoading: false }
  );

  useEffect(() => {
    if (!enabled) {
      setState({ ...initialState, isLoading: false });
      return;
    }

    let cancelled = false;
    const s = getStore();
    s.subscribers.add(setState);

    void (async () => {
      const currentUserId = await fetchCurrentUserId();
      if (cancelled) return;
      const cached = s.cachedState;
      if (cached && cached.userId && cached.userId === currentUserId) {
        setState(cached);
        return;
      }
      // 사용자 바뀌었거나 캐시 없음 → 새 fetch
      s.cachedState = null;
      if (!s.inflight) {
        s.inflight = fetchButtonRbac();
        void s.inflight.then((newState) => {
          notify(newState);
          getStore().inflight = null;
        });
      }
    })();

    return () => {
      cancelled = true;
      getStore().subscribers.delete(setState);
    };
  }, [enabled]);

  return state;
}

/**
 * 특정 (objId, action) 조합에 대한 권한 여부 판정.
 *  - objId 미지정 → 검사 안 함 (true) — 비-RBAC 페이지 (예: 로그인, 시스템 페이지)
 *  - objId 지정 + action 미지정 → **false (보안 default)** — RBAC 페이지의 액션 미명시 버튼은 비활성.
 *    RBAC 통제를 받기로 한 페이지에서 action 을 적지 않은 버튼이 무방비로 노출되는 것을 차단.
 *    예외가 필요한 버튼은 action="_skip" 같은 명시적 코드를 부여하거나 PageLayout 밖에서 직접 렌더.
 *  - SYSADMIN → 항상 true
 *  - 로딩 중 → false (안전 차원에서 비활성)
 *  - 일치 row 존재 → true
 *
 * 액션 코드는 양쪽 모두 소문자 정규화 후 비교한다 (docs/guide/FrontEnd/Local-Rules.md §6 — 표준은 소문자, 레거시 대문자 호환).
 */
export function canDoButton(
  state: ButtonRbacState,
  objId: string | null | undefined,
  action: string | null | undefined
): boolean {
  if (!objId) return true; // 비-RBAC 페이지 → 통과
  if (!action) return false; // RBAC 페이지인데 action 없음 → 보안 default 비활성
  if (state.isSysadmin) return true;
  if (state.isLoading) return false;
  const want = action.toLowerCase();
  return state.rows.some(
    (r) => r.objId === objId && (r.action.toLowerCase() === want || r.action === "*")
  );
}
