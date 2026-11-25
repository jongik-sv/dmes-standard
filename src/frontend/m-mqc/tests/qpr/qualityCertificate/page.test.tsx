/** @vitest-environment happy-dom */
// 품질보증서관리 화면 렌더 시험 — 서버 대역(FakeWtyServer)을 넘겨 진입 INIT, 탭, 종이, 초안 저장(0.7초 모음), 승인 요청 → 승인(v2), 초기화를 본다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { QualityCertificateScreen } from "@/qpr/qualityCertificate/QualityCertificatePage";
import { paperFonts } from "@/qpr/qualityCertificate/paperCss";
import { WtyStore } from "@/qpr/qualityCertificate/store";

import { FakeWtyServer } from "./fakeApi";

const STORES = ["__dkOasisButtonRbacStore__", "__dkOasisCurrentUserStore__"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

paperFonts.on = false;

let host: HTMLDivElement;
let root: Root;
let server: FakeWtyServer;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  server = new FakeWtyServer();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/secUser/myButtonEndpoints")) return json({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const settle = async (n = 10) => {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const text = () => (host.textContent ?? "").replace(/\s+/g, " ");
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label) as HTMLButtonElement | undefined;
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await settle();
}

async function mount() {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(QualityCertificateScreen, { api: server.api() })));
  });
  await settle(20);
}

describe("품질보증서관리 화면", () => {
  it("서버에 문서가 없으면 기본 문서를 INIT 으로 넣고 탭·조항·종이를 보인다", async () => {
    await mount();
    expect(server.calls.map((c) => c.action).slice(0, 3)).toEqual(["search", "save", "search"]);
    expect((server.calls[1].params as { act: string }).act).toBe("INIT");
    expect(server.doc?.ver).toBe(1);
    const t = text();
    for (const label of ["조항·블록", "기준값", "양식", "이미지·서명", "이력", "적용본 v1", "승인 완료", "블록 편집 — 변색"]) expect(t).toContain(label);
    expect(host.querySelector('[data-testid="wty-paper-frame"]')).toBeTruthy();
  });

  it("탭을 바꾸면 그 편집기가 보인다", async () => {
    await mount();
    await click(button("양식"));
    expect(text()).toContain("레이아웃 조정");
    await click(button("이미지·서명"));
    expect(text()).toContain("머리말 이미지 자리");
  });
});

describe("품질보증서 상태 흐름(store)", () => {
  it("고친 본문은 0.7초 모아 DRAFT 로 저장하고, 승인 요청 → 승인하면 v2 와 새 비교 기준이 된다", async () => {
    vi.useFakeTimers();
    try {
      const store = new WtyStore(server.api());
      await store.load();
      store.edit("기준값 수정", (x) => (x.vals.PERFORATION.LUXTEEL = 12));
      store.edit("기준값 수정", (x) => (x.vals.PEEL_FLAKE.LUXTEEL = 11));
      expect(store.state).toBe("DRAFT");
      expect(store.analysis().rows.length).toBe(2);
      const before = server.calls.length;
      await vi.advanceTimersByTimeAsync(800);
      const saves = server.calls.slice(before).filter((c) => c.action === "save");
      expect(saves).toHaveLength(1);
      expect((saves[0].params as { act: string; state: string }).act).toBe("DRAFT");
      expect(server.doc?.state).toBe("DRAFT");

      await store.request();
      expect(store.state).toBe("PENDING");
      expect(store.locked).toBe(true);
      store.edit("막힘", (x) => (x.brand = "X"));
      expect(store.doc!.brand).toBe("LUXTEEL");

      const v = await store.approve();
      expect(v).toBe(2);
      expect(store.state).toBe("APPLIED");
      expect(store.analysis().rows).toEqual([]);
      expect(server.versions[0].memo).toContain("기준값");

      store.undo();
      expect(store.doc!.vals.PEEL_FLAKE.LUXTEEL).toBe(10);
      expect(store.state).toBe("DRAFT");
      await store.discard();
      expect(store.state).toBe("APPLIED");
      expect(store.doc!.vals.PEEL_FLAKE.LUXTEEL).toBe(11);

      await store.reset();
      expect(server.calls.slice(-3).map((c) => c.action)).toEqual(["search", "save", "search"]);
      expect(store.ver).toBe(1);
      expect(store.doc!.vals.PERFORATION.LUXTEEL).toBe(10);
      expect(store.hist.map((h) => h.act)).toEqual(["INIT", "RESET"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
