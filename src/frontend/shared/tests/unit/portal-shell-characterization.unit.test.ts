/** @vitest-environment happy-dom */
/**
 * PortalShell 특성 시험 — 컴포넌트를 탭 상태·전체 화면·인증 사용자·즐겨찾기 묶음으로 나누기 전에
 * 지금 동작을 고정한다(2026-10-04). 고치는 시험이 아니라 "지금 이렇게 동작한다"를 적은 것이므로,
 * 분리 뒤에도 이 파일은 손대지 않고 그대로 통과해야 한다.
 *
 * <p>저장 형식은 secure-storage(JSON → UTF-8 → base64)를 그대로 쓴다. 탭 저장 키 = storageKey.
 */
import { act, createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import type { PortalShellMenuItem, PortalShellPageComponent } from "../../src/portal-shell/types";
import type { PortalFavoriteMenuRecord } from "../../src/portal-menu";
import { readSecureJson, writeSecureJson } from "../../src/secure-storage";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

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

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

// ─────────────────────────────────────────────────────────── 공통 준비

interface StoredTabs {
  tabs: Array<{ id: string; title: string; pageId?: string; pageName?: string; snapshot: unknown }>;
  activeTabId: string | null;
}

const Page: PortalShellPageComponent = () => createElement("div", { className: "t-page" }, "page");

function pageNode(id: string, text: string): PortalShellMenuItem {
  return {
    id,
    name: id,
    displayText: text,
    type: "page",
    items: [],
    parentId: "g",
    expended: null,
    path: "/",
    moduleId: "t",
    pageName: id,
    componentPath: `g/${id}`,
  };
}

function menuOf(labels: { a: string; b: string; c: string }) {
  return {
    items: [
      {
        id: "g",
        name: "g",
        displayText: "그룹",
        type: "dir" as const,
        items: [pageNode("a", labels.a), pageNode("b", labels.b), pageNode("c", labels.c)],
        parentId: null,
        expended: null,
        path: "/",
        moduleId: "t",
        pageName: null,
      },
    ],
  };
}

const MENU = menuOf({ a: "A 화면", b: "B 화면", c: "C 화면" });

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function openTab(pageId: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
  });
  await flush();
}

/** 홈을 뺀 탭바 표시 순서(제목). */
const order = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")).map((el) =>
    (el.querySelector(".tab-title")?.textContent ?? "").trim()
  );
/** 홈을 뺀 탭바 표시 순서(탭 ID). */
const orderIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")).map(
    (el) => el.getAttribute("data-tab-id") ?? ""
  );
const active = () =>
  (
    document.querySelector(".tabs-scroll-area .tab-item.active .tab-title")?.textContent ?? ""
  ).trim();
const homeActive = () => document.querySelector(".home-tab.active") !== null;
const tabIdOf = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]"))
    .find((el) => el.querySelector(".tab-title")?.textContent?.trim() === title)
    ?.getAttribute("data-tab-id") ?? "";

/** 탭바의 탭을 실제 포인터처럼 누른다(mousedown 뒤 200ms 안의 click 만 전환으로 친다). */
function clickTab(title: string) {
  const el = document.querySelector<HTMLElement>(`[data-tab-id="${tabIdOf(title)}"]`);
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el!.click();
  });
}

function closeTabByTitle(title: string) {
  const btn = document.querySelector<HTMLElement>(
    `.tabs-scroll-area [data-tab-id] .tab-close[aria-label="${title} 탭 닫기"]`
  );
  expect(btn).not.toBeNull();
  act(() => btn!.click());
}

function openContextMenu(title: string) {
  const el = document.querySelector<HTMLElement>(`[data-tab-id="${tabIdOf(title)}"]`);
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    );
  });
}

const contextItem = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".tab-context-menu .tab-context-menu-item")
  ).find((el) => el.textContent?.trim() === label);

const controlButton = (label: string) =>
  document.querySelector<HTMLElement>(`.tabs-controls button[aria-label='${label}']`);

const isFullscreen = () => document.querySelector(".portal-shell--tab-fullscreen") !== null;

const stored = (key: string) => readSecureJson<StoredTabs>(key);

function decodeSecure(encoded: string): StoredTabs | null {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as StoredTabs;
  } catch {
    return null;
  }
}

/** storageKey 에 대한 모든 쓰기를 순서대로 모은다. */
function recordWrites(key: string): StoredTabs[] {
  const writes: StoredTabs[] = [];
  // 이 파일의 localStorage 는 위에서 깐 평범한 객체(또는 환경 Storage)다 — 인스턴스의 setItem 을 감싼다.
  const storage = window.localStorage;
  const original = storage.setItem.bind(storage);
  vi.spyOn(storage, "setItem").mockImplementation((k: string, value: string) => {
    if (k === key) {
      const decoded = decodeSecure(value);
      if (decoded) writes.push(decoded);
    }
    original(k, value);
  });
  return writes;
}

function authResponse(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

let rendered: Rendered | null = null;
let storageKey = "";

function shell(props: Partial<PortalShellProps> = {}) {
  return createElement(PortalShell, {
    appName: "TEST",
    menu: MENU,
    resolvePage: async () => Page,
    homePageId: "t:home",
    storageKey,
    ...props,
  });
}

beforeEach(() => {
  storageKey = `portal-shell-char-${Math.random()}`;
  vi.stubGlobal("fetch", authResponse({ authenticated: false, user: null }));
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────── 탭 복원·저장

describe("PortalShell 탭 복원·저장 (특성)", () => {
  it("저장된 탭이 있으면 첫 마운트에서 저장 순서·ID·활성 탭 그대로 복원하고, 홈과 같은 화면·빈 pageId 는 버린다", async () => {
    writeSecureJson<StoredTabs>(storageKey, {
      tabs: [
        { id: "b-1", title: "옛 B", pageId: "t:g/b", snapshot: null },
        { id: "home-dup", title: "홈 중복", pageId: "t:home", snapshot: null },
        { id: "empty", title: "빈", pageId: "", snapshot: null },
        // pageId 없이 pageName 만 있는 옛 형식도 읽는다.
        { id: "legacy-c", title: "옛 C", pageName: "t:g/c", snapshot: null },
        { id: "a-1", title: "옛 A", pageId: "t:g/a", snapshot: null },
      ],
      activeTabId: "a-1",
    });

    rendered = renderWithMantine(shell());
    await flush();

    expect(document.querySelector(".home-tab")).not.toBeNull();
    expect(orderIds()).toEqual(["b-1", "legacy-c", "a-1"]);
    // 제목은 저장된 제목이 아니라 메뉴 표시명을 따른다.
    expect(order()).toEqual(["B 화면", "C 화면", "A 화면"]);
    expect(active()).toBe("A 화면");
    expect(document.querySelectorAll(".t-page")).toHaveLength(4); // 홈 + 복원 3개 모두 화면을 불러온다
  });

  it("저장된 활성 탭 ID 가 복원 목록에 없으면 홈을 활성으로 둔다", async () => {
    writeSecureJson<StoredTabs>(storageKey, {
      tabs: [{ id: "b-1", title: "B", pageId: "t:g/b", snapshot: null }],
      activeTabId: "gone",
    });
    rendered = renderWithMantine(shell());
    await flush();
    expect(order()).toEqual(["B 화면"]);
    expect(homeActive()).toBe(true);
    expect(stored(storageKey)?.activeTabId).toBe("home:t:home");
  });

  it("첫 렌더에서 저장값을 빈 목록으로 덮어쓰지 않는다(홈 있음·없음 모두)", async () => {
    const seed: StoredTabs = {
      tabs: [
        { id: "a-1", title: "A", pageId: "t:g/a", snapshot: { q: 1 } },
        { id: "b-1", title: "B", pageId: "t:g/b", snapshot: null },
      ],
      activeTabId: "a-1",
    };

    for (const homePageId of ["t:home", null]) {
      rendered?.unmount();
      storageKey = `portal-shell-char-${Math.random()}`;
      writeSecureJson(storageKey, seed);
      vi.restoreAllMocks();
      const writes = recordWrites(storageKey);

      rendered = renderWithMantine(shell({ homePageId }));
      await flush();

      expect(writes.length).toBeGreaterThan(0);
      for (const w of writes) expect(w.tabs.length).toBe(2);
      const last = writes[writes.length - 1];
      expect(last.tabs.map((t) => [t.id, t.pageId, t.snapshot])).toEqual([
        ["a-1", "t:g/a", { q: 1 }],
        ["b-1", "t:g/b", null],
      ]);
      expect(last.activeTabId).toBe("a-1");
      expect(active()).toBe("A 화면");
    }
  });

  it("탭 열기·전환·닫기 뒤 저장값은 만든 순서(tabs 배열)와 활성 탭 ID 를 따르고, 홈은 저장하지 않는다", async () => {
    rendered = renderWithMantine(shell());
    await flush();
    expect(stored(storageKey)).toEqual({ tabs: [], activeTabId: "home:t:home" });

    await openTab("t:g/a");
    await openTab("t:g/b");
    const aId = tabIdOf("A 화면");
    const bId = tabIdOf("B 화면");
    expect(stored(storageKey)?.tabs.map((t) => t.id)).toEqual([aId, bId]);
    expect(stored(storageKey)?.activeTabId).toBe(bId);
    expect(stored(storageKey)?.tabs[0]).toEqual({
      id: aId,
      title: "A 화면",
      pageId: "t:g/a",
      snapshot: null,
    });

    clickTab("A 화면");
    await flush();
    expect(active()).toBe("A 화면");
    expect(stored(storageKey)?.activeTabId).toBe(aId);

    // A 를 보면서 C 를 열면 표시는 A 오른쪽이지만 저장은 만든 순서다(표시 순서는 저장하지 않는다).
    await openTab("t:g/c");
    const cId = tabIdOf("C 화면");
    expect(order()).toEqual(["A 화면", "C 화면", "B 화면"]);
    expect(stored(storageKey)?.tabs.map((t) => t.id)).toEqual([aId, bId, cId]);
    expect(stored(storageKey)?.activeTabId).toBe(cId);

    // 보고 있는 탭을 닫으면 tabs 배열(만든 순서)의 마지막 탭으로 간다 — 표시상 이웃이 아니다.
    closeTabByTitle("C 화면");
    await flush();
    expect(active()).toBe("B 화면");
    expect(stored(storageKey)?.tabs.map((t) => t.id)).toEqual([aId, bId]);
    expect(stored(storageKey)?.activeTabId).toBe(bId);

    // 보고 있지 않은 탭을 닫으면 활성 탭은 그대로다.
    closeTabByTitle("A 화면");
    await flush();
    expect(active()).toBe("B 화면");
    expect(stored(storageKey)?.tabs.map((t) => t.id)).toEqual([bId]);

    closeTabByTitle("B 화면");
    await flush();
    expect(homeActive()).toBe(true);
    expect(stored(storageKey)).toEqual({ tabs: [], activeTabId: "home:t:home" });
  });

  it("화면이 넘긴 snapshot 을 저장하고, 다시 마운트하면 그 snapshot 으로 화면을 연다", async () => {
    const received: unknown[] = [];
    const SnapshotPage: PortalShellPageComponent = ({ snapshot, onSnapshotChange }) => {
      received.push(snapshot);
      useEffect(() => {
        if (snapshot == null) onSnapshotChange({ keyword: "abc" });
      }, [snapshot, onSnapshotChange]);
      return createElement("div", null, "snap");
    };
    rendered = renderWithMantine(
      shell({ homePageId: null, resolvePage: async () => SnapshotPage })
    );
    await flush();
    await openTab("t:g/a");
    expect(stored(storageKey)?.tabs[0].snapshot).toEqual({ keyword: "abc" });

    rendered.unmount();
    received.length = 0;
    rendered = renderWithMantine(
      shell({ homePageId: null, resolvePage: async () => SnapshotPage })
    );
    await flush();
    expect(order()).toEqual(["A 화면"]);
    expect(received[0]).toEqual({ keyword: "abc" });
  });

  it("storageKey 가 바뀌면 새 키의 탭을 복원하고, 새 키의 저장값을 옛 탭으로 덮어쓰지 않는다(복원 effect 가 저장 effect 보다 먼저)", async () => {
    const key1 = `${storageKey}-1`;
    const key2 = `${storageKey}-2`;
    writeSecureJson<StoredTabs>(key1, {
      tabs: [{ id: "a-1", title: "A", pageId: "t:g/a", snapshot: null }],
      activeTabId: "a-1",
    });
    writeSecureJson<StoredTabs>(key2, {
      tabs: [{ id: "b-2", title: "B", pageId: "t:g/b", snapshot: null }],
      activeTabId: "b-2",
    });

    rendered = renderWithMantine(shell({ storageKey: key1 }));
    await flush();
    expect(orderIds()).toEqual(["a-1"]);

    rerender(rendered, shell({ storageKey: key2 }));
    await flush();
    expect(orderIds()).toEqual(["b-2"]);
    // 제목 동기화 effect(deps: resolveDisplayText)는 다시 돌지 않으므로 저장된 제목이 그대로 보인다.
    expect(active()).toBe("B");
    expect(stored(key2)?.tabs.map((t) => t.id)).toEqual(["b-2"]);
    expect(stored(key2)?.activeTabId).toBe("b-2");
    expect(stored(key1)?.tabs.map((t) => t.id)).toEqual(["a-1"]);
  });

  it("menu 가 새 객체로 바뀌면 열린 탭 ID·순서·활성 탭은 그대로 두고 제목만 새 메뉴 이름을 따른다", async () => {
    rendered = renderWithMantine(shell());
    await flush();
    await openTab("t:g/a");
    await openTab("t:g/b");
    clickTab("A 화면");
    await flush();
    const before = orderIds();

    rerender(rendered, shell({ menu: menuOf({ a: "A 새이름", b: "B 새이름", c: "C 새이름" }) }));
    await flush();
    expect(orderIds()).toEqual(before);
    expect(order()).toEqual(["A 새이름", "B 새이름"]);
    expect(active()).toBe("A 새이름");
    expect(stored(storageKey)?.tabs.map((t) => t.title)).toEqual(["A 새이름", "B 새이름"]);
  });

  it("menu 교체와 기본 화면 목록 도착이 한 커밋에 겹쳐도 복원 뒤에 기본 화면을 덧붙인다(복원 effect 가 기본 화면 effect 보다 먼저)", async () => {
    writeSecureJson<StoredTabs>(storageKey, {
      tabs: [{ id: "b-1", title: "B", pageId: "t:g/b", snapshot: null }],
      activeTabId: "b-1",
    });
    rendered = renderWithMantine(shell({ startPages: [], isStartPagesLoaded: false }));
    await flush();
    expect(orderIds()).toEqual(["b-1"]);

    // 새 menu 객체(복원 effect 재실행)와 기본 화면 목록(기본 화면 effect 실행)을 한 번에 넘긴다.
    rerender(
      rendered,
      shell({
        menu: menuOf({ a: "A 새이름", b: "B 새이름", c: "C 새이름" }),
        startPages: [{ pageId: "t:g/c", menuId: "t:g/c", displayText: "C", sortOrder: 1 }],
        isStartPagesLoaded: true,
      })
    );
    await flush();
    expect(order()).toEqual(["B 새이름", "C 새이름"]);
    expect(orderIds()[0]).toBe("b-1");
    expect(active()).toBe("B 새이름"); // 복원된 탭이 있으므로 활성 탭은 그대로
  });

  it("홈 화면이 없고 저장된 탭도 없으면 메뉴 첫 화면을 연다", async () => {
    rendered = renderWithMantine(shell({ homePageId: null }));
    await flush();
    expect(document.querySelector(".home-tab")).toBeNull();
    expect(order()).toEqual(["A 화면"]);
    expect(active()).toBe("A 화면");
  });
});

// ─────────────────────────────────────────────────────────── 전체 화면

describe("PortalShell 전체 화면 (특성)", () => {
  it("탭바 버튼으로 들어가고 끝내기 버튼·Esc 로 나오며, 전체 화면은 저장하지 않는다", async () => {
    rendered = renderWithMantine(shell());
    await flush();
    await openTab("t:g/a");
    expect(isFullscreen()).toBe(false);
    expect(controlButton("헤더 접기")).not.toBeNull();

    act(() => controlButton("전체 화면으로 보기")!.click());
    expect(isFullscreen()).toBe(true);
    expect(controlButton("헤더 접기")).toBeNull();
    expect(controlButton("전체 화면 끝내기")).not.toBeNull();

    act(() => controlButton("전체 화면 끝내기")!.click());
    expect(isFullscreen()).toBe(false);

    act(() => controlButton("전체 화면으로 보기")!.click());
    expect(isFullscreen()).toBe(true);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(isFullscreen()).toBe(false);

    // 전체 화면 중 다른 탭으로 옮겨도 전체 화면은 유지된다.
    await openTab("t:g/b");
    act(() => controlButton("전체 화면으로 보기")!.click());
    clickTab("A 화면");
    await flush();
    expect(isFullscreen()).toBe(true);
    expect(active()).toBe("A 화면");

    rendered.unmount();
    rendered = renderWithMantine(shell());
    await flush();
    expect(isFullscreen()).toBe(false);
  });

  it("홈이 없는 포털에서 마지막 탭을 닫아 활성 탭이 없어지면 전체 화면을 끝내고, 그때는 들어가기 버튼이 없다", async () => {
    rendered = renderWithMantine(shell({ homePageId: null, menu: { items: [] } }));
    await flush();
    expect(order()).toEqual([]);
    expect(controlButton("전체 화면으로 보기")).toBeNull();

    await openTab("t:x");
    act(() => controlButton("전체 화면으로 보기")!.click());
    expect(isFullscreen()).toBe(true);

    closeTabByTitle("t:x");
    await flush();
    expect(order()).toEqual([]);
    expect(isFullscreen()).toBe(false);
    expect(controlButton("전체 화면으로 보기")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── 즐겨찾기

function favoriteRow(over: Partial<PortalFavoriteMenuRecord>): PortalFavoriteMenuRecord {
  return {
    id: over.name ?? "x",
    userId: "u",
    name: "x",
    displayText: "",
    type: "page",
    parentId: null,
    expended: null,
    path: "/",
    moduleId: null,
    pageName: null,
    sortOrder: 0,
    componentPath: null,
    ...over,
  };
}

const FAVORITES: PortalFavoriteMenuRecord[] = [
  favoriteRow({ name: "F1", displayText: "업무", type: "folder" }),
  favoriteRow({
    name: "fav-a",
    displayText: "즐겨찾기 A",
    type: "page",
    parentId: "F1",
    moduleId: "t",
    pageName: "a",
    componentPath: "g/a",
  }),
];

describe("PortalShell 즐겨찾기 (특성)", () => {
  it("등록된 화면은 해제(폴더 인자 없음), 미등록 화면은 폴더 선택 뒤 (pageId, 폴더) 로 토글을 부른다", async () => {
    const onToggleFavorite = vi.fn();
    rendered = renderWithMantine(shell({ favoriteMenus: FAVORITES, onToggleFavorite }));
    await flush();
    await openTab("t:g/a");
    await openTab("t:g/b");

    // 탭 제목 앞 즐겨찾기 표시는 등록된 화면에만 붙는다.
    const marks = (title: string) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tab-id="${tabIdOf(title)}"] .tab-mark`)
      ).map((el) => el.getAttribute("aria-label"));
    expect(marks("A 화면")).toEqual(["즐겨찾기"]);
    expect(marks("B 화면")).toEqual([]);

    openContextMenu("A 화면");
    act(() => contextItem("즐겨찾기 해제")!.click());
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite.mock.calls[0]).toEqual(["t:g/a"]);
    expect(document.querySelector(".cm-modal")).toBeNull();

    openContextMenu("B 화면");
    act(() => contextItem("즐겨찾기 추가")!.click());
    expect(onToggleFavorite).toHaveBeenCalledTimes(1); // 팝업만 열린다
    await flush();
    expect(document.querySelector(".cm-modal")).not.toBeNull();
    expect(document.body.textContent).toContain("'B 화면' 를(을) 어느 폴더에 추가할까요?");
    const confirm = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
      (b) => b.textContent?.trim() === "추가"
    );
    act(() => confirm!.click());
    await flush();
    expect(onToggleFavorite).toHaveBeenCalledTimes(2);
    expect(onToggleFavorite.mock.calls[1]).toEqual(["t:g/b", { fvtFoldId: "F1" }]);
  });

  it("사이드바 즐겨찾기 칸은 폴더 아래 화면을 보이고, 누르면 그 화면 탭을 연다", async () => {
    rendered = renderWithMantine(shell({ favoriteMenus: FAVORITES, onToggleFavorite: vi.fn() }));
    await flush();
    const radio = document.querySelector<HTMLInputElement>("input[type=radio][value='favorites']");
    expect(radio).not.toBeNull();
    act(() => radio!.click());
    await flush();

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".favorites-tree .tree-item .item-name")
    ).map((el) => el.textContent?.trim());
    expect(rows).toEqual(["업무", "즐겨찾기 A"]);

    const leaf = Array.from(
      document.querySelectorAll<HTMLElement>(".favorites-tree .tree-item--page")
    ).find((el) => el.textContent?.includes("즐겨찾기 A"));
    act(() => leaf!.click());
    await flush();
    expect(order()).toEqual(["A 화면"]);
    expect(active()).toBe("A 화면");
  });

  it("onToggleFavorite 가 없으면 탭 우클릭 메뉴에 즐겨찾기 항목이 없다", async () => {
    rendered = renderWithMantine(shell({ favoriteMenus: FAVORITES }));
    await flush();
    await openTab("t:g/b");
    openContextMenu("B 화면");
    expect(contextItem("즐겨찾기 추가")).toBeUndefined();
    expect(contextItem("즐겨찾기 해제")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────── 인증 사용자

async function openUserMenu() {
  const target = document.querySelector<HTMLElement>(".portal-header__user-button");
  expect(target).not.toBeNull();
  act(() => target!.click());
  await flush();
}

describe("PortalShell 인증 사용자 표시 (특성)", () => {
  it("props 가 없으면 /api/auth/me 의 사용자 이름·ID 를 보인다", async () => {
    const fetchMock = authResponse({ authenticated: true, user: { id: "hong", name: "홍길동" } });
    vi.stubGlobal("fetch", fetchMock);
    rendered = renderWithMantine(shell());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/api/auth/me");
    expect(rendered.host.textContent).toContain("홍길동 님");
    await openUserMenu();
    expect(document.body.textContent).toContain("로그인 ID · hong");
  });

  it("userName·userLoginId props 가 있으면 조회 결과보다 앞선다", async () => {
    vi.stubGlobal(
      "fetch",
      authResponse({ authenticated: true, user: { id: "hong", name: "홍길동" } })
    );
    rendered = renderWithMantine(shell({ userName: "관리자", userLoginId: "admin" }));
    await flush();
    expect(rendered.host.textContent).toContain("관리자 님");
    expect(rendered.host.textContent).not.toContain("홍길동");
    await openUserMenu();
    expect(document.body.textContent).toContain("로그인 ID · admin");
  });

  it("인증되지 않았거나 조회가 실패하면 기본 문구를 보인다", async () => {
    rendered = renderWithMantine(shell());
    await flush();
    expect(rendered.host.textContent).toContain("사용자 님");
    await openUserMenu();
    expect(document.body.textContent).toContain("로그인 ID · 로그인아이디");
    rendered.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      })
    );
    rendered = renderWithMantine(shell());
    await flush();
    expect(rendered.host.textContent).toContain("사용자 님");
  });

  it("이름이 없는 인증 사용자는 이름 자리에 기본 문구, ID 자리에 사용자 ID 를 보인다", async () => {
    vi.stubGlobal("fetch", authResponse({ authenticated: true, user: { id: "kim", name: null } }));
    rendered = renderWithMantine(shell());
    await flush();
    expect(rendered.host.textContent).toContain("사용자 님");
    await openUserMenu();
    expect(document.body.textContent).toContain("로그인 ID · kim");
  });
});
