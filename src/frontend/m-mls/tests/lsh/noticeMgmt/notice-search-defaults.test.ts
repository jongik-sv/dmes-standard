/** @vitest-environment happy-dom */
/**
 * noticeMgmt 화면 × 조회 칸 사용자 기본값(설계 2026-10-07-search-defaults §6.4·§7.3) — fetch 만 가짜이고 화면·shared 는 진짜다.
 *  - 진입 조회는 SearchArea autoSearch 가 한다. 규칙이 없으면 지금처럼 빈 조건으로 한 번 조회한다.
 *  - 규칙이 있으면 칸에 넣은 값(게시기간 짝 포함)으로 한 번 조회한다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSearchDefaultsLocalForDev } from "@dk-oasis/shared/layout";
import { MessageProvider } from "@dk-oasis/shared/message-provider";
import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import NoticeMgmtPage from "../../../pages/lsh/noticeMgmt/page";
import { json, settle } from "./mdm-test-env";

const PAGE_ID = "mls:lsh/noticeMgmt";
const USER = "tester";

function fakeServer() {
  const searches: Record<string, unknown>[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/auth/me") return json({ user: { id: USER } });
    if (url.endsWith("/secUser/myButtonEndpoints")) {
      return json({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } });
    }
    if (url.endsWith("/mdmMeta/columns") || url.endsWith("/mdmMeta/domains")) {
      return json({ items: {}, missing: [], unavailable: [] });
    }
    if (url.endsWith("/noticeMgmt/search")) {
      searches.push(JSON.parse(String(init?.body)).params);
      return json({ meta: { success: true }, data: { result: { list: [] } } });
    }
    if (url.endsWith("/commRoleMng/search")) {
      return json({ meta: { success: true }, data: { result: { ds_main: [] } } });
    }
    // 조회 기본값 미리 받기(secSrchDflt/search) 등 — 빈 응답이면 거울 값을 그대로 쓴다.
    return json({});
  });
  return { fn, searches };
}

/** 사용자 기본값 거울(localStorage)이 읽히도록 메모리 저장소를 둔다. */
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

/** 조회 기본값 저장소(globalThis)를 비운다 — 다음 접근 때 새로 만든다. */
const resetSearchDefaultsStore = () => {
  delete (globalThis as Record<string, unknown>).__dkOasisSearchDefaultsStore__;
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  resetMdmMetaStore();
  resetSearchDefaultsStore();
  vi.stubGlobal("localStorage", memoryStorage());
  // 로그인 사용자를 이미 확인한 상태(포털 셸이 미리 받은 것과 같다).
  (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__ = {
    user: { id: USER, name: null },
    inflight: null,
    generation: 0,
    listeners: new Set(),
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  resetSearchDefaultsStore();
  delete (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__;
  vi.unstubAllGlobals();
});

async function showPage(server: ReturnType<typeof fakeServer>) {
  vi.stubGlobal("fetch", server.fn);
  await act(async () =>
    root!.render(
      createElement(
        TabPageContext.Provider,
        { value: { pageId: PAGE_ID, serviceId: "" } },
        createElement(
          DmesUiProvider,
          null,
          createElement(MessageProvider, null, createElement(MdmMetaProvider, { module: "mls" }, createElement(NoticeMgmtPage))),
        ),
      ),
    ),
  );
  await act(async () => {
    await settle(200);
  });
}

describe("noticeMgmt — 조회 칸 사용자 기본값", () => {
  it("규칙이 없으면 지금처럼 빈 조건으로 한 번 조회한다", async () => {
    const server = fakeServer();
    await showPage(server);
    expect(server.searches).toHaveLength(1);
    expect(server.searches[0]).toMatchObject({
      title: "",
      noticeStatus: "",
      postStartDt: "",
      postEndDt: "",
      noticeCategory: "",
      contentFormat: "",
    });
  });

  it("규칙이 있으면 칸에 넣은 값으로 한 번 조회한다(게시기간 짝 포함)", async () => {
    setSearchDefaultsLocalForDev(USER, PAGE_ID, {
      title: { kind: "fixed", value: "점검" },
      postStartDt: { kind: "fixed", value: "2026-10-01" },
      "postStartDt~to": { kind: "fixed", value: "2026-10-31" },
    });
    const server = fakeServer();
    await showPage(server);
    expect(server.searches).toHaveLength(1);
    expect(server.searches[0]).toMatchObject({ title: "점검", postStartDt: "2026-10-01", postEndDt: "2026-10-31" });
  });
});
