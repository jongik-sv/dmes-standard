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
import {
  SEARCH_DEFAULTS_USER,
  clearSearchDefaultsUser,
  givenSearchDefaults,
  inTabPage,
  setSearchDefaultsUser,
} from "../../helpers/search-defaults";

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

// Modal·TransferList 은 document.body 포털에 그려지므로 container 가 아니라 document 로 찾는다
// (m-mdm 다른 페이지 테스트와 같은 규약).
const testId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

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
  // BASE 말고 편집 가능한 REGEX — 정규식 문법 오류 경로를 시험한다(BASE 는 예약이라 [편집] 이 없다).
  { cateId: "R1", cateName: "숫자 시작", defKind: "REGEX", defExpr: "^[0-9]", defTarget: "KEY", description: null, open: true, matchCount: 0 },
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
/** dataCateEdit/view 가 주는 TABLE 후보 — KRPUS 는 소속, KRINC 는 가능 쪽에 남는다. */
const cateItems = [{ code: "KRPUS", name: "부산", lvl1: "KR" }, { code: "KRINC", name: "인천", lvl1: "KR" }];
/** dataCateEdit/save 호출마다 받은 grids(소속 diff). */
let saveGrids: unknown[] = [];
/** true 면 compare 가 정규식 문법 오류(invalid)를 돌려준다 — 미완성 괄호 같은 경우. */
let holdCompareInvalid = false;
/** 설정하면 dataCateEdit/reg 를 이 문구로 거부한다(OASIS 거부 = HTTP 200 + meta.success=false). */
let rejectCateReg: string | null = null;

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** shared `Input` 래퍼는 React controlled 이므로 네이티브 setter 로 값을 심고 input 이벤트를 흘려야 한다. */
async function type(el: Element | null, value: string) {
  expect(el).not.toBeNull();
  const input = el as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

/** 전송 목록 행의 체크박스 — 선택 여부를 본다. */
function rowCheckbox(side: "available" | "member", code: string): HTMLInputElement {
  const box = testId(`transfer-item-${side}-${code}`)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(box, `${side}-${code}`).toBeTruthy();
  return box!;
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
    saveGrids = [];
    holdCompareInvalid = false;
    rejectCateReg = null;
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
        if (other[2] === "save") saveGrids.push(JSON.parse(String(init?.body ?? "{}")).grids ?? null);
        if (other[1] === "dataHistory") {
          return ok({ target: params.target, key: params.key, state: "OPEN", rows: [] });
        }
        if (other[2] === "search") return ok({ maruDataId: params.maruDataId, lvlCnt: 1, attrLabels: ["국가"], list: cateList });
        if (other[2] === "view") {
          if (holdCateView && holdCateView.cateId === params.cateId) await holdCateView.until;
          const cate = cateList.find((c) => c.cateId === params.cateId);
          return ok({ cate, items: cateItems, memberCodes: ["KRPUS"] });
        }
        if (other[2] === "reg" && rejectCateReg) {
          return jsonResponse({ data: {}, meta: { success: false, message: rejectCateReg } });
        }
        if (other[2] === "compare") {
          return ok(holdCompareInvalid
            ? { invalid: true, codes: [], count: 0 }
            : { invalid: false, codes: ["KRPUS"], count: 1 });
        }
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

  it("행 번호(No) 가 키 앞에 붙고 1부터 매겨진다 — 드래그 재배열은 없다", async () => {
    await render();
    const headers = Array.from(container.querySelectorAll(".ag-header-cell"))
      .map((h) => h.querySelector(".ag-header-cell-text")?.textContent);
    // 맨 앞 열이 No 다 — 드래그 핸들이 아니다(재배열해도 저장되지 않는다).
    expect(headers[0]).toBe("No");
    expect(headers.indexOf("No")).toBeLessThan(headers.indexOf("키"));
    // 표시 순서대로 1부터 매겨진다(저장 값이 아니라 화면 순서다).
    const nums = Array.from(container.querySelectorAll('.ag-row [col-id="__rowNo"]')).map((c) => c.textContent?.trim());
    expect(nums).toEqual(["1"]);
    // 드래그 핸들은 없다.
    expect(container.querySelector(".ag-row-drag-handle")).toBeNull();
    expect(container.querySelector(".ag-row-drag")).toBeNull();
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

  it("오른쪽은 [카테고리 편집][코드 테스트] 탭이고, 각각 미리보기·카테고리 이력과 항목 이력을 본다", async () => {
    await render();
    // 카테고리 편집이 처음 선택된 탭이다 — 화면이 열리자마자 그 탭의 카테고리를 읽는다.
    expect(testId("item-right-tab-cate")).not.toBeNull();
    expect(testId("item-right-tab-test")).not.toBeNull();
    expect(testId("cate-tab")).not.toBeNull();
    expect(testId("item-history")).toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search").map((c) => c.params.maruDataId)).toEqual(["PORT"]);

    // 코드 테스트 탭 — 항목 이력 자리.
    await click(testId("item-right-tab-test"));
    expect(testId("item-history")).not.toBeNull();
    expect(testId("item-history-empty")).not.toBeNull();
    expect(testId("cate-tab")).toBeNull();

    await click(testId("item-history-KRPUS"));
    expect(otherCalls.at(-1)).toEqual({
      path: "dataHistory/search", params: { maruDataId: "PORT", target: "ITEM", key: "KRPUS" },
    });
    expect(testId("item-history")?.textContent).toContain("이력 — KRPUS");

    // 카테고리 편집 탭으로 돌아오면, 같은 마루 데이터면 카테고리를 다시 읽지 않는다.
    await click(testId("item-right-tab-cate"));
    expect(testId("item-history")).toBeNull();
    // 이력 칸은 카테고리를 고르지 않았어도 그려진다 — 카테고리 섹션의 세로 스택이 유지돼야 아래 소속이 밀리지 않는다.
    expect(testId("cate-history")).not.toBeNull();
    expect(testId("cate-history-empty")?.textContent).toBe("카테고리를 고르면 이력이 보입니다");
    // 조회 컨트롤(대상 Select·항목 키·[조회])은 없다 — 고른 카테고리 그것이 곧 조회 조건이다.
    expect(testId("cate-history-target")).toBeNull();
    expect(testId("cate-history-key")).toBeNull();
    expect(testId("cate-history-search")).toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search")).toHaveLength(1);

    // 카테고리를 고르면 상세를 읽고, 대상 「카테고리」 이력을 그 ID 로 바로 부른다.
    await click(testId("cate-row-KR"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/view" && c.params.cateId === "KR")).toBe(true);
    expect(otherCalls.filter((c) => c.path === "dataHistory/search").at(-1)?.params).toEqual({
      maruDataId: "PORT", target: "CATE", key: "KR",
    });
    expect(testId("cate-history")?.textContent).toContain("카테고리 이력 — KR");
    // 별도 미리보기 패널이 없다 — 정규식 매칭 결과가 곧 소속 목록이다.
    expect(testId("cate-preview")).toBeNull();
    // TABLE 편집은 동작 칸의 [편집] 이 transfer-list 팝업을 연다(목록은 읽기 전용 — 쓰기가 서버로 바로 간다).
    expect(testId("transfer-list-panel")).toBeNull();
    await click(testId("cate-edit-KR"));
    expect(testId("transfer-list-panel")).not.toBeNull();
  });

  it("REGEX 는 소속 목록이 곧 매칭 결과고, 정규식이 틀리면 비는 이유를 함께 보인다", async () => {
    await render();
    // R1 은 편집 가능한 REGEX(`^[0-9]`, 대상 KEY) — 문법이 맞으면 오류 문구가 없다.
    await click(testId("cate-row-R1"));
    expect(testId("cate-regex-invalid")).toBeNull();
    expect(document.body.textContent).not.toContain("정규식 문법이 올바르지 않습니다");

    // compare 가 invalid 를 주면 — 목록이 비는 것과, 비는 이유를 함께 보여 준다.
    holdCompareInvalid = true;
    await click(testId("cate-edit-R1"));
    await type(testId("regex-expr"), "(");
    expect(otherCalls.some((c) => c.path === "dataCateEdit/compare")).toBe(true);
    expect(testId("cate-regex-invalid")?.textContent).toBe("정규식 문법이 올바르지 않습니다");
  });

  it("카테고리 편집 탭에서 마루 데이터를 바꾸면 탭은 그대로 두고 카테고리를 그 데이터로 다시 읽는다", async () => {
    await render();
    await chooseMaru("CUST");
    expect(testId("cate-tab")).not.toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/search").map((c) => c.params.maruDataId)).toEqual([
      "PORT", "CUST",
    ]);
    expect(calls.filter((c) => c.action === "search").at(-1)?.params.maruDataId).toBe("CUST");
  });

  // ── D-104: 카테고리 탭 편집 가능 여부 ──

  it("편집 가능한 마루 데이터는 카테고리 추가 팝업과 닫기 버튼을 보인다(BASE 는 닫기 없음)", async () => {
    await render();
    expect(testId("cate-readonly")).toBeNull();
    expect(testId("cate-add")).not.toBeNull();
    // 추가 폼은 버튼을 눌러 팝업으로 연다(목록에 인라인 폼을 두지 않는다).
    expect(testId("cate-add-id")).toBeNull();
    await click(testId("cate-add"));
    expect(testId("cate-add-id")).not.toBeNull();
    expect(testId("cate-add-name")).not.toBeNull();
    await click(testId("cate-add-cancel"));
    expect(testId("cate-add-id")).toBeNull();

    expect(testId("cate-close-KR")).not.toBeNull();
    expect(testId("cate-close-BASE")).toBeNull();

    await click(testId("cate-close-KR"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/delete" && c.params.cateId === "KR")).toBe(true);
  });

  it("추가 팝업에서 ID 와 이름을 넣고 [추가] 하면 그 값으로 등록한다", async () => {
    await render();
    await click(testId("cate-add"));
    // 빈 칸이면 무엇이 비었는지 알리고 등록하지 않는다.
    await click(testId("cate-add-submit"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/reg")).toBe(false);

    await type(testId("cate-add-id"), "NEW_CATE");
    await type(testId("cate-add-name"), "신규 카테고리");
    await click(testId("cate-add-submit"));
    expect(otherCalls.some((c) => c.path === "dataCateEdit/reg" && c.params.cateId === "NEW_CATE")).toBe(true);
  });

  it("등록이 성공하면 팝업을 닫는다", async () => {
    await render();
    await click(testId("cate-add"));
    await type(testId("cate-add-id"), "NEW_CATE");
    await type(testId("cate-add-name"), "신규 카테고리");
    await click(testId("cate-add-submit"));
    await flush();
    expect(testId("cate-add-id")).toBeNull();
  });

  // 2026-10-03 mdm-user 여정 결함 — 서버가 거부해도 팝업이 닫히고 입력이 지워졌다(룰·코드 등록 팝업은 입력을 남긴다).
  it("서버가 등록을 거부하면 팝업은 열린 채 입력을 남기고 오류를 보인다(오류 창을 닫아도 남는다)", async () => {
    rejectCateReg = "이미 있는 카테고리 ID 입니다: NEW_CATE";
    await render();
    await click(testId("cate-add"));
    await type(testId("cate-add-id"), "NEW_CATE");
    await type(testId("cate-add-name"), "신규 카테고리");
    await click(testId("cate-add-submit"));
    await flush();
    expect(otherCalls.some((c) => c.path === "dataCateEdit/reg" && c.params.cateId === "NEW_CATE")).toBe(true);
    expect(document.body.textContent).toContain("이미 있는 카테고리 ID 입니다: NEW_CATE");
    expect((testId("cate-add-id") as HTMLInputElement | null)?.value).toBe("NEW_CATE");
    expect((testId("cate-add-name") as HTMLInputElement | null)?.value).toBe("신규 카테고리");

    const ok = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === "확인");
    await click(ok ?? null);
    await flush();
    expect(document.body.textContent).not.toContain("이미 있는 카테고리 ID 입니다");
    expect((testId("cate-add-id") as HTMLInputElement | null)?.value).toBe("NEW_CATE");
    expect((testId("cate-add-name") as HTMLInputElement | null)?.value).toBe("신규 카테고리");
  });

  it("거부 오류 창이 떠 있을 때 Escape 를 눌러도 추가 팝업은 닫히지 않는다", async () => {
    rejectCateReg = "이미 있는 카테고리 ID 입니다: NEW_CATE";
    await render();
    await click(testId("cate-add"));
    await type(testId("cate-add-id"), "NEW_CATE");
    await type(testId("cate-add-name"), "신규 카테고리");
    await click(testId("cate-add-submit"));
    await flush();
    expect(document.body.textContent).toContain("이미 있는 카테고리 ID 입니다: NEW_CATE");
    await act(async () => {
      // shared Modal 은 열린 창마다 window 의 Escape 를 받는다 — 요소에서 올려 window 까지 닿게 한다.
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await flush();
    expect((testId("cate-add-id") as HTMLInputElement | null)?.value).toBe("NEW_CATE");
  });

  // 훅 규칙(2026-10-03): 팝업은 훅을 모두 부른 뒤 닫혔으면 그리지 않고, 열릴 때 칸을 비운다.
  it("거부 뒤 [취소] 로 닫았다가 다시 열면 칸이 비어 있다", async () => {
    rejectCateReg = "이미 있는 카테고리 ID 입니다: NEW_CATE";
    await render();
    await click(testId("cate-add"));
    await type(testId("cate-add-id"), "NEW_CATE");
    await type(testId("cate-add-name"), "신규 카테고리");
    await click(testId("cate-add-submit"));
    await flush();
    const ok = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === "확인");
    await click(ok ?? null);
    await click(testId("cate-add-cancel"));
    expect(testId("cate-add-id")).toBeNull();
    await click(testId("cate-add"));
    expect((testId("cate-add-id") as HTMLInputElement | null)?.value).toBe("");
    expect((testId("cate-add-name") as HTMLInputElement | null)?.value).toBe("");
  });

  it("조회 전용(EXTERNAL) 마루 데이터는 카테고리 탭도 편집을 막는다", async () => {
    await render();
    await chooseMaru("CUST");
    expect(testId("cate-readonly")).not.toBeNull();
    expect(testId("cate-add")).toBeNull();
    expect(testId("cate-close-KR")).toBeNull();
    await click(testId("cate-row-KR"));
    expect(testId("cate-edit-KR")).toBeNull();
  });

  it("다른 TABLE 카테고리를 고르면 새 상세가 올 때까지 이전 소속 목록을 잠근다", async () => {
    await render();
    await click(testId("cate-row-KR"));
    await click(testId("cate-edit-KR"));
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(false);

    let release!: () => void;
    holdCateView = { cateId: "CN", until: new Promise<void>((resolve) => (release = resolve)) };
    await click(testId("cate-row-CN"));
    // KR 의 소속이 아직 보이지만 적용·이동은 막힌다 — 이 사이 [적용] 하면 KR 소속 diff 가 CN 에 저장된다.
    expect(testId("transfer-item-member-KRPUS")).not.toBeNull();
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(true);
    // 이동도 잠긴다 — 가능 쪽 항목(KRINC)을 골라 둬도 > 는 꺼져 있고, 행을 눌러도 골라지지 않는다.
    await click(testId("transfer-item-available-KRINC"));
    expect(rowCheckbox("available", "KRINC").checked).toBe(false);
    expect((testId("transfer-move-right") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release();
    });
    await flush();
    expect((testId("transfer-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("소속 이동은 화면 상태만 바꾸고, 서버 저장은 [적용] 을 눌렀을 때 diff 로 한 번 간다", async () => {
    await render();
    await click(testId("cate-row-KR"));
    await click(testId("cate-edit-KR"));
    expect(testId("transfer-list-panel")).not.toBeNull();
    // 선택이 없으면 > 는 꺼져 있다.
    expect((testId("transfer-move-right") as HTMLButtonElement).disabled).toBe(true);

    await click(testId("transfer-item-available-KRINC"));
    expect(rowCheckbox("available", "KRINC").checked).toBe(true);
    expect((testId("transfer-move-right") as HTMLButtonElement).disabled).toBe(false);
    await click(testId("transfer-move-right"));
    // 이동 즉시 소속 쪽에 보이지만 서버(save)는 부르지 않는다.
    expect(testId("transfer-item-member-KRINC")).not.toBeNull();
    expect(testId("transfer-item-available-KRINC")).toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/save")).toHaveLength(0);

    // 소속 KRPUS 를 빼도 마찬가지다.
    await click(testId("transfer-item-member-KRPUS"));
    await click(testId("transfer-move-left"));
    expect(testId("transfer-item-available-KRPUS")).not.toBeNull();
    expect(otherCalls.filter((c) => c.path === "dataCateEdit/save")).toHaveLength(0);

    await click(testId("transfer-apply"));
    const saves = otherCalls.filter((c) => c.path === "dataCateEdit/save");
    expect(saves).toHaveLength(1);
    expect(saves[0].params).toEqual({ maruDataId: "PORT", cateId: "KR" });
    expect(saveGrids.at(-1)).toEqual({
      addCodes: { rows: [{ code: "KRINC" }] },
      removeCodes: { rows: [{ code: "KRPUS" }] },
    });
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
    // 항목 이력은 오른쪽 [코드 테스트] 탭에 있다.
    await click(testId("item-right-tab-test"));
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
    await click(testId("item-right-tab-test"));
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

  describe("조회 칸 사용자 기본값(dependsOn)", () => {
    const PAGE_ID = "mdm:dmd/dataItemMng";
    const listSearches = () => calls.filter((c) => c.action === "search" && c.params.withTree !== true);

    async function renderInTab() {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root!.render(createElement(DmesUiProvider, null, inTabPage(PAGE_ID, createElement(DataItemMngPage))));
      });
      await flush();
    }

    afterEach(() => {
      clearSearchDefaultsUser();
      delete (globalThis as Record<string, unknown>).__dkOasisSearchDefaultsStore__;
    });

    it("규칙이 없으면 마루 데이터를 바꿀 때 고친 키 칸을 비우고 빈 조건으로 조회한다(이전 동작과 같다)", async () => {
      setSearchDefaultsUser(SEARCH_DEFAULTS_USER);
      await renderInTab();
      // 조회 요청은 빈 조건을 보내지 않는다.
      expect(listSearches().at(-1)?.params.maruDataId).toBe("PORT");
      expect(listSearches().at(-1)?.params.code ?? "").toBe("");
      await type(testId("item-search-code"), "KR");
      await chooseMaru("CUST");
      expect((testId("item-search-code") as HTMLInputElement).value).toBe("");
      expect(listSearches().at(-1)?.params.maruDataId).toBe("CUST");
      expect(listSearches().at(-1)?.params.code ?? "").toBe("");
    });

    it("마루 데이터 기본값이 snapshot·첫 항목보다 앞서고, 바꿀 때마다 의존 칸 기본값을 다시 채워 조회한다", async () => {
      givenSearchDefaults(PAGE_ID, {
        maruDataId: { kind: "fixed", value: "CUST" },
        code: { kind: "fixed", value: "C0" },
        showClosed: { kind: "fixed", value: "Y" },
      });
      await renderInTab();
      expect(currentMaru()).toContain("CUST");
      expect(listSearches().map((c) => c.params.maruDataId)).not.toContain("PORT");
      expect(listSearches().at(-1)?.params).toMatchObject({ maruDataId: "CUST", code: "C0", showClosed: true });
      await type(testId("item-search-code"), "ZZ");
      await chooseMaru("PORT");
      expect((testId("item-search-code") as HTMLInputElement).value).toBe("C0");
      expect(listSearches().at(-1)?.params).toMatchObject({ maruDataId: "PORT", code: "C0", showClosed: true });
    });

    it("handoff 로 넘겨받은 마루 데이터가 사용자 기본값보다 앞선다", async () => {
      givenSearchDefaults(PAGE_ID, { maruDataId: { kind: "fixed", value: "CUST" } });
      openMdmPage("dmd/dataItemMng", { maruDataId: "PORT" });
      await renderInTab();
      expect(currentMaru()).toContain("PORT");
      expect(listSearches().at(-1)?.params.maruDataId).toBe("PORT");
    });
  });
});
