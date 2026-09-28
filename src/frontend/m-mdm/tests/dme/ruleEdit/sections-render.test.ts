/** @vitest-environment happy-dom */

// TSK-08-03 design §3.2 — 열 설정 섹션 렌더 스모크(happy-dom). 순수 로직은 column-draft.test.ts 가 덮고, 여기서는 화면 연결만 본다:
// 초안 편집 → 검사 표시 → 적용 요청 본문(part COLUMNS, grids.rows.rows)·거부 시 요청 없음, 초안 dirty 면 표 저장 차단, 열 머리 하이라이트.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { DecisionTableCard } from "../../../pages/dme/ruleEdit/decision-table/DecisionTableCard";
import { ColumnSettingsSection } from "../../../pages/dme/ruleEdit/sections/columns/ColumnSettingsSection";
import { ColumnDraftSharedContext } from "../../../pages/dme/ruleEdit/sections/column-draft-context";
import { TABLE_SECTIONS } from "../../../pages/dme/ruleEdit/sections";
import { columnDraftStorageKey, draftFromView, newColumn, type ColumnDraftRow } from "../../../pages/dme/ruleEdit/sections/columns/column-draft";
import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import type { RuleEditView } from "../../../pages/dme/ruleEdit/types";
import { findButton, flush, installDomStorage, jsonResponse, typeInto, visibleText } from "../helpers/render";
import { PivotSection } from "../../../pages/dme/ruleEdit/sections/pivot/PivotSection";
import { InputContractSection } from "../../../pages/dme/ruleEdit/sections/contract/InputContractSection";
import { PROD_WGT_CALC, PROD_WGT_CALC_PV2 } from "../../fixtures/evalex-rules";
import { ast } from "../../helpers/parse-expr";
import { draftView, sourceOf } from "./fixtures";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
let writes = 0;
const notices: unknown[] = [];

const CANDIDATES = [
  { name: "COIL_THK", label: "두께", kind: "COLUMN" as const },
  { name: "COIL_WID", label: "폭", kind: "COLUMN" as const },
  { name: "SURF_GRD", label: "표면등급", kind: "COLUMN" as const },
];

function view(over: Partial<RuleEditView> = {}): RuleEditView {
  return {
    ...draftView("e2e_mdm_steward"),
    varCandidates: CANDIDATES,
    varMeta: [],
    ...over,
  };
}

function props(v: RuleEditView, canDo: (a: string) => boolean = () => true): RuleEditCardProps {
  return {
    view: v,
    me: v.me,
    editable: v.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: (n) => notices.push(n),
    runWrite: async (fn) => {
      const r = await fn();
      writes++;
      return r;
    },
    setDirty: () => {},
    canDo,
    busy: false,
  };
}

async function mount(node: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, node));
  });
  await flush();
}

const q = <T extends Element>(sel: string) => container.querySelector(sel) as T;

/** 그리드 칸 편집 대신 같은 row_version 의 저장 초안을 넣어 두고 연다(섹션이 마운트할 때 되살린다). 칸 편집 → 초안 변경은 cellPatch 테스트가 덮는다. */
function seedDraft(v: RuleEditView, change: (rows: ColumnDraftRow[]) => ColumnDraftRow[]) {
  const sel = v.versions.find((x) => x.ver === v.selectedVer)!;
  globalThis.sessionStorage.setItem(columnDraftStorageKey(v.rule.maruRuleId, sel.ver), JSON.stringify({ rowVersion: sel.rowVersion, rows: change(draftFromView(v)) }));
}
const relabel = (rows: ColumnDraftRow[]) => rows.map((r) => (r.key === "v1" ? { ...r, label: "바뀐 이름" } : r));
const gridRows = () => [...container.querySelectorAll("[data-testid='col-table'] .ag-center-cols-container .ag-row")];

describe("열 설정 섹션 렌더", () => {
  beforeEach(() => {
    installDomStorage();
    bodies = [];
    writes = 0;
    notices.length = 0;
    globalThis.sessionStorage?.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      bodies.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      if (url.includes("/oasis/ruleEdit/search")) {
        const yn = { domainId: 50, stdName: "USE_YN", domainName: "사용 여부", dataType: "STRING", length: 1 };
        const del = { domainId: 51, stdName: "DEL_YN", domainName: "삭제 여부", dataType: "STRING", length: 1 };
        const kw = String((bodies.at(-1)?.body as { params?: { keyword?: string } }).params?.keyword ?? "");
        return jsonResponse({ meta: { success: true }, data: { result: { rows: kw === "여부" ? [yn, del] : [yn] } } });
      }
      if (url.includes("/oasis/ruleEdit/save")) return jsonResponse({ meta: { success: true }, data: { result: { part: "COLUMNS", rowVersion: 4, rowIdMap: { "-1": 6 }, issues: [] } } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("열마다 한 줄, 처음에는 변경이 없어 적용·버리기가 꺼져 있다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    expect(gridRows().map((r) => r.getAttribute("row-id"))).toEqual(["v1", "v2", "v3", "v4", "v5"]);
    expect(q("[data-testid='col-name-v1']").textContent).toBe("COIL_THK");
    expect(q<HTMLButtonElement>("[data-testid='col-apply']").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-testid='col-discard']").disabled).toBe(true);
    expect(container.querySelector("[data-testid='col-dirty']")).toBeNull();
  });

  it("도메인 찾기는 팝업으로 열리고, 고르면 그 줄의 값 타입·도메인 칸(이름)이 바로 바뀌고(그리드 칸 갱신) 팝업이 닫히며, 해제하면 되돌아간다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    await act(async () => q<HTMLButtonElement>("[data-testid='col-domain-open-v1']").click());
    await flush();
    const box = document.querySelector("[data-testid='col-domain-v1']");
    expect(box).not.toBeNull();
    expect(box!.closest("[role='dialog']")).not.toBeNull();
    await act(async () => (document.querySelector("[data-testid='col-domain-v1-search']") as HTMLButtonElement).click());
    await flush();
    await act(async () => (document.querySelector("[data-testid='col-domain-v1-pick-USE_YN']") as HTMLButtonElement).click());
    await flush();
    expect(q("[data-testid='col-type-v1']").textContent).toBe("도메인 STRING");
    expect(q("[data-testid='col-domain-name-v1']").textContent).toBe("사용 여부");
    expect(q("[data-testid='col-table']").textContent).not.toContain("#50"); // 도메인 번호는 내부 키라 보이지 않는다
    expect(document.querySelector("[data-testid='col-domain-v1']")).toBeNull();
    await act(async () => q<HTMLButtonElement>("button[aria-label='도메인 해제']").click());
    await flush();
    expect(q("[data-testid='col-type-v1']").textContent).toBe("사전 NUMBER");
    expect(q("[data-testid='col-domain-name-v1']").textContent).toBe("");
  });

  /** 그리드 칸을 눌러 편집기를 열고 글자를 넣은 뒤 Enter 로 확정한다(singleClickEdit). */
  async function editGridCell(rowKey: string, colId: string, text: string) {
    const cell = q<HTMLElement>(`[data-testid='col-table'] .ag-row[row-id='${rowKey}'] [col-id='${colId}']`);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const input = cell.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    await typeInto(input, text);
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await flush();
    await flush();
  }

  it("도메인 칸에 도메인명·표준명을 직접 넣으면 하나로 정해질 때 바로 적용하고, 여럿이면 그 글자로 찾기 팝업을 연다", async () => {
    await mount(createElement(ColumnSettingsSection, props(view())));
    await editGridCell("v1", "domain", "사용 여부");
    expect(q("[data-testid='col-domain-name-v1']").textContent).toBe("사용 여부");
    expect(q("[data-testid='col-type-v1']").textContent).toBe("도메인 STRING");
    expect(document.querySelector("[data-testid='col-domain-v1']")).toBeNull();

    await editGridCell("v2", "domain", "use_yn"); // 표준명(대소문자 무시)
    expect(q("[data-testid='col-domain-name-v2']").textContent).toBe("사용 여부");

    await editGridCell("v3", "domain", "여부"); // 두 건 — 고르지 못한다
    expect(q("[data-testid='col-domain-name-v3']").textContent).toBe("");
    const box = document.querySelector("[data-testid='col-domain-v3']");
    expect(box!.closest("[role='dialog']")).not.toBeNull();
    expect((document.querySelector("[data-testid='col-domain-v3-keyword']") as HTMLInputElement).value).toBe("여부");
    expect(document.querySelector("[data-testid='col-domain-v3-pick-DEL_YN']")).not.toBeNull();
    await act(async () => (document.querySelector("[data-testid='col-domain-v3-pick-DEL_YN']") as HTMLButtonElement).click());
    await flush();
    expect(q("[data-testid='col-domain-name-v3']").textContent).toBe("삭제 여부");

    await editGridCell("v1", "domain", ""); // 비우면 해제
    expect(q("[data-testid='col-domain-name-v1']").textContent).toBe("");
    expect(q("[data-testid='col-type-v1']").textContent).toBe("사전 NUMBER");
  });

  it("읽기 전용(편집 불가)이면 편집 버튼 없이 표만 보인다", async () => {
    await mount(createElement(ColumnSettingsSection, props(draftView("other_user"))));
    expect(q("[data-testid='col-readonly']")).not.toBeNull();
    expect(container.querySelector("[data-testid='col-apply']")).toBeNull();
    expect(q<HTMLButtonElement>("button[aria-label='COIL_THK 위로']").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-testid='col-del-v1']").disabled).toBe(true);
  });

  it("값 타입 없는 프로그램 변수를 넣으면 줄 검사가 거부를 보이고, 적용을 눌러도 요청을 보내지 않는다(원자)", async () => {
    seedDraft(view(), (rows) => rows.map((r) => (r.key === "v2" ? { ...r, varName: "MY_PROG_VAR" } : r)));
    await mount(createElement(ColumnSettingsSection, props(view())));
    expect(q("[data-testid='col-check-v2']").textContent).toContain("프로그램 변수는 값 타입을 선언해야 합니다");
    expect(q("[data-testid='col-reject-count']").textContent).toContain("거부 1건");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-apply']").click();
    });
    await flush();
    expect(bodies.filter((b) => b.url.includes("/oasis/ruleEdit/save"))).toHaveLength(0);
    expect(q("[data-testid='col-apply-rejects']").textContent).toContain("아무 것도 반영되지 않음");
  });

  it("결과 열을 추가해 적용하면 part COLUMNS 요청이 grids.rows.rows 로 가고 적중 정책은 싣지 않는다", async () => {
    // 결과 열 추가 버튼이 새 줄을 만든다.
    await mount(createElement(ColumnSettingsSection, props(view())));
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-add-result']").click();
    });
    expect(gridRows().map((r) => r.getAttribute("row-id"))).toContain("n1");
    act(() => root?.unmount());
    container.remove();
    // 새 결과 열은 값 타입이 필요하다 — 이름·기본 타입을 넣은 초안으로 다시 연다.
    seedDraft(view(), (rows) => [...rows, { ...newColumn("RESULT", "n1"), varName: "NEW_RES", dataType: "STRING" }]);
    await mount(createElement(ColumnSettingsSection, props(view())));
    expect(q("[data-testid='col-type-n1']").textContent).toBe("STRING");
    expect(q("[data-testid='col-notices']").textContent).toContain("새 열 NEW_RES");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-apply']").click();
    });
    await flush();
    const save = bodies.find((b) => b.url.includes("/oasis/ruleEdit/save"))!;
    const params = save.body.params as Record<string, unknown>;
    expect(params).toEqual({ part: "COLUMNS", maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3 });
    const rows = (save.body.grids as { rows: { rows: Array<Record<string, unknown>> } }).rows.rows;
    expect(rows).toHaveLength(6);
    expect(rows[5]).toMatchObject({ varId: -1, varKind: "RESULT", varName: "NEW_RES", dataType: "STRING" });
    expect(writes).toBe(1);
    expect(JSON.stringify(notices)).toContain("새 열 NEW_RES");
  });

  it("초안 버리기는 변경을 되돌린다", async () => {
    seedDraft(view(), relabel);
    await mount(createElement(ColumnSettingsSection, props(view())));
    expect(q("[data-testid='col-dirty']")).not.toBeNull();
    expect(q("[data-testid='col-label-v1']").textContent).toBe("바뀐 이름");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-discard']").click();
    });
    expect(container.querySelector("[data-testid='col-dirty']")).toBeNull();
    expect(q("[data-testid='col-label-v1']").textContent).toBe("두께");
  });

  it("열 머리 클릭이 정한 varId 의 줄은 하이라이트된다", async () => {
    const shared = { colDirty: false, tableDirty: false, pivotDirty: false, setPivotDirty: () => {}, setColDirty: () => {}, highlightVarId: 3, setHighlightVarId: () => {} };
    await mount(createElement(ColumnDraftSharedContext.Provider, { value: shared }, createElement(ColumnSettingsSection, props(view()))));
    const row = (id: string) => q(`[data-testid='col-table'] .ag-center-cols-container .ag-row[row-id='${id}']`);
    expect(row("v3").classList.contains("ag-row-highlighted")).toBe(true);
    expect(row("v1").classList.contains("ag-row-highlighted")).toBe(false);
  });

  it("접으면 본문만 숨기고 초안 배지는 제목 줄에 남으며, 초안 dirty 알림도 풀리지 않는다(불변 13)", async () => {
    const setColDirty = vi.fn();
    const shared = { colDirty: false, tableDirty: false, pivotDirty: false, setPivotDirty: () => {}, setColDirty, highlightVarId: null, setHighlightVarId: () => {} };
    seedDraft(view(), relabel);
    await mount(createElement(ColumnDraftSharedContext.Provider, { value: shared }, createElement(ColumnSettingsSection, props(view()))));
    expect(setColDirty).toHaveBeenLastCalledWith(true);
    const toggle = q<HTMLButtonElement>("[data-testid='rule-section-columns-toggle']");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(q<HTMLElement>("[data-testid='rule-section-columns-body']").hidden).toBe(true);
    expect(q("[data-testid='col-dirty']")).not.toBeNull();
    expect(q("[data-testid='col-table']")).not.toBeNull(); // 내리지 않고 숨긴다
    expect(setColDirty).not.toHaveBeenLastCalledWith(false);
    await act(async () => {
      toggle.click();
    });
    expect(q<HTMLElement>("[data-testid='rule-section-columns-body']").hidden).toBe(false);
  });

  it("접힌 채로 열 머리를 누르면(highlightVarId) 섹션을 펼친다", async () => {
    const base = { colDirty: false, tableDirty: false, pivotDirty: false, setPivotDirty: () => {}, setColDirty: () => {}, setHighlightVarId: () => {} };
    const render = (highlightVarId: number | null) =>
      createElement(DmesUiProvider, null, createElement(ColumnDraftSharedContext.Provider, { value: { ...base, highlightVarId } }, createElement(ColumnSettingsSection, props(view()))));
    await mount(createElement(ColumnDraftSharedContext.Provider, { value: { ...base, highlightVarId: null } }, createElement(ColumnSettingsSection, props(view()))));
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='rule-section-columns-toggle']").click();
    });
    expect(q<HTMLElement>("[data-testid='rule-section-columns-body']").hidden).toBe(true);
    await act(async () => {
      root!.render(render(3));
    });
    expect(q<HTMLElement>("[data-testid='rule-section-columns-body']").hidden).toBe(false);
  });
});

describe("표 카드 + 열 설정 섹션(불변 13)", () => {
  beforeEach(() => {
    installDomStorage();
    globalThis.sessionStorage?.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("섹션 목록에 열 설정이 들어 있다", () => {
    expect(TABLE_SECTIONS.map((s) => s.id)).toContain("columns");
  });

  it("열 설정 초안이 dirty 이면 표 저장이 꺼지고 안내가 나오며, 초안을 버리면 다시 켜진다", async () => {
    seedDraft(view(), relabel);
    await mount(createElement(DecisionTableCard, { ...props(view()), extraSections: TABLE_SECTIONS }));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(true);
    expect(visibleText(q("[data-testid='dt-col-block']"))).toContain("열 설정 초안이 있어");

    await act(async () => {
      q<HTMLButtonElement>("[data-testid='col-discard']").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(false);
    expect(container.querySelector("[data-testid='dt-col-block']")).toBeNull();
  });
});

// ── 피벗 섹션(TSK-08-03 단계 5) ──

function pvVar(over: Record<string, unknown>) {
  return { exprVar: false, dateString: false, typeSource: "COLUMN", scale: null, ...over };
}

/** 행 축 COIL_THK(2 타입)·열 축 TOP_RESIN_CD(Equal)·결과 BASE_SPD(Value) — 편집 가능한 피벗 모양. */
function pivotView(over: { dispOf?: Record<number, string>; axis?: Array<[number, string]>; me?: string; owner?: string } = {}): RuleEditView {
  const disp = { 1: "2", 2: "Equal", 3: "Value", ...over.dispOf } as Record<number, string>;
  const cell = (lo: string, hi: string, col: string, val: string) =>
    JSON.stringify({ 1: { op: "<= 변수 <", left: lo, right: hi }, 2: { op: "EQ", left: col }, 3: { val } });
  const base = draftView(over.owner ?? "e2e_mdm_steward", over.me ?? "e2e_mdm_steward");
  return {
    ...base,
    rule: { ...base.rule, maruRuleId: "E2E_PVT_LKP", maruRuleName: "피벗 시험" },
    vars: [
      pvVar({ varId: 1, varKind: "COND", dispType: disp[1], seq: 1, varName: "COIL_THK", dataType: "NUMBER" }),
      pvVar({ varId: 2, varKind: "COND", dispType: disp[2], seq: 2, varName: "TOP_RESIN_CD", dataType: "STRING" }),
      pvVar({ varId: 3, varKind: "RESULT", dispType: disp[3], seq: 1, varName: "BASE_SPD", dataType: "NUMBER" }),
    ] as RuleEditView["vars"],
    varMeta: (over.axis ?? [[1, "ROW"], [2, "COL"]]).map(([varId, axis]) => ({ varId, axis })) as RuleEditView["varMeta"],
    rows: [
      { rowId: 1, seq: 1, rowKind: "NORMAL", cells: cell("0", "0.5", "2", "100"), note: null },
      { rowId: 2, seq: 2, rowKind: "NORMAL", cells: cell("0", "0.5", "6", "90"), note: null },
      { rowId: 3, seq: 3, rowKind: "NORMAL", cells: cell("0.5", "0.6", "2", "70"), note: null },
    ],
    baseRows: [],
    varCandidates: [],
  };
}

describe("피벗 섹션", () => {
  beforeEach(() => {
    installDomStorage();
    bodies = [];
    writes = 0;
    globalThis.sessionStorage?.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      bodies.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      if (url.includes("/oasis/ruleEdit/save")) return jsonResponse({ meta: { success: true }, data: { result: { part: "TABLE", rowVersion: 4, issues: [] } } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("축 열이 없는 룰(QLTY_GRD_JDG)은 피벗 섹션을 그리지 않는다", async () => {
    await mount(createElement(PivotSection, props(view())));
    expect(container.querySelector("[data-testid='pivot-section']")).toBeNull();
  });

  it("편집 가능 모양이면 편집 배지와 셀·구간 입력 칸을 그린다(열 축 값은 처음 나온 순서)", async () => {
    await mount(createElement(PivotSection, props(pivotView())));
    expect(q("[data-testid='pivot-badge']").textContent).toContain("편집");
    expect(Array.from(container.querySelectorAll("th[data-testid^='pivot-col-']")).map((t) => t.textContent)).toEqual(["2", "6"]);
    expect(container.querySelectorAll("input[data-pvc]")).toHaveLength(4); // 구간 2 × 열 2
    expect(q<HTMLInputElement>("input[data-pvc='1'][data-col='2']").value).toBe("100");
    expect(q<HTMLInputElement>("input[data-pvc='3'][data-col='6']").value).toBe("");
    expect(q<HTMLButtonElement>("[data-testid='pivot-save']").disabled).toBe(true);
  });

  it("셀을 고치고 빈칸에 값을 넣어 저장하면 기존 TABLE 파트로 평탄화 행이 간다(피벗 전용 저장 없음)", async () => {
    await mount(createElement(PivotSection, props(pivotView())));
    await typeInto(q<HTMLInputElement>("input[data-pvc='1'][data-col='6']"), "95");
    await act(async () => {
      q<HTMLInputElement>("input[data-pvc='1'][data-col='6']").dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    await typeInto(q<HTMLInputElement>("input[data-pvc='3'][data-col='6']"), "60");
    await act(async () => {
      q<HTMLInputElement>("input[data-pvc='3'][data-col='6']").dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(q<HTMLButtonElement>("[data-testid='pivot-save']").disabled).toBe(false);
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='pivot-save']").click();
    });
    await flush();
    const save = bodies.find((b) => b.url.includes("/oasis/ruleEdit/save"))!;
    expect(save.body.params).toMatchObject({ part: "TABLE", maruRuleId: "E2E_PVT_LKP", ver: 2, rowVersion: 3, hitPolicy: "FIRST" });
    const rows = (save.body.grids as { rows: { rows: Array<{ rowId: number; cells: string }> } }).rows.rows;
    expect(rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1]);
    expect(JSON.parse(rows[1].cells)["3"]).toEqual({ val: "95" });
    expect(JSON.parse(rows[3].cells)).toEqual({ 1: { op: "<= 변수 <", left: "0.5", right: "0.6" }, 2: { op: "EQ", left: "6" }, 3: { val: "60" } });
    expect(writes).toBe(1);
  });

  it("편집 조건이 안 맞으면 화면 표현 배지와 안내만 있고 입력 칸이 없다", async () => {
    await mount(createElement(PivotSection, props(pivotView({ dispOf: { 2: "1" } }))));
    expect(q("[data-testid='pivot-badge']").textContent).toContain("화면 표현");
    expect(container.querySelectorAll("input[data-pvc]")).toHaveLength(0);
    expect(q("[data-testid='pivot-readonly-note']").textContent).toContain("이 표는 피벗에서 편집하지 않는다");
    expect(container.querySelector("[data-testid='pivot-save']")).toBeNull();
  });

  it("소유자가 아니면(편집 불가) 피벗은 보이되 입력 칸이 없다", async () => {
    await mount(createElement(PivotSection, props(pivotView({ owner: "someone_else" }))));
    expect(q("[data-testid='pivot-badge']").textContent).toContain("화면 표현");
    expect(container.querySelectorAll("input[data-pvc]")).toHaveLength(0);
  });

  it("열 설정 초안이 dirty 이면 피벗 저장이 꺼지고 안내가 나온다(불변 13)", async () => {
    const shared = { colDirty: true, tableDirty: false, pivotDirty: false, setPivotDirty: () => {}, setColDirty: () => {}, highlightVarId: null, setHighlightVarId: () => {} };
    await mount(createElement(ColumnDraftSharedContext.Provider, { value: shared }, createElement(PivotSection, props(pivotView()))));
    await typeInto(q<HTMLInputElement>("input[data-pvc='1'][data-col='6']"), "95");
    await act(async () => {
      q<HTMLInputElement>("input[data-pvc='1'][data-col='6']").dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(q<HTMLButtonElement>("[data-testid='pivot-save']").disabled).toBe(true);
    expect(visibleText(q("[data-testid='pivot-col-block']"))).toContain("열 설정 초안이 있어");
  });

  const commitPivotCell = async () => {
    await typeInto(q<HTMLInputElement>("input[data-pvc='1'][data-col='6']"), "95");
    await act(async () => {
      q<HTMLInputElement>("input[data-pvc='1'][data-col='6']").dispatchEvent(new Event("focusout", { bubbles: true }));
    });
  };

  it("표 카드에 저장 안 한 변경이 있으면 피벗 저장이 꺼지고 안내가 나오며, 되돌리면 다시 켜진다(같은 표 파트를 덮어쓰지 않게)", async () => {
    await mount(createElement(DecisionTableCard, { ...props(pivotView()), extraSections: [{ id: "pivot", Component: PivotSection }] }));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    await commitPivotCell();
    expect(q<HTMLButtonElement>("[data-testid='pivot-save']").disabled).toBe(true);
    expect(visibleText(q("[data-testid='pivot-table-block']"))).toContain("표 카드에 저장 안 한 변경이 있어");
    await act(async () => {
      findButton(container, "되돌리기").click();
    });
    expect(container.querySelector("[data-testid='pivot-table-block']")).toBeNull();
  });

  it("피벗에 저장 안 한 편집이 있으면 표 저장이 꺼지고 안내가 나오며, 피벗을 버리면 다시 켜진다", async () => {
    await mount(createElement(DecisionTableCard, { ...props(pivotView()), extraSections: [{ id: "pivot", Component: PivotSection }] }));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(false);
    expect(container.querySelector("[data-testid='dt-pivot-block']")).toBeNull();
    await commitPivotCell();
    expect(findButton(container, "표 저장").disabled).toBe(true);
    expect(visibleText(q("[data-testid='dt-pivot-block']"))).toContain("피벗에 저장 안 한 변경이 있어");
    await act(async () => {
      q<HTMLButtonElement>("[data-testid='pivot-revert']").click();
    });
    expect(findButton(container, "표 저장").disabled).toBe(false);
    expect(container.querySelector("[data-testid='dt-pivot-block']")).toBeNull();
  });

  it("구간 추가·삭제 버튼이 행 수를 바꾼다", async () => {
    await mount(createElement(PivotSection, props(pivotView())));
    await act(async () => {
      q<HTMLButtonElement>("[data-pvadd='3']").click();
    });
    expect(container.querySelectorAll("tbody tr[data-testid^='pivot-band-']")).toHaveLength(3);
    await act(async () => {
      q<HTMLButtonElement>("[data-pvdel='1']").click();
    });
    expect(container.querySelectorAll("tbody tr[data-testid^='pivot-band-']")).toHaveLength(2);
  });
});

// ── 입력 계약 섹션(TSK-08-03 단계 6) ──

function contractView(cur = PROD_WGT_CALC, base = PROD_WGT_CALC_PV2): RuleEditView {
  const c = sourceOf(cur).src;
  const b = sourceOf(base).src;
  const v = draftView("e2e_mdm_steward");
  return { ...v, rule: { ...v.rule, maruRuleId: "PROD_WGT_CALC" }, vars: c.vars, varMeta: c.meta, rows: c.rows, baseVars: b.vars, baseRows: b.rows };
}

describe("입력 계약 섹션", () => {
  beforeEach(() => {
    installDomStorage();
    bodies = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      const body = JSON.parse(String(init?.body ?? "{}")) as { params?: { text?: string } };
      bodies.push({ url, body: body as Record<string, unknown> });
      if (url.includes("/oasis/ruleEdit/validate")) {
        const text = body.params?.text ?? "";
        return jsonResponse({ meta: { success: true }, data: { result: { ast: ast(text), refVars: [], supported: true, problems: [] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("조건 변수 한 줄과 행 묶음 표를 그린다(PROD_WGT_CALC 는 행마다 필수가 달라 3줄)", async () => {
    await mount(createElement(InputContractSection, props(contractView())));
    expect(q("[data-testid='contract-always']").textContent).toContain("PROD_TYPE");
    expect(q("[data-testid='contract-always']").textContent).toContain("CALC_BASIS");
    const groups = container.querySelectorAll("[data-testid^='contract-group-']");
    expect(groups).toHaveLength(3);
    expect(groups[0].textContent).toContain("PROD_TYPE = COIL · CALC_BASIS = LEN");
    expect(groups[0].textContent).toContain("COIL_LEN");
    expect(groups[2].textContent).toContain("SHEET_LEN");
  });

  it("같은 행이 묶이면 'N개 행이 같다' 로 보이고 title 에 행별 조건이 든다", async () => {
    const same = { ...PROD_WGT_CALC, rows: PROD_WGT_CALC.rows.map((r) => ({ ...r, cells: { ...r.cells, 2: PROD_WGT_CALC.rows[0].cells[2] } })) };
    await mount(createElement(InputContractSection, props(contractView(same as never, PROD_WGT_CALC))));
    const groups = container.querySelectorAll("[data-testid^='contract-group-']");
    expect(groups).toHaveLength(1);
    expect(groups[0].textContent).toContain("3개 행이 같다");
    expect(groups[0].querySelector("[title]")?.getAttribute("title")).toContain("PROD_TYPE = SHEET");
  });

  it("DRAFT 는 RELEASED 대비 diff 를 보인다: 필수 → 선택은 알림, 선택 → 필수는 경고", async () => {
    await mount(createElement(InputContractSection, props(contractView(PROD_WGT_CALC_PV2, PROD_WGT_CALC))));
    expect(q("[data-testid='contract-diff-info']").textContent).toContain("SPEC_GRAV");
    expect(container.querySelector("[data-testid='contract-diff-warning']")).toBeNull();
    act(() => root?.unmount());
    container.remove();
    await mount(createElement(InputContractSection, props(contractView(PROD_WGT_CALC, PROD_WGT_CALC_PV2))));
    expect(q("[data-testid='contract-diff-warning']").textContent).toContain("SPEC_GRAV");
    expect(q("[data-testid='contract-warning-count']").textContent).toContain("1");
  });

  it("열 조건 식은 서버 parseExpr 로 AST 를 받아 조건 변수에 반영한다(화면 파서 없음)", async () => {
    const v = contractView();
    const withGrp: RuleEditView = {
      ...v,
      vars: [...v.vars, { varId: 9, varKind: "RESULT", dispType: "Value", seq: 2, varName: "EXTRA", exprVar: false, dataType: "NUMBER", dateString: false, typeSource: "DECLARED" }],
      varMeta: [...(v.varMeta ?? []), { varId: 9, resGrp: "PROD_WGT", grpCond: 'TOP_RESIN_CD == "F"' }],
    };
    await mount(createElement(InputContractSection, props(withGrp)));
    await flush();
    const called = bodies.filter((b) => b.url.includes("/oasis/ruleEdit/validate"));
    expect(called).toHaveLength(1);
    expect(q("[data-testid='contract-always']").textContent).toContain("TOP_RESIN_CD");
  });

  it("열 조건 식이 여럿이면 앞 응답이 화면을 다시 그려도 뒤 응답을 버리지 않는다", async () => {
    const v = contractView();
    const extra = (varId: number, seq: number, varName: string) =>
      ({ varId, varKind: "RESULT", dispType: "Value", seq, varName, exprVar: false, dataType: "NUMBER", dateString: false, typeSource: "DECLARED" }) as const;
    const withGrp: RuleEditView = {
      ...v,
      vars: [...v.vars, extra(9, 2, "EXTRA1"), extra(10, 3, "EXTRA2")],
      varMeta: [
        ...(v.varMeta ?? []),
        { varId: 9, resGrp: "PROD_WGT", grpCond: 'TOP_RESIN_CD == "F"' },
        { varId: 10, resGrp: "PROD_WGT", grpCond: 'COAT_SIDE == "1"' },
      ],
    };
    // 응답을 하나씩 풀어 준다 — 첫 응답으로 화면이 다시 그려진 뒤에 둘째 응답이 온다(실제 네트워크 순서).
    const gates: Array<() => void> = [];
    const answer = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/oasis/ruleEdit/validate") ? new Promise<Response>((res) => gates.push(() => void answer(input, init).then(res))) : answer(input, init),
    ) as typeof fetch;
    await mount(createElement(InputContractSection, props(withGrp)));
    for (let i = 0; i < 2; i++) {
      await flush();
      await act(async () => gates.shift()?.());
      await flush();
    }
    expect(bodies.filter((b) => b.url.includes("/oasis/ruleEdit/validate"))).toHaveLength(2);
    expect(q("[data-testid='contract-always']").textContent).toContain("TOP_RESIN_CD");
    expect(q("[data-testid='contract-always']").textContent).toContain("COAT_SIDE");
    expect(container.querySelector("[data-testid='contract-pending']")).toBeNull();
  });

  it("validate 권한이 없으면 서버를 부르지 않고 파싱 대기 안내를 낸다", async () => {
    const v = contractView();
    const withGrp: RuleEditView = {
      ...v,
      varMeta: (v.varMeta ?? []).map((m) => (m.varId === 2 ? { ...m, resGrp: "PROD_WGT", grpCond: 'TOP_RESIN_CD == "F"' } : m)),
    };
    await mount(createElement(InputContractSection, props(withGrp, (a) => a !== "validate")));
    await flush();
    expect(bodies.filter((b) => b.url.includes("/oasis/ruleEdit/validate"))).toHaveLength(0);
    expect(q("[data-testid='contract-pending']").textContent).toContain('TOP_RESIN_CD == "F"');
  });

  it("섹션 목록 순서는 열 설정 → 피벗 → 입력 계약이다", () => {
    expect(TABLE_SECTIONS.map((x) => x.id)).toEqual(["columns", "pivot", "contract"]);
  });
});
