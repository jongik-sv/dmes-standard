/** @vitest-environment happy-dom */

// D-144 2단계 — ruleSetConfirm 렌더: handoff 진입, 세트 검사 표와 [확정] 활성, 확정 대화상자, 서버 거부 문구.
// 서버는 globalThis.fetch mock 이다(서비스 RuleSetConfirmService 와 같은 봉투). 준비 방식은 ruleConfirm 화면 시험과 같다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";

import RuleSetConfirmPage from "../../../pages/dme/ruleSetConfirm/page";
import { pickDateTime } from "../../helpers/datetime-picker";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";

const ITEMS = ["FLOW_STRUCTURE", "RULES_RELEASED", "ORDER", "TEST_CASES"] as const;

type Issue = { severity: string; code: string; message: string; field: string | null; itemKey: string | null };
type Item = { item: string; status: string; issues: Issue[] };

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

function viewResult(version: Record<string, unknown> = {}) {
  return {
    set: { setId: "S_C", setName: "확정 세트", status: "INUSE" },
    version: { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", ownerId: "tester", rowVersion: 4, baseVer: "1.000",
      applyFrom: null, applyTo: null, requestedBy: null, releasedAt: null, ruleIds: ["R_A"], ...version },
    previous: { ver: "1.000", verLabel: "v1.000", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00" },
    firstVersion: false,
    diff: [
      { key: "NODE:r1", kind: "CHANGED", oldValues: { kind: "RULE", ruleId: "R_OLD" }, newValues: { kind: "RULE", ruleId: "R_A" } },
      { key: "NODE:start", kind: "SAME", oldValues: { kind: "START" }, newValues: { kind: "START" } },
    ],
    diffCounts: { ADDED: 0, REMOVED: 0, CHANGED: 1, SAME: 1 },
    serverNow: "2026-06-15 09:00:00",
  };
}

function items(patch: Partial<Record<(typeof ITEMS)[number], Partial<Item>>> = {}): Item[] {
  return ITEMS.map((item) => ({ item, status: "PASSED", issues: [], ...patch[item] }));
}

function validateResult(its: Item[]) {
  return {
    items: its,
    applyFromCheck: { status: "PASSED", previousApplyFrom: "2026-01-01 00:00:00", message: null },
    caseSummary: { total: 0, withExpected: 0, passed: 0, failed: 0 },
    rejectedCount: its.filter((i) => i.status === "REJECTED").length,
    warnedCount: its.filter((i) => i.status === "WARNED").length,
    applyFrom: "2026-07-01 00:00:00",
    futureApplyFrom: false,
    serverNow: "2026-06-15 09:00:00",
  };
}

const NOT_RELEASED: Issue = {
  severity: "ERROR", code: "SET_RULE_NOT_RELEASED", message: "R_A 에 적용 시각 2026-07-01 00:00:00 의 RELEASED 버전이 없습니다",
  field: "RULES_RELEASED", itemKey: "RULE:R_A",
};

let nextValidate: () => unknown;
let nextView: () => unknown;
let confirmResponse: unknown;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null,
      createElement(RuleSetConfirmPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {} })));
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

const actions = (name: string) => calls.filter((c) => c.action === name);

async function openAndValidate(applyFrom = "2026-07-01 00:00:00") {
  openMdmPage("dme/ruleSetConfirm", { setId: "S_C", ver: "2.000" });
  await render();
  await pickDateTime(() => byTestId("rsc-apply-from") as HTMLElement, applyFrom);
  await click(byTestId("rsc-validate"));
}

describe("RuleSetConfirmPage", () => {
  beforeEach(() => {
    installDomStorage();
    calls.length = 0;
    nextValidate = () => validateResult(items());
    nextView = () => viewResult();
    confirmResponse = ok({ ...viewResult({ status: "RELEASED", applyFrom: "2026-07-01 00:00:00" }),
      confirmed: { ver: "2.000", rowVersion: 5 }, closedPreviousVer: "1.000", warnings: [] });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleSetConfirm\/(\w+)/);
      if (m) {
        calls.push({ action: m[1], params: body.params ?? {} });
        if (m[1] === "search") {
          return jsonResponse(ok({ rows: [{ setId: "S_C", setName: "확정 세트", ver: "2.000", verKind: "MAJOR", ownerId: "tester", setStatus: "INUSE" }] }));
        }
        if (m[1] === "view") return jsonResponse(ok(nextView()));
        if (m[1] === "validate") return jsonResponse(ok(nextValidate()));
        if (m[1] === "confirm") return jsonResponse(confirmResponse);
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    takeMdmPageParams("dme/ruleSetConfirm");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  // 메뉴 시드 이름(mcm DataInitializer "룰 세트 확정")과 화면 제목·breadcrumb 이 같아야 한다 — 다른 확정 화면(버전 확정·레이아웃 확정)처럼.
  it("0. 화면 제목·breadcrumb 은 메뉴 이름 「룰 세트 확정」 이다", async () => {
    await render();
    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toBe("마루 MDM > 업무기준 > 룰 세트 확정");
    expect(container.textContent).not.toContain("룰 세트 버전 확정");
  });

  it("1. handoff {setId, ver: \"2\"} 로 열면 ver 를 \"2.000\" 으로 맞춰 부르고 대상·직전 버전·diff 건수를 보인다", async () => {
    openMdmPage("dme/ruleSetConfirm", { setId: "S_C", ver: "2" });
    await render();
    expect(actions("view").map((c) => c.params)).toEqual([{ setId: "S_C", ver: "2.000" }]);
    expect(byTestId("rsc-target")?.textContent).toBe("S_C 버전 v2.000 · 확정 세트");
    expect(visibleText(byTestId("rsc-previous")!)).toContain("v1.000");
    expect(byTestId("rsc-diff-counts")?.textContent).toBe("추가 0 · 삭제 0 · 수정 1 · 같음 1");
  });

  it("1-1. 흐름이 손상돼 diffError 가 오면 diff 표 대신 그 문구를 보이고 검사는 그대로 부를 수 있다", async () => {
    nextView = () => ({ ...viewResult(), diff: [], diffCounts: { ADDED: 0, REMOVED: 0, CHANGED: 0, SAME: 0 },
      diffError: "저장된 룰 정의를 읽을 수 없습니다: 룰 세트 S_C 의 저장된 흐름을 읽을 수 없습니다" });
    openMdmPage("dme/ruleSetConfirm", { setId: "S_C", ver: "2.000" });
    await render();
    expect(byTestId("rsc-diff-error")?.textContent).toContain("저장된 흐름을 읽을 수 없습니다");
    expect(byTestId("rsc-diff")).toBeNull();
    expect(byTestId("rsc-target")?.textContent).toBe("S_C 버전 v2.000 · 확정 세트");
  });

  it("2. 검사 표는 세트 항목 제목을 보이고 REJECTED 가 있으면 [확정] 이 꺼진다", async () => {
    nextValidate = () => validateResult(items({ RULES_RELEASED: { status: "REJECTED", issues: [NOT_RELEASED] } }));
    await openAndValidate();
    expect(visibleText(byTestId("rsc-checks")!)).toContain("참조 룰 RELEASED");
    expect(visibleText(byTestId("rsc-checks")!)).toContain("흐름 구조");
    expect(byTestId("rsc-check-status-RULES_RELEASED")?.getAttribute("data-rejected")).toBe("true");
    expect((byTestId("rsc-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("3. 통과하면 [확정] → 대화상자 확인으로 confirm 을 보내고 닫은 직전 버전을 알린다", async () => {
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    await click(byTestId("rc-modal-ok"));
    expect(actions("confirm")[0].params).toEqual({
      setId: "S_C", ver: "2.000", rowVersion: 4, applyFrom: "2026-07-01 00:00:00", warningsAcknowledged: false,
    });
    expect(byTestId("rsc-closed-previous")?.textContent).toBe("직전 버전 v1.000 의 적용을 닫았습니다");
  });

  it("4. 서버 거부 문구는 오류 영역에 그대로 보인다", async () => {
    confirmResponse = { meta: { success: false, message: "확정 검사를 통과하지 못했습니다" } };
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    await click(byTestId("rc-modal-ok"));
    expect(byTestId("rsc-error")?.textContent).toContain("확정 검사를 통과하지 못했습니다");
  });

  it("5. 경고가 있으면 대화상자 경고 줄에 세트 쪽 항목 제목이 보인다", async () => {
    const warn: Issue = { severity: "WARNING", code: "W", message: "경고 한 건", field: "ORDER", itemKey: null };
    nextValidate = () => validateResult(items({ ORDER: { status: "WARNED", issues: [warn] } }));
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    expect(visibleText(byTestId("rc-modal-warnings")!)).toContain("순서·순환 · 경고 한 건");
  });

  it("6. 미래 적용 경고는 세트 문구이고 룰 전용 확정 취소 안내(D8-10)는 보이지 않는다", async () => {
    nextValidate = () => ({ ...validateResult(items()), futureApplyFrom: true });
    await openAndValidate();
    await click(byTestId("rsc-confirm"));
    expect(byTestId("rc-future-warning")?.textContent).toContain("이 세트의 새 버전");
    expect(document.body.textContent ?? "").not.toContain("이 룰을 멤버로 가진 룰 세트");
  });
});
