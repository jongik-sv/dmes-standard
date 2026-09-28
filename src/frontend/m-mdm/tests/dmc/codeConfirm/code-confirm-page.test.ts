/** @vitest-environment happy-dom */

// TSK-06-05 design.md §3.3 — codeConfirm 렌더: handoff 진입(P1), 검사 표와 확정 버튼(P2·P5·P7), 경고 확인 대화상자(P3),
// 서버 futureApplyFrom 기준 미래 경고(P4), 서버 거부 message(P6). 서버는 globalThis.fetch mock 이다(§6.5 모양).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import { pickDateTime } from "../../helpers/datetime-picker";
import CodeConfirmPage from "../../../pages/dmc/codeConfirm/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const CHECK_NOS = ["1", "2", "2-1", "2-2", "3", "4", "5", "6", "7", "8"];

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];

type Row = { no: string; item: string; severity: string; status: string; issues: unknown[] };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

function viewResult(overrides: Record<string, unknown> = {}, version: Record<string, unknown> = {}) {
  return {
    header: { maruCodeId: "PROC_CD", maruCodeName: "공정 코드", status: "INUSE", sourceKind: "MDM" },
    version: {
      ver: "2.000", verLabel: "v2.000", verKind: "MAJOR", status: "DRAFT", ownerId: "tester", rowVersion: 3,
      applyFrom: null, applyTo: null, requestedBy: null, releasedAt: null, restoredFrom: null, ...version,
    },
    previous: { ver: "1.010", verLabel: "v1.010", applyFrom: "2024-01-01 00:00:00" },
    firstVersion: false,
    diff: [
      { table: "ITEM", key: "ITEM:82", kind: "REMOVED", oldValues: { NAME: "82" }, newValues: null },
      { table: "ITEM", key: "ITEM:83", kind: "CHANGED", oldValues: { NAME: "3CGl" }, newValues: { NAME: "3CGL" } },
    ],
    categoryChanges: [
      { cateId: "COATING", cateName: "코팅", kind: "CHANGED", beforeCount: 2, afterCount: 0, addedCodes: [],
        removedCodes: ["82", "83"], reduced: true },
    ],
    unchangedCategories: ["냉연"],
    serverNow: "2026-09-03 00:00:00",
    ...overrides,
  };
}

function checkRows(patch: Record<string, Partial<Row>> = {}): Row[] {
  return CHECK_NOS.map((no) => ({
    no, item: `ITEM_${no}`, severity: no.startsWith("2-") ? "WARNING" : "REJECT",
    status: no === "5" ? "DEFERRED" : "PASSED", issues: [], ...patch[no],
  }));
}

function validateResult(rows: Row[], extra: Record<string, unknown> = {}) {
  return {
    rows,
    rejectedCount: rows.filter((r) => r.status === "REJECTED").length,
    warnedCount: rows.filter((r) => r.status === "WARNED").length,
    applyFrom: "2026-10-01 00:00:00",
    futureApplyFrom: true,
    serverNow: "2026-09-03 00:00:00",
    ...extra,
  };
}

const WARNED_2_2: Partial<Row> = {
  status: "WARNED",
  issues: [{ code: "CATEGORY_EMPTY", message: "해당 코드가 0건입니다", field: null, itemKey: "CATE:COATING" }],
};
const REJECTED_4: Partial<Row> = {
  status: "REJECTED",
  issues: [{ code: "HAS_CHANGES", message: "직전 RELEASED 대비 바뀐 행이 없습니다", field: null, itemKey: null }],
};

let nextView: () => unknown;
let nextValidate: () => unknown;
let confirmResponse: unknown;
let rbacRows: { objId: string; action: string; endpoint: string; httpMethod: string }[];

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
    root!.render(createElement(DmesUiProvider, null,
      createElement(CodeConfirmPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })));
  });
  await flush();
  await flush();
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

const actions = (name: string) => calls.filter((c) => c.action === name);
const confirmButton = () => byTestId("cf-confirm") as HTMLButtonElement;

/** 희망 적용 시작 일시를 넣는다 — 달력 + 24시간제 시·분·초 칸(`datetime-local` 이 아니다). */
async function pickApplyFrom(value: string) {
  await pickDateTime(() => byTestId("cf-apply-from") as HTMLElement, value);
}

/** 핸드오프로 PROC_CD 2.000 을 열고 apply_from 을 넣어 검사까지 한다. */
async function openAndValidate(applyFrom = "2026-10-01 00:00:00") {
  openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
  await render();
  await pickApplyFrom(applyFrom);
  await click(byTestId("cf-validate"));
}

describe("CodeConfirmPage", () => {
  beforeEach(() => {
    calls.length = 0;
    nextView = () => viewResult();
    nextValidate = () => validateResult(checkRows());
    confirmResponse = ok({ ...viewResult({}, { status: "RELEASED", applyFrom: "2026-10-01 00:00:00" }),
      confirmed: { ver: "2.000", rowVersion: 4 }, closedPreviousVer: "1.010", warnings: [] });
    rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/codeConfirm\/(\w+)/);
      if (m) {
        calls.push({ action: m[1], params: body.params ?? {} });
        if (m[1] === "search") {
          return jsonResponse(ok({ rows: [{ maruCodeId: "PROC_CD", maruCodeName: "공정 코드", ver: "2.000",
            verLabel: "v2.000", verKind: "MAJOR", ownerId: "tester", codeStatus: "INUSE" }] }));
        }
        if (m[1] === "view") return jsonResponse(ok(nextView()));
        if (m[1] === "validate") return jsonResponse(ok(nextValidate()));
        if (m[1] === "confirm") return jsonResponse(confirmResponse);
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeConfirm");
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

  it("확정 대기 목록을 서버에서 받아 행으로 보이고, 행을 누르면 그 코드·버전으로 view 를 부른다", async () => {
    await render();
    expect(actions("search")).toHaveLength(1);
    expect(actions("view")).toHaveLength(0);
    await click(byTestId("cf-row-PROC_CD-2.000"));
    expect(actions("view").map((c) => c.params)).toEqual([{ maruCodeId: "PROC_CD", ver: "2.000" }]);
  });

  it("목록이 비면 빈 상태 문구를 보인다", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/codeConfirm/search")) {
        calls.push({ action: "search", params: JSON.parse(String(init?.body)).params });
        return jsonResponse(ok({ rows: [] }));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
    }) as typeof fetch;
    await render();
    await typeInto("cf-keyword", "NO_SUCH");
    await click(byTestId("cf-search"));
    expect(actions("search").at(-1)?.params).toEqual({ keyword: "NO_SUCH" });
    expect(byTestId("cf-list-empty")?.textContent).toContain("확정할 DRAFT 가 없습니다");
  });

  it("P1 핸드오프 {maruCodeId, ver} 로 열면 그 값(문자열 ver)으로 view 를 부르고 snapshot 에 남긴다", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render({ snapshot: { maruCodeId: "OTHER", ver: "9.000" }, onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(actions("view").map((c) => c.params)).toEqual([{ maruCodeId: "PROC_CD", ver: "2.000" }]);
    expect(snapshots).toContainEqual({ maruCodeId: "PROC_CD", ver: "2.000" });
    const form = byTestId("cf-form")!;
    expect(visibleText(form)).toContain("PROC_CD");
    expect(visibleText(form)).toContain("v2.000");
    expect(visibleText(form)).toContain("v1.010 · 2024-01-01 00:00:00");
  });

  it("P1 ver 없이 넘겨받으면 ver 파라미터를 보내지 않는다(null 은 빼고 보낸다)", async () => {
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD" });
    await render();
    const params = actions("view")[0].params;
    expect(params).toEqual({ maruCodeId: "PROC_CD" });
    expect("ver" in params).toBe(false);
  });

  it("핸드오프가 없으면 snapshot 의 코드·버전을 불러온다", async () => {
    await render({ snapshot: { maruCodeId: "PROC_CD", ver: "2.000" } });
    expect(actions("view").map((c) => c.params)).toEqual([{ maruCodeId: "PROC_CD", ver: "2.000" }]);
  });

  it("diff 표와 바뀐 카테고리 요약(줄어듦 강조)을 보인다", async () => {
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    const diff = visibleText(byTestId("cf-diff")!);
    expect(diff).toContain("ITEM:82");
    expect(diff).toContain("삭제");
    expect(diff).toContain("3CGL");
    const summary = byTestId("cf-cate-summary")!;
    expect(visibleText(summary)).toContain("코팅");
    expect(visibleText(summary)).toContain("2건");
    expect(visibleText(summary)).toContain("0건");
    expect(visibleText(summary)).toContain("냉연");
    expect(byTestId("cf-cate-COATING")?.getAttribute("data-reduced")).toBe("true");
  });

  it("diff 가 비면 빈 상태 문구를 보인다", async () => {
    nextView = () => viewResult({ diff: [], categoryChanges: [], unchangedCategories: [] });
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    expect(byTestId("cf-diff-empty")?.textContent).toContain("변경된 행이 없습니다");
  });

  it("최초 버전이면 직전 RELEASED 자리에 면제 안내를 보인다", async () => {
    nextView = () => viewResult({ previous: null, firstVersion: true });
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    expect(visibleText(byTestId("cf-form")!)).toContain("최초 버전 — 적용 순서 검사를 하지 않습니다");
  });

  it("P2 검사 결과 10행을 표로 그리고, 거부가 없으면 확정 버튼이 활성이다(apply_from 은 초 단위 문자열)", async () => {
    await openAndValidate();
    expect(actions("validate").map((c) => c.params)).toEqual([
      { maruCodeId: "PROC_CD", ver: "2.000", applyFrom: "2026-10-01 00:00:00" },
    ]);
    for (const no of CHECK_NOS) expect(byTestId(`cf-check-${no}`), no).toBeTruthy();
    expect(byTestId("cf-check-status-1")?.textContent).toBe("통과");
    expect(byTestId("cf-check-status-5")?.textContent).toBe("보류");
    expect(confirmButton().disabled).toBe(false);
  });

  it("P2 REJECTED 가 하나라도 있으면 확정 버튼이 비활성이고 거부 행을 강조한다", async () => {
    nextValidate = () => validateResult(checkRows({ "4": REJECTED_4 }));
    await openAndValidate();
    expect(byTestId("cf-check-status-4")?.textContent).toBe("거부");
    expect(byTestId("cf-check-4")?.getAttribute("data-rejected")).toBe("true");
    expect(visibleText(byTestId("cf-check-4")!)).toContain("직전 RELEASED 대비 바뀐 행이 없습니다");
    expect(confirmButton().disabled).toBe(true);
  });

  it("검사 전에는 확정 버튼이 비활성이다", async () => {
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    expect(confirmButton().disabled).toBe(true);
  });

  it("DRAFT 소유자가 아니면 거부가 없어도 확정 버튼이 비활성이다", async () => {
    nextView = () => viewResult({}, { ownerId: "other" });
    await openAndValidate();
    expect(confirmButton().disabled).toBe(true);
  });

  it("P3 경고가 있으면 체크 전에는 확인이 비활성이고, 체크하고 누르면 warningsAcknowledged=true 로 확정한다", async () => {
    nextValidate = () => validateResult(checkRows({ "2-2": WARNED_2_2 }));
    await openAndValidate();
    expect(confirmButton().disabled).toBe(false);
    await click(confirmButton());
    expect(visibleText(document.body)).toContain("해당 코드가 0건입니다");
    const okButton = () => byTestId("cf-modal-ok") as HTMLButtonElement;
    expect(okButton().disabled).toBe(true);
    await click(okButton());
    expect(actions("confirm")).toHaveLength(0);

    await click(byTestId("cf-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(false);
    await click(okButton());
    expect(actions("confirm").map((c) => c.params)).toEqual([{
      maruCodeId: "PROC_CD", ver: "2.000", rowVersion: 3, applyFrom: "2026-10-01 00:00:00", warningsAcknowledged: true,
    }]);
  });

  it("P3 경고가 없으면 체크 없이 warningsAcknowledged=false 로 확정하고, 성공하면 view·search 를 다시 부른다", async () => {
    await openAndValidate();
    await click(confirmButton());
    expect(byTestId("cf-ack")).toBeNull();
    await click(byTestId("cf-modal-ok"));
    expect(actions("confirm").map((c) => c.params)).toEqual([{
      maruCodeId: "PROC_CD", ver: "2.000", rowVersion: 3, applyFrom: "2026-10-01 00:00:00", warningsAcknowledged: false,
    }]);
    await flush();
    expect(visibleText(document.body)).toContain("확정했습니다");
    expect(actions("view").length).toBeGreaterThanOrEqual(2);
    expect(actions("search").length).toBeGreaterThanOrEqual(2);
  });

  it("P4 서버가 futureApplyFrom=true 를 주면 과거 일시라도 미래 적용 경고를 보인다", async () => {
    nextValidate = () => validateResult(checkRows(), { applyFrom: "2026-01-01 00:00:00", futureApplyFrom: true });
    await openAndValidate("2026-01-01 00:00:00");
    await click(confirmButton());
    const warning = byTestId("cf-future-warning")?.textContent ?? "";
    expect(warning).toContain("적용 시작 일시가 미래입니다");
    // D8 — 철회 불가 안내가 아니라 확정 취소 안내가 된다.
    expect(warning).toContain("확정 취소로 작성 중인 상태로 되돌릴 수 있습니다");
    expect(warning).not.toContain("철회 없음");
  });

  it("P4 서버가 futureApplyFrom=false 를 주면 먼 미래 일시라도 미래 경고를 보이지 않는다", async () => {
    nextValidate = () => validateResult(checkRows(), { applyFrom: "2075-01-01 00:00:00", futureApplyFrom: false });
    await openAndValidate("2075-01-01 00:00:00");
    await click(confirmButton());
    expect(byTestId("cf-modal-ok")).toBeTruthy();
    expect(byTestId("cf-future-warning")).toBeNull();
    expect(visibleText(document.body)).not.toContain("적용 시작 일시가 미래입니다");
  });

  it("P5 confirm 권한이 없으면 거부가 없어도 확정 버튼이 비활성이다", async () => {
    rbacRows = ["search", "view", "validate"].map((action) => ({
      objId: "codeConfirm", action, endpoint: `/api/mdm/oasis/codeConfirm/${action}`, httpMethod: "POST",
    }));
    await openAndValidate();
    expect(actions("validate")).toHaveLength(1);
    expect(confirmButton().disabled).toBe(true);
  });

  it("P5 validate 권한도 없으면 검사 버튼이 비활성이다", async () => {
    rbacRows = ["search", "view"].map((action) => ({
      objId: "codeConfirm", action, endpoint: `/api/mdm/oasis/codeConfirm/${action}`, httpMethod: "POST",
    }));
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    expect((byTestId("cf-validate") as HTMLButtonElement).disabled).toBe(true);
    expect(confirmButton().disabled).toBe(true);
  });

  it("P6 서버가 meta.success=false 를 주면 그 message 를 오류 영역에 그대로 보인다", async () => {
    confirmResponse = { meta: { success: false, message: "DRAFT 상태에서만 할 수 있습니다" } };
    await openAndValidate();
    await click(confirmButton());
    await click(byTestId("cf-modal-ok"));
    expect(byTestId("cf-error")?.textContent).toContain("DRAFT 상태에서만 할 수 있습니다");
  });

  it("P7 검사 뒤 apply_from 을 바꾸면 확정 버튼이 다시 비활성이 된다", async () => {
    await openAndValidate();
    expect(confirmButton().disabled).toBe(false);
    await pickApplyFrom("2026-10-02 00:00:00");
    expect(confirmButton().disabled).toBe(true);
    await pickApplyFrom("2026-10-01 00:00:00");
    expect(confirmButton().disabled).toBe(false);
  });

  it("희망 적용 시작 일시는 24시간제·초까지 입력된다 — picker 값이 초를 보존해 검사·확정에 그대로 실린다", async () => {
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    // datetime-local 이 아니다 — 클릭해서 여는 picker 다.
    const trigger = byTestId("cf-apply-from") as HTMLElement;
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.textContent).toContain("YYYY-MM-DD HH:mm:ss");

    await pickApplyFrom("2026-10-01 21:45:37");
    // 트리거 표기가 24시간제(오후 표시 없음) + 초.
    expect(trigger.textContent).toBe("2026-10-01 21:45:37");
    await act(async () => {
      trigger.click();
    });
    await flush();
    const panel = document.body.querySelector("[data-dates-dropdown]")!;
    expect(panel.querySelectorAll('input[aria-label="시"], input[aria-label="분"], input[aria-label="초"]')).toHaveLength(3);
    // select 은 달력의 연·월 2개뿐 — 오전/오후 select 는 없다(24시간제).
    expect(panel.querySelectorAll("select")).toHaveLength(2);
    expect(panel.textContent).not.toMatch(/AM|PM/);
    await act(async () => {
      trigger.click();
    });
    await flush();

    await click(byTestId("cf-validate"));
    // 초까지 서버로 간다(I34).
    expect(actions("validate").map((c) => c.params)).toEqual([
      { maruCodeId: "PROC_CD", ver: "2.000", applyFrom: "2026-10-01 21:45:37" },
    ]);
    expect(confirmButton().disabled).toBe(false);
  });

  it("DRAFT 가 아닌 버전은 읽기 전용이고 확정 결과(적용 구간·확정자)를 보인다", async () => {
    nextView = () => viewResult({}, {
      status: "RELEASED", applyFrom: "2024-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", requestedBy: "kim",
      releasedAt: "2026-09-03 00:00:00",
    });
    openMdmPage("dmc/codeConfirm", { maruCodeId: "PROC_CD", ver: "2.000" });
    await render();
    expect(byTestId("cf-apply-from")).toBeNull();
    expect((byTestId("cf-validate") as HTMLButtonElement | null)?.disabled ?? true).toBe(true);
    const form = visibleText(byTestId("cf-form")!);
    expect(form).toContain("2024-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    expect(form).toContain("kim");
  });
});
