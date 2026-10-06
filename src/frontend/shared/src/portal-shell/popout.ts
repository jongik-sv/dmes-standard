import { readSecureJson, removeSecureValue, writeSecureJson } from "../secure-storage";
import { createRandomId } from "./random-id";

/*
 * 포털 탭 → 단독 창 분리(설계 2026-10-06-portal-tab-popout §5.3). 셸과 PortalPageWindow 가 같이 쓴다.
 * snapshot 은 token 키로 localStorage 에 한 번 써 두고 새 창이 읽은 뒤 지운다. 새 창은 그 값을 자기 sessionStorage 에 둔다.
 * window.open 은 클릭 처리기 안에서 동기로 불러야 팝업 차단을 피한다 — 이 함수 안에 await 를 넣지 않는다.
 * noopener 를 넣지 않는다: 넣으면 반환값이 늘 null 이라 차단과 구분할 수 없다.
 */

export const POPOUT_HANDOFF_PREFIX = "oasis.portal.popout.";
export const POPOUT_SNAPSHOT_PREFIX = "oasis.portal.popoutSnap.";
export const POPOUT_HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface PortalPopoutHandoff {
  pageId: string;
  snapshot: unknown;
  createdAt: number;
}

export interface OpenPagePopoutArgs {
  pageId: string;
  snapshot: unknown;
  buildUrl: (pageId: string, token: string) => string;
  win?: Pick<Window, "open" | "outerWidth" | "outerHeight" | "screenX" | "screenY">;
  now?: () => number;
  createToken?: () => string;
}

function sweepExpiredHandoffs(now: number): void {
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

/** 로그아웃 때 — 새 창이 아직 가져가지 않은 handoff 를 TTL 과 무관하게 모두 지운다. */
export function clearPopoutHandoffs(): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POPOUT_HANDOFF_PREFIX)) keys.push(key);
  }
  for (const key of keys) removeSecureValue(key);
}

/**
 * 실패 계약: 반환 null 은 팝업 차단 전용이다. 그 밖의 실패(buildUrl·window.open 예외)는 예외로 전파한다.
 * handoff 쓰기(Quota 등)만 best-effort — 실패하면 경고만 남기고 창은 연다(새 창은 빈 상태로 정상 표시).
 */
export function openPagePopout({ pageId, snapshot, buildUrl, win = window, now = Date.now, createToken = createRandomId }: OpenPagePopoutArgs): Window | null {
  const at = now();
  sweepExpiredHandoffs(at);
  const token = createToken();
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  // handoff 를 쓰기 전에 URL·features 를 만든다 — 여기서 던져도 남는 것이 없다.
  const url = buildUrl(pageId, token);
  const width = Math.max(640, Math.round(win.outerWidth || 1280));
  const height = Math.max(480, Math.round(win.outerHeight || 800));
  const features = `popup,width=${width},height=${height},left=${Math.round((win.screenX || 0) + 40)},top=${Math.round((win.screenY || 0) + 40)}`;
  try {
    writeSecureJson<PortalPopoutHandoff>(key, { pageId, snapshot, createdAt: at });
  } catch (err) {
    console.warn("[popout] handoff 를 쓰지 못해 상태 없이 새 창을 연다", err);
  }
  let opened: Window | null;
  try {
    opened = win.open(url, `dmes-popout-${token}`, features);
  } catch (err) {
    removeSecureValue(key);
    throw err;
  }
  if (!opened) {
    removeSecureValue(key);
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
