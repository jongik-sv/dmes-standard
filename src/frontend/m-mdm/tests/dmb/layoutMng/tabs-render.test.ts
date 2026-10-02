/** @vitest-environment happy-dom */

// TSK-05-03 design.md §3.5 — layoutMng 오른쪽 패널 탭(편집·등록 검증·샘플 전문·버전·영향도). 기본 탭은 05-02 편집 화면 그대로이고,
// 검증 표 7행·샘플 한 줄 구간·버전 이력은 서버 응답(stub)으로 채운다. RBAC 는 SYSADMIN 으로 stub 한다(검증·렌더 버튼이 보이게).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import LayoutMngPage from "../../../pages/dmb/layoutMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let actions: string[] = [];

function item(seq: number, fill: string, phys: string | null, len: number, extra: Record<string, unknown> = {}) {
  return { SEQ: seq, FILL_KIND: fill, COLUMN_PHYS: phys, DISPLAY_NAME: phys, DOMAIN_LENGTH: fill === "FILLER" ? null : len,
    FILLER_LENGTH: fill === "FILLER" ? len : null, DATA_TYPE: "STRING", OFFSET: 0, LENGTH: len, ...extra };
}

const BODY = [
  item(1, "DATA", "COIL_ID", 20), item(2, "DATA", "PROD_DT", 8),
  item(3, "DATA", "COIL_THK", 3, { DATA_TYPE: "NUMBER", SCALE: 1, NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4" }),
  item(4, "FILLER", null, 25),
];

const VERSIONS = [
  { LAYOUT_VERSION: 2, SAVED_AT: "2026-09-24 10:20", SAVED_BY: "admin", TOTAL_LENGTH: 187, SWITCH_MODE: "SEQUENTIAL",
    CHANGE_SUMMARY: "여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)" },
  { LAYOUT_VERSION: 1, SAVED_AT: "2026-09-24 10:00", SAVED_BY: "admin", TOTAL_LENGTH: 187, SWITCH_MODE: null, CHANGE_SUMMARY: "최초 등록" },
];

function checks(failNo: number | null) {
  const conds = ["본문 항목의 컬럼이 컬럼 사전에 없음", "CONST 값이 도메인 유효 식 위반", "전송 단위의 차원 불일치", "숫자 표현 자리 부족",
    "FILLER 가 아닌 항목에 길이 직접 입력", "trans_unit 과 unit_item 동시 입력", "unit_item 이 같은 레이아웃의 항목을 가리키지 않음"];
  return conds.map((c, i) => ({ NO: i + 1, CONDITION: c, CODE: "L", RESULT: i + 1 === failNo ? "FAIL" : "PASS",
    MESSAGES: i + 1 === failNo ? ["L14[3] 표현 자리 2는 도메인 코일 두께(숫자 3,1)를 담지 못합니다"] : [] }));
}

/** M201 23구간 — 헤더 L100 13·L110 6·본문 4. 텍스트는 공백 채움 그대로(가운뎃점은 화면이 바꾼다). */
function segments() {
  const lens = [8, 4, 3, 4, 3, 14, 14, 12, 1, 5, 1, 6, 25, 2, 4, 5, 8, 6, 5, 20, 8, 4, 25];
  const fill = ["AUTO", "CONST", "CONST", "CONST", "CONST", "AUTO", "CONST", "CONST", "CONST", "AUTO", "CONST", "AUTO", "FILLER",
    "CONST", "AUTO", "AUTO", "AUTO", "AUTO", "FILLER", "DATA", "DATA", "DATA", "FILLER"];
  let at = 0;
  return lens.map((len, i) => {
    const zone = i < 19 ? "HEADER" : "BODY";
    const seg = { INDEX: i, ZONE: zone, HEADER_SEQ: i < 13 ? 1 : i < 19 ? 2 : 0, ZONE_LABEL: i < 13 ? "L100" : i < 19 ? "L110" : "본문",
      SEQ: 1, NAME: i === 21 ? "코일 두께" : `항목${i}`, COLUMN_PHYS: i === 21 ? "COIL_THK" : null, FILL_KIND: fill[i], OFFSET: at,
      LENGTH: len, POSITION: `${at + 1}-${at + len}`, TEXT: i === 21 ? "0035" : " ".repeat(len) };
    at += len;
    return seg;
  });
}

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch(failNo: number | null = 4) {
  actions = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/layoutMng/")) {
      const action = u.split("/").pop() ?? "";
      actions.push(action);
      const params = JSON.parse(String(init?.body ?? "{}")).params ?? {};
      if (action === "search") {
        return ok({
          layouts: [
            { LAYOUT_ID: 30, LAYOUT_NAME: "이력 없는 전문", SND_SYSTEM: "L2", RCV_SYSTEM: "MES", ITEM_COUNT: 4, TOTAL_LENGTH: 57, LAYOUT_VERSION: 0, VER: 1 },
            { LAYOUT_ID: 31, LAYOUT_NAME: "이력 있는 전문", SND_SYSTEM: "L2", RCV_SYSTEM: "MES", ITEM_COUNT: 4, TOTAL_LENGTH: 57, LAYOUT_VERSION: 2, VER: 5 },
          ],
          systems: [{ SYSTEM_CODE: "L2", SYSTEM_NAME: "레벨2" }, { SYSTEM_CODE: "MES", SYSTEM_NAME: "MES" }], eais: [], headers: [],
        });
      }
      if (action === "view") {
        const id = params.layoutId;
        return ok({
          layout: { LAYOUT_ID: id, LAYOUT_NAME: id === 30 ? "이력 없는 전문" : "이력 있는 전문", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
            TOTAL_LENGTH: 57, HEADER_LENGTH: 0, LAYOUT_VERSION: id === 30 ? 0 : 2, VER: 1 },
          headers: [], items: BODY, units: [], versions: id === 30 ? [] : VERSIONS,
        });
      }
      if (action === "validate") return ok({ checks: checks(failNo), otherIssues: [], passed: failNo == null });
      if (action === "execute") {
        return ok({ encoding: "EUC-KR", totalBytes: 187, line: "", segments: segments(), errors: [], issues: [],
          parsed: [{ COLUMN_PHYS: "COIL_THK", NAME: "코일 두께", VALUE: "3.5" }] });
      }
      if (action === "export") {
        return ok({ layoutId: 31, layoutVersion: params.layoutVersion ?? 2, fileBase: "layout-31-v2", names: {},
          snapshot: { layoutId: 31, layoutName: "이력 있는 전문", layoutVersion: 2, totalLength: 57, headers: [], items: [] } });
      }
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(LayoutMngPage)));
  });
  await flush(100);
}

async function click(el: Element | null) {
  expect(el, "클릭 대상이 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/** 머리 [조회] — 첫 진입은 목록을 자동 조회하지 않으므로(cf4fbb05) 목록 행이 필요한 시험은 먼저 누른다. */
async function search() {
  const btn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회");
  expect(btn, "조회").toBeTruthy();
  await act(async () => {
    (btn as HTMLButtonElement).click();
  });
  await flush();
  await flush();
}

async function openRow(index: number) {
  const rows = container.querySelectorAll("[data-testid=layout-list] .ag-center-cols-container .ag-row");
  const row = Array.from(rows).find((r) => r.getAttribute("row-index") === String(index)) ?? null;
  await click(row?.querySelector(".ag-cell") ?? null);
  await flush(100);
}

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

describe("layoutMng 탭", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    stubFetch();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("기본 탭은 편집이고 기존 편집 화면이 그대로 보인다", async () => {
    await render();
    await search();
    await openRow(0);
    expect(q("layout-tab-edit")).not.toBeNull();
    expect(q("layout-tab-check")).not.toBeNull();
    expect(q("layout-tab-version")).not.toBeNull();
    expect(q("layout-items")).not.toBeNull();
    expect(q("layout-total-length")?.textContent).toContain("57 바이트");
    expect(q("layout-check-run")).toBeNull();
    // 진입 때 콤보용 search(optionsOnly) 1건 + [조회] 1건 + view(cf4fbb05)
    expect(actions).toEqual(["search", "search", "view"]);
  });

  it("등록 검증 탭에서 검증을 실행하면 7행이 보이고 거부 행에 메시지가 보인다", async () => {
    await render();
    await search();
    await openRow(0);
    await click(q("layout-tab-check"));
    expect(q("layout-items")).toBeNull();
    await click(q("layout-check-run"));
    expect(actions).toContain("validate");
    expect(container.querySelectorAll("[data-testid^=layout-check-row-]")).toHaveLength(7);
    expect(q("layout-check-result-4")?.textContent).toBe("거부");
    expect(q("layout-check-result-1")?.textContent).toBe("통과");
    expect(q("layout-check-message-4")?.textContent).toContain("표현 자리 2는 도메인");
  });

  it("샘플 렌더 결과는 구간마다 색과 가운뎃점으로 보인다", async () => {
    await render();
    await search();
    await openRow(0);
    await click(q("layout-tab-check"));
    expect(q("sample-input-COIL_ID")).not.toBeNull();
    expect(q("sample-input-COIL_THK")).not.toBeNull();
    await click(q("sample-render"));
    expect(actions).toContain("execute");
    const segs = container.querySelectorAll("[data-testid^=sample-seg-]");
    expect(segs).toHaveLength(23);
    expect(new Set(Array.from(segs).map((s) => s.getAttribute("data-zone")))).toEqual(new Set(["h1", "h2", "body", "filler"]));
    expect(q("sample-seg-21")?.textContent).toBe("0035");
    expect(q("sample-seg-21")?.getAttribute("title")).toBe("본문 코일 두께 159-162");
    expect(q("sample-seg-22")?.textContent).toBe("·".repeat(25));
    expect(q("sample-length")?.textContent).toContain("187");
    expect(q("sample-ruler")?.textContent).toHaveLength(187);
    expect(q("sample-parsed-COIL_THK")?.textContent).toBe("3.5");
    // 구간 목록 첫 행: 위치·구역·값(공백은 가운뎃점)
    const firstSeg = q("sample-segments")?.querySelector(".ag-center-cols-container .ag-row[row-index='0']");
    expect(firstSeg?.querySelector("[col-id=POSITION]")?.textContent).toBe("1-8");
    expect(firstSeg?.querySelector("[col-id=ZONE]")?.textContent).toBe("L100");
    expect(firstSeg?.querySelector("[col-id=TEXT]")?.textContent).toBe("·".repeat(8));
  });

  it("버전 탭은 이력이 없으면 빈 상태를, 있으면 전환 방식을 보인다", async () => {
    await render();
    await search();
    await openRow(0);
    await click(q("layout-tab-version"));
    expect(q("version-list-empty")?.textContent).toBe("저장된 버전이 없습니다");
    expect(q("change-class-table")).not.toBeNull();
    expect(q("change-class-table")?.querySelectorAll(".ag-center-cols-container .ag-row")).toHaveLength(5);
    expect(q("change-class-table")?.textContent).toContain("여분을 쪼개 항목 추가");
    expect(actions).not.toContain("export");
    await openRow(1);
    await flush(300);
    expect(q("version-list")?.textContent).toContain("순차 전환");
    expect(q("version-list")?.textContent).toContain("여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)");
    expect(actions).toContain("export");
    expect(q("snapshot-preview")?.textContent).toContain("\"layoutVersion\": 2");
  });
});
