/**
 * 화면 업무 호출 감지 — 탭을 열기만 한 화면은 기록하지 않고, 그 화면에서 첫 업무 호출이 나간 순간부터 잰다.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §3.1·§3.2.
 * React 에 의존하지 않는다. fetch 를 가진 대상(window)·document·시계를 주입받는다.
 */

/** 사용자 입력 뒤 이 시간 안에 나간 요청만 업무 호출로 인정한다(화면을 열 때의 자동 조회·콤보 로딩 제외). */
export const USAGE_INPUT_WINDOW_MS = 5000;

/** 업무 호출 경로 — 같은 출처의 `/api/{모듈}/oasis/` 또는 `/api/{모듈}/rest/`. 뒤 그룹은 그 아래 경로다. */
export const USAGE_BUSINESS_PATH_PATTERN = /^\/api\/[^/]+\/(?:oasis|rest)\/(.*)$/;

/**
 * 업무 경로라도 제외하는 요청. LOV·인증은 업무 경로 형식이 아니지만 의도를 남기려고 함께 둔다.
 * 근거: m-mcm `proxy.ts` 의 `authOnlyPrefixes`(포털 자체 요청)·`lovPattern`.
 */
export const USAGE_EXCLUDED_PATH_PATTERNS: readonly RegExp[] = [
  /^\/api\/[^/]+\/lov\//,
  /^\/api\/auth\//,
  /^\/api\/mcm\/auth\//,
];

/** 포털 자체 요청 — `/api/{모듈}/(oasis|rest)/` 다음 경로의 접두(대소문자 무시). */
export const USAGE_PORTAL_PATH_PREFIXES: readonly string[] = [
  "secUser/myMenus", // myMenus, myMenusTree
  "secUser/myPermissions",
  "secUser/myButtonEndpoints",
  "secFavorite/",
  "secStartPgm/",
  "secWidget/",
  "noticeBoard/search",
  "ntfNotification/",
  "screenUsage/record",
];

const INPUT_EVENTS = ["pointerdown", "keydown"] as const;
const INPUT_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
const PORTAL_PREFIXES_LOWER = USAGE_PORTAL_PATH_PREFIXES.map((p) => p.toLowerCase());

function toRequestUrl(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  const url = (input as { url?: unknown } | null)?.url;
  return typeof url === "string" ? url : null;
}

/** 요청이 업무 호출인지 — 같은 출처(origin)의 업무 경로이고 제외 목록에 없다. 해석할 수 없으면 false. */
export function isUsageBusinessRequest(input: RequestInfo | URL, origin: string): boolean {
  const raw = toRequestUrl(input);
  if (raw == null) return false;
  let url: URL;
  let base: URL;
  try {
    base = new URL(origin);
    url = new URL(raw, base);
  } catch {
    return false;
  }
  if (url.origin !== base.origin) return false;
  const path = url.pathname;
  if (USAGE_EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(path))) return false;
  const match = USAGE_BUSINESS_PATH_PATTERN.exec(path);
  if (!match) return false;
  const rest = match[1].toLowerCase();
  return !PORTAL_PREFIXES_LOWER.some((prefix) => rest.startsWith(prefix));
}

/** 요청 시각이 마지막 입력 뒤 windowMs 안인지. 입력이 없었으면(null) false. */
export function isWithinUsageInputWindow(
  requestAt: number,
  lastInputAt: number | null,
  windowMs: number = USAGE_INPUT_WINDOW_MS
): boolean {
  if (lastInputAt == null) return false;
  const elapsed = requestAt - lastInputAt;
  return elapsed >= 0 && elapsed <= windowMs;
}

/** fetch 를 가진 대상(브라우저에서는 window). */
export interface UsageFetchTarget {
  fetch: typeof fetch;
}

export interface UsageActivityEventTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

export interface UsageActivityOptions {
  /** 업무 호출로 인정된 요청이 나갈 때 — 입력·요청 때 범위(활성 탭 ID)를 넘긴다. 던져도 fetch 는 그대로 나간다. */
  onBusinessCall: (scope: string) => void;
  /**
   * 지금 범위(포털에서는 활성 탭 ID). 입력 때와 요청 때 범위가 같아야 인정한다 — 사이드바 메뉴를 눌러 새 탭을
   * 열면 그 입력은 이전 탭의 것이라 새 화면의 자동 조회를 업무 호출로 치지 않는다. null 이면 인정하지 않는다.
   */
  getScope: () => string | null;
  /** fetch 를 감쌀 대상. 기본 globalThis(브라우저에서는 window). */
  target?: UsageFetchTarget;
  /** 입력(pointerdown·keydown) 대상. 기본 document. 없으면 입력이 없는 것으로 본다. */
  doc?: UsageActivityEventTarget | null;
  /** 상대 경로를 풀고 같은 출처를 가릴 출처. 기본 location.origin. */
  origin?: string;
  now?: () => number;
  inputWindowMs?: number;
}

/**
 * fetch 를 감싸 업무 호출을 감지한다. 돌려준 함수로 해제한다(여러 번 불러도 된다).
 * 해제할 때 대상의 fetch 가 아직 이 감싸기면 원래 fetch 로 되돌리고, 다른 코드가 위에 또 감쌌으면
 * 그 감싸기를 지우지 않고 알림만 끈다(그대로 원래 fetch 로 넘긴다).
 */
export function installUsageActivity(options: UsageActivityOptions): () => void {
  const target = options.target ?? (globalThis as unknown as UsageFetchTarget);
  const doc =
    options.doc !== undefined
      ? options.doc
      : typeof document !== "undefined"
        ? document
        : null;
  const origin =
    options.origin ??
    (typeof location !== "undefined" ? location.origin : "http://localhost");
  const now = options.now ?? (() => Date.now());
  const windowMs = options.inputWindowMs ?? USAGE_INPUT_WINDOW_MS;
  const original = target.fetch;
  let active = true;
  let lastInput: { at: number; scope: string | null } | null = null;

  const handleInput = (): void => {
    if (!active) return;
    lastInput = { at: now(), scope: options.getScope() };
  };

  const notifyIfBusiness = (input: RequestInfo | URL): void => {
    if (!active || lastInput == null) return;
    const scope = options.getScope();
    if (scope == null || scope !== lastInput.scope) return;
    if (!isWithinUsageInputWindow(now(), lastInput.at, windowMs)) return;
    if (!isUsageBusinessRequest(input, origin)) return;
    options.onBusinessCall(scope);
  };

  const wrapped = function usageActivityFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    try {
      notifyIfBusiness(input);
    } catch (err) {
      console.warn("[usage-activity] 업무 호출 감지 실패", err);
    }
    // 브라우저 fetch 는 window 를 this 로 불러야 한다(Illegal invocation).
    return original.call(target, input, init);
  } as typeof fetch;

  target.fetch = wrapped;
  for (const type of INPUT_EVENTS) doc?.addEventListener(type, handleInput, INPUT_LISTENER_OPTIONS);

  return () => {
    if (!active) return;
    active = false;
    for (const type of INPUT_EVENTS) doc?.removeEventListener(type, handleInput, { capture: true });
    if (target.fetch === wrapped) target.fetch = original;
  };
}
