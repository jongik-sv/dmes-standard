/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 코드(selectedId)의 상세를 마운트 때 한 번 서버에서 다시 읽는다.
// 진입 코드를 정하는 handoff(openMdmPage)가 있으면 이어받은 선택보다 handoff 가 이긴다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { CarryStateProvider, createCarryRegistry, type CarryRestore } from "@dk-oasis/shared/portal-shell";
import { openMdmPage, takeMdmPageParams } from "@/shell";

import CodeMngPage from "../../../pages/dmc/codeMng/page";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
/** codeEdit view 로 나간 코드 ID 순서. */
let viewed: string[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

function viewResult(id: string) {
  return {
    header: {
      maruCodeId: id, maruCodeName: `${id} 이름`, description: null, lvlCnt: 0, sourceKind: "MDM",
      status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
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
  };
}

const ROW = {
  maruCodeId: "OLD_CD", maruCodeName: "이어받은 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
  currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1,
};
const LIGHT = { selectedId: "OLD_CD", selectedVer: null };

async function render(restore: CarryRestore | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const page = createElement(DmesUiProvider, null, createElement(CodeMngPage));
  await act(async () => {
    root!.render(createElement(CarryStateProvider, { registry: createCarryRegistry(restore) }, page));
  });
  await flush();
  await flush();
  await flush();
}

beforeEach(() => {
  installDomStorage();
  viewed = [];
  takeMdmPageParams("dmc/codeMng");
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/oasis/codeMng/search")) return jsonResponse(ok({ rows: [ROW], totalCount: 1 }));
    if (url.includes("/oasis/codeEdit/view")) {
      const id = String(body.params?.maruCodeId);
      viewed.push(id);
      return jsonResponse(ok(viewResult(id)));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
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
  takeMdmPageParams("dmc/codeMng");
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
});

describe("CodeMngPage 새 창 분리 복원 — 선택 코드", () => {
  it("복원되면 이어받은 선택 코드의 상세를 한 번 읽는다", async () => {
    await render({ light: LIGHT, bulky: { rows: [ROW] }, hadBulky: true });
    expect(viewed).toEqual(["OLD_CD"]);
  });

  it("handoff 가 있으면 이어받은 선택 대신 handoff 대상 코드를 연다", async () => {
    openMdmPage("dmc/codeMng", { maruCodeId: "NEW_CD" });
    await render({ light: LIGHT, bulky: { rows: [ROW] }, hadBulky: true });
    expect(viewed).toEqual(["NEW_CD"]);
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 상세를 읽지 않는다", async () => {
    await render(null);
    expect(viewed).toEqual([]);
  });
});
