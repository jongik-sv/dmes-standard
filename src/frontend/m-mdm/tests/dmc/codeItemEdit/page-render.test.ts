/** @vitest-environment happy-dom */

// TSK-06-03 design.md §4.8 page-render ①~⑥ — 화면 셸·빈 상태·DRAFT/RELEASED/CANCELLED 에 따른 편집 요소와 경미 수정 패널의
// 잠김(수용 기준 2·5·6). PageLayout 이 /api/auth/me·버튼 RBAC 를 부르므로 fetch 를 URL 별로 스텁하고, 버튼 RBAC 는
// SYSADMIN 와일드카드로 응답한다 — 편집 요소가 사라지는 까닭이 권한이 아니라 버전 상태임을 보이기 위해서다.
// ⑦~ — 카테고리 편집(TSK-06-04)을 합친 뒤(D-101)의 세 탭·카테고리 탭(BASE 버튼 비노출·REGEX/TABLE 편집 영역)·합친 저장
// 호출 모양(세 그리드 늘 전송)·거부 뒤 카테고리 이슈 표시·미저장 코드의 transfer 후보 표시.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import CodeItemEditPage from "../../../pages/dmc/codeItemEdit/page";
import { PatchPanel } from "../../../pages/dmc/codeItemEdit/components/PatchPanel";
import type { ServerRow } from "../../../pages/dmc/codeItemEdit/grid-state";
import { TransferListPanel } from "../../../pages/dmc/codeItemEdit/cate/components/TransferListPanel";
import { transferCandidates } from "../../../pages/dmc/codeItemEdit/cate/transfer";
import type { CategoryDef, CateItemInfo, CodeItemInfo } from "../../../pages/dmc/codeItemEdit/cate/types";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

function row(code: string, extra: Partial<ServerRow> = {}): ServerRow {
  return {
    code, name: `${code} 이름`, alterName: null, seq: 1, description: null, fromVer: "1.000", toVer: "9999.000",
    lvl1: "KS", lvl2: null, lvl3: null, lvl4: null, lvl5: null,
    attr01: "270", attr02: null, attr03: null, attr04: null, attr05: null,
    attr06: null, attr07: null, attr08: null, attr09: null, attr10: null,
    change: "NONE", prev: null, tableCategories: [], patchBlocked: false, ...extra,
  };
}

function viewOf(status: string, flags: { editable: boolean; patchable: boolean }, rows: ServerRow[]) {
  return {
    header: {
      maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1,
      attrLabels: [{ no: 1, label: "인장강도" }],
    },
    versions: [{ ver: "1.000", display: "v1.000", status, verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
    selected: { ver: "1.000", display: "v1.000", status, ownerId: "kim", rowVersion: 4, warning: null, ...flags },
    rows, closed: [], closedCateItems: [], categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
  };
}

const BASE: CategoryDef = { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: ".*", defTarget: "CODE", description: null };
const TABLE1: CategoryDef = { cateId: "T1", cateName: "표1", defKind: "TABLE", defExpr: null, defTarget: null, description: null };
const REGEX1: CategoryDef = { cateId: "R1", cateName: "정규식1", defKind: "REGEX", defExpr: "8[0-9]", defTarget: "CODE", description: null };

/** codeCateEdit view — 카테고리 탭이 코드 view 가 고른 버전으로 따로 읽는다. */
function cateViewOf(
  status: string, editable: boolean, categories: CategoryDef[], items: CodeItemInfo[] = [], cateItems: CateItemInfo[] = [],
) {
  return {
    header: { maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 },
    versions: [{ ver: "1.000", display: "v1.000", status, verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
    selected: { ver: "1.000", display: "v1.000", status, ownerId: "kim", rowVersion: 4, warning: null, editable },
    categories, items, cateItems,
  };
}

type Call = { url: string; body: { params?: Record<string, unknown>; grids?: Record<string, { rows: unknown[] }> } };

interface StubOptions {
  cateView?: unknown;
  /** save 가 거부되면 서버 메시지. */
  saveError?: string;
  validate?: unknown;
  /** 버튼 RBAC 행 — 생략하면 SYSADMIN 와일드카드(모두 허용). 특정 권한만 주고 나머지를 잠그는 시나리오용. */
  rbacRows?: { objId: string; action: string }[];
}

let calls: Call[] = [];
const callsTo = (part: string) => calls.filter((c) => c.url.includes(part));

function stubFetch(view: unknown, opts: StubOptions = {}) {
  calls = [];
  const cateView = opts.cateView ?? cateViewOf("DRAFT", true, [BASE]);
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/oasis/")) calls.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
    const ok = (result: unknown) => new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
    if (u.includes("/oasis/codeItemEdit/search")) {
      return ok({ codes: [{ maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 }] });
    }
    if (u.includes("/oasis/codeItemEdit/view")) return ok(view);
    if (u.includes("/oasis/codeItemEdit/compare")) {
      return ok({ cateId: "BASE", ver: "1.000", hitCount: 0, total: 0, rows: [], warnings: [] });
    }
    if (u.includes("/oasis/codeItemEdit/save")) {
      if (opts.saveError) {
        return new Response(JSON.stringify({ meta: { success: false, message: opts.saveError } }), { status: 200 });
      }
      return ok({ rowVersion: 5, closedCategories: {} });
    }
    if (u.includes("/oasis/codeItemEdit/validate")) return ok(opts.validate ?? { issues: [], cateIssues: [] });
    if (u.includes("/oasis/codeItemEdit/restore")) return ok({ rowVersion: 5 });
    if (u.includes("/oasis/codeCateEdit/view")) return ok(cateView);
    if (u.includes("/oasis/codeCateEdit/compare")) {
      return ok({ cateId: "R1", ver: "1.000", hitCount: 1, total: 2, rows: [], warnings: [] });
    }
    if (u.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return new Response(
        JSON.stringify({ grids: { buttons: { rows: opts.rbacRows ?? [{ objId: "*", action: "*" }] } } }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function render(element: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, element));
  });
  await settle();
}

async function chooseCode(id: string) {
  const sel = container.querySelector('[data-testid="code-maru-select"]') as HTMLSelectElement;
  await act(async () => {
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

/** 네이티브 value setter 로 값을 넣고 React 가 듣는 input 이벤트를 쏜다(code-mng-page.test.ts 관례). */
async function typeInto(testIdValue: string, value: string) {
  const el = container.querySelector(`[data-testid="${testIdValue}"]`) as HTMLInputElement;
  expect(el, testIdValue).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

const bodyButtons = () => Array.from(document.body.querySelectorAll("button"));

const testId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const buttonTexts = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim());
const saveButton = () => Array.from(container.querySelectorAll("button"))
  .find((b) => b.textContent?.trim() === "저장") as HTMLButtonElement | undefined;
const openCateTab = () => click(testId("code-tab-cate"));

describe("codeItemEdit page", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("① 화면 id 꼬리표와 breadcrumb", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    await render(createElement(CodeItemEditPage));
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("codeItemEdit");
    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toContain("마루 MDM > 마스터코드 > 코드 편집");
  });

  it("② 코드가 0건이면 빈 상태 문구", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("code-grid-empty")?.textContent).toBe("보일 코드가 없습니다");
  });

  it("③ DRAFT(편집 가능)는 저장·코드 추가가 있고 경미 수정 패널이 없다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(buttonTexts()).toContain("저장");
    expect(testId("code-add")).not.toBeNull();
    expect(testId("code-row-version")?.textContent).toBe("row_version = 4");
    expect(testId("patch-panel")).toBeNull();
    expect(testId("code-grid-empty")).toBeNull();
  });

  it("④ RELEASED 는 저장·코드 추가가 없고 경미 수정 패널이 있다", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(buttonTexts()).not.toContain("저장");
    expect(testId("code-add")).toBeNull();
    expect(testId("patch-panel")).not.toBeNull();
  });

  it("④ 경미 수정 패널은 코드·계층·추가 컬럼이 disabled 이고 이름·약칭·순서·설명만 입력된다", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, []));
    await render(createElement(PatchPanel, {
      row: row("KS-9"), lvlCnt: 1, attrLabels: [{ no: 1, label: "인장강도" }], canPatch: true, onSave: () => {},
    }));
    const input = (id: string) => testId(id) as HTMLInputElement;
    expect(input("patch-code").disabled).toBe(true);
    expect(input("patch-code").value).toBe("KS-9");
    expect(input("patch-lvl1").disabled).toBe(true);
    expect(input("patch-attr01").disabled).toBe(true);
    for (const id of ["patch-name", "patch-alter-name", "patch-seq", "patch-description"]) {
      expect(input(id).disabled, id).toBe(false);
    }
    expect((testId("patch-save") as HTMLButtonElement).disabled).toBe(false);
    expect(testId("patch-blocked")).toBeNull();
  });

  it("⑤ patchBlocked 행은 경미 수정 저장이 막히고 DRAFT에서 고치세요", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, []));
    await render(createElement(PatchPanel, {
      row: row("82", { patchBlocked: true }), lvlCnt: 1, attrLabels: [], canPatch: true, onSave: () => {},
    }));
    expect((testId("patch-save") as HTMLButtonElement).disabled).toBe(true);
    expect(testId("patch-blocked")?.textContent).toBe("DRAFT에서 고치세요");
  });

  it("⑥ CANCELLED 는 경미 수정 패널도 편집 요소도 없다", async () => {
    stubFetch(viewOf("CANCELLED", { editable: false, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("patch-panel")).toBeNull();
    expect(testId("code-add")).toBeNull();
    expect(buttonTexts()).not.toContain("저장");
  });
  it("⑦ 탭은 코드·트리·카테고리 셋이다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("code-tab-grid")?.textContent).toBe("코드");
    expect(testId("code-tab-tree")?.textContent).toBe("트리");
    expect(testId("code-tab-cate")?.textContent).toBe("카테고리");
    expect(testId("code-grid")).not.toBeNull();
    await openCateTab();
    expect(testId("code-grid")).toBeNull();
    expect(testId("cate-tab")).not.toBeNull();
  });

  it("⑧ 마루 코드를 고르기 전 카테고리 탭은 빈 상태 문구", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    await render(createElement(CodeItemEditPage));
    await openCateTab();
    expect(testId("cate-empty")?.textContent).toBe("마루 코드를 고르세요");
  });

  it("⑨ 카테고리 탭 — DRAFT 는 추가 폼이 있고 BASE 행에는 닫기 버튼이 없다, 카테고리 조회는 codeCateEdit 서비스", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]),
      { cateView: cateViewOf("DRAFT", true, [BASE, TABLE1]) });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();
    expect(callsTo("/oasis/codeCateEdit/view")[0]?.body.params).toEqual({ maruCodeId: "STEEL", ver: "1.000" });
    expect(testId("cate-list")?.querySelectorAll('[data-testid^="cate-row-"]')).toHaveLength(2);
    expect(testId("cate-add-submit")).not.toBeNull();
    expect(testId("cate-close-BASE")).toBeNull();
    expect(testId("cate-close-T1")).not.toBeNull();
    expect(testId("cate-row-version")?.textContent).toBe("row_version = 4");
  });

  it("⑩ 카테고리 탭 — RELEASED 는 추가 폼·닫기 버튼이 없다", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, [row("KS-9")]),
      { cateView: cateViewOf("RELEASED", false, [BASE, TABLE1]) });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();
    expect(testId("cate-row-T1")).not.toBeNull();
    expect(testId("cate-add-submit")).toBeNull();
    expect(testId("cate-close-T1")).toBeNull();
  });

  it("⑪ BASE 는 안내만, TABLE 은 transfer-list, REGEX 는 편집 영역과 오른쪽 미리보기(compare 결과)", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]), {
      cateView: cateViewOf("DRAFT", true, [BASE, TABLE1, REGEX1],
        [{ code: "KS-9", name: "규격 외 KS", seq: 1, lvls: ["KS", null, null, null, null] }]),
    });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();
    await click(testId("cate-row-BASE"));
    expect(testId("cate-base-readonly")).not.toBeNull();
    expect(testId("cate-regex-edit")).toBeNull();

    await click(testId("cate-row-T1"));
    expect(testId("cate-transfer-item-available-KS-9")).not.toBeNull();
    expect(testId("cate-preview")?.textContent).toContain("TABLE 카테고리는 소속 목록이 곧 결과입니다");
    expect(testId("code-preview")).toBeNull();

    await click(testId("cate-row-R1"));
    expect((testId("cate-regex-expr") as HTMLInputElement).value).toBe("8[0-9]");
    await settle();
    expect(testId("cate-preview-summary")?.textContent).toBe("1 / 2건 해당");
    expect(callsTo("/oasis/codeCateEdit/compare").at(-1)?.body.params).toMatchObject({ cateId: "R1", defExpr: "8[0-9]" });
  });

  it("⑫ 코드·트리 탭의 오른쪽은 코드 편집 미리보기다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("code-preview")).not.toBeNull();
    expect(testId("cate-preview")).toBeNull();
  });

  it("⑬ 변경이 없으면 저장을 누를 수 없고, 저장은 세 그리드를 늘 codeItemEdit save 한 번으로 보낸다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]),
      { cateView: cateViewOf("DRAFT", true, [BASE, TABLE1]) });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(saveButton()?.disabled).toBe(true);

    await openCateTab();
    await click(testId("cate-close-T1"));
    expect(testId("cate-undo-T1")).not.toBeNull();
    expect(saveButton()?.disabled).toBe(false);

    await click(saveButton()!);
    const saves = callsTo("/oasis/codeItemEdit/save");
    expect(saves).toHaveLength(1);
    expect(saves[0].body.params).toEqual({ maruCodeId: "STEEL", ver: "1.000", rowVersion: 4 });
    expect(saves[0].body.grids).toEqual({
      rows: { rows: [] },
      categories: { rows: [{ rowStatus: "DELETED", cateId: "T1" }] },
      members: { rows: [] },
    });
    expect(callsTo("/oasis/codeCateEdit/save")).toHaveLength(0);
    // 저장 뒤 코드·카테고리를 모두 다시 읽는다.
    expect(callsTo("/oasis/codeItemEdit/view")).toHaveLength(2);
    expect(callsTo("/oasis/codeCateEdit/view")).toHaveLength(2);
  });

  it("⑭ 탭을 오가도 카테고리 편집이 남는다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]),
      { cateView: cateViewOf("DRAFT", true, [BASE, TABLE1]) });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();
    await click(testId("cate-close-T1"));
    await click(testId("code-tab-grid"));
    expect(testId("cate-tab")).toBeNull();
    await openCateTab();
    expect(testId("cate-undo-T1")).not.toBeNull();
  });

  it("⑮ 저장이 거부되면 같은 세 그리드로 validate 하고 카테고리 이슈를 목록 행·탭 표시로 보인다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]), {
      cateView: cateViewOf("DRAFT", true, [BASE, TABLE1]),
      saveError: "MDM022 코드 저장 검사를 통과하지 못했습니다",
      validate: {
        issues: [],
        cateIssues: [
          { code: "CATE_NOT_FOUND", message: "이 버전에 없는 카테고리다", field: "cateId", itemKey: "T1" },
          { code: "MEMBER_CODE_NOT_FOUND", message: "이 버전에 없는 코드다", field: "code", itemKey: "ZZ" },
        ],
      },
    });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();
    await click(testId("cate-close-T1"));
    await click(saveButton()!);

    const validates = callsTo("/oasis/codeItemEdit/validate");
    expect(validates).toHaveLength(1);
    expect(validates[0].body.grids).toEqual(callsTo("/oasis/codeItemEdit/save")[0].body.grids);
    expect(Object.keys(validates[0].body.grids ?? {}).sort()).toEqual(["categories", "members", "rows"]);
    expect(document.body.textContent).toContain("코드 저장 검사를 통과하지 못했습니다");
    expect(testId("cate-row-issue-T1")?.textContent).toBe("이 버전에 없는 카테고리다");
    expect(testId("cate-issues")?.textContent).toContain("ZZ MEMBER_CODE_NOT_FOUND");
    expect(testId("code-tab-cate-issue")).not.toBeNull();
    expect(testId("code-tab-grid-issue")).toBeNull();
    // 거부된 변경은 화면에 그대로 남는다.
    expect(testId("cate-undo-T1")).not.toBeNull();
  });

  it("⑯ 코드 탭에서 추가만 하고 저장하지 않은 코드도 transfer 후보에 미저장 표시로 보인다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    const items = transferCandidates([{ code: "A", name: "에이", lvl1: "G" }], [
      { code: "A", __local: "deleted" },
      { code: "N1", name: "새 코드", lvl1: "G", __local: "new" },
    ]);
    await render(createElement(TransferListPanel, { items, memberCodes: new Set<string>(), editable: true, onChange: () => {} }));
    expect(testId("cate-transfer-item-available-N1")).not.toBeNull();
    expect(testId("cate-transfer-mark-N1")?.textContent).toBe("미저장");
    expect(testId("cate-transfer-item-available-A")).toBeNull();
  });

  it("⑰ 추가 뒤 취소한 새 카테고리의 소속 행은 저장 요청에 실리지 않는다(§ 결함 1)", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]), {
      cateView: cateViewOf("DRAFT", true, [BASE, TABLE1],
        [{ code: "KS-9", name: "규격 외 KS", seq: 1, lvls: ["KS", null, null, null, null] }]),
    });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();

    // 저장 버튼을 켜 둘 다른 변경(T1 닫기) 하나를 같이 낸다.
    await click(testId("cate-close-T1"));

    await typeInto("cate-add-id", "T2");
    await typeInto("cate-add-name", "표2");
    await click(testId("cate-add-submit"));
    expect(testId("cate-row-T2")).not.toBeNull();

    // 새 카테고리 T2(선택된 상태)의 소속으로 KS-9 를 옮긴다.
    await click(testId("cate-transfer-move-right-all"));
    expect(testId("cate-transfer-item-member-KS-9")).not.toBeNull();

    // T2 를 취소하면 목록에서 아예 빠진다 — 옮긴 소속도 함께 버려야 한다.
    await click(testId("cate-undo-T2"));
    expect(testId("cate-row-T2")).toBeNull();

    await click(saveButton()!);
    const saves = callsTo("/oasis/codeItemEdit/save");
    expect(saves).toHaveLength(1);
    expect(saves[0].body.grids).toEqual({
      rows: { rows: [] },
      categories: { rows: [{ rowStatus: "DELETED", cateId: "T1" }] },
      members: { rows: [] },
    });
  });

  it("⑱ 되돌리기는 저장하지 않은 카테고리 편집이 있으면 확인을 받는다(§ 결함 2)", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9", { change: "ADDED" })]),
      { cateView: cateViewOf("DRAFT", true, [BASE, TABLE1]) });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");

    await openCateTab();
    await click(testId("cate-close-T1"));
    expect(testId("cate-undo-T1")).not.toBeNull();

    // [취소] 를 누르면 되돌리지 않고, 카테고리 편집도 그대로 남는다.
    await click(testId("code-tab-grid"));
    await click(bodyButtons().find((b) => b.textContent === "되돌리기") ?? null);
    expect(document.body.textContent).toContain("저장하지 않은 카테고리 편집이 있습니다");
    await click(bodyButtons().find((b) => b.textContent === "취소") ?? null);
    expect(callsTo("/oasis/codeItemEdit/restore")).toHaveLength(0);
    await openCateTab();
    expect(testId("cate-undo-T1")).not.toBeNull();

    // [확인] 을 누르면 되돌리고, 다시 조회해 저장하지 않은 카테고리 편집은 사라진다.
    await click(testId("code-tab-grid"));
    await click(bodyButtons().find((b) => b.textContent === "되돌리기") ?? null);
    await click(bodyButtons().find((b) => b.textContent === "확인") ?? null);
    expect(callsTo("/oasis/codeItemEdit/restore")).toHaveLength(1);
    await openCateTab();
    expect(testId("cate-undo-T1")).toBeNull();
  });

  it("⑲ codeItemEdit save 권한이 없으면 카테고리 추가·닫기·REGEX 편집·소속 이동이 모두 잠긴다(§ 결함 3)", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]), {
      cateView: cateViewOf("DRAFT", true, [BASE, TABLE1, REGEX1],
        [{ code: "KS-9", name: "규격 외 KS", seq: 1, lvls: ["KS", null, null, null, null] }]),
      // save 는 뺀다 — validate·restore 는 있어도(다른 화면 동작은 그대로) 카테고리 편집은 잠긴다.
      rbacRows: [{ objId: "codeItemEdit", action: "validate" }, { objId: "codeItemEdit", action: "restore" }],
    });
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    await openCateTab();

    expect(testId("cate-add-submit")).toBeNull();
    expect(testId("cate-close-T1")).toBeNull();

    await click(testId("cate-row-R1"));
    expect((testId("cate-regex-name") as HTMLInputElement).disabled).toBe(true);
    expect((testId("cate-regex-expr") as HTMLInputElement).disabled).toBe(true);

    await click(testId("cate-row-T1"));
    // available 목록에 KS-9 가 있어 length===0 이 아니다 — disabled 는 오직 editable(=editable && canEdit) 로만 갈린다.
    expect(testId("cate-transfer-item-available-KS-9")).not.toBeNull();
    expect((testId("cate-transfer-move-right-all") as HTMLButtonElement).disabled).toBe(true);
  });
});
