/** @vitest-environment happy-dom */

// TSK-06-02 design.md §3.3 — codeMng 오른쪽 상세(옛 codeEdit) 렌더 스모크. 2026-09-28 통합(D-101·D-102):
// 코드 선택은 목록 행 클릭(ComboBox 없앰), [코드 편집] 단일 버튼(버전 선택만 있으면 늘 켠다), 헤더 [폐기]↔[삭제]
// 전환(flags.neverReleased·canDeleteCode), handoff/snapshot·MDM001 오류 재조회·확정 이동 handoff 는 그대로 옮겼다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import CodeMngPage from "../../../pages/dmc/codeMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; svc: string; params: Record<string, unknown> }[] = [];
let saveResponse: unknown;
let viewName = "공정 코드";
let searchRow: Record<string, unknown> = {
  maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
  currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function viewResult(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      maruCodeId: "PROC_CD", maruCodeName: viewName, description: null, lvlCnt: 0, sourceKind: "MDM",
      status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
      attr01Name: "인장강도",
    },
    versions: [
      { ver: "1.000", verLabel: "v1.000", verKind: "MAJOR", status: "DRAFT", ownerId: "tester", applyFrom: null,
        applyTo: null, releasedAt: null, restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: true,
        description: null },
    ],
    flags: { unappliedCount: 1, canNewMajor: false, canNewMinor: false, nextMajor: "2.000", nextMinor: "1.001",
      minorLimit: false, canDeprecate: false, editable: true },
    restoreSources: [],
    me: "tester",
    steward: true,
    ...overrides,
  };
}

let nextView: () => unknown = () => viewResult();

function visibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      out += visibleText(node as Element);
    }
  }
  return out;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeMngPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })));
  });
  await flush();
  await flush();
}

/** 버전 목록 그리드의 행(ag-row) 을 ver(rowKey) 로 찾는다. */
function versionRow(ver: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="version-list"] .ag-row[row-id="${ver}"]`);
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function typeInto(testId: string, value: string) {
  const el = byTestId(testId) as HTMLInputElement;
  expect(el, testId).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** code-list 안에서 텍스트를 담은 ag-grid 행을 찾아 첫 셀을 클릭한다(목록 선택 — ComboBox 를 대신한다). */
async function selectFromList(matchText: string) {
  const rows = Array.from(document.body.querySelectorAll('[data-testid="code-list"] .ag-row'));
  const row = rows.find((r) => r.textContent?.includes(matchText));
  expect(row, `row containing "${matchText}"`).toBeTruthy();
  await click(row!.querySelector(".ag-cell"));
  expect(byTestId("header-name")).toBeTruthy();
}

async function confirmDialog() {
  const btn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인");
  await click(btn);
}

const actions = (name: string) => calls.filter((c) => c.action === name);

describe("codeMng — 오른쪽 상세(옛 codeEdit)", () => {
  beforeEach(() => {
    calls.length = 0;
    viewName = "공정 코드";
    nextView = () => viewResult();
    saveResponse = { meta: { success: true }, data: { result: viewResult() } };
    searchRow = {
      maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
      currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1,
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const mEdit = url.match(/\/oasis\/codeEdit\/(\w+)/);
      const mMng = url.match(/\/oasis\/codeMng\/(\w+)/);
      if (mEdit) {
        calls.push({ svc: "codeEdit", action: mEdit[1], params: body.params ?? {} });
        if (mEdit[1] === "view") return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
        if (mEdit[1] === "save") return jsonResponse(saveResponse);
        return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
      }
      if (mMng) {
        calls.push({ svc: "codeMng", action: mMng[1], params: body.params ?? {} });
        if (mMng[1] === "search") return jsonResponse({ meta: { success: true }, data: { result: { rows: [searchRow] } } });
        return jsonResponse({ meta: { success: true }, data: { result: {} } });
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeMng");
    takeMdmPageParams("dmc/codeConfirm");
    takeMdmPageParams("dmc/codeItemEdit");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  it("같은 코드를 다시 불러오는 사이 고친 헤더 폼은 늦게 온 view 응답이 덮지 않는다", async () => {
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("공정 코드");

    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/codeEdit/view")) await gate;
      return baseFetch(input, init);
    }) as typeof fetch;

    const row = Array.from(document.body.querySelectorAll('[data-testid="code-list"] .ag-row')).find((r) => r.textContent?.includes("PROC_CD"));
    await click(row!.querySelector(".ag-cell")); // 이미 고른 행을 다시 눌러 view 를 다시 부른다(응답은 붙잡아 둔다)
    await typeInto("header-name", "고친 이름");
    release(null);
    await flush();
    await flush();

    expect((byTestId("header-name") as HTMLInputElement).value).toBe("고친 이름");
    expect(actions("view")).toHaveLength(2);
  });

  it("코드를 고르기 전에는 안내만 보인다", async () => {
    await render();
    expect(visibleText(container)).toContain("목록에서 마루 코드를 고르거나");
    expect(actions("view")).toHaveLength(0);
    expect(byTestId("version-list")).toBeNull();
  });

  it("handoff 로 받은 코드를 불러와 버전 목록과 잠금 배지를 보이고 snapshot 에 남긴다", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmc/codeMng", { maruCodeId: "PROC_CD" });
    await render({ snapshot: { maruCodeId: "OTHER" }, onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
    const list = byTestId("version-list")!;
    expect(visibleText(list)).toContain("v1.000");
    expect(visibleText(list)).toContain("편집 중(나)");
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("공정 코드");
    expect((byTestId("label-attr01") as HTMLInputElement).value).toBe("인장강도");
    expect(snapshots).toContainEqual({ maruCodeId: "PROC_CD" });
  });

  it("handoff 가 ver 를 주면 그 버전 행이 골라진 채로 보인다", async () => {
    openMdmPage("dmc/codeMng", { maruCodeId: "PROC_CD", ver: "1.000" });
    await render();
    expect(versionRow("1.000")?.classList.contains("ag-row-highlighted")).toBe(true);
  });

  it("이미 열린 탭이 재활성화로 handoff 를 다시 받으면 목록도 다시 조회한다", async () => {
    await render();
    const searchCountBefore = actions("search").length;
    openMdmPage("dmc/codeMng", { maruCodeId: "PROC_CD", ver: "1.000" });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "t1" } }));
    });
    await flush();
    expect(actions("search").length).toBeGreaterThan(searchCountBefore);
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
    expect(versionRow("1.000")?.classList.contains("ag-row-highlighted")).toBe(true);
  });

  it("handoff 가 없으면 snapshot 의 코드를 불러온다", async () => {
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
  });

  it("목록에서 코드를 고르면 상세가 보인다", async () => {
    await render();
    await selectFromList("PROC_CD");
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
  });

  it("버전이 없으면 빈 상태를 보인다", async () => {
    nextView = () => viewResult({ versions: [], flags: { ...viewResult().flags, unappliedCount: 0, canNewMajor: true } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(byTestId("version-empty")?.textContent).toContain("버전이 없습니다");
  });

  it("MDM001 오류 모달을 닫으면 view 를 다시 부른다", async () => {
    saveResponse = { meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    await typeInto("header-name", "새 이름");
    await click(byTestId("header-save"));
    expect(actions("save")[0].params).toMatchObject({ maruCodeId: "PROC_CD", auditVer: 0, maruCodeName: "새 이름" });
    expect(visibleText(document.body)).toContain("다른 사용자가 수정했습니다");

    viewName = "E2E 동시";
    await confirmDialog();
    expect(actions("view")).toHaveLength(2);
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("E2E 동시");
  });

  it("내 DRAFT 를 고르고 확정 이동하면 codeConfirm 탭을 코드·버전과 함께 연다", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render({ snapshot: { maruCodeId: "PROC_CD" } });
      expect((byTestId("ver-confirm-move") as HTMLButtonElement).disabled).toBe(true);
      await click(versionRow("1.000")?.querySelector(".ag-cell"));
      expect((byTestId("ver-confirm-move") as HTMLButtonElement).disabled).toBe(false);
      await click(byTestId("ver-confirm-move"));
      expect(opened).toEqual([{ pageId: "mdm:dmc/codeConfirm" }]);
      expect(takeMdmPageParams("dmc/codeConfirm")).toEqual({ maruCodeId: "PROC_CD", ver: "1.000" });
      expect(actions("confirm")).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("[코드 편집] 은 버전을 고르면 owner·상태와 무관하게 켜지고 codeItemEdit 을 코드·버전과 함께 연다", async () => {
    nextView = () => viewResult({
      versions: [{ ...viewResult().versions[0], status: "RELEASED", ownerId: "other", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", unapplied: false }],
      flags: { ...viewResult().flags, unappliedCount: 0, canNewMajor: true, canNewMinor: true },
    });
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render({ snapshot: { maruCodeId: "PROC_CD" } });
      expect((byTestId("ver-item-edit") as HTMLButtonElement).disabled).toBe(true);
      await click(versionRow("1.000")?.querySelector(".ag-cell"));
      expect((byTestId("ver-item-edit") as HTMLButtonElement).disabled).toBe(false);
      await click(byTestId("ver-item-edit"));
      expect(opened).toEqual([{ pageId: "mdm:dmc/codeItemEdit" }]);
      expect(takeMdmPageParams("dmc/codeItemEdit")).toEqual({ maruCodeId: "PROC_CD", ver: "1.000" });
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("새 버전 모달은 서버의 다음 번호를 보이고 빈 버전이면 reg 를 부른다", async () => {
    nextView = () => viewResult({
      versions: [{ ...viewResult().versions[0], status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", unapplied: false }],
      flags: { ...viewResult().flags, unappliedCount: 0, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001" },
      restoreSources: ["1.000"],
    });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    await click(byTestId("ver-new-major"));
    expect(byTestId("newver-number")?.textContent).toBe("v2.000");
    expect(byTestId("newver-content-restore-1.000")).toBeTruthy();
    await click(byTestId("newver-ok"));
    expect(actions("reg")[0].params).toEqual({ maruCodeId: "PROC_CD", verKind: "MAJOR" });

    await click(byTestId("ver-new-minor"));
    expect(byTestId("newver-number")?.textContent).toBe("v1.001");
    await click(byTestId("newver-content-restore-1.000")?.querySelector("input"));
    await click(byTestId("newver-ok"));
    expect(actions("restore")[0].params).toEqual({ maruCodeId: "PROC_CD", verKind: "MINOR", sourceVer: "1.000" });
  });

  it("미적용 버전이 2개면 경고 문구가 보인다", async () => {
    const draft2 = { ...viewResult().versions[0], ver: "1.001", verLabel: "v1.001", ownerId: "other" };
    nextView = () => viewResult({ versions: [draft2, viewResult().versions[0]], flags: { ...viewResult().flags, unappliedCount: 2 } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(byTestId("ver-unapplied-warning")?.textContent).toContain("미적용 버전이 2개입니다. 하나를 삭제하세요");
    expect((byTestId("header-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flags.neverReleased 면 헤더에 [폐기] 대신 [삭제] 가 보인다", async () => {
    nextView = () => viewResult({ flags: { ...viewResult().flags, neverReleased: true, canDeleteCode: true } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(byTestId("header-deprecate")).toBeNull();
    expect(byTestId("header-delete-code")).toBeTruthy();
    expect((byTestId("header-delete-code") as HTMLButtonElement).disabled).toBe(false);
  });

  it("flags.neverReleased·canDeleteCode 가 아니면 [삭제] 가 비활성이다", async () => {
    nextView = () => viewResult({ flags: { ...viewResult().flags, neverReleased: true, canDeleteCode: false } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect((byTestId("header-delete-code") as HTMLButtonElement).disabled).toBe(true);
  });

  it("[삭제] 를 확인하면 target CODE 로 delete 를 부르고 선택을 비운 채 목록을 다시 조회한다", async () => {
    nextView = () => viewResult({ flags: { ...viewResult().flags, neverReleased: true, canDeleteCode: true } });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const mEdit = url.match(/\/oasis\/codeEdit\/(\w+)/);
      const mMng = url.match(/\/oasis\/codeMng\/(\w+)/);
      if (mEdit) {
        calls.push({ svc: "codeEdit", action: mEdit[1], params: body.params ?? {} });
        if (mEdit[1] === "view") return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
        if (mEdit[1] === "delete") return jsonResponse({ meta: { success: true }, data: { result: { deleted: "CODE", maruCodeId: "PROC_CD" } } });
        return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
      }
      if (mMng) {
        calls.push({ svc: "codeMng", action: mMng[1], params: body.params ?? {} });
        if (mMng[1] === "search") return jsonResponse({ meta: { success: true }, data: { result: { rows: [] } } });
        return jsonResponse({ meta: { success: true }, data: { result: {} } });
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;

    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    const searchCountBefore = actions("search").length;
    await click(byTestId("header-delete-code"));
    await confirmDialog();
    expect(actions("delete")[0].params).toEqual({ maruCodeId: "PROC_CD", auditVer: 0, target: "CODE" });
    expect(visibleText(document.body)).toContain("삭제했습니다");
    expect(byTestId("header-name")).toBeNull();
    expect(visibleText(container)).toContain("목록에서 마루 코드를 고르거나");
    expect(actions("search").length).toBeGreaterThan(searchCountBefore);
  });

  /**
   * 해제(unlock) 회귀 — 재현 조건: `TB_MDM_CODE_VER.OWNER_ID='admin'` 인 PROC_CD 2.000 DRAFT 를 소유자 본인(admin)이
   * 열었는데 담당자(MDM_STEWARD) 역할이 없어 `flags.editable=false`. 편집자·확정 이동은 꺼지는 게 맞지만(담당자 전용),
   * 해제까지 꺼져 "admin 편집중" 을 아무도 풀 수 없었다(ADR-0002 D3 — 해제는 소유자만 한다, 역할 미보).
   *
   * 이 파일 마지막에 둔다 — 앞 테스트가 남긴 "삭제했습니다" 토스트(Mantine notifications 모듈 단위 싱글턴, limit=3)와
   * 겹치면 `visibleText(document.body)` 단언이 뒤틀린다. 그래서 성공은 토스트가 아니라 배지 변화로 본다.
   */
  it("담당자 역할이 없어도 내가 소유한 DRAFT 는 [해제] 가 켜지고 실제로 해제된다", async () => {
    let unlocked = false;
    nextView = () => viewResult({
      me: "admin",
      steward: false,
      flags: { ...viewResult().flags, editable: false },
      versions: [{ ...viewResult().versions[0], ver: "2.000", verLabel: "v2.000",
        ownerId: unlocked ? null : "admin", rowVersion: unlocked ? 8 : 7 }],
    });
    // unlock 응답만 '해제된 뒤' 모습으로 돌려준다 — 나머지 호출은 기본 목이 받는다.
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (/\/oasis\/codeEdit\/unlock/.test(String(input))) unlocked = true;
      return baseFetch(input, init);
    }) as typeof fetch;

    await render({ snapshot: { maruCodeId: "PROC_CD" } });

    // 소유자가 나면 배지는 '편집 중(나)' — 남의 소유자가 아니라 잠김이 아니다.
    expect(visibleText(byTestId("version-list")!)).toContain("편집 중(나)");

    await click(versionRow("2.000")?.querySelector(".ag-cell"));
    expect((byTestId("ver-unlock") as HTMLButtonElement).disabled, "역할이 없어도 소유자는 해제할 수 있어야 한다").toBe(false);
    // 담당자 전용 액션은 그대로 꺼져 있다.
    expect((byTestId("ver-delete") as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId("ver-confirm-move") as HTMLButtonElement).disabled).toBe(true);

    await click(byTestId("ver-unlock"));
    expect(actions("unlock")[0].params).toEqual({ maruCodeId: "PROC_CD", ver: "2.000", rowVersion: 7 });
    // 해제 응답(소유자 없음)이 반영돼 배지가 '선점 가능' 으로 바뀐다.
    expect(visibleText(byTestId("version-list")!)).toContain("선점 가능");
    // 선점(lock)은 ADR-0002 D3 "빈 DRAFT 는 담당자 역할 보유자가 선점한다" 라 그대로 담당자 전용이다.
    expect((byTestId("ver-lock") as HTMLButtonElement).disabled, "선점은 여전히 담당자 전용").toBe(true);
  });
});
