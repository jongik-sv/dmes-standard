import { readSecureJson, removeSecureValue, writeSecureJson } from "../secure-storage";

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

export function openPagePopout({ pageId, snapshot, buildUrl, win = window, now = Date.now, createToken = () => crypto.randomUUID() }: OpenPagePopoutArgs): Window | null {
  const at = now();
  sweepExpiredHandoffs(at);
  const token = createToken();
  const key = `${POPOUT_HANDOFF_PREFIX}${token}`;
  writeSecureJson<PortalPopoutHandoff>(key, { pageId, snapshot, createdAt: at });
  const width = Math.max(640, Math.round(win.outerWidth || 1280));
  const height = Math.max(480, Math.round(win.outerHeight || 800));
  const features = `popup,width=${width},height=${height},left=${Math.round((win.screenX || 0) + 40)},top=${Math.round((win.screenY || 0) + 40)}`;
  const opened = win.open(buildUrl(pageId, token), `dmes-popout-${token}`, features);
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
