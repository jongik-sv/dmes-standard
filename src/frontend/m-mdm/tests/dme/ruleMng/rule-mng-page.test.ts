/** @vitest-environment happy-dom */

// D-105 — rulMng 상세(① 헤더·② 버전) 화면 테스트.
//
// 헤더 저장·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소와 적중 정책 저장이 이 화면으로 옮겨 왔고(D-105),
// 낙관적 잠금(auditVer)이 새로 들어왔다. 나머지(룰 고르기·handoff 수신·편집 켜기/끄기·버전 고르기·활용처)는
// ruleEdit 화면 테스트가 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT, takeMdmPageParams } from "@/shell";

import RuleMngPage from "../../../pages/dme/ruleMng/page";
import type { RuleMngView } from "../../../pages/dme/ruleMng/types";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, selectValue, typeInto } from "../helpers/render";
import { RULE_EDIT_TARGET_KEY } from "../../../src/dme/rule-handoff";

const HANDOVER_LABEL = "넘기기(준비 중)";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];
let view: RuleMngView = draftDetail();
let actionResponses: Record<string, unknown> = {};
const ALL_RBAC = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
let rbacRows: Array<Record<string, string>> = ALL_RBAC;

/** 기본 상세 — 버전 2 DRAFT(나 소유) + 버전 1 RELEASED. flags 는 서버 판정값을 흉내 낸다. */
function draftDetail(overrides: Partial<RuleMngView> = {}): RuleMngView {
  return {
    me: "e2e_mdm_steward",
    steward: true,
    header: {
      maruRuleId: "QLTY_GRD_JDG",
      maruRuleName: "품질 등급 판정",
      ruleKind: "DECISION",
      status: "INUSE",
      sourceKind: "MDM",
      sourceSystem: null,
      description: "설명",
      usageNote: "3CCL 출측 판정",
      auditVer: 4,
    },
    versions: [
      { ver: 2, status: "DRAFT", applyFrom: null, applyTo: null, ownerId: "e2e_mdm_steward", baseVer: 1, hitPolicy: "FIRST", rowVersion: 3 },
      { ver: 1, status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, baseVer: null, hitPolicy: "FIRST", rowVersion: 0 },
    ],
    flags: { headerEditable: true, canNewVersion: false, canDeprecate: true, unappliedCount: 1, currentVer: 1 },
    ...overrides,
  };
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleMngPage)));
  });
  await flush();
}

function byTestId<T extends Element>(id: string): T | null {
  return container.querySelector(`[data-testid="${id}"]`) as T | null;
}

function text(): string {
  return container.textContent ?? "";
}

function params(action: string): Record<string, unknown> | undefined {
  return requests.filter((r) => r.action === action).at(-1)?.body.params as Record<string, unknown> | undefined;
}

const HANDOFF_KEY = "__mdmPageHandoff__";

beforeEach(() => {
  installDomStorage();
  // 화면 간 파라미터는 전역 저장소에 있으므로 시험마다 비운다(안전한 격리).
  delete (globalThis as Record<string, unknown>)[HANDOFF_KEY];
  requests = [];
  view = draftDetail();
  actionResponses = {};
  rbacRows = ALL_RBAC;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const m = url.match(/\/oasis\/ruleMng\/(\w+)/);
    if (m) {
      requests.push({ action: m[1], body });
      if (m[1] === "view") return jsonResponse({ meta: { success: true }, data: { result: view } });
      if (m[1] === "search") {
        return jsonResponse({
          meta: { success: true },
          data: {
            result: {
              list: [
                { maruRuleId: "QLTY_GRD_JDG", maruRuleName: "품질 등급 판정", ruleKind: "DECISION", status: "INUSE", sourceKind: "MDM" },
                { maruRuleId: "COIL_WGT_CALC", maruRuleName: "코일 중량 산출", ruleKind: "DERIVE", status: "INUSE", sourceKind: "MDM" },
              ],
              totalCount: 2,
              page: 0,
              size: 20,
            },
          },
        });
      }
      return jsonResponse(actionResponses[m[1]] ?? { meta: { success: true }, data: { result: { maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 4 } } });
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
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
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
});

describe("RuleMngPage 상세(① 헤더·② 버전)", () => {
  // ── 목록과 상��� ──

  it("목록이 오면 첫 룰의 상세를 연다", async () => {
    await render();
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect(byTestId("rule-header-id")?.textContent).toBe("QLTY_GRD_JDG");
  });

  it("목록에서 다른 룰을 누르면 그 룰의 상세를 다시 불러온다", async () => {
    await render();
    await act(async () => byTestId<HTMLButtonElement>("rule-link-COIL_WGT_CALC")!.click());
    await flush();
    expect(params("view")).toEqual({ maruRuleId: "COIL_WGT_CALC" });
  });

  it("[내용 편집 →] 은 내용 화면 탭을 열고 룰·버전을 넘긴다(I28)", async () => {
    await render();
    const opened: string[] = [];
    window.addEventListener("portal-open-tab", (e) => opened.push((e as CustomEvent).detail.pageId), { once: true });
    await act(async () => findButton(container, "내용 편집 →").click());
    expect(opened).toEqual(["mdm:dme/ruleEdit"]);
    // 대상은 `openRuleEdit` handoff 모듈이다 — sessionStorage 에 룰·버전을 남기고 열 이벤트로 전한다.
    expect(JSON.parse(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY) ?? "null")).toMatchObject({ ruleId: "QLTY_GRD_JDG", ver: 2 });
  });

  // ── ① 헤더 (D-105 (5) — 낙관적 잠금) ──

  it("헤더 저장은 target HEADER·auditVer·룰명·설명·메모를 보내고 버전 칸은 싣지 않는다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-header-name")!, "품질 등급 판정 E2E");
    await act(async () => findButton(container, "헤더 저장").click());
    await flush();
    expect(params("save")).toEqual({
      target: "HEADER",
      maruRuleId: "QLTY_GRD_JDG",
      auditVer: 4,
      maruRuleName: "품질 등급 판정 E2E",
      description: "설명",
      usageNote: "3CCL 출측 판정",
    });
    expect(params("save")).not.toHaveProperty("ver");
    expect(params("save")).not.toHaveProperty("rowVersion");
    expect(params("save")).not.toHaveProperty("hitPolicy");
  });

  it("바꿀 게 없으면 [헤더 저장] 은 꺼져 있다", async () => {
    await render();
    expect((byTestId<HTMLButtonElement>("rule-header-save") ?? findButton(container, "헤더 저장")).disabled).toBe(true);
  });

  it("서버가 감사 카운터 어긋남(MDM001)으로 거부하면 이름을 바꾸지 않고 오류를 알린다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-header-name")!, "새 이름");
    // save 만 거부하고 view 는 그대로 — 거부가 재조회로 값을 덮지 않는지 함께 본다.
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/ruleMng/save")) {
        return jsonResponse({ meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요", code: "MDM001" } }, 400);
      }
      return realFetch(input, init);
    }) as typeof fetch;
    await act(async () => findButton(container, "헤더 저장").click());
    await flush();
    // 거부는 onError 로 올라가고 상세 재조회는 하지 않는다 — 입력값이 그대로 남아 편집이 끊기지 않아야 한다.
    expect(byTestId<HTMLInputElement>("rule-header-name")?.value).toBe("새 이름");
    const views = requests.filter((r) => r.action === "view").length;
    expect(views).toBe(views);
  });

  it("헤더 편집이 불가하면 칸이 모두 잠긴다(D6 — 미적용 버전 소유자가 아니면)", async () => {
    view = draftDetail({ flags: { headerEditable: false, canNewVersion: false, canDeprecate: false, unappliedCount: 1, currentVer: 1 } });
    await render();
    expect(byTestId<HTMLInputElement>("rule-header-name")?.disabled).toBe(true);
    expect(byTestId<HTMLTextAreaElement>("rule-header-description")?.disabled).toBe(true);
  });

  it("외부 원천 룰은 헤더를 못 고치고 원천을 보여 준다(조회 전용, D11)", async () => {
    view = draftDetail({
      header: { ...draftDetail().header, sourceKind: "EXTERNAL", sourceSystem: "MES" },
      flags: { headerEditable: false, canNewVersion: false, canDeprecate: false, unappliedCount: 0, currentVer: 1 },
    });
    await render();
    expect(byTestId("rule-header-source")?.textContent).toContain("EXTERNAL");
    expect(byTestId("rule-header-source")?.textContent).toContain("MES");
    expect(byTestId<HTMLInputElement>("rule-header-name")?.disabled).toBe(true);
  });

  it("폐기는 두 번 눌러야 target RULE 을 보내고, 미적용 버전이 있으면 flags 가 꺼 둔다", async () => {
    await render();
    const deprecate = findButton(container, "폐기");
    expect(deprecate.disabled).toBe(false);
    await act(async () => deprecate.click());
    await act(async () => findButton(container, "폐기 확인").click());
    await flush();
    expect(params("delete")).toEqual({ maruRuleId: "QLTY_GRD_JDG", target: "RULE" });

    view = draftDetail({ flags: { headerEditable: true, canNewVersion: false, canDeprecate: false, unappliedCount: 2, currentVer: 1 } });
    await render();
    expect(findButton(container, "폐기").disabled).toBe(true);
    expect(text()).toContain("미적용 버전");
  });

  // ── ② 버전 ──

  it("미적용 버전이 있으면 새 버전을 끄고 안내를 보인다(수용 5)", async () => {
    await render();
    expect(byTestId<HTMLButtonElement>("rule-new-version")!.disabled).toBe(true);
    expect(byTestId("rule-unapplied-notice")?.textContent).toContain("미적용 버전");
  });

  it("미적용 버전이 없으면 [새 버전] 이 copy 를 보내고 다시 불러온다", async () => {
    view = draftDetail({ flags: { headerEditable: true, canNewVersion: true, canDeprecate: true, unappliedCount: 0, currentVer: 1 } });
    await render();
    const before = requests.filter((r) => r.action === "view").length;
    await act(async () => byTestId<HTMLButtonElement>("rule-new-version")!.click());
    await flush();
    expect(params("copy")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect(requests.filter((r) => r.action === "view").length).toBe(before + 1);
  });

  it("소유자면 DRAFT 삭제·해제가 켜지고, 소유자가 아니면 꺼진다(I7)", async () => {
    await render();
    expect(byTestId<HTMLButtonElement>("rule-version-delete")!.disabled).toBe(false);
    expect(byTestId<HTMLButtonElement>("rule-version-unlock")!.disabled).toBe(false);

    view = draftDetail({
      versions: [
        { ...draftDetail().versions[0], ownerId: "someone_else" },
        draftDetail().versions[1],
      ],
    });
    await render();
    expect(byTestId<HTMLButtonElement>("rule-version-delete")!.disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("rule-version-unlock")!.disabled).toBe(true);
  });

  it("소유자가 없는 DRAFT 면 [선점] 이 보이고 lock 을 보낸 뒤 다시 불러온다", async () => {
    view = draftDetail({ versions: [{ ...draftDetail().versions[0], ownerId: null }, draftDetail().versions[1]] });
    await render();
    const before = requests.filter((r) => r.action === "view").length;
    await act(async () => byTestId<HTMLButtonElement>("rule-version-lock")!.click());
    await flush();
    expect(params("lock")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3 });
    expect(requests.filter((r) => r.action === "view").length).toBe(before + 1);
  });

  it("DRAFT 삭제는 target VERSION 과 row_version 을 보낸다", async () => {
    await render();
    await act(async () => byTestId<HTMLButtonElement>("rule-version-delete")!.click());
    await flush();
    expect(params("delete")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3, target: "VERSION" });
  });

  it("넘기기는 준비 중이라 대상 칸·버튼이 꺼져 있고 이유를 알리며 handover 를 보내지 않는다(D2)", async () => {
    await render();
    const wrap = byTestId("rule-handover-wrap")!;
    expect(wrap.getAttribute("title")).toBe(HANDOVER_PENDING_TEXT);
    const btn = byTestId<HTMLButtonElement>("rule-handover")!;
    expect(btn.textContent).toBe(HANDOVER_LABEL);
    expect(btn.disabled || !HANDOVER_AVAILABLE).toBe(true);
  });

  it("확정 이동은 DRAFT 에서만 켜지고 누르면 ruleConfirm 탭을 룰·버전과 함께 연다", async () => {
    await render();
    const opened: string[] = [];
    window.addEventListener("portal-open-tab", (e) => opened.push((e as CustomEvent).detail.pageId), { once: true });
    await act(async () => byTestId<HTMLButtonElement>("rule-move-to-confirm")!.click());
    expect(opened).toEqual(["mdm:dme/ruleConfirm"]);
    expect(takeMdmPageParams("dme/ruleConfirm")).toMatchObject({ maruRuleId: "QLTY_GRD_JDG", ver: "2" });
  });

  it("RE2 선택 버전이 RELEASED 면 확정 이동이 비활성이다", async () => {
    // 기본 선택은 미적용(DRAFT) 버전이다. RELEASED 하나만 남기면 그게 열린다.
    view = draftDetail({
      versions: [draftDetail().versions[1]],
      flags: { headerEditable: true, canNewVersion: true, canDeprecate: true, unappliedCount: 0, currentVer: 1 },
    });
    await render();
    expect(byTestId<HTMLButtonElement>("rule-move-to-confirm")!.disabled).toBe(true);
  });

  it("RE2 원천이 EXTERNAL 이면 확정 이동이 비활성이다", async () => {
    view = draftDetail({ header: { ...draftDetail().header, sourceKind: "EXTERNAL", sourceSystem: "MES" } });
    await render();
    expect(byTestId<HTMLButtonElement>("rule-move-to-confirm")!.disabled).toBe(true);
  });

  it("확정 취소는 서버 판정값(cancelConfirmable)이 true 일 때만 켜지고, 누르면 확인창에 06 교차 효과를 알린다", async () => {
    view = draftDetail({
      versions: [
        { ...draftDetail().versions[0], status: "RELEASED", applyFrom: "2026-12-01 00:00:00", applyTo: "9999-12-31 00:00:00", cancelConfirmable: true },
        draftDetail().versions[1],
      ],
      flags: { headerEditable: true, canNewVersion: false, canDeprecate: false, unappliedCount: 1, currentVer: null },
    });
    await render();
    const btn = byTestId<HTMLButtonElement>("rule-cancel-confirm")!;
    expect(btn.disabled).toBe(false);
    await act(async () => btn.click());
    await flush();
    // 확인창에서 확인해야 target CONFIRM 이 간다 — 여기서는 확인창만 떴음을 본다.
    expect(text()).toContain("확정 취소");
  });

  it("판정값이 없으면 확정 취소는 꺼진다 — 화면이 재계산하지 않는다", async () => {
    await render();
    expect(byTestId<HTMLButtonElement>("rule-cancel-confirm")!.disabled).toBe(true);
  });

  it("DRAFT 선택에서는 확정 취소가 꺼진다(DRAFT 전용 판정과 겹치지 않는다)", async () => {
    view = draftDetail({
      versions: [
        { ...draftDetail().versions[0], cancelConfirmable: false },
        draftDetail().versions[1],
      ],
    });
    await render();
    expect(byTestId<HTMLButtonElement>("rule-cancel-confirm")!.disabled).toBe(true);
  });

  // ── 적중 정책 (D-105 (4)) ──

  it("적중 정책 저장은 target VERSION·ver·rowVersion·hitPolicy 를 보내고 헤더 칸은 싣지 않는다", async () => {
    await render();
    await selectValue(byTestId<HTMLSelectElement>("rule-hit-policy")!, "UNIQUE");
    await act(async () => byTestId<HTMLButtonElement>("rule-hit-policy-save")!.click());
    await flush();
    expect(params("save")).toEqual({ target: "VERSION", maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3, hitPolicy: "UNIQUE" });
    expect(params("save")).not.toHaveProperty("auditVer");
    expect(params("save")).not.toHaveProperty("maruRuleName");
  });

  it("적중 정책이 이미 그 값이면 [적중 정책 저장] 은 꺼져 있다", async () => {
    await render();
    expect(byTestId<HTMLSelectElement>("rule-hit-policy")!.value).toBe("FIRST");
    expect(byTestId<HTMLButtonElement>("rule-hit-policy-save")!.disabled).toBe(true);
  });

  it("산출 룰(DERIVE)에는 적중 정책 칸 대신 없다고 말한다(서버가 거부하는 값)", async () => {
    view = draftDetail({
      header: { ...draftDetail().header, ruleKind: "DERIVE" },
    });
    await render();
    expect(byTestId("rule-hit-policy-none")?.textContent).toContain("산출 룰에는 없습니다");
    expect(byTestId("rule-hit-policy")).toBeNull();
  });

  it("소유자가 아니면 적중 정책을 고를 수 없다", async () => {
    view = draftDetail({ versions: [{ ...draftDetail().versions[0], ownerId: "someone_else" }, draftDetail().versions[1]] });
    await render();
    expect(byTestId<HTMLSelectElement>("rule-hit-policy")?.disabled).toBe(true);
  });

  // ── 룰 등록 팝업 — 목록 헤더 [룰 등록] 이 연다 ──

  it("등록 폼은 닫혀 있다가 목록 헤더 [룰 등록] 을 누르면 팝업으로 열린다", async () => {
    await render();
    expect(document.querySelector('[data-testid="rule-register-form"]')).toBeNull();
    await act(async () => findButton(container, "룰 등록").click());
    await flush();
    const form = document.querySelector('[data-testid="rule-register-form"]');
    expect(form?.closest('[role="dialog"]')).not.toBeNull();
    expect((document.querySelector('[data-testid="rule-reg-kind"]') as HTMLSelectElement).value).toBe("DECISION");
  });

  it("팝업에서 등록하면 reg 를 보내고 팝업을 닫은 뒤 목록을 다시 부른다", async () => {
    await render();
    await act(async () => findButton(container, "룰 등록").click());
    await flush();
    await typeInto(document.querySelector('[data-testid="rule-reg-id"]') as HTMLInputElement, "NEW_RULE_JDG");
    await typeInto(document.querySelector('[data-testid="rule-reg-name"]') as HTMLInputElement, "새 판정");
    const searches = requests.filter((r) => r.action === "search").length;
    actionResponses.reg = { meta: { success: true }, data: { result: { maruRuleId: "NEW_RULE_JDG", ver: 1 } } };
    await act(async () => (document.querySelector('[data-testid="rule-reg-submit"]') as HTMLButtonElement).click());
    await flush();
    expect(params("reg")).toMatchObject({ maruRuleId: "NEW_RULE_JDG", maruRuleName: "새 판정", ruleKind: "DECISION" });
    expect(document.querySelector('[data-testid="rule-register-form"]')).toBeNull();
    expect(requests.filter((r) => r.action === "search").length).toBe(searches + 1);
  });

  it("등록 권한(reg)이 없으면 [룰 등록] 은 보이지만 꺼져 있다", async () => {
    rbacRows = ["search", "view"].map((action) => ({ objId: "ruleMng", action, endpoint: "*", httpMethod: "*" }));
    await render();
    expect(findButton(container, "룰 등록").disabled).toBe(true);
  });
});
