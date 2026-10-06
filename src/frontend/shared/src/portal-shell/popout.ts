import { readSecureJson, removeSecureValue, writeSecureJson } from "../secure-storage";
import { createRandomId } from "./random-id";

/*
 * 포털 탭 → 단독 창 분리(설계 2026-10-06-portal-tab-popout §5.3). 셸과 PortalPageWindow 가 같이 쓴다.
 * snapshot 은 token 키로 localStorage 에 한 번 써 두고 새 창이 읽은 뒤 지운다. 새 창은 그 값을 자기 sessionStorage 에 둔다.
 * window.open 은 클릭 처리기 안에서 동기로 불러야 팝업 차단을 피한다 — 이 함수 안에 await 를 넣지 않는다.
 * noopener 를 넣지 않는다: 넣으면 반환값이 늘 null 이라 차단과 구분할 수 없다.
 *
 * 화면 상태 이어받기(설계 2026-10-06-popout-carry-state-design §4.3~4.5):
 * - light(조건·선택 키 등)·bulky(조회 결과 행 등)를 셸 창 메모리 보관소에 넣고 창 전역(window.__dmesPopoutCarry)으로 노출한다.
 *   새 창이 window.opener 로 token 의 값을 한 번 꺼내 자기 창 안으로 복제한다(크기 제한 없음).
 * - light 는 인코딩 뒤 256KB 이하일 때만 handoff 에도 담는다(opener 를 못 쓰는 경우의 보조 경로). bulky 는 localStorage 에 담지 않는다.
 * - 분리 창 새로고침용으로 light 를 그 창 sessionStorage 에 둔다.
 */

export const POPOUT_HANDOFF_PREFIX = "oasis.portal.popout.";
export const POPOUT_SNAPSHOT_PREFIX = "oasis.portal.popoutSnap.";
export const POPOUT_HANDOFF_TTL_MS = 10 * 60 * 1000;
/** 분리 창 새로고침용 — 이 창 sessionStorage 에 light 를 둔다. */
export const POPOUT_CARRY_SESSION_PREFIX = "oasis.portal.popoutCarry.";
/** opener(셸 창)가 노출하는 보관소 창 전역 이름. 새 창이 window.opener[이 이름].take(token) 으로 꺼낸다. */
export const POPOUT_CARRY_GLOBAL = "__dmesPopoutCarry";
/** handoff·sessionStorage 에 담을 light 의 인코딩 뒤 크기 상한(바이트). */
export const POPOUT_CARRY_MAX_ENCODED_BYTES = 256 * 1024;

/** 분리 창이 이어받는 화면 상태 — light 는 JSON 으로, bulky 는 opener 메모리로만 온다. */
export interface PopoutCarryPayload {
  light: Record<string, unknown>;
  bulky: Record<string, unknown>;
}

export interface PortalPopoutHandoff {
  pageId: string;
  snapshot: unknown;
  createdAt: number;
  /** 화면 상태 이어받기(보조 경로) — light 만 담는다. hadBulky 가 true 면 새 창이 행을 자동 재조회한다. */
  carry?: { light: Record<string, unknown>; hadBulky: boolean };
}

export interface OpenPagePopoutArgs {
  pageId: string;
  snapshot: unknown;
  /** 화면 상태 이어받기 — 셸이 분리 순간에 동기로 모은 값. 없으면 지금과 같다. */
  carry?: PopoutCarryPayload;
  buildUrl: (pageId: string, token: string) => string;
  win?: Pick<Window, "open" | "outerWidth" | "outerHeight" | "screenX" | "screenY">;
  now?: () => number;
  createToken?: () => string;
}

interface CarryStoreEntry extends PopoutCarryPayload {
  createdAt: number;
}

/**
 * opener 메모리 보관소 — token → 값. 이 창(셸)의 메모리에만 있다.
 * shared 는 entry 마다 이 모듈이 inline 될 수 있어(splitting: false) 보관소 Map 은 globalThis 에 하나만 둔다(tab-page-context.ts 와 같은 이유).
 */
const CARRY_STORE_KEY = "__dkOasisPopoutCarryStore__";

function getCarryStore(): Map<string, CarryStoreEntry> {
  const holder = globalThis as unknown as Record<string, Map<string, CarryStoreEntry> | undefined>;
  return (holder[CARRY_STORE_KEY] ??= new Map<string, CarryStoreEntry>());
}

/** 보관소에서 token 의 값을 한 번만 꺼낸다(꺼내면 지움). 없거나 TTL 이 지났으면 null. 창 전역 take 가 이것이다. */
function takeFromCarryStore(token: string): PopoutCarryPayload | null {
  const store = getCarryStore();
  const entry = store.get(token);
  if (!entry) return null;
  store.delete(token);
  if (Date.now() - entry.createdAt > POPOUT_HANDOFF_TTL_MS) return null;
  return { light: entry.light, bulky: entry.bulky };
}

/** 새 창이 window.opener 로 꺼낼 수 있게 창 전역을 노출한다. 여러 번 불러도 같은 take 하나만 둔다. */
function exposeCarryStore(): void {
  if (typeof window === "undefined") return;
  const holder = window as unknown as Record<string, unknown>;
  holder[POPOUT_CARRY_GLOBAL] = { take: takeFromCarryStore };
}

function sweepExpiredCarry(now: number): void {
  const store = getCarryStore();
  for (const [token, entry] of store) {
    if (now - entry.createdAt > POPOUT_HANDOFF_TTL_MS) store.delete(token);
  }
}

function sweepExpiredHandoffs(now: number): void {
  sweepExpiredCarry(now);
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POPOUT_HANDOFF_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const value = readSecureJson<PortalPopoutHandoff>(key);
    if (!value || typeof value.createdAt !== "number" || now - value.createdAt > POPOUT_HANDOFF_TTL_MS) {
      removeSecureValue(key);
    }
  }
}

/** 로그아웃 때 — 새 창이 아직 가져가지 않은 handoff·opener 보관소 값을 TTL 과 무관하게 모두 지운다. */
export function clearPopoutHandoffs(): void {
  getCarryStore().clear();
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POPOUT_HANDOFF_PREFIX)) keys.push(key);
  }
  for (const key of keys) removeSecureValue(key);
}

/** light 를 base64 로 인코딩했을 때의 길이 추정(writeSecureJson 이 UTF-8 → base64). 직렬화할 수 없으면 null. */
function estimateEncodedBytes(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return null;
    return Math.ceil(new TextEncoder().encode(json).length / 3) * 4;
  } catch {
    return null;
  }
}

/** light 가 handoff·sessionStorage 에 담을 수 있는 크기(인코딩 뒤 256KB 이하)이고 직렬화되는가. */
export function isCarryLightStorable(light: Record<string, unknown>): boolean {
  const size = estimateEncodedBytes(light);
  return size !== null && size <= POPOUT_CARRY_MAX_ENCODED_BYTES;
}

function hasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

/**
 * 실패 계약: 반환 null 은 팝업 차단 전용이다. 그 밖의 실패(buildUrl·window.open 예외)는 예외로 전파한다.
 * handoff 쓰기(Quota 등)만 best-effort — 실패하면 경고만 남기고 창은 연다(새 창은 빈 상태로 정상 표시).
 */
export function openPagePopout({ pageId, snapshot, carry, buildUrl, win = window, now = Date.now, createToken = createRandomId }: OpenPagePopoutArgs): Window | null {
  const at = now();
  sweepExpiredHandoffs(at);
  const token = createToken();
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  // handoff·보관소에 쓰기 전에 URL·features 를 만든다 — 여기서 던져도 남는 것이 없다.
  const url = buildUrl(pageId, token);
  const width = Math.max(640, Math.round(win.outerWidth || 1280));
  const height = Math.max(480, Math.round(win.outerHeight || 800));
  const features = `popup,width=${width},height=${height},left=${Math.round((win.screenX || 0) + 40)},top=${Math.round((win.screenY || 0) + 40)}`;
  const handoff: PortalPopoutHandoff = { pageId, snapshot, createdAt: at };
  let carryInStore = false;
  if (carry) {
    // 주 경로: opener 메모리 보관소(크기 제한 없음). 새 창이 window.opener 로 한 번 꺼낸다.
    getCarryStore().set(token, { light: carry.light, bulky: carry.bulky, createdAt: at });
    exposeCarryStore();
    carryInStore = true;
    // 보조 경로: light 만 handoff 에 — opener 를 못 쓰는 경우에도 조건·선택 키를 잇고, hadBulky 면 새 창이 행을 다시 조회한다.
    if (isCarryLightStorable(carry.light)) {
      handoff.carry = { light: carry.light, hadBulky: hasKeys(carry.bulky) };
    } else {
      console.warn("[popout] 화면 상태(light)가 256KB 를 넘어 handoff 에 담지 않는다 — opener 를 못 쓰면 처음 상태로 열린다");
    }
  }
  try {
    writeSecureJson<PortalPopoutHandoff>(key, handoff);
  } catch (err) {
    console.warn("[popout] handoff 를 쓰지 못해 상태 없이 새 창을 연다", err);
  }
  let opened: Window | null;
  try {
    opened = win.open(url, `dmes-popout-${token}`, features);
  } catch (err) {
    removeSecureValue(key);
    if (carryInStore) getCarryStore().delete(token);
    throw err;
  }
  if (!opened) {
    removeSecureValue(key);
    if (carryInStore) getCarryStore().delete(token);
    return null;
  }
  return opened;
}

export function takePopoutHandoff(token: string, now: () => number = Date.now): PortalPopoutHandoff | null {
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  const value = readSecureJson<PortalPopoutHandoff>(key);
  removeSecureValue(key);
  if (!value || typeof value.createdAt !== "number" || now() - value.createdAt > POPOUT_HANDOFF_TTL_MS) return null;
  return value;
}

export function readPopoutSnapshot(token: string): { found: boolean; snapshot: unknown } {
  try {
    const raw = sessionStorage.getItem(`${POPOUT_SNAPSHOT_PREFIX}${token}`);
    if (raw == null) return { found: false, snapshot: null };
    return { found: true, snapshot: JSON.parse(raw) as unknown };
  } catch {
    return { found: false, snapshot: null };
  }
}

export function writePopoutSnapshot(token: string, snapshot: unknown): void {
  try {
    sessionStorage.setItem(`${POPOUT_SNAPSHOT_PREFIX}${token}`, JSON.stringify(snapshot ?? null));
  } catch {
    /* 저장소를 못 쓰면 새로고침 때 상태만 잃는다 */
  }
}

function cloneIntoThisWindow<T>(value: T): T {
  // opener 창의 객체를 이 창 안의 복사본으로 만든다 — opener 가 닫히거나 이동해도 값이 남게.
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 새 창이 opener(셸 창)의 메모리 보관소에서 token 의 값을 한 번 꺼내 이 창 안으로 복제한다.
 * opener 가 없거나 닫혔거나 다른 출처로 이동했거나 값이 없으면(이미 가져감·TTL) null — 던지지 않는다.
 */
export function takePopoutCarryFromOpener(
  token: string,
  opener: Window | null | undefined = typeof window === "undefined" ? null : window.opener
): PopoutCarryPayload | null {
  try {
    if (!opener || opener.closed) return null;
    const bridge = (opener as unknown as Record<string, unknown>)[POPOUT_CARRY_GLOBAL] as { take?: (token: string) => unknown } | undefined;
    if (!bridge || typeof bridge.take !== "function") return null;
    const taken = bridge.take(token);
    if (!isPlainRecord(taken) || !isPlainRecord(taken.light) || !isPlainRecord(taken.bulky)) return null;
    return cloneIntoThisWindow({ light: taken.light, bulky: taken.bulky });
  } catch {
    return null;
  }
}

/** 분리 창 새로고침(F5)용 — 이 창 sessionStorage 에 둔 light. 없거나 깨졌으면 null. */
export function readPopoutCarry(token: string): { light: Record<string, unknown>; hadBulky: boolean } | null {
  try {
    const raw = sessionStorage.getItem(`${POPOUT_CARRY_SESSION_PREFIX}${token}`);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { light?: unknown; hadBulky?: unknown } | null;
    if (!parsed || !isPlainRecord(parsed.light)) return null;
    return { light: parsed.light, hadBulky: parsed.hadBulky === true };
  } catch {
    return null;
  }
}

/** light 를 이 창 sessionStorage 에 쓴다. 256KB 를 넘거나 쓰지 못하면 쓰지 않고(앞서 쓴 값은 지운다) false — 새로고침하면 처음 상태가 된다. */
export function writePopoutCarry(token: string, carry: { light: Record<string, unknown>; hadBulky: boolean }): boolean {
  const key = `${POPOUT_CARRY_SESSION_PREFIX}${token}`;
  try {
    if (!isCarryLightStorable(carry.light)) {
      sessionStorage.removeItem(key);
      return false;
    }
    sessionStorage.setItem(key, JSON.stringify({ light: carry.light, hadBulky: carry.hadBulky }));
    return true;
  } catch {
    return false;
  }
}
