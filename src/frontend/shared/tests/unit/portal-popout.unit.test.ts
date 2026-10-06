/** @vitest-environment happy-dom */
/**
 * 탭 분리 창 열기·handoff(설계 2026-10-06-portal-tab-popout §5.3).
 * snapshot 은 localStorage handoff 로 한 번 넘기고, 새 창은 자기 sessionStorage 에 둔다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  openPagePopout,
  POPOUT_HANDOFF_PREFIX,
  POPOUT_HANDOFF_TTL_MS,
  POPOUT_SNAPSHOT_PREFIX,
  readPopoutSnapshot,
  takePopoutHandoff,
  writePopoutSnapshot,
} from "../../src/portal-shell/popout";
import { readSecureJson, writeSecureJson } from "../../src/secure-storage";

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name] !== "undefined") continue;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;

function makeWin(opened: unknown) {
  return {
    open: vi.fn(() => opened as Window | null),
    outerWidth: 1200,
    outerHeight: 800,
    screenX: 0,
    screenY: 0,
  };
}

const buildUrl = (pageId: string, token: string) => `/popout/${pageId}?t=${token}`;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("openPagePopout", () => {
  it("성공: 새 창을 돌려주고 handoff 를 쓰며 open 인자가 맞다", () => {
    const fake = { name: "fake-window" };
    const win = makeWin(fake);
    const result = openPagePopout({
      pageId: "page-a",
      snapshot: { q: 1 },
      buildUrl,
      win,
      now: () => NOW,
      createToken: () => "tok",
    });
    expect(result).toBe(fake);
    expect(readSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`)).toEqual({
      pageId: "page-a",
      snapshot: { q: 1 },
      createdAt: NOW,
    });
    expect(win.open).toHaveBeenCalledTimes(1);
    const [url, name, features] = win.open.mock.calls[0] as unknown as [string, string, string];
    expect(url).toBe(buildUrl("page-a", "tok"));
    expect(name).toBe("dmes-popout-tok");
    expect(features).toContain("popup");
    expect(features).not.toContain("noopener");
  });

  it("차단: open 이 null 이면 null 을 돌려주고 handoff 를 남기지 않는다", () => {
    const win = makeWin(null);
    const result = openPagePopout({
      pageId: "page-a",
      snapshot: null,
      buildUrl,
      win,
      now: () => NOW,
      createToken: () => "tok",
    });
    expect(result).toBeNull();
    expect(localStorage.getItem(`${POPOUT_HANDOFF_PREFIX}tok`)).toBeNull();
  });

  it("정리: 10분 지난 handoff 만 지우고 다른 접두 키는 그대로 둔다", () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}old`, { pageId: "x", snapshot: null, createdAt: NOW - 11 * MINUTE });
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}new`, { pageId: "y", snapshot: null, createdAt: NOW - 1 * MINUTE });
    localStorage.setItem("oasis.portal.tabs.v1", "keep");
    openPagePopout({
      pageId: "page-a",
      snapshot: null,
      buildUrl,
      win: makeWin({}),
      now: () => NOW,
      createToken: () => "tok",
    });
    expect(localStorage.getItem(`${POPOUT_HANDOFF_PREFIX}old`)).toBeNull();
    expect(localStorage.getItem(`${POPOUT_HANDOFF_PREFIX}new`)).not.toBeNull();
    expect(localStorage.getItem("oasis.portal.tabs.v1")).toBe("keep");
  });
});

describe("takePopoutHandoff", () => {
  it("처음엔 값을 돌려주고 두 번째엔 null", () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, { pageId: "p", snapshot: { a: 1 }, createdAt: NOW });
    expect(takePopoutHandoff("tok", () => NOW)).toEqual({ pageId: "p", snapshot: { a: 1 }, createdAt: NOW });
    expect(takePopoutHandoff("tok", () => NOW)).toBeNull();
  });

  it("만료(10분 초과) handoff 는 null 이고 지운다", () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, { pageId: "p", snapshot: null, createdAt: NOW });
    expect(takePopoutHandoff("tok", () => NOW + POPOUT_HANDOFF_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(`${POPOUT_HANDOFF_PREFIX}tok`)).toBeNull();
  });
});

describe("snapshot 저장소", () => {
  it("write 뒤 read 하면 found 와 값이 돌아온다", () => {
    writePopoutSnapshot("tok", { q: 1 });
    expect(readPopoutSnapshot("tok")).toEqual({ found: true, snapshot: { q: 1 } });
  });

  it("없는 토큰은 found false", () => {
    expect(readPopoutSnapshot("none")).toEqual({ found: false, snapshot: null });
  });

  it("깨진 JSON 은 found false", () => {
    sessionStorage.setItem(`${POPOUT_SNAPSHOT_PREFIX}bad`, "{not json");
    expect(readPopoutSnapshot("bad").found).toBe(false);
  });
});
