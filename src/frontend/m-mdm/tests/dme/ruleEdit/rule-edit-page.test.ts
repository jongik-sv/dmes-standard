/** @vitest-environment happy-dom */

// TSK-08-02 design §3.2 — 룰 화면 골격 렌더 테스트(카드 ①②⑧). 소유자·비소유자·외부 원천에 따른 편집 켜기(I7)와
// handoff 대상 열기(I28), 버전 조작 요청 본문. 그리드 셀은 ag-grid 렌더 의존이라 여기서 보지 않는다(카드 ③ 테스트가 본다).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { takeMdmPageParams } from "@/shell";

import RuleEditPage from "../../../pages/dme/ruleEdit/page";
import { RULE_EDIT_TARGET_EVENT, RULE_EDIT_TARGET_KEY } from "../../../src/dme/rule-handoff";
import type { RuleEditView } from "../../../pages/dme/ruleEdit/types";
import {
  RBAC_STORE_KEY,
  findButton,
  flush,
  installDomStorage,
  jsonResponse,
  typeInto,
  visibleText,
} from "../helpers/render";
import { draftView, releasedView } from "./fixtures";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];
let view: RuleEditView = draftView("e2e_mdm_steward");
let actionResponses: Record<string, unknown> = {};
const ALL_RBAC = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
let rbacRows: Array<Record<string, string>> = ALL_RBAC;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleEditPage)));
  });
  await flush();
}

function byTestId<T extends Element>(id: string): T | null {
  return container.querySelector(`[data-testid="${id}"]`) as T | null;
}

function params(action: string): Record<string, unknown> | undefined {
  return requests.filter((r) => r.action === action).at(-1)?.body.params as Record<string, unknown> | undefined;
}

async function openByHandoff(ruleId = "QLTY_GRD_JDG") {
  window.sessionStorage.setItem(RULE_EDIT_TARGET_KEY, JSON.stringify({ ruleId, at: Date.now() }));
  await render();
}

describe("RuleEditPage", () => {
  beforeEach(() => {
    installDomStorage();
    window.sessionStorage.clear();
    requests = [];
    view = draftView("e2e_mdm_steward");
    actionResponses = {};
    rbacRows = ALL_RBAC;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleEdit\/(\w+)/);
      if (m) {
        requests.push({ action: m[1], body });
        if (m[1] === "view") return jsonResponse({ meta: { success: true }, data: { result: view } });
        if (m[1] === "search") {
          return jsonResponse({
            meta: { success: true },
            data: { result: { list: [{ maruRuleId: "QLTY_GRD_JDG", maruRuleName: "품질 등급 판정", ruleKind: "DECISION", status: "INUSE", sourceKind: "MDM" }] } },
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

  it("룰을 고르기 전에는 룰 고르기 칸과 빈 상태만 보인다", async () => {
    await render();
    expect(byTestId("rule-pick-keyword")).not.toBeNull();
    expect(visibleText(container)).toContain("룰을 고르세요");
    expect(requests.filter((r) => r.action === "view")).toHaveLength(0);
  });

  it("룰 고르기로 찾고 고르면 그 룰을 연다", async () => {
    view = releasedView();
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-pick-keyword")!, "QLTY");
    await act(async () => {
      findButton(container, "찾기").click();
    });
    await flush();
    expect(params("search")).toEqual({ keyword: "QLTY" });
    await act(async () => {
      byTestId<HTMLButtonElement>("rule-pick-QLTY_GRD_JDG")!.click();
    });
    await flush();
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect(visibleText(container)).toContain("품질 등급 판정");
  });

  it("handoff 대상이 있으면 그 룰을 열고 대상을 지운다(I28)", async () => {
    window.sessionStorage.setItem(RULE_EDIT_TARGET_KEY, JSON.stringify({ ruleId: "QLTY_GRD_JDG", ver: 1, at: Date.now() }));
    await render();
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 1 });
    expect(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY)).toBeNull();
  });

  it("이미 열린 화면은 대상 이벤트를 받으면 그 룰로 바꾼다", async () => {
    await render();
    const detail = { ruleId: "E2E_LOCK_JDG", at: Date.now() };
    await act(async () => {
      // openRuleEdit 과 같은 순서 — 저장소에 쓰고 이벤트를 보낸다. 열린 화면이 읽었으면 지워야 다음 새 탭이 다시 열지 않는다.
      window.sessionStorage.setItem(RULE_EDIT_TARGET_KEY, JSON.stringify(detail));
      window.dispatchEvent(new CustomEvent(RULE_EDIT_TARGET_EVENT, { detail }));
    });
    await flush();
    expect(params("view")).toEqual({ maruRuleId: "E2E_LOCK_JDG" });
    expect(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY)).toBeNull();
  });

  it("소유자면 편집 중(나) 배지와 헤더 저장·삭제·해제·넘기기가 켜진다", async () => {
    await openByHandoff();
    expect(visibleText(container)).toContain("편집 중(나)");
    expect(findButton(container, "헤더 저장").disabled).toBe(false);
    expect(findButton(container, "삭제").disabled).toBe(false);
    expect(findButton(container, "해제").disabled).toBe(false);
    expect(findButton(container, "넘기기").disabled).toBe(false);
    expect(byTestId<HTMLInputElement>("rule-header-name")!.disabled).toBe(false);
  });

  it("소유자가 아니면 잠김 배지이고 헤더·버전 조작이 모두 꺼지며 선점 버튼이 없다(I7)", async () => {
    view = draftView("e2e_mdm_steward2");
    await openByHandoff();
    expect(visibleText(container)).toContain("잠김 · e2e_mdm_steward2 편집 중");
    expect(findButton(container, "헤더 저장").disabled).toBe(true);
    expect(findButton(container, "삭제").disabled).toBe(true);
    expect(findButton(container, "해제").disabled).toBe(true);
    expect(findButton(container, "넘기기").disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("rule-header-name")!.disabled).toBe(true);
    expect(() => findButton(container, "선점")).toThrow();
  });

  it("쓰기 권한(RBAC)이 없으면 소유자라도 카드 버튼을 숨기지 않고 끈다(§6.7.0)", async () => {
    rbacRows = [
      { objId: "ruleEdit", action: "search", endpoint: "", httpMethod: "POST" },
      { objId: "ruleEdit", action: "view", endpoint: "", httpMethod: "POST" },
    ];
    await openByHandoff();
    await flush();
    expect(visibleText(container)).toContain("편집 중(나)");
    for (const label of ["헤더 저장", "삭제", "해제", "넘기기"]) {
      expect(findButton(container, label).disabled, label).toBe(true);
    }
  });

  it("소유자가 없는 DRAFT 면 선점 버튼이 보이고 lock 을 보낸 뒤 다시 불러온다", async () => {
    view = draftView(null);
    await openByHandoff();
    await act(async () => {
      findButton(container, "선점").click();
    });
    await flush();
    expect(params("lock")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3 });
    expect(requests.filter((r) => r.action === "view").length).toBeGreaterThanOrEqual(2);
  });

  it("외부 원천 룰은 조회 전용 배지를 보이고 편집을 끈다", async () => {
    view = releasedView("e2e_mdm_steward", {
      headerEditable: false,
      rule: { ...releasedView().rule, sourceKind: "EXTERNAL", sourceSystem: "MES" },
    });
    await openByHandoff();
    expect(visibleText(container)).toContain("조회 전용");
    expect(visibleText(container)).toContain("EXTERNAL · MES");
    expect(findButton(container, "헤더 저장").disabled).toBe(true);
    expect(findButton(container, "새 버전").disabled).toBe(true);
  });

  it("미적용 버전이 있으면 새 버전을 끄고 안내를 보인다(수용 5)", async () => {
    await openByHandoff();
    expect(findButton(container, "새 버전").disabled).toBe(true);
    expect(visibleText(container)).toContain("미적용 버전");
  });

  it("미적용 버전이 없으면 새 버전(copy)을 보내고 새 버전으로 다시 불러온다", async () => {
    view = releasedView();
    actionResponses.copy = { meta: { success: true }, data: { result: { maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 0 } } };
    await openByHandoff();
    await act(async () => {
      findButton(container, "새 버전").click();
    });
    await flush();
    expect(params("copy")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2 });
  });

  it("확정 이동은 확정 화면이 없어 비활성이다", async () => {
    await openByHandoff();
    expect(findButton(container, "확정 이동").disabled).toBe(true);
  });

  // TSK-08-05 §3.3 RE1·RE2 (I40) — confirmScreenReady 가 켜지면 MDM 원천 DRAFT 에서 확정 화면으로 넘긴다.
  it("RE1 확정 화면이 준비됐고 선택 버전이 MDM 원천 DRAFT 면 확정 이동이 활성이고, 누르면 ruleConfirm 탭을 룰·버전과 함께 연다", async () => {
    view = draftView("e2e_mdm_steward", "e2e_mdm_steward", { confirmScreenReady: true });
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await openByHandoff();
      const move = findButton(container, "확정 이동");
      expect(move.disabled).toBe(false);
      await act(async () => {
        move.click();
      });
      await flush();
      expect(opened).toEqual([{ pageId: "mdm:dme/ruleConfirm" }]);
      expect(takeMdmPageParams("dme/ruleConfirm")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: "2" });
      expect(requests.filter((r) => r.action === "confirm")).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
      takeMdmPageParams("dme/ruleConfirm");
    }
  });

  it("RE1 소유자가 아닌 DRAFT 도 확정 이동은 활성이다(소유자 판정은 확정 화면·서버가 한다)", async () => {
    view = draftView("someone_else", "e2e_mdm_steward", { confirmScreenReady: true });
    await openByHandoff();
    expect(findButton(container, "확정 이동").disabled).toBe(false);
  });

  it("RE2 확정 화면이 준비됐어도 선택 버전이 RELEASED 면 확정 이동이 비활성이다", async () => {
    view = releasedView("e2e_mdm_steward", { confirmScreenReady: true });
    await openByHandoff();
    expect(findButton(container, "확정 이동").disabled).toBe(true);
  });

  it("RE2 확정 화면이 준비됐어도 원천이 EXTERNAL 이면 확정 이동이 비활성이다", async () => {
    const base = draftView("e2e_mdm_steward", "e2e_mdm_steward", { confirmScreenReady: true });
    view = { ...base, rule: { ...base.rule, sourceKind: "EXTERNAL", sourceSystem: "L2" } };
    await openByHandoff();
    expect(findButton(container, "확정 이동").disabled).toBe(true);
  });

  it("헤더 저장은 part HEADER 로 룰명·설명·메모를 보낸다", async () => {
    await openByHandoff();
    await typeInto(byTestId<HTMLInputElement>("rule-header-name")!, "품질 등급 판정 E2E");
    await act(async () => {
      findButton(container, "헤더 저장").click();
    });
    await flush();
    expect(params("save")).toEqual({
      part: "HEADER",
      maruRuleId: "QLTY_GRD_JDG",
      maruRuleName: "품질 등급 판정 E2E",
      description: "설명",
      usageNote: "3CCL 출측 판정",
    });
  });

  it("DRAFT 삭제는 target VERSION 과 row_version 을 보내고 기본 버전으로 다시 불러온다", async () => {
    await openByHandoff();
    await act(async () => {
      findButton(container, "삭제").click();
    });
    await flush();
    expect(params("delete")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3, target: "VERSION" });
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
  });

  it("넘기기는 대상 사용자 ID 를 실어 보낸다", async () => {
    await openByHandoff();
    await typeInto(byTestId<HTMLInputElement>("rule-handover-target")!, "e2e_mdm_steward2");
    await act(async () => {
      findButton(container, "넘기기").click();
    });
    await flush();
    expect(params("handover")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3, newOwnerId: "e2e_mdm_steward2" });
  });

  it("폐기는 두 번 눌러야 target RULE 을 보낸다", async () => {
    view = releasedView();
    await openByHandoff();
    await act(async () => {
      findButton(container, "폐기").click();
    });
    expect(params("delete")).toBeUndefined();
    await act(async () => {
      findButton(container, "폐기 확인").click();
    });
    await flush();
    expect(params("delete")).toEqual({ maruRuleId: "QLTY_GRD_JDG", target: "RULE" });
  });

  it("서버가 거부하면 오류를 보이고, MDM001 이면 다시 불러오기 안내를 준다", async () => {
    actionResponses.unlock = { meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await openByHandoff();
    await act(async () => {
      findButton(container, "해제").click();
    });
    await flush();
    expect(visibleText(document.body)).toContain("다른 창에서 바뀌었습니다");
    expect(findButton(container, "다시 불러오기")).toBeTruthy();
  });

  it("버전 목록에서 다른 버전을 고르면 그 버전으로 다시 불러온다", async () => {
    await openByHandoff();
    await act(async () => {
      byTestId<HTMLButtonElement>("rule-ver-row-1")!.click();
    });
    await flush();
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG", ver: 1 });
  });

  it("활용처 카드는 담은 세트와 의존 룰을 보인다", async () => {
    await openByHandoff();
    const text = visibleText(container);
    expect(text).toContain("LS_E2E");
    expect(text).toContain("E2E 룰 세트");
    expect(text).toContain("BASE_SPD_LKP");
  });
});
