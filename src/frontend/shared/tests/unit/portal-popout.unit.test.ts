/** @vitest-environment happy-dom */
/**
 * 탭 분리 창 열기·handoff(설계 2026-10-06-portal-tab-popout §5.3).
 * snapshot 은 localStorage handoff 로 한 번 넘기고, 새 창은 자기 sessionStorage 에 둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPopoutHandoffs,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function handoffKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(POPOUT_HANDOFF_PREFIX)) keys.push(key);
  }
  return keys;
}

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

describe("openPagePopout 실패 계약·토큰", () => {
  it("비보안 문맥(crypto.randomUUID 없음)에서도 createToken 주입 없이 성공하고 handoff 키가 생긴다", () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => realCrypto.getRandomValues(bytes) });
    const win = makeWin({ name: "fake" });
    const result = openPagePopout({ pageId: "page-a", snapshot: null, buildUrl, win, now: () => NOW });
    expect(result).not.toBeNull();
    expect(handoffKeys()).toHaveLength(1);
    expect(handoffKeys()[0]).toMatch(/^oasis\.portal\.popout\.[0-9a-f-]{36}$/);
  });

  it("buildUrl 이 던지면 예외가 그대로 전파되고 handoff 키가 남지 않는다", () => {
    const win = makeWin({});
    expect(() =>
      openPagePopout({
        pageId: "page-a",
        snapshot: null,
        buildUrl: () => {
          throw new Error("bad url");
        },
        win,
        now: () => NOW,
        createToken: () => "tok",
      })
    ).toThrow("bad url");
    expect(win.open).not.toHaveBeenCalled();
    expect(handoffKeys()).toEqual([]);
  });

  it("window.open 이 던지면 handoff 키를 지우고 예외를 다시 던진다", () => {
    const win = makeWin({});
    win.open.mockImplementation(() => {
      throw new Error("open failed");
    });
    expect(() =>
      openPagePopout({ pageId: "page-a", snapshot: null, buildUrl, win, now: () => NOW, createToken: () => "tok" })
    ).toThrow("open failed");
    expect(handoffKeys()).toEqual([]);
  });

  it("handoff 쓰기가 Quota 로 실패해도 창은 열고 키는 없으며 console.warn 만 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // handoff 키에 대해서만 setItem 이 Quota 로 던지는 저장소 — 실제 저장소를 감싼다.
    const real = localStorage;
    vi.stubGlobal("localStorage", {
      get length() {
        return real.length;
      },
      key: (index: number) => real.key(index),
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => real.removeItem(key),
      setItem: (key: string, value: string) => {
        if (key.startsWith(POPOUT_HANDOFF_PREFIX)) throw new DOMException("quota", "QuotaExceededError");
        real.setItem(key, value);
      },
    });
    const fake = { name: "fake-window" };
    const win = makeWin(fake);
    const result = openPagePopout({ pageId: "page-a", snapshot: null, buildUrl, win, now: () => NOW, createToken: () => "tok" });
    expect(result).toBe(fake);
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(real.length).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("clearPopoutHandoffs", () => {
  it("TTL 과 무관하게 handoff 키를 모두 지우고 다른 접두 키는 남긴다", () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}a`, { pageId: "x", snapshot: null, createdAt: Date.now() });
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}b`, { pageId: "y", snapshot: null, createdAt: 1 });
    localStorage.setItem("oasis.portal.tabs.v1", "keep");
    sessionStorage.setItem(`${POPOUT_SNAPSHOT_PREFIX}a`, "{}");
    clearPopoutHandoffs();
    expect(handoffKeys()).toEqual([]);
    expect(localStorage.getItem("oasis.portal.tabs.v1")).toBe("keep");
    expect(sessionStorage.getItem(`${POPOUT_SNAPSHOT_PREFIX}a`)).toBe("{}");
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
