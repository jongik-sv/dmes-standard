
/**
 * 현재 로그인 사용자(`/api/auth/me`) 확인을 한 곳에서 한다 — 진행 중 요청 공유 + 세션 캐시.
 *
 * <p>포털 셸·RBAC 훅·즐겨찾기·기본 화면 등이 각자 `/api/auth/me` 를 불러 진입당 4~6건이 나가던 것을
 * 한 번으로 줄인다(Screen-Performance-Guide K3). 성공한 응답만 캐시하고, 실패(401·!ok·빈 사용자·연결 오류)는
 * 캐시하지 않는다 — 로그인 화면에서 받은 실패가 로그인 뒤 포털까지 남지 않게.
 *
 * <p>캐시는 globalThis 에 둔다. shared 가 entry 별로 따로 번들되거나 m-* chunk 가 따로 로드돼도 같은 저장소를 쓴다
 * (use-user-button-rbac 의 RBAC store 와 같은 이유).
 *
 * <p>비우는 곳: 로그아웃(`PortalShell` doLogout·`useOasisAuth().logout`), 401 리다이렉트(`redirectToLoginOn401`),
 * 로그인 성공 직후(`PortalLoginForm`). 비울 때 RBAC 캐시도 함께 비운다 — 다른 사용자의 버튼 권한이 남지 않게.
 * 다른 브라우저 탭에서 다른 사용자로 다시 로그인한 경우는 RBAC 훅이 화면이 다시 보일 때 {@link revalidateCurrentUser}
 * 로 확인한다.
 */

export interface CurrentUser {
  id: string;
  name: string | null;
}

/** `/api/auth/me` 확인 결과. `ok` 가 아니면 `status` 에 HTTP 상태(빈 사용자는 401 로 본다)를 담는다. */
export type CurrentUserResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; status: number };

interface CurrentUserStore {
  user: CurrentUser | null;
  inflight: Promise<CurrentUserResult> | null;
  /** 비우기 세대 — 비운 뒤 끝난 옛 요청이 캐시를 다시 채우지 않게 한다. */
  generation: number;
  listeners: Set<(user: CurrentUser | null) => void>;
}

const STORE_KEY = "__dkOasisCurrentUserStore__";
/** use-user-button-rbac 의 RBAC store 키 — 사용자 캐시를 비울 때 함께 비운다. */
export const BUTTON_RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

function getStore(): CurrentUserStore {
  const g = globalThis as unknown as Record<string, CurrentUserStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { user: null, inflight: null, generation: 0, listeners: new Set() };
  }
  return g[STORE_KEY] as CurrentUserStore;
}

async function requestCurrentUser(): Promise<CurrentUserResult> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json()) as {
    authenticated?: boolean;
    user?: { id?: string | number | null; name?: string | null } | null;
  };
  const id = String(body.user?.id ?? "");
  if (body.authenticated === false || !id) return { ok: false, status: 401 };
  return { ok: true, user: { id, name: body.user?.name ?? null } };
}

function startRequest(store: CurrentUserStore): Promise<CurrentUserResult> {
  const generation = store.generation;
  const p = requestCurrentUser().then(
    (result) => {
      const s = getStore();
      if (s.inflight === p) s.inflight = null;
      if (s.generation === generation && result.ok) {
        const prev = s.user;
        s.user = result.user;
        if (prev?.id !== result.user.id) s.listeners.forEach((cb) => cb(result.user));
      }
      return result;
    },
    (error: unknown) => {
      const s = getStore();
      if (s.inflight === p) s.inflight = null;
      throw error;
    }
  );
  store.inflight = p;
  return p;
}

/**
 * 현재 사용자를 돌려준다. 캐시가 있으면 요청 없이, 진행 중 요청이 있으면 그것을 함께 기다린다.
 * 연결 오류는 reject 한다(캐시하지 않는다).
 */
export function getCurrentUser(): Promise<CurrentUserResult> {
  const s = getStore();
  if (s.user) return Promise.resolve({ ok: true, user: s.user });
  return s.inflight ?? startRequest(s);
}

/**
 * 캐시와 상관없이 서버에 다시 묻는다(진행 중 요청은 공유). 사용자가 바뀌었으면 구독자에게 알린다.
 * 실패하면 캐시를 그대로 둔다 — 잠깐의 연결 오류로 권한 화면이 흔들리지 않게.
 */
export function revalidateCurrentUser(): Promise<CurrentUserResult> {
  const s = getStore();
  return s.inflight ?? startRequest(s);
}

/** 이미 확인된 사용자를 동기로 돌려준다(없으면 null). 응답을 기다리면 안 되는 곳(전송 meta 등)에서 쓴다. */
export function peekCurrentUser(): CurrentUser | null {
  return getStore().user;
}

/** 확인된 사용자가 바뀌면(다른 사용자로 재확인·비우기) 불린다. 해제 함수를 돌려준다. */
export function subscribeCurrentUser(cb: (user: CurrentUser | null) => void): () => void {
  const s = getStore();
  s.listeners.add(cb);
  return () => {
    getStore().listeners.delete(cb);
  };
}

/**
 * 사용자 캐시와 RBAC 캐시를 비운다 — 로그아웃·401 리다이렉트·로그인 성공 때 부른다.
 * 진행 중이던 요청은 끝나도 캐시를 채우지 않는다.
 */
export function clearCurrentUserCache(): void {
  const s = getStore();
  const hadUser = s.user != null;
  s.user = null;
  s.inflight = null;
  s.generation += 1;
  const g = globalThis as unknown as Record<
    string,
    { cachedState: unknown; inflight: unknown; generation?: number } | undefined
  >;
  const rbac = g[BUTTON_RBAC_STORE_KEY];
  if (rbac) {
    rbac.cachedState = null;
    rbac.inflight = null;
    rbac.generation = (rbac.generation ?? 0) + 1;
  }
  if (hadUser) s.listeners.forEach((cb) => cb(null));
}
