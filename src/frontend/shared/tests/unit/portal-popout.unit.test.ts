/** @vitest-environment happy-dom */
/**
 * 탭 분리 창 열기·handoff(설계 2026-10-06-portal-tab-popout §5.3).
 * snapshot 은 localStorage handoff 로 한 번 넘기고, 새 창은 자기 sessionStorage 에 둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPopoutHandoffs,
  openPagePopout,
  POPOUT_CARRY_GLOBAL,
  POPOUT_CARRY_MAX_ENCODED_BYTES,
  POPOUT_CARRY_SESSION_PREFIX,
  POPOUT_HANDOFF_PREFIX,
  POPOUT_HANDOFF_TTL_MS,
  POPOUT_SNAPSHOT_PREFIX,
  readPopoutCarry,
  readPopoutSnapshot,
  takePopoutCarryFromOpener,
  takePopoutHandoff,
  writePopoutCarry,
  writePopoutSnapshot,
  type PortalPopoutHandoff,
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
  clearPopoutHandoffs(); // opener 보관소도 비운다
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

// ── 화면 상태 이어받기(carry) ─────────────────────────────────────────────────────

interface CarryBridge {
  take: (token: string) => { light: Record<string, unknown>; bulky: Record<string, unknown> } | null;
}
const bridge = () => (window as unknown as Record<string, CarryBridge | undefined>)[POPOUT_CARRY_GLOBAL];
const CARRY = { light: { filters: { q: "가나" }, selectedKey: "K1" }, bulky: { rows: [{ id: 1 }, { id: 2 }] } };

function openWithCarry(over: Partial<Parameters<typeof openPagePopout>[0]> = {}) {
  return openPagePopout({
    pageId: "page-a",
    snapshot: null,
    carry: CARRY,
    buildUrl,
    win: makeWin({}),
    now: () => NOW,
    createToken: () => "tok",
    ...over,
  });
}

describe("opener 메모리 보관소", () => {
  it("carry 를 주면 보관소에 넣고 창 전역 take 로 한 번만 꺼낼 수 있다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(bridge()?.take("tok") ?? null).toBeNull(); // 아직 아무것도 없다
    expect(openWithCarry()).not.toBeNull();
    expect(typeof bridge()?.take).toBe("function");
    expect(bridge()!.take("tok")).toEqual({ pageId: "page-a", ...CARRY });
    expect(bridge()!.take("tok")).toBeNull();
  });

  it("carry 를 안 주면 보관소에 넣지 않고 handoff 에도 carry 칸이 없다(지금과 같다)", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry({ carry: undefined });
    expect(bridge()?.take("tok") ?? null).toBeNull();
    expect(readSecureJson<PortalPopoutHandoff>(`${POPOUT_HANDOFF_PREFIX}tok`)).toEqual({ pageId: "page-a", snapshot: null, createdAt: NOW });
  });

  it("10분(TTL)이 지난 항목은 꺼낼 수 없다", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry();
    now.mockReturnValue(NOW + POPOUT_HANDOFF_TTL_MS + 1);
    expect(bridge()!.take("tok")).toBeNull();
  });

  it("다음 openPagePopout 의 sweep 이 TTL 지난 보관소 항목을 지운다", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry({ createToken: () => "old" });
    openWithCarry({ createToken: () => "new", now: () => NOW + POPOUT_HANDOFF_TTL_MS + 1 });
    now.mockReturnValue(NOW + POPOUT_HANDOFF_TTL_MS + 2);
    expect(bridge()!.take("old")).toBeNull();
    expect(bridge()!.take("new")).toMatchObject(CARRY);
  });

  it("clearPopoutHandoffs 가 보관소를 비운다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry();
    clearPopoutHandoffs();
    expect(bridge()!.take("tok")).toBeNull();
  });

  it("차단(null)이면 보관소 항목을 지운다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(openWithCarry({ win: makeWin(null) })).toBeNull();
    expect(bridge()?.take("tok") ?? null).toBeNull();
    expect(localStorage.getItem(`${POPOUT_HANDOFF_PREFIX}tok`)).toBeNull();
  });

  it("window.open 이 던지면 보관소 항목을 지우고 예외를 다시 던진다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const win = makeWin({});
    win.open.mockImplementation(() => {
      throw new Error("open failed");
    });
    expect(() => openWithCarry({ win })).toThrow("open failed");
    expect(bridge()?.take("tok") ?? null).toBeNull();
  });

  it("buildUrl 이 던지면 보관소에 아무것도 남지 않는다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry({ createToken: () => "keep" });
    expect(() =>
      openWithCarry({
        buildUrl: () => {
          throw new Error("bad url");
        },
      })
    ).toThrow("bad url");
    expect(bridge()!.take("tok")).toBeNull();
    expect(bridge()!.take("keep")).toMatchObject(CARRY);
  });

  it("창 열기가 성공하면 TTL 뒤 타이머가 그 token 항목만 지운다(새 창이 가져가지 않아도)", () => {
    // Date 는 그대로 두고 타이머만 가짜로 — take 의 TTL 판정이 아니라 타이머가 지웠는지를 본다.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      openWithCarry({ createToken: () => "a" });
      openWithCarry({ createToken: () => "b" });
      vi.advanceTimersByTime(POPOUT_HANDOFF_TTL_MS - 1);
      expect(vi.getTimerCount()).toBe(2);
      vi.advanceTimersByTime(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(bridge()!.take("a")).toBeNull();
      expect(bridge()!.take("b")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("새 창이 이미 가져간 항목은 타이머가 돌아도 오류 없이 지나간다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      openWithCarry({ createToken: () => "a" });
      expect(bridge()!.take("a")).not.toBeNull();
      vi.advanceTimersByTime(POPOUT_HANDOFF_TTL_MS);
      expect(bridge()!.take("a")).toBeNull(); // 지워진 채 — 오류 없이
    } finally {
      vi.useRealTimers();
    }
  });

  it("차단·예외로 열리지 않으면 타이머를 걸지 않는다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      openWithCarry({ win: makeWin(null) });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("보관소 항목에 pageId 가 들어 있고, 다른 pageId 로 꺼내면 버린다(그 뒤 맞는 pageId 로도 못 꺼낸다)", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry();
    expect(bridge()!.take("tok", "other-page")).toBeNull();
    expect(bridge()!.take("tok", "page-a")).toBeNull();
    openWithCarry();
    expect(bridge()!.take("tok", "page-a")).toEqual({ pageId: "page-a", ...CARRY });
  });
});

describe("handoff carry(light 보조 경로)", () => {
  it("light 는 왕복하고 hadBulky 는 bulky 에 key 가 있으면 true 다. bulky 는 handoff 에 담지 않는다", () => {
    openWithCarry();
    const handoff = takePopoutHandoff("tok", () => NOW);
    expect(handoff?.carry).toEqual({ light: CARRY.light, hadBulky: true });
    expect(JSON.stringify(handoff)).not.toContain("rows");
  });

  it("bulky 가 비어 있으면 hadBulky false", () => {
    openWithCarry({ carry: { light: { a: 1 }, bulky: {} } });
    expect(takePopoutHandoff("tok", () => NOW)?.carry).toEqual({ light: { a: 1 }, hadBulky: false });
  });

  it("조회하지 않은 탭(빈 배열·null)의 bulky 는 hadBulky false, 행이 있으면 true", () => {
    openWithCarry({ carry: { light: { a: 1 }, bulky: { rows: [], detail: null } } });
    expect(takePopoutHandoff("tok", () => NOW)?.carry).toEqual({ light: { a: 1 }, hadBulky: false });
    openWithCarry({ carry: { light: { a: 1 }, bulky: { rows: [], detail: [{ id: 1 }] } }, createToken: () => "tok2" });
    expect(takePopoutHandoff("tok2", () => NOW)?.carry).toEqual({ light: { a: 1 }, hadBulky: true });
  });

  it("쿼터로 carry 가 든 handoff 쓰기가 실패하면 carry 를 뺀 handoff 로 한 번 더 쓴다(snapshot 은 지킨다)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = localStorage;
    let handoffWrites = 0;
    vi.stubGlobal("localStorage", {
      get length() {
        return real.length;
      },
      key: (index: number) => real.key(index),
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => real.removeItem(key),
      setItem: (key: string, value: string) => {
        if (key.startsWith(POPOUT_HANDOFF_PREFIX)) {
          handoffWrites += 1;
          if (handoffWrites === 1) throw new DOMException("quota", "QuotaExceededError");
        }
        real.setItem(key, value);
      },
    });
    const fake = { name: "fake-window" };
    const result = openWithCarry({ snapshot: { q: 9 }, win: makeWin(fake) });
    expect(result).toBe(fake);
    expect(handoffWrites).toBe(2);
    expect(warn).toHaveBeenCalled();
    expect(readSecureJson<PortalPopoutHandoff>(`${POPOUT_HANDOFF_PREFIX}tok`)).toEqual({ pageId: "page-a", snapshot: { q: 9 }, createdAt: NOW });
  });

  it("carry 를 뺀 쓰기도 실패하면 경고만 하고 창은 연다(opener 보관소는 그대로)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const real = localStorage;
    let handoffWrites = 0;
    vi.stubGlobal("localStorage", {
      get length() {
        return real.length;
      },
      key: (index: number) => real.key(index),
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => real.removeItem(key),
      setItem: (key: string, value: string) => {
        if (key.startsWith(POPOUT_HANDOFF_PREFIX)) {
          handoffWrites += 1;
          throw new DOMException("quota", "QuotaExceededError");
        }
        real.setItem(key, value);
      },
    });
    const fake = { name: "fake-window" };
    expect(openWithCarry({ win: makeWin(fake) })).toBe(fake);
    expect(handoffWrites).toBe(2);
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(real.length).toBe(0);
    expect(bridge()!.take("tok")).toMatchObject(CARRY);
  });

  it("carry 가 없는 handoff 쓰기 실패는 다시 쓰지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = localStorage;
    let handoffWrites = 0;
    vi.stubGlobal("localStorage", {
      get length() {
        return real.length;
      },
      key: (index: number) => real.key(index),
      getItem: (key: string) => real.getItem(key),
      removeItem: (key: string) => real.removeItem(key),
      setItem: (key: string, value: string) => {
        if (key.startsWith(POPOUT_HANDOFF_PREFIX)) {
          handoffWrites += 1;
          throw new DOMException("quota", "QuotaExceededError");
        }
        real.setItem(key, value);
      },
    });
    expect(openWithCarry({ carry: undefined })).not.toBeNull();
    expect(handoffWrites).toBe(1);
  });

  it("인코딩 뒤 256KB 를 넘으면 light 를 빼고 console.warn, opener 보관소에는 그대로 있다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    // 한글 1글자 = UTF-8 3바이트 — 80K 글자는 UTF-8 240KB, base64 로 약 320KB.
    const big = { text: "가".repeat(80 * 1024) };
    expect(openWithCarry({ carry: { light: big, bulky: { rows: [1] } } })).not.toBeNull();
    const handoff = takePopoutHandoff("tok", () => NOW);
    expect(handoff).toEqual({ pageId: "page-a", snapshot: null, createdAt: NOW });
    expect(warn).toHaveBeenCalled();
    expect(bridge()!.take("tok")?.light).toEqual(big);
  });

  it("상한 경계: 인코딩 뒤 크기가 정확히 256KB 이하면 담는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // JSON {"t":"…"} 의 바이트 수를 3 의 배수로 맞춰 base64 길이를 정확히 256KB 로 만든다.
    const bytes = (POPOUT_CARRY_MAX_ENCODED_BYTES / 4) * 3; // 196608
    const text = "a".repeat(bytes - '{"t":""}'.length);
    openWithCarry({ carry: { light: { t: text }, bulky: {} } });
    expect(takePopoutHandoff("tok", () => NOW)?.carry?.light).toEqual({ t: text });
    openWithCarry({ carry: { light: { t: `${text}b` }, bulky: {} }, createToken: () => "tok2" });
    expect(takePopoutHandoff("tok2", () => NOW)?.carry).toBeUndefined();
  });

  it("직렬화할 수 없는 light(순환 참조)는 handoff 에서 빠지고 창은 열린다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(openWithCarry({ carry: { light: cyclic, bulky: {} } })).not.toBeNull();
    expect(takePopoutHandoff("tok", () => NOW)?.carry).toBeUndefined();
  });
});

describe("takePopoutCarryFromOpener", () => {
  it("opener 보관소의 값을 꺼내 이 창 안의 복사본으로 돌려준다", () => {
    const stored = { light: { a: { b: 1 } }, bulky: { rows: [{ id: 1 }] } };
    const opener = { closed: false, [POPOUT_CARRY_GLOBAL]: { take: vi.fn(() => stored) } } as unknown as Window;
    const taken = takePopoutCarryFromOpener("tok", opener);
    expect(taken).toEqual(stored);
    expect(taken).not.toBe(stored);
    expect(taken!.bulky.rows).not.toBe(stored.bulky.rows);
  });

  it("opener 가 없거나 닫혔거나 보관소가 없거나 값이 없으면 null", () => {
    expect(takePopoutCarryFromOpener("tok", null)).toBeNull();
    expect(takePopoutCarryFromOpener("tok", { closed: true } as unknown as Window)).toBeNull();
    expect(takePopoutCarryFromOpener("tok", { closed: false } as unknown as Window)).toBeNull();
    expect(
      takePopoutCarryFromOpener("tok", { closed: false, [POPOUT_CARRY_GLOBAL]: { take: () => null } } as unknown as Window)
    ).toBeNull();
  });

  it("opener 접근이 던져도(다른 출처) null", () => {
    const opener = new Proxy({}, {
      get() {
        throw new DOMException("blocked a frame", "SecurityError");
      },
    }) as unknown as Window;
    expect(takePopoutCarryFromOpener("tok", opener)).toBeNull();
  });

  it("Date 같은 값은 JSON 왕복으로 문자열이 된다(handoff·새로고침 경로와 같은 타입)", () => {
    const stored = { light: { at: new Date(0), n: 1 }, bulky: { rows: [{ d: new Date(86_400_000), skip: undefined }] } };
    const opener = { closed: false, [POPOUT_CARRY_GLOBAL]: { take: () => stored } } as unknown as Window;
    expect(takePopoutCarryFromOpener("tok", opener)).toEqual({
      light: { at: "1970-01-01T00:00:00.000Z", n: 1 },
      bulky: { rows: [{ d: "1970-01-02T00:00:00.000Z" }] },
    });
  });

  it("JSON 복제에 실패하는 값(순환 참조)이면 던지지 않고 null — 호출부가 handoff light 로 물러선다", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const opener = { closed: false, [POPOUT_CARRY_GLOBAL]: { take: () => ({ light: {}, bulky: { cyclic } }) } } as unknown as Window;
    expect(takePopoutCarryFromOpener("tok", opener)).toBeNull();
  });

  it("pageId 를 주면 take 에 넘기고, 보관소가 돌려준 pageId 와 다르면 null", () => {
    const take = vi.fn(() => ({ pageId: "page-b", light: {}, bulky: {} }));
    const opener = { closed: false, [POPOUT_CARRY_GLOBAL]: { take } } as unknown as Window;
    expect(takePopoutCarryFromOpener("tok", opener, "page-a")).toBeNull();
    expect(take).toHaveBeenCalledWith("tok", "page-a");
    expect(takePopoutCarryFromOpener("tok", opener, "page-b")).toEqual({ light: {}, bulky: {} });
    expect(takePopoutCarryFromOpener("tok", opener)).toEqual({ light: {}, bulky: {} }); // pageId 를 안 주면 거르지 않는다
  });

  it("셸이 넣은 항목을 다른 pageId 의 창이 꺼내려 하면 null 이고 항목은 버려진다", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry();
    const opener = window as unknown as Window;
    expect(takePopoutCarryFromOpener("tok", opener, "other-page")).toBeNull();
    expect(takePopoutCarryFromOpener("tok", opener, "page-a")).toBeNull();
  });

  it("셸이 openPagePopout 으로 넣은 값을 한 번만 꺼낸다(왕복)", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    openWithCarry();
    const opener = window as unknown as Window; // 같은 문서를 opener 로 본다
    expect(takePopoutCarryFromOpener("tok", opener)).toEqual(CARRY);
    expect(takePopoutCarryFromOpener("tok", opener)).toBeNull();
  });
});

describe("분리 창 sessionStorage carry", () => {
  it("write 뒤 read 하면 light 와 hadBulky 가 돌아온다", () => {
    expect(writePopoutCarry("tok", { light: { q: "가" }, hadBulky: true })).toBe(true);
    expect(sessionStorage.getItem(`${POPOUT_CARRY_SESSION_PREFIX}tok`)).not.toBeNull();
    expect(readPopoutCarry("tok")).toEqual({ light: { q: "가" }, hadBulky: true });
  });

  it("없거나 깨졌으면 null", () => {
    expect(readPopoutCarry("none")).toBeNull();
    sessionStorage.setItem(`${POPOUT_CARRY_SESSION_PREFIX}bad`, "{not json");
    expect(readPopoutCarry("bad")).toBeNull();
  });

  it("256KB 를 넘으면 쓰지 않고 앞서 쓴 값도 지운다", () => {
    writePopoutCarry("tok", { light: { q: 1 }, hadBulky: false });
    expect(writePopoutCarry("tok", { light: { text: "가".repeat(80 * 1024) }, hadBulky: false })).toBe(false);
    expect(readPopoutCarry("tok")).toBeNull();
  });

  it("저장소가 던져도 예외를 삼킨다", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    expect(writePopoutCarry("tok", { light: { q: 1 }, hadBulky: false })).toBe(false);
    expect(readPopoutCarry("tok")).toBeNull();
  });
});
