/** @vitest-environment happy-dom */

// TSK-07-03 design.md §3.4 — 항목 편집 렌더 스모크(unit-mng-page.test.ts 패턴). 동적 열 머리(Q5), EXTERNAL 조회 전용(Q6),
// 충돌 문구 → 목록 재조회(F1). D-104 — 카테고리 편집·항목 이력을 합친 뒤의 handoff 수신(handoff > snapshot > 첫 항목),
// 탭별 오른쪽 열 전환, 카테고리 탭 편집 가능 여부.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import DataItemMngPage from "../../../pages/dmd/dataItemMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const CONFLICT = "다른 사용자가 수정했습니다. 다시 불러오세요";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let calls: { action: string; params: Record<string, unknown> }[] = [];
/** dataCateEdit·dataHistory 서비스 호출 — `서비스/액션` 으로 남긴다. */
let otherCalls: { path: string; params: Record<string, unknown> }[] = [];
/** 설정하면 PORT 의 search 응답을 이 약속이 풀릴 때까지 붙잡는다(늦게 도착한 옛 응답 흉내). */
let holdPortSearch: Promise<void> | null = null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ok = (result: unknown) => jsonResponse({ data: { result }, meta: { success: true } });

function header(id: string) {
  const external = id === "CUST";
  return {
    maruDataId: id,
    maruDataName: id === "NEW" ? "신규 창고" : external ? "거래처" : "항구",
    status: "INUSE",
    sourceKind: external ? "EXTERNAL" : "MDM",
    sourceSystem: external ? "ERP" : null,
    lvlCnt: 1,
    attrLabels: [{ field: "attr01", label: external ? "사업자번호" : "국가" }],
    editable: !external,
    categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
  };
}

const row = {
  code: "KRPUS",
  name: "부산",
  alterName: null,
  seq: 1,
  description: null,
  lvl1: "KR",
  attr01: "KR",
  validFrom: "2026-08-20 09:00:00",
  validTo: "9999-12-31 00:00:00",
  open: true,
  rowVersion: 0,
};

async function render(props?: Parameters<typeof DataItemMngPage>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataItemMngPage, props)));
  });
  await flush();
}

const testId = (id: string) => container.querySelector(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/** 조회칸 고르기에서 `keyword` 로 찾는다(칸에 넣고 Enter). 드롭다운 후보 ID 목록을 돌려준다. */
async function findMaru(keyword: string): Promise<string[]> {
  const input = testId("item-pick-keyword") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, keyword);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await flush();
  return Array.from(container.querySelectorAll('[data-testid="item-pick-list"] [role="option"]')).map(
    (o) => o.getAttribute("data-testid")?.replace("item-pick-", "") ?? "",
  );
}

/** 조회칸 고르기 — 그 ID 로 찾고 드롭다운의 후보를 누른다. */
async function chooseMaru(id: string) {
  expect(await findMaru(id)).toContain(id);
  await click(testId(`item-pick-${id}`));
}

const currentMaru = () => testId("item-current")?.textContent ?? "";

const cateList = [
  { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: "^.*$", defTarget: "KEY", description: null, open: true, matchCount: 1 },
  { cateId: "KR", cateName: "국내", defKind: "TABLE", defExpr: null, defTarget: null, description: null, open: true, matchCount: 1 },
  { cateId: "CN", cateName: "중국", defKind: "TABLE", defExpr: null, defTarget: null, description: null, open: true, matchCount: 0 },
];
/** true 면 view 가 주는 선택 목록에 방금 등록된 마루 데이터 NEW 가 들어 있다(서버는 view 마다 목록을 새로 준다). */
let withNewOption = false;
/** 설정하면 dataItemMng delete(닫기) 가 성공하고, 응답을 이 약속이 풀릴 때까지 붙잡는다. 없으면 충돌 문구로 거부한다. */
let holdClose: Promise<void> | null = null;

function maruOptions() {
  return [
    { maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM" },
    { maruDataId: "CUST", maruDataName: "거래처", status: "INUSE", sourceKind: "EXTERNAL" },
    ...(withNewOption ? [{ maruDataId: "NEW", maruDataName: "신규 창고", status: "INUSE", sourceKind: "MDM" }] : []),
  ];
}

/** 설정하면 이 카테고리의 dataCateEdit/view 응답을 이 약속이 풀릴 때까지 붙잡는다. */
let holdCateView: { cateId: string; until: Promise<void> } | null = null;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
}

describe("DataItemMngPage", () => {
  beforeEach(() => {
    calls = [];
    otherCalls = [];
    holdPortSearch = null;
    holdCateView = null;
    withNewOption = false;
    holdClose = null;
    takeMdmPageParams("dmd/dataItemMng");
    // apiRequest 가 토큰을 localStorage 에서 읽는데 이 happy-dom 환경에는 localStorage 가 없다.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/oasis\/dataItemMng\/(\w+)/);
      if (m) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
        calls.push({ action: m[1], params });
        if (m[1] === "view") {
          return ok({
            maruDataOptions: maruOptions(),
            ...(params.maruDataId ? { header: header(String(params.maruDataId)) } : {}),
          });
        }
        if (m[1] === "search") {
          if (params.maruDataId === "PORT" && holdPortSearch) await holdPortSearch;
          const list = params.maruDataId === "CUST" ? [{ ...row, code: "C0001", name: "동국철강" }] : [row];
          return ok({ list, totalCount: 1, page: 0, size: 50 });
        }
        if (m[1] === "delete" && holdClose) {
          await holdClose;
          return ok({ action: "delete", row: { ...row, open: false, rowVersion: 1 } });
        }
        if (m[1] === "delete" || m[1] === "save") {
          return jsonResponse({ data: {}, meta: { success: false, message: CONFLICT } });
        }
      }
      const other = url.match(/\/oasis\/(dataCateEdit|dataHistory)\/(\w+)/);
      if (other) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
        otherCalls.push({ path: `${other[1]}/${other[2]}`, params });
        if (other[1] === "dataHistory") {
          return ok({ target: params.target, key: params.key, state: "OPEN", rows: [] });
        }
        if (other[2] === "search") return ok({ maruDataId: params.maruDataId, lvlCnt: 1, attrLabels: ["국가"], list: cateList });
        if (other[2] === "view") {
          if (holdCateView && holdCateView.cateId === params.cateId) await holdCateView.until;
          const cate = cateList.find((c) => c.cateId === params.cateId);
          return ok({ cate, items: [{ code: "KRPUS", name: "부산", lvl1: "KR" }], memberCodes: ["KRPUS"] });
        }
        if (other[2] === "compare") return ok({ invalid: false, codes: ["KRPUS"], count: 1 });
        return ok({});
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({
          grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
        });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    takeMdmPageParams("dmd/dataItemMng");
  });

  it("첫 마루 데이터를 골라 동적 열 머리를 라벨로 보인다(Q5)", async () => {
    await render();
    expect(calls.map((c) => c.action)).toEqual(["view", "view", "search"]);
    expect(container.textContent).toContain("항목 편집");
    const headers = Array.from(container.querySelectorAll(".ag-header-cell-text")).map((h) => h.textContent);
    expect(headers).toContain("국가");
    expect(headers).toContain("1차");
    expect(headers).not.toContain("attr01");
    expect(button("항목 추가")?.disabled).toBe(false);
  });

  it("EXTERNAL 마루 데이터는 「항목 추가」가 비활성이고 행에 닫기가 없다(Q6)", async () => {
    await render();
    await chooseMaru("CUST");
    expect(calls.filter((c) => c.action === "view").at(-1)?.params.maruDataId).toBe("CUST");
    expect(button("항목 추가")?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="item-readonly"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="item-close-C0001"]')).toBeNull();
    expect(container.querySelector('[data-testid="item-history-C0001"]')).not.toBeNull();
  });

  it("늦게 도착한 옛 조회 응답은 새 선택의 목록을 덮지 않는다", async () => {
    let release!: () => void;
    holdPortSearch = new Promise<void>((resolve) => {
      release = resolve;
    });
    await render();
    await chooseMaru("CUST");
    expect(container.querySelector('[data-testid="item-history-C0001"]')).not.toBeNull();

    await act(async () => {
      release();
    });
    await flush();
    expect(container.querySelector('[data-testid="item-history-C0001"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="item-close-KRPUS"]')).toBeNull();
  });

  it("충돌 문구를 받으면 안내를 보이고 목록을 다시 부른다(F1)", async () => {
    await render();
    const close = container.querySelector('[data-testid="item-close-KRPUS"]') as HTMLButtonElement;
    expect(close).not.toBeNull();
    const searchesBefore = calls.filter((c) => c.action === "search").length;
    await act(async () => {
      close.click();
    });
    await flush();
    expect(calls.some((c) => c.action === "delete")).toBe(true);
    expect(document.body.textContent).toContain("다른 사용자가 수정했습니다");
    expect(calls.filter((c) => c.action === "search").length).toBe(searchesBefore + 1);
  });
  // ── D-104: handoff 수신 ──

  it("handoff 로 받은 마루 데이터를 고르고 첫 항목(PORT)은 부르지 않는다", async () => {
    openMdmPage("dmd/dataItemMng", { maruDataId: "CUST" });
    const onSnapshotChange = vi.fn();
    await render({ tabId: "t1", snapshot: null, onSnapshotChange });
    const viewed = calls.filter((c) => c.action === "view").map((c) => c.params.maruDataId ?? "");
    expect(viewed).toContain("CUST");
    expect(viewed).not.toContain("PORT");
    expect(calls.filter((c) => c.action === "search").map((c) => c.params.maruDataId)).toEqual(["CUST"]);
    expect(currentMaru()).toBe("CUST 거래처");
    expect(onSnapshotChange).toHaveBeenLastCalledWith({ maruDataId: "CUST" });
  });

  it("handoff 가 snapshot 보다 앞선다", async () => {
    openMdmPage("dmd/dataItemMng", { maruDataId: "CUST" });
    await render({ tabId: "t1", snapshot: { maruDataId: "PORT" }, onSnapshotChange: vi.fn() });
    expect(calls.filter((c) => c.action === "search").map((c) => c.params.maruDataId)).toEqual(["CUST"]);
  });

  it("handoff 가 없으면 snapshot 의 마루 데이터가 첫 항목보다 앞선다", async () => {
    const onSnapshotChange = vi.fn();
    await render({ tabId: "t1", snapshot: { maruDataId: "CUST", other: 1 }, onSnapshotChange });
    expect(calls.filter((c) => c.action === "search").map((c) => c.params.maruDataId)).toEqual(["CUST"]);
    expect(onSnapshotChange).toHaveBeenLastCalledWith({ maruDataId: "CUST", other: 1 });
  });

  it("이미 열린 탭이 다시 활성화되면 새 handoff 로 마루 데이터를 바꾼다", async () => {
    await render({ tabId: "t1", snapshot: null, onSnapshotChange: vi.fn() });
    expect(currentMaru()).toBe("PORT 항구");
    openMdmPage("dmd/dataItemMng", { maruDataId: "CUST" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
    });
    await flush();
    expect(calls.filter((c) => c.action === "search").at(-1)?.params.maruDataId).toBe("CUST");
    expect(currentMaru()).toBe("CUST 거래처");
  });

  // ── D-104: 탭별 오른쪽 열 ──

  it("항목 탭은 오른쪽에 항목 이력, 카테고리 탭은 미리보기·카테고리 이력을 보이고 카테고리는 탭에 들어갈 때 읽는다", async () => {
    await render();
    expect(otherCalls).toEqual([]);
    expect(testId("item-history")).not.toBeNull();
    expect(testId("item-history-empty")).not.toBeNull();
    expect(testId("cate-preview")).toBeNull();
    expect(testId("cate-history")).toBeNull();

    await click(testId("item-history-KRPUS"));
    expect(otherCalls.at(-1)).toEqual({
      path: "dataHistory/search", params: { maruDataId: "PORT", target: "ITEM", key: "KRPUS" },
    });
    expect(testId("item-history")?.textContent).toContain("이력 — KRPUS");

    await click(testId("item-tab-cate"));
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
    expect(testId("item-history")).toBeNull();
    expect(testId("cate-tab")).not.toBeNull();
    expect(testId("cate-preview")?.textContent).toContain("카테고리를 고르면");
    expect(testId("cate-history-empty")).not.toBeNull();

    // 카테고리를 고르면 상세를 읽고, 대상 「카테고리」 이력을 그 ID 로 바로 부른다.
    await click(testId("cate-row-KR"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/view" && c.params.cateId === "KR")).toBe(true);
    expect(otherCalls.filter((c) => c.path === "dataHistory/search").at(-1)?.params).toEqual({
      maruDataId: "PORT", target: "CATE", key: "KR",
    });
    expect(testId("cate-preview")?.textContent).toContain("TABLE 카테고리는");
    expect(testId("transfer-list-panel")).not.toBeNull();

    // 항목 탭으로 돌아오면 항목 이력 자리로 바뀌고, 같은 마루 데이터면 카테고리를 다시 읽지 않는다.
    await click(testId("item-tab-grid"));
    expect(testId("item-history")).not.toBeNull();
    expect(testId("cate-history")).toBeNull();
    await click(testId("item-tab-cate"));
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search")).toHaveLength(1);
  });

  it("카테고리 탭에서 마루 데이터를 바꾸면 탭은 그대로 두고 카테고리를 그 데이터로 다시 읽는다", async () => {
    await render();
    await click(testId("item-tab-cate"));
    await chooseMaru("CUST");
    expect(testId("cate-tab")).not.toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search").map((c) => c.params.maruDataId)).toEqual([
      "PORT", "CUST",
    ]);
    expect(calls.filter((c) => c.action === "search").at(-1)?.params.maruDataId).toBe("CUST");
  });

  // ── D-104: 카테고리 탭 편집 가능 여부 ──

  it("편집 가능한 마루 데이터는 카테고리 등록 폼과 닫기 버튼을 보인다(BASE 는 닫기 없음)", async () => {
    await render();
    await click(testId("item-tab-cate"));
    expect(testId("cate-readonly")).toBeNull();
    expect(testId("cate-add-id")).not.toBeNull();
    expect(testId("cate-close-KR")).not.toBeNull();
    expect(testId("cate-close-BASE")).toBeNull();

    await click(testId("cate-close-KR"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/delete" && c.params.cateId === "KR")).toBe(true);
  });

  it("조회 전용(EXTERNAL) 마루 데이터는 카테고리 탭도 편집을 막는다", async () => {
    await render();
    await chooseMaru("CUST");
    await click(testId("item-tab-cate"));
    expect(testId("cate-readonly")).not.toBeNull();
    expect(testId("cate-add-id")).toBeNull();
    expect(testId("cate-close-KR")).toBeNull();
    await click(testId("cate-row-KR"));
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("다른 TABLE 카테고리를 고르면 새 상세가 올 때까지 이전 소속 목록을 잠근다", async () => {
    await render();
    await click(testId("item-tab-cate"));
    await click(testId("cate-row-KR"));
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(false);

    let release!: () => void;
    holdCateView = { cateId: "CN", until: new Promise<void>((resolve) => (release = resolve)) };
    await click(testId("cate-row-CN"));
    // KR 의 소속이 아직 보이지만 적용·이동은 막힌다 — 이 사이 [적용] 하면 KR 소속 diff 가 CN 에 저장된다.
    expect(testId("transfer-member-KRPUS")).not.toBeNull();
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release();
    });
    await flush();
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  // ── 리뷰 결함 수정 ──

  it("이미 열린 탭이 처음 목록에 없던 마루 데이터를 handoff 로 받으면 그 데이터를 제 이름으로 보이고 고르기에서도 찾는다", async () => {
    await render({ tabId: "t1", snapshot: null, onSnapshotChange: vi.fn() });
    expect(await findMaru("NEW")).not.toContain("NEW");

    withNewOption = true;
    openMdmPage("dmd/dataItemMng", { maruDataId: "NEW" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
    });
    await flush();
    expect(currentMaru()).toBe("NEW 신규 창고");
    expect(await findMaru("신규")).toEqual(["NEW"]);
  });

  it("행 쓰기 응답을 기다리는 사이 마루 데이터가 바뀌면 이전 데이터의 이력·트리를 다시 부르지 않는다", async () => {
    await render();
    await click(testId("item-history-KRPUS"));
    expect(testId("item-history")?.textContent).toContain("이력 — KRPUS");

    let release!: () => void;
    holdClose = new Promise<void>((resolve) => (release = resolve));
    await click(testId("item-close-KRPUS"));
    // 응답 전에 트리 탭으로 옮기고 다른 마루 데이터를 고른다.
    await click(testId("item-tab-tree"));
    await chooseMaru("CUST");
    const historyCallsBefore = otherCalls.filter((c) => c.path === "dataHistory/search").length;
    const treeCallsBefore = calls.filter((c) => c.action === "search" && c.params.withTree === true).length;

    await act(async () => {
      release();
    });
    await flush();
    expect(calls.some((c) => c.action === "delete")).toBe(true);
    // 이전 데이터(PORT)의 KRPUS 이력을 새 데이터 화면에 다시 부르지 않는다.
    expect(otherCalls.filter((c) => c.path === "dataHistory/search")).toHaveLength(historyCallsBefore);
    expect(testId("item-history-empty")).not.toBeNull();
    // 이전 데이터(PORT)의 트리로 새 데이터 트리를 덮지 않는다.
    const treeCalls = calls.filter((c) => c.action === "search" && c.params.withTree === true);
    expect(treeCalls).toHaveLength(treeCallsBefore);
    expect(treeCalls.at(-1)?.params.maruDataId).toBe("CUST");
  });

  it("행 쓰기가 끝났을 때 마루 데이터가 그대로면 트리 탭의 트리와 열린 이력을 다시 부른다", async () => {
    await render();
    await click(testId("item-history-KRPUS"));
    let release!: () => void;
    holdClose = new Promise<void>((resolve) => (release = resolve));
    await click(testId("item-close-KRPUS"));
    await click(testId("item-tab-tree"));
    const historyCallsBefore = otherCalls.filter((c) => c.path === "dataHistory/search").length;
    const treeCallsBefore = calls.filter((c) => c.action === "search" && c.params.withTree === true).length;

    await act(async () => {
      release();
    });
    await flush();
    expect(otherCalls.filter((c) => c.path === "dataHistory/search")).toHaveLength(historyCallsBefore + 1);
    expect(otherCalls.at(-1)?.params).toEqual({ maruDataId: "PORT", target: "ITEM", key: "KRPUS" });
    const treeCalls = calls.filter((c) => c.action === "search" && c.params.withTree === true);
    expect(treeCalls).toHaveLength(treeCallsBefore + 1);
    expect(treeCalls.at(-1)?.params.maruDataId).toBe("PORT");
  });
});
