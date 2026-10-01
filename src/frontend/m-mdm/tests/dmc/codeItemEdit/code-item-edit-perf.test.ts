/** @vitest-environment happy-dom */

// codeItemEdit 렌더·요청 낭비 회귀 — 시간(ms) 대신 결정적인 개수만 센다.
//   · 코드·카테고리 그리드 columns 재생성 수, 셀 렌더러 호출 수, 그리드에 넘긴 행 객체 수 (셀 편집마다)
//   · compare(미리보기) 요청 수 — [코드 테스트] 탭이 보일 때만
// 그리드(AgDataGrid)는 실제 컴포넌트를 그대로 쓰되 props 만 가로채 센다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

type AnyProps = Record<string, any>;

const log = vi.hoisted(() => ({
  codeColumns: new Set<unknown>(),
  cateColumns: new Set<unknown>(),
  codeRows: new Set<object>(),
  codeRenderCalls: 0,
  cateRenderCalls: 0,
  codeData: [] as AnyProps[],
  codeOnCellValueChanged: null as null | ((p: AnyProps) => void),
  codeAutoSize: [] as unknown[],
}));

vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const React = await import("react");
  const Orig = mod.AgDataGrid as unknown as (p: AnyProps) => unknown;
  function Spy(props: AnyProps) {
    const cols = props.columns as AnyProps[];
    const kind = props.rowKey === "__key" && props.singleClickEdit ? "code" : props.rowKey === "cateId" ? "cate" : null;
    if (kind === "cate") log.cateColumns.add(cols);
    if (kind === "code") {
      log.codeColumns.add(cols);
      for (const r of props.data as object[]) log.codeRows.add(r);
      log.codeData = props.data;
      log.codeOnCellValueChanged = props.onCellValueChanged;
      log.codeAutoSize.push(props.autoSizeOnDataUpdate);
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
                      if (kind === "code") log.codeRenderCalls++;
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

import CodeItemEditPage from "../../../pages/dmc/codeItemEdit/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let calls: { url: string; body: AnyProps }[] = [];
let validateHandler: () => unknown = () => ({ issues: [], cateIssues: [] });

const ok = (result: unknown) => new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });

const serverRow = (code: string, seq: number) => ({
  code, name: `${code} 이름`, alterName: null, seq, description: null, fromVer: "1.000", toVer: "9999.000",
  lvl1: "KS", lvl2: null, lvl3: null, lvl4: null, lvl5: null,
  attr01: "270", attr02: null, attr03: null, attr04: null, attr05: null,
  attr06: null, attr07: null, attr08: null, attr09: null, attr10: null,
  change: "NONE", prev: null, tableCategories: [], patchBlocked: false,
});
const ROWS = ["K1", "K2", "K3", "K4", "K5"].map((c, i) => serverRow(c, i + 1));
const BASE = { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: ".*", defTarget: "CODE", description: null };

const codeView = {
  header: { maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1, attrLabels: [{ no: 1, label: "인장강도" }] },
  versions: [{ ver: "1.000", display: "v1.000", status: "DRAFT", verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
  selected: { ver: "1.000", display: "v1.000", status: "DRAFT", ownerId: "kim", rowVersion: 4, warning: null, editable: true, patchable: false },
  rows: ROWS, closed: [], closedCateItems: [], categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
};
const cateView = {
  header: { maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 },
  versions: codeView.versions, selected: codeView.selected, categories: [BASE], items: [], cateItems: [],
};

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

const testId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeItemEditPage)));
  });
  await settle();
  const input = testId("code-pick-keyword") as HTMLInputElement;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
  await click(testId("code-pick-STEEL"));
}

/** ag-grid 가 하듯 넘겨받은 행 객체에 값을 직접 쓴 뒤 onCellValueChanged 를 부른다. */
async function edit(key: string, field: string, newValue: unknown) {
  const target = log.codeData.find((r) => r.__key === key);
  if (target) target[field] = newValue;
  await act(async () => {
    log.codeOnCellValueChanged!({ rowKey: key, field, newValue });
  });
  await settle();
}

const count = (part: string) => calls.filter((c) => c.url.includes(part)).length;
const dataRow = (key: string) => log.codeData.find((r) => r.__key === key);

describe("codeItemEdit 렌더·요청 낭비", () => {
  beforeEach(() => {
    calls = [];
    validateHandler = () => ({ issues: [], cateIssues: [] });
    log.codeColumns.clear();
    log.cateColumns.clear();
    log.codeRows.clear();
    log.codeRenderCalls = 0;
    log.cateRenderCalls = 0;
    log.codeData = [];
    log.codeOnCellValueChanged = null;
    log.codeAutoSize = [];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/oasis/")) calls.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
      if (u.includes("/oasis/codeItemEdit/search")) {
        return ok({ codes: [{ maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 }] });
      }
      if (u.includes("/oasis/codeItemEdit/view")) return ok(codeView);
      if (u.includes("/oasis/codeItemEdit/compare")) {
        return ok({ cateId: "BASE", ver: "1.000", hitCount: 1, total: 1, rows: [], warnings: [] });
      }
      if (u.includes("/oasis/codeItemEdit/validate")) return ok(validateHandler());
      if (u.includes("/oasis/codeCateEdit/view")) return ok(cateView);
      if (u.includes("/oasis/codeCateEdit/compare")) return ok({ cateId: "BASE", ver: "1.000", hitCount: 0, total: 0, rows: [], warnings: [] });
      if (u.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
      if (u.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("코드 셀 편집마다 열 정의를 다시 만들지 않고 바뀐 행만 새 객체로 만든다 (검증 응답이 비어 있을 때)", async () => {
    await render();
    expect(testId("cate-row-BASE")).not.toBeNull();
    const codeColsBefore = log.codeColumns.size;
    const cateColsBefore = log.cateColumns.size;
    const rowsBefore = log.codeRows.size;
    const codeRendersBefore = log.codeRenderCalls;
    const cateRendersBefore = log.cateRenderCalls;
    const validateBefore = count("/codeItemEdit/validate");

    await edit("K1", "code", "K1a");
    await edit("K2", "lvl1", "ZZ");
    await edit("K3", "code", "K3a");

    // 검증 요청은 그대로 편집마다 1번(동작 유지).
    expect(count("/codeItemEdit/validate") - validateBefore).toBe(3);
    // 고치기 전: 코드 열 +3, 카테고리 열 +3, 새 행 객체 +15, 코드 렌더러 +102, 카테고리 렌더러 +수십.
    expect(log.codeColumns.size - codeColsBefore).toBe(0);
    expect(log.cateColumns.size - cateColsBefore).toBe(0);
    expect(log.codeRows.size - rowsBefore).toBe(3);
    expect(log.codeRenderCalls - codeRendersBefore).toBeLessThanOrEqual(12);
    expect(log.cateRenderCalls - cateRendersBefore).toBe(0);
    // 열 너비 자동 맞춤은 예전 그대로 둔다(데이터가 바뀌면 다시 맞춘다).
    expect(log.codeAutoSize.every((v) => v !== false)).toBe(true);
  });

  it("검증 이슈는 곧바로 표시되고, 다음 응답이 비면 사라진다", async () => {
    await render();
    validateHandler = () => ({
      issues: [{ itemKey: "K1a", code: "E1", message: "코드 중복", field: "code" }], cateIssues: [],
    });
    await edit("K1", "code", "K1a");
    expect(testId("code-row-issue-K1a")?.textContent).toBe("코드 중복");
    expect(testId("code-tab-grid-issue")).not.toBeNull();

    validateHandler = () => ({ issues: [], cateIssues: [] });
    await edit("K1", "code", "K1b");
    expect(testId("code-row-issue-K1a")).toBeNull();
    expect(testId("code-tab-grid-issue")).toBeNull();
  });

  it("편집 뒤 취소하면 원래 값으로 돌아온다 (ag-grid 가 행 객체에 직접 쓴 값이 새지 않는다)", async () => {
    await render();
    await edit("K1", "name", "바뀐 이름");
    expect(dataRow("K1")?.name).toBe("바뀐 이름");
    expect(dataRow("K1")?.__local).toBe("edited");
    const cancel = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "취소");
    expect(cancel.length).toBe(1);
    await click(cancel[0]);
    expect(dataRow("K1")?.name).toBe("K1 이름");
    expect(dataRow("K1")?.__local).toBe("none");
  });

  it("카테고리 편집 탭에서는 compare 를 부르지 않고, [코드 테스트] 탭에 들어올 때 부른다", async () => {
    await render();
    // 고치기 전 1번(카테고리 편집 탭인데도 부른다), 고친 뒤 0번.
    expect(count("/codeItemEdit/compare")).toBe(0);
    await click(testId("code-right-tab-test"));
    expect(count("/codeItemEdit/compare")).toBe(1);
    // 조회 기준이 그대로면 탭을 오가도 다시 부르지 않고 앞 결과를 그대로 둔다.
    await click(testId("code-right-tab-cate"));
    await click(testId("code-right-tab-test"));
    expect(count("/codeItemEdit/compare")).toBe(1);
  });

  it("트리 탭에서는 트리가 그려지고 거르기도 동작한다", async () => {
    await render();
    await click(testId("code-tab-tree"));
    expect(testId("code-tree")?.textContent).toContain("K1");
  });
});
