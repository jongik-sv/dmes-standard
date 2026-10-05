/** @vitest-environment happy-dom */
// D-144 3단계 — layoutConfirm: handoff 진입(minor 버전 문자열), 검사·동시 전환 강조, 헤더 영향도 표, 경고 확인 후 확정.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import LayoutConfirmPage from "../../../pages/dmb/layoutConfirm/page";
import { pickDateTime } from "../../helpers/datetime-picker";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse, visibleText } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let validateResponse: () => Response;
let confirmResponse: () => Response;
let viewBody: unknown;
const calls: { action: string; params: Record<string, unknown> }[] = [];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

const VIEW_HEADER = {
  layout: { LAYOUT_ID: 110, LAYOUT_KIND: "HEADER", LAYOUT_NAME: "L2 구간 헤더", STATUS: "INUSE" },
  version: { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 2, BASE_VER: "1.000" },
  previous: { VER: "1.000", APPLY_FROM: "2026-01-01 00:00:00", APPLY_TO: "9999-12-31 00:00:00" },
  firstVersion: false,
};

const VALIDATE_HEADER = {
  checks: [{ severity: "WARNING", code: "SIMULTANEOUS_SWITCH", message: "동시 전환 — 송신·수신 양쪽이 2026-07-01 00:00:00 에 맞춰 함께 전환해야 합니다", field: "SWITCH_MODE", itemKey: null }],
  applyFromCheck: { ok: true, message: null },
  change: { switchMode: "SIMULTANEOUS", kinds: ["TOTAL_LENGTH"], summary: "총 길이 30 → 33" },
  simultaneous: true, futureApplyFrom: true,
  impact: [{ LAYOUT_ID: 201, LAYOUT_NAME: "출측검사 실적 수신", SND_RCV: "L2 → MES", VER: "1.000", STATE: "CURRENT",
    EVALUATED_AT: "2026-07-01 00:00:00", TOTAL_LENGTH_BEFORE: 187, TOTAL_LENGTH_AFTER: 190, ISSUES: "" }],
  eais: ["GLUE"],
};

beforeEach(() => {
  installDomStorage();
  calls.length = 0;
  viewBody = VIEW_HEADER;
  validateResponse = () => jsonResponse(ok(VALIDATE_HEADER));
  confirmResponse = () => jsonResponse(ok({ layoutId: 110, ver: "1.001", rowVersion: 3, closedPreviousVer: "1.000", switchMode: "SIMULTANEOUS" }));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = url.match(/\/oasis\/layoutConfirm\/(\w+)/);
    if (m) {
      const action = m[1];
      const params = JSON.parse(String(init?.body)).params as Record<string, unknown>;
      calls.push({ action, params });
      if (action === "view") return jsonResponse(ok(viewBody));
      if (action === "validate") return validateResponse();
      if (action === "confirm") return confirmResponse();
      return jsonResponse(ok({ rows: [] }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  takeMdmPageParams("dmb/layoutConfirm");
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  globalThis.fetch = originalFetch;
});

async function mount(props: Record<string, unknown> = {}) {
  root = createRoot(container);
  await act(async () => root!.render(createElement(DmesUiProvider, null, createElement(LayoutConfirmPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props }))));
  await flush();
}

describe("layoutConfirm page", () => {
  it("handoff 로 열어도 onSnapshotChange 를 부르지 않고, snapshot 의 선택 값은 복원하지 않는다(R8)", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmb/layoutConfirm", { layoutId: "110", ver: "1.001" });
    await mount({ onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(snapshots).toHaveLength(0);
    await act(async () => root!.unmount());
    root = null;
    calls.length = 0;
    await mount({ snapshot: { layoutId: 110, ver: "1.001" } });
    expect(calls.filter((c) => c.action === "view")).toHaveLength(0);
  });

  it("handoff opens the minor version as a string and shows header impact with simultaneous emphasis", async () => {
    openMdmPage("dmb/layoutConfirm", { layoutId: "110", ver: "1.001" });
    await mount();
    expect(calls.find((c) => c.action === "view")?.params).toEqual({ layoutId: 110, ver: "1.001" });
    expect(visibleText(container)).toContain("v1.001");
    await pickDateTime(() => container.querySelector('[data-testid="lc-apply-from"]') as HTMLElement, "2026-07-01 00:00:00");
    await act(async () => (container.querySelector('[data-testid="lc-validate"]') as HTMLButtonElement).click());
    await flush();
    expect(container.querySelector('[data-testid="lc-simultaneous"]')?.textContent).toContain("송신·수신");
    const impact = container.querySelector('[data-testid="lc-impact"]')!.textContent!;
    expect(impact).toContain("출측검사 실적 수신");
    expect(impact).toContain("187");
    expect(impact).toContain("190");
    expect(container.querySelector('[data-testid="lc-eais"]')?.textContent).toContain("GLUE");
    const confirm = container.querySelector('[data-testid="lc-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await act(async () => (container.querySelector('[data-testid="lc-ack"] input') as HTMLInputElement).click());
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());
    await flush();
    expect(calls.find((c) => c.action === "confirm")?.params).toEqual({
      layoutId: 110, ver: "1.001", rowVersion: 2, applyFrom: "2026-07-01 00:00:00", warningsAcknowledged: true,
    });
  });

  const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const confirmBtn = () => q("lc-confirm") as HTMLButtonElement;
  const clickEl = async (el: HTMLElement | null) => {
    await act(async () => el!.click());
    await flush();
  };
  const pickFrom = (v: string) => pickDateTime(() => q("lc-apply-from") as HTMLElement, v);
  async function openAndValidate() {
    openMdmPage("dmb/layoutConfirm", { layoutId: "110", ver: "1.001" });
    await mount();
    await pickFrom("2026-07-01 00:00:00");
    await clickEl(q("lc-validate"));
  }

  it("changing apply_from after validation disables confirm and asks for re-validation", async () => {
    await openAndValidate();
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    expect(confirmBtn().disabled).toBe(false);
    await pickFrom("2026-07-02 00:00:00");
    expect(confirmBtn().disabled).toBe(true);
    expect(q("lc-stale")).toBeTruthy();
    await clickEl(q("lc-validate"));
    expect(calls.filter((c) => c.action === "validate").at(-1)?.params.applyFrom).toBe("2026-07-02 00:00:00");
    expect(q("lc-stale")).toBeNull();
    expect(confirmBtn().disabled).toBe(true); // 다시 검사하면 경고 확인도 처음부터
  });

  it("stays disabled until the warning acknowledgement is checked", async () => {
    await openAndValidate();
    expect(q("lc-ack")).toBeTruthy();
    expect(confirmBtn().disabled).toBe(true);
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    expect(confirmBtn().disabled).toBe(false);
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    expect(confirmBtn().disabled).toBe(true);
  });

  it("is disabled for someone who is not the owner", async () => {
    viewBody = { ...VIEW_HEADER, version: { ...VIEW_HEADER.version, OWNER_ID: "someone-else" } };
    await openAndValidate();
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    expect(confirmBtn().disabled).toBe(true);
  });

  it("shows the server message when validate is rejected and keeps the page usable", async () => {
    validateResponse = () => jsonResponse({ meta: { success: false, message: "적용 시각이 직전 버전보다 이릅니다" } });
    await openAndValidate();
    expect(q("lc-error")?.textContent).toContain("적용 시각이 직전 버전보다 이릅니다");
    expect(q("lc-checks")).toBeNull();
    expect(confirmBtn().disabled).toBe(true);
    expect(visibleText(container)).toContain("v1.001");
    validateResponse = () => jsonResponse(ok(VALIDATE_HEADER));
    await clickEl(q("lc-validate"));
    expect(q("lc-error")).toBeNull();
    expect(q("lc-checks")).toBeTruthy();
  });

  it("shows the server message when confirm is rejected, keeps the validation, and shows no done notice", async () => {
    confirmResponse = () => jsonResponse({ meta: { success: false, message: "다른 사용자가 먼저 수정했습니다" } });
    await openAndValidate();
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    await clickEl(confirmBtn());
    expect(q("lc-error")?.textContent).toContain("다른 사용자가 먼저 수정했습니다");
    expect(q("lc-done")).toBeNull();
    expect(q("lc-checks")).toBeTruthy();
    expect(confirmBtn().disabled).toBe(false);
  });

  it("shows the closed-previous notice after a successful confirm", async () => {
    await openAndValidate();
    await clickEl(container.querySelector('[data-testid="lc-ack"] input') as HTMLElement);
    await clickEl(confirmBtn());
    expect(q("lc-done")?.textContent).toContain("직전 v1.000 는 2026-07-01 00:00:00 에 닫힙니다");
    expect(q("lc-error")).toBeNull();
  });
});
