/** @vitest-environment happy-dom */
// Tag관리 화면 렌더 시험 — 서버 대역(FakeTagServer)을 넘겨 진입 INIT(겹친 진입도 한 번), 3단 화면, 칸 고르기, 탭, 창, 초안 저장(0.7초 모음),
// 승인 요청 → 승인(v2), 초기화를 본다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { TagManagementScreen } from "@/qpr/tagManagement/TagManagementPage";
import { INIT_MSG, TagStore } from "@/qpr/tagManagement/store";

import { FakeTagServer } from "./fakeApi";

const STORES = ["__dkOasisButtonRbacStore__", "__dkOasisCurrentUserStore__"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let host: HTMLDivElement;
let root: Root;
let server: FakeTagServer;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  server = new FakeTagServer();
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
const bodyText = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const button = (label: string, scope: ParentNode = host) =>
  [...scope.querySelectorAll("button")].find((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === label) as HTMLButtonElement | undefined;
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => void el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
}

async function mount() {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(TagManagementScreen, { api: server.api() })));
  });
  await settle(30);
}

describe("Tag관리 화면", () => {
  it("서버에 문서가 없으면 현행 규칙 이관본을 INIT 으로 넣고 목록 · TAG · 검사기를 보인다", async () => {
    await mount();
    expect(server.calls.map((c) => c.action).slice(0, 3)).toEqual(["search", "save", "search"]);
    expect(server.calls[1].params).toMatchObject({ act: "INIT", state: "APPLIED", msg: INIT_MSG });
    const doc = JSON.parse(server.doc!.json);
    expect(Object.keys(doc)).toEqual(["data", "style", "geo", "imgs", "facts"]);
    expect(doc.data.lic.length).toBeGreaterThan(0);
    const t = text();
    for (const label of ["예시 코일", "양식 35종", "적용본 v1", "칸 목록", "코일 조건", "출력 점검", "어디서 왔나", "이 칸에 나올 수 있는 값"]) expect(t).toContain(label);
    expect(host.querySelector('[data-testid="tag-stage"] svg')).toBeTruthy();
    expect(host.querySelector('[data-testid="tag-field-name"]')?.textContent).toBe("BIS 인증번호");
  });

  it("코일을 고르면 제목이 바뀌고, TAG 칸을 누르면 오른쪽에 그 칸이 열린다", async () => {
    await mount();
    const title0 = host.querySelector('[data-testid="tag-coil-title"]')?.textContent;
    const items = [...host.querySelectorAll<HTMLButtonElement>("[data-coil]")];
    await click(items[3]);
    expect(host.querySelector('[data-testid="tag-coil-title"]')?.textContent).not.toBe(title0);
    const fld = host.querySelector('[data-testid="tag-stage"] [data-f="COIL_ID"]');
    await click(fld);
    expect(host.querySelector('[data-testid="tag-field-name"]')?.textContent).toBe("코일번호");
    expect(text()).toContain("MES 코일 정보");
  });

  it("탭과 넓은 창이 열린다 — 칸 목록, 코일 조건, 출력 점검, 기준값 표, 바꾼 것, 현행과 다른 것", async () => {
    await mount();
    await click(button("칸 목록"));
    expect(text()).toContain("언제 찍히나");
    await click(button("코일 조건"));
    expect(text()).toContain("규칙이 정한 것");
    await click(button("출력 점검"));
    expect(text()).toContain("TAG 크기 — 장비로 찍을 수 있나");
    await click(button("기준값 표"));
    expect(bodyText()).toContain("규격 하나에 우리 공장 인증서 하나");
    await click(button("닫기", document.body));
    await click(button("바꾼 것 0"));
    expect(bodyText()).toContain("바꾼 것이 없습니다");
    await click(button("닫기", document.body));
    const gold = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("현행과 다른 것"));
    await click(gold);
    expect(bodyText()).toContain("새 규칙으로 다시 찍어");
  });

  it("인증서 번호를 그 자리에서 고치면 TAG 와 바꾼 것에 바로 반영되고 초안 띠가 붙는다", async () => {
    await mount();
    const inp = host.querySelector<HTMLInputElement>('input[data-ed^="lic|"]');
    expect(inp).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inp, "CML/9999");
      inp!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(text()).toContain("초안 — 발행 안 됨");
    expect(host.querySelector('[data-testid="tag-valbox"]')?.textContent).toBe("CML/9999");
    expect(button("바꾼 것 1")).toBeTruthy();
    expect(host.querySelector('[data-testid="tag-stage"] svg')?.outerHTML).toContain("CML/9999");
  });
});

describe("Tag관리 상태 흐름(store)", () => {
  it("겹쳐 부른 load() 는 INIT 을 한 번만 보낸다", async () => {
    const store = new TagStore(server.api());
    await Promise.all([store.load(), store.load()]);
    expect(server.calls.filter((c) => c.action === "save")).toHaveLength(1);
    expect(store.ver).toBe(1);
  });

  it("다른 창이 먼저 INIT 했으면 다시 읽어 그 문서를 쓴다", async () => {
    const a = new TagStore(server.api());
    const b = new TagStore(server.api());
    await Promise.all([a.load(), b.load()]);
    expect(server.calls.filter((c) => c.action === "save" && (c.params as { act: string }).act === "INIT").length).toBeGreaterThanOrEqual(1);
    expect(server.versions).toHaveLength(1);
    expect(a.state).toBe("APPLIED");
    expect(b.state).toBe("APPLIED");
  });

  it("고친 문서는 0.7초 모아 DRAFT 로 저장하고, 승인 요청 → 승인하면 v2, 초기화하면 v1 로 돌아간다", async () => {
    vi.useFakeTimers();
    try {
      const store = new TagStore(server.api());
      await store.load();
      store.model();
      const lic = store.S!.data.lic[0];
      store.edit("기준값 수정", () => (lic.r.NO = "A"));
      store.edit("기준값 수정", () => (lic.r.NO = "AB"));
      expect(store.state).toBe("DRAFT");
      expect(store.sim!.changes()).toHaveLength(1);
      const before = server.calls.length;
      await vi.advanceTimersByTimeAsync(800);
      const saves = server.calls.slice(before).filter((c) => c.action === "save");
      expect(saves).toHaveLength(1);
      expect(saves[0].params).toMatchObject({ act: "DRAFT", state: "DRAFT" });
      expect(JSON.parse(server.doc!.json).data.lic[0].r.NO).toBe("AB");

      store.undo();
      expect(store.S!.data.lic[0].r.NO).not.toBe("AB");
      expect(store.state).toBe("APPLIED");
      store.redo();
      expect(store.S!.data.lic[0].r.NO).toBe("AB");

      await store.request();
      expect(store.state).toBe("PENDING");
      expect(store.locked).toBe(true);
      store.edit("막힘", (S) => (S.data.lic[0].r.NO = "X"));
      expect(store.S!.data.lic[0].r.NO).toBe("AB");

      const v = await store.approve();
      expect(v).toBe(2);
      expect(store.state).toBe("APPLIED");
      expect(store.sim!.changes()).toEqual([]);
      expect(server.versions[0].memo).toContain("번호");
      expect(server.versions[0].memo).toContain("가상 코일 1,200건 중");

      await store.reset();
      expect(server.calls.slice(-3).map((c) => c.action)).toEqual(["search", "save", "search"]);
      expect(store.ver).toBe(1);
      expect(store.hist.map((h) => h.act)).toEqual(["INIT", "RESET"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
