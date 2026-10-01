/** @vitest-environment happy-dom */

// dataItemMng 속도·부하 낭비 회귀 — 시간(ms) 대신 결정적인 개수만 센다.
//   · 항목 그리드 columns 재생성 수·작업 열 셀 렌더러 호출 수·그리드에 넘긴 행 객체 수 (셀 편집마다)
//   · 카테고리 그리드 columns 재생성 수·렌더러 호출 수 (항목 셀 편집·조회조건 키 입력마다)
//   · 정규식 입력 때 compare API 요청 수 (디바운스, 언마운트 취소, 늦은 응답)
// 그리드(AgDataGrid)는 실제 컴포넌트를 그대로 쓰되 props 만 가로채 센다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { takeMdmPageParams } from "@/shell";

type AnyProps = Record<string, any>;

const log = vi.hoisted(() => ({
  itemColumns: new Set<unknown>(),
  cateColumns: new Set<unknown>(),
  itemRows: new Set<object>(),
  itemRenderCalls: 0,
  cateRenderCalls: 0,
  itemOnCellValueChanged: null as null | ((p: AnyProps) => void),
}));

vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const React = await import("react");
  const Orig = mod.AgDataGrid as unknown as (p: AnyProps) => unknown;
  function Spy(props: AnyProps) {
    const cols = props.columns as AnyProps[];
    const kind = props.rowKey === "cateId" ? "cate" : cols?.some((c) => c.key === "actions") ? "item" : null;
    if (kind === "cate") log.cateColumns.add(cols);
    if (kind === "item") {
      log.itemColumns.add(cols);
      for (const r of props.data as object[]) log.itemRows.add(r);
      log.itemOnCellValueChanged = props.onCellValueChanged;
    }
    // 렌더러 호출을 세는 래퍼 — columns 가 같으면 같은 래퍼를 돌려줘야 실제 그리드의 열 정의 비교가 그대로 된다.
    const wrapped = React.useMemo(
      () =>
        kind
          ? cols.map((c) =>
              c.render
                ? {
                    ...c,
                    render: (v: unknown, row: unknown) => {
                      if (kind === "item") log.itemRenderCalls++;
                      else log.cateRenderCalls++;
                      return c.render(v, row);
                    },
                  }
                : c,
            )
          : cols,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [cols],
    );
    return React.createElement(Orig as never, { ...props, columns: wrapped });
  }
  return { ...mod, AgDataGrid: Spy };
});

import DataItemMngPage from "../../../pages/dmd/dataItemMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let calls: { service: string; action: string; params: Record<string, unknown> }[] = [];
/** compare 응답 — 기본은 즉시 한 건. */
let compareHandler: (params: Record<string, unknown>) => Promise<unknown> | unknown = () => ({
  invalid: false, codes: ["KRPUS"], count: 1,
});

const ok = (result: unknown) =>
  new Response(JSON.stringify({ data: { result }, meta: { success: true } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

const rowOf = (code: string, seq: number) => ({
  code, name: `이름${code}`, alterName: null, seq, description: null, lvl1: "KR", attr01: "KR",
  validFrom: "2026-08-20 09:00:00", validTo: "9999-12-31 00:00:00", open: true, rowVersion: 0,
});
const ROWS = ["K1", "K2", "K3", "K4", "K5"].map((c, i) => rowOf(c, i + 1));
const cateList = [
  { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: "^.*$", defTarget: "KEY", description: null, open: true, matchCount: 5 },
  { cateId: "R1", cateName: "숫자 시작", defKind: "REGEX", defExpr: "^[0-9]", defTarget: "KEY", description: null, open: true, matchCount: 0 },
];

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
/** 디바운스 창(300ms)이 지나도록 기다린다. */
const waitDebounce = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  await flush();
};

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataItemMngPage)));
  });
  await flush();
}

const testId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function type(el: Element | null, value: string) {
  expect(el).not.toBeNull();
  const input = el as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function edit(code: string, field: string, newValue: unknown) {
  await act(async () => {
    log.itemOnCellValueChanged!({ rowKey: code, field, newValue, row: { code, open: true } });
  });
  await flush();
}

const count = (service: string, action: string) => calls.filter((c) => c.service === service && c.action === action).length;

describe("dataItemMng 속도·부하 낭비", () => {
  beforeEach(() => {
    calls = [];
    compareHandler = () => ({ invalid: false, codes: ["KRPUS"], count: 1 });
    log.itemColumns.clear();
    log.cateColumns.clear();
    log.itemRows.clear();
    log.itemRenderCalls = 0;
    log.cateRenderCalls = 0;
    log.itemOnCellValueChanged = null;
    takeMdmPageParams("dmd/dataItemMng");
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/oasis\/(dataItemMng|dataCateEdit|dataHistory)\/(\w+)/);
      if (m) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
        calls.push({ service: m[1], action: m[2], params });
        if (m[1] === "dataItemMng") {
          if (m[2] === "view") {
            return ok({
              maruDataOptions: [{ maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM" }],
              ...(params.maruDataId
                ? {
                    header: {
                      maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM", sourceSystem: null,
                      lvlCnt: 1, attrLabels: [{ field: "attr01", label: "국가" }], editable: true,
                      categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
                    },
                  }
                : {}),
            });
          }
          if (m[2] === "search") return ok({ list: ROWS, totalCount: ROWS.length, page: 0, size: 20000 });
          return ok({ action: "UPDATE", row: ROWS[0] });
        }
        if (m[1] === "dataHistory") return ok({ target: params.target, key: params.key, state: "OPEN", rows: [] });
        if (m[2] === "search") return ok({ maruDataId: params.maruDataId, lvlCnt: 1, attrLabels: ["국가"], list: cateList });
        if (m[2] === "view") {
          return ok({
            cate: cateList.find((c) => c.cateId === params.cateId),
            items: [{ code: "KRPUS", name: "부산", lvl1: "KR" }],
            memberCodes: [],
          });
        }
        if (m[2] === "compare") return ok(await compareHandler(params));
        return ok({});
      }
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return new Response(
          JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
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

  it("셀 편집마다 항목 그리드 열 정의를 다시 만들지 않고, draft 가 없는 행 객체는 그대로 둔다", async () => {
    await render();
    const colsBefore = log.itemColumns.size;
    const rowsBefore = log.itemRows.size;
    const rendersBefore = log.itemRenderCalls;
    expect(testId("item-close-K1")).not.toBeNull();

    await edit("K1", "name", "a");
    await edit("K1", "name", "ab");
    await edit("K2", "name", "x");

    // 고치기 전: 열 정의 +3, 새 행 객체 +15(편집마다 5행 전부 복제), 작업 열 렌더러 +30. 고친 뒤: 열 0, 새 행은 draft 가 바뀐 3개만.
    expect(log.itemColumns.size - colsBefore).toBe(0);
    expect(log.itemRows.size - rowsBefore).toBe(3);
    // 작업 열 렌더러 호출 — 열 정의를 다시 만들면 보이는 5행 전부 다시 불린다(고치기 전 +15 이상).
    expect(log.itemRenderCalls - rendersBefore).toBeLessThanOrEqual(2);

    // 동작은 그대로 — draft 가 있는 행만 [저장][취소], 나머지는 [닫기].
    expect(testId("item-save-K1")).not.toBeNull();
    expect(testId("item-close-K1")).toBeNull();
    expect(testId("item-save-K2")).not.toBeNull();
    expect(testId("item-close-K3")).not.toBeNull();

    // 취소하면 원래 버튼으로 돌아온다.
    await click(testId("item-cancel-K2"));
    expect(testId("item-close-K2")).not.toBeNull();
    expect(testId("item-save-K2")).toBeNull();
  });

  it("[저장] 은 그 행의 draft 를 합친 값을 보내고, 저장 중에는 버튼이 곧바로 잠긴다", async () => {
    await render();
    await edit("K1", "name", "a");
    await edit("K1", "name", "ab");
    await click(testId("item-save-K1"));
    const save = calls.find((c) => c.service === "dataItemMng" && c.action === "save");
    expect(save?.params).toMatchObject({ code: "K1", name: "ab", expectedRowVersion: 0 });
    // 저장 뒤 목록을 다시 읽고 draft 가 비워져 [닫기] 로 돌아온다.
    expect(testId("item-close-K1")).not.toBeNull();
    expect(testId("item-save-K1")).toBeNull();
  });

  it("항목 셀 편집·조회조건 키 입력에 카테고리 그리드 열 정의를 다시 만들지 않는다", async () => {
    await render();
    expect(testId("cate-row-R1")).not.toBeNull();
    const colsBefore = log.cateColumns.size;
    const rendersBefore = log.cateRenderCalls;

    await edit("K1", "name", "a");
    await edit("K2", "name", "b");
    await edit("K3", "name", "c");
    await type(testId("item-search-code"), "A");
    await type(testId("item-search-code"), "AB");
    await type(testId("item-search-code"), "ABC");
    await flush();

    // 고치기 전: 열 정의 +6, 렌더러 호출 +60.
    expect(log.cateColumns.size - colsBefore).toBe(0);
    expect(log.cateRenderCalls - rendersBefore).toBe(0);
  });

  it("정규식 입력은 디바운스한다 — 연속 입력 5번에 compare 1번", async () => {
    await render();
    await click(testId("cate-row-R1"));
    await click(testId("cate-edit-R1"));
    await waitDebounce();
    const before = count("dataCateEdit", "compare");

    for (const v of ["(", "([", "([0", "([0-", "([0-9"]) await type(testId("regex-expr"), v);
    await flush();
    // 입력 중에는 아직 부르지 않는다.
    expect(count("dataCateEdit", "compare") - before).toBe(0);
    await waitDebounce();
    // 고치기 전 +5, 고친 뒤 +1(마지막 값만).
    expect(count("dataCateEdit", "compare") - before).toBe(1);
    const last = calls.filter((c) => c.action === "compare").at(-1);
    expect(last?.params.defExpr).toBe("([0-9");
  });

  it("카테고리 행 한 번 누름에 상세(view)는 한 번만 읽는다 (onRowClick·onFocusedRowChange 가 함께 불려도)", async () => {
    await render();
    const before = count("dataCateEdit", "view");
    await click(testId("cate-row-R1"));
    await waitDebounce();
    expect(count("dataCateEdit", "view") - before).toBe(1);
  });

  it("정규식 입력 직후 화면을 닫으면 대기 중인 compare 를 부르지 않는다", async () => {
    await render();
    await click(testId("cate-row-R1"));
    await click(testId("cate-edit-R1"));
    await waitDebounce();
    const before = count("dataCateEdit", "compare");
    await type(testId("regex-expr"), "abc");
    act(() => {
      root!.unmount();
    });
    root = null;
    await new Promise((r) => setTimeout(r, 400));
    expect(count("dataCateEdit", "compare") - before).toBe(0);
  });

  it("늦게 도착한 옛 compare 응답이 새 결과를 덮지 않는다", async () => {
    await render();
    await click(testId("cate-row-R1"));
    await click(testId("cate-edit-R1"));
    await waitDebounce();

    let releaseOld!: () => void;
    const oldHeld = new Promise<void>((r) => (releaseOld = r));
    compareHandler = async (p) => {
      if (p.defExpr === "old") {
        await oldHeld;
        return { invalid: false, codes: ["OLDCODE"], count: 1 };
      }
      return { invalid: false, codes: ["NEWCODE"], count: 1 };
    };
    await type(testId("regex-expr"), "old");
    await waitDebounce();
    await type(testId("regex-expr"), "new");
    await waitDebounce();
    expect(document.body.textContent).toContain("NEWCODE");
    await act(async () => {
      releaseOld();
    });
    await flush();
    expect(document.body.textContent).toContain("NEWCODE");
    expect(document.body.textContent).not.toContain("OLDCODE");
  });
});
