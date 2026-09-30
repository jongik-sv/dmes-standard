/** @vitest-environment happy-dom */

// TSK-08-02 design §3.2 — 룰 내용 편집 화면 골격 렌더 테스트. 소유자·비소유자·외부 원천에 따른 편집 켜기(I7)와
// handoff 대상 열기(I28). 그리드 셀은 ag-grid 렌더 의존이라 여기서 보지 않는다(카드 ③ 테스트가 본다).
//
// D-105 — ① 헤더·② 버전 카드는 `ruleMng` 화면으로 옮겨 갔다. 여기 남는 시험은 룰 고르기·handoff 수신, 편집 켜기/끄기,
// 버전 목록에서 다른 버전 고르기, 활용처 카드다. 헤더 저장·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소·적중 정책
// 저장은 tests/dme/ruleMng/rule-mng-page.test.ts 가 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { HANDOVER_AVAILABLE, HANDOVER_PENDING_TEXT, takeMdmPageParams } from "@/shell";

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
import { cancelConfirmableView, draftView, releasedView } from "./fixtures";

const HANDOVER_LABEL = "넘기기(준비 중)";

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

  it("룰 고르기 목록은 칸 아래 드롭다운으로 뜨고 Esc 로 닫으며, Enter 로 고른 줄을 연다", async () => {
    view = releasedView();
    await render();
    const input = byTestId<HTMLInputElement>("rule-pick-keyword")!;
    const key = async (k: string) => {
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      });
      await flush();
    };
    await typeInto(input, "QLTY");
    await key("Enter");
    expect(byTestId("rule-pick-list")?.getAttribute("role")).toBe("listbox");
    expect(byTestId("rule-pick-QLTY_GRD_JDG")?.textContent).toContain("사용 중");
    await key("Escape");
    expect(byTestId("rule-pick-list")).toBeNull();
    expect(requests.filter((r) => r.action === "view")).toHaveLength(0);
    await key("Enter");
    await key("Enter");
    expect(params("view")).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect(byTestId("rule-pick-list")).toBeNull();
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









  // TSK-08-05 §3.3 RE1·RE2 (I40) — confirmScreenReady 가 켜지면 MDM 원천 DRAFT 에서 확정 화면으로 넘긴다.






  // D2(2026-09-28): 넘겨받는 사람의 담당자 여부를 확인할 수단이 없어 서버가 늘 MDM005 로 거부한다. 켜 둔 버튼이 늘
  // 실패하지 않도록 조회 수단이 생길 때까지 끈다(HANDOVER_AVAILABLE). 서버 넘기기 로직은 백엔드 테스트가 가짜 디렉터리로 본다.


  // ── 확정 취소(ADR-0002 D8, TSK-02-01 D4-1) ──





  // D-105 — ② 버전 카드(표)를 뺀 뒤 버전 고르는 곳은 상단 [버전] Select 다. 표에서 고르는 것은 헤더·버전 화면 몫이다.
  it("상단 버전 고르기로 다른 버전을 열면 그 버전으로 다시 불러온다", async () => {
    await openByHandoff();
    const sel = byTestId<HTMLSelectElement>("rule-ver-select")!;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["2 (DRAFT)", "1 (RELEASED)"]);
    await act(async () => {
      sel.value = "1";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
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
