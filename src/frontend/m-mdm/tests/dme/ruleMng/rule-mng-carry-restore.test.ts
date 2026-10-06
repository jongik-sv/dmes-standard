/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 룰(selectedId)로 `choose` 를 한 번 불러 상세를 서버에서 다시 읽는다.
// 복원값은 shared 의 createCarryRegistry(restore) + CarryStateProvider 로 준다(분리 창 PortalPageWindow 와 같은 경로).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { CarryStateProvider, createCarryRegistry, type CarryRestore } from "@dk-oasis/shared/portal-shell";

import RuleMngPage from "../../../pages/dme/ruleMng/page";
import type { RuleMngView } from "../../../pages/dme/ruleMng/types";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];

const LIST = [
  { maruRuleId: "QLTY_GRD_JDG", maruRuleName: "품질 등급 판정", ruleKind: "DECISION", status: "INUSE", sourceKind: "MDM" },
  { maruRuleId: "COIL_WGT_CALC", maruRuleName: "코일 중량 산출", ruleKind: "DERIVE", status: "INUSE", sourceKind: "MDM" },
];

function detailOf(ruleId: string, name: string): RuleMngView {
  return {
    me: "e2e_mdm_steward",
    steward: true,
    header: {
      maruRuleId: ruleId,
      maruRuleName: name,
      ruleKind: "DECISION",
      status: "INUSE",
      sourceKind: "MDM",
      sourceSystem: null,
      description: "설명",
      usageNote: "",
      auditVer: 1,
    },
    versions: [
      { ver: "1.000", status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, baseVer: null, hitPolicy: "FIRST", rowVersion: 0 },
    ],
    flags: {
      headerEditable: true, canNewVersion: false, canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null,
      canDeprecate: false, unappliedCount: 0, currentVer: "1.000",
    },
  } as RuleMngView;
}

const DETAILS: Record<string, RuleMngView> = {
  QLTY_GRD_JDG: detailOf("QLTY_GRD_JDG", "품질 등급 판정"),
  COIL_WGT_CALC: detailOf("COIL_WGT_CALC", "코일 중량 산출"),
};

const LIGHT = {
  filters: { keyword: "", ruleKind: "", status: "" },
  applied: { keyword: "", ruleKind: "", status: "" },
  totalCount: 2,
  page: 0,
  selectedId: "COIL_WGT_CALC",
};

/** restore 가 null 이면 포털 탭(등록소는 있으나 복원값이 없다 — PortalShell 이 탭마다 두는 createCarryRegistry()). */
async function render(restore: CarryRestore | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const page = createElement(DmesUiProvider, null, createElement(RuleMngPage));
  const tree = createElement(CarryStateProvider, { registry: createCarryRegistry(restore) }, page);
  await act(async () => {
    root!.render(tree);
  });
  await flush();
  await flush();
}

function byTestId(id: string): Element | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function viewIds(): string[] {
  return requests
    .filter((r) => r.action === "view")
    .map((r) => String((r.body.params as Record<string, unknown>).maruRuleId));
}

function count(action: string): number {
  return requests.filter((r) => r.action === action).length;
}

beforeEach(() => {
  installDomStorage();
  requests = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const m = url.match(/\/oasis\/ruleMng\/(\w+)/);
    if (m) {
      requests.push({ action: m[1], body });
      if (m[1] === "view") {
        const ruleId = String((body.params as Record<string, unknown> | undefined)?.maruRuleId ?? "");
        return jsonResponse({ meta: { success: true }, data: { result: DETAILS[ruleId] } });
      }
      if (m[1] === "search") {
        return jsonResponse({ meta: { success: true }, data: { result: { list: LIST, totalCount: 2, page: 0, size: 20 } } });
      }
      return jsonResponse({ meta: { success: true }, data: { result: {} } });
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
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

describe("RuleMngPage 새 창 분리 복원 — 선택 룰", () => {
  it("행과 함께 복원되면 이어받은 선택 룰의 상세를 서버에서 한 번 읽고 목록은 다시 조회하지 않는다", async () => {
    await render({ light: LIGHT, bulky: { rows: LIST }, hadBulky: true });
    expect(count("search")).toBe(0);
    expect(viewIds()).toEqual(["COIL_WGT_CALC"]);
    expect(byTestId("rule-header-id")?.textContent).toBe("COIL_WGT_CALC");
    expect(byTestId("rule-detail-empty")).toBeNull();
  });

  it("행 없이 복원돼 재조회해도 첫 줄로 덮지 않고 이어받은 선택 룰이 남는다", async () => {
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect(count("search")).toBe(1);
    // 상세는 이어받은 룰 하나만 읽는다 — 재조회 결과의 첫 줄(QLTY_GRD_JDG)을 자동 선택하지 않는다.
    expect(viewIds()).toEqual(["COIL_WGT_CALC"]);
    expect(byTestId("rule-header-id")?.textContent).toBe("COIL_WGT_CALC");
  });

  it("선택 룰이 없이 복원되면 상세를 읽지 않는다", async () => {
    await render({ light: { ...LIGHT, selectedId: null }, bulky: { rows: LIST }, hadBulky: true });
    expect(viewIds()).toEqual([]);
    expect(byTestId("rule-detail-empty")?.textContent).toBe("룰을 고르세요.");
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 아무것도 읽지 않는다", async () => {
    await render(null);
    expect(requests).toEqual([]);
    expect(byTestId("rule-detail-empty")?.textContent).toBe("룰을 고르세요.");
  });
});
