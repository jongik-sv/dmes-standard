/** @vitest-environment happy-dom */

// 룰 세트 자동 저장 — 저장 중 그 DRAFT 가 다른 곳에서 확정·넘기기·삭제됨(D-144 2단계 Review Focus 1).
// 서버가 MDM002(DRAFT 아님)·MDM003(소유자 아님)으로 거부하면 같은 내용을 2초마다 되풀이하지 않고, 자동 저장을 끄고 읽기 전용으로 다시 불러온다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { storeKeys } from "../../../pages/dme/ruleSetEdit/debugger/local-store";
import type { RuleIo, RuleSetVersionRow, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { typeInto } from "../helpers/render";
import { visibleText } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

const versions = (): RuleSetVersionRow[] => [
  { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", applyFrom: null, applyTo: null, ownerId: "tester", rowVersion: 0, cancelConfirmable: false },
  { ver: "1.000", verKind: "MAJOR", verLabel: "v1.000", status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, rowVersion: 3, cancelConfirmable: false },
];

/** 내 DRAFT 2.000 을 연 view — 편집할 수 있다. */
function draftView(): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 0, ruleIds: ["E2S_GRD"], flow: null, branched: false,
      ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", verStatus: "DRAFT", ownerId: "tester" },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD")],
    checks: [], condIo: {}, editable: true, restorable: false, cases: [],
    versions: versions(),
    flags: { canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null, unappliedCount: 1, currentVer: "1.000", canDeprecate: false },
    me: "tester",
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("자동 저장 중 DRAFT 가 다른 곳에서 바뀜", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it.each([
    ["MDM003", "DRAFT 소유자만 할 수 있습니다"],
    ["MDM002", "DRAFT 상태에서만 할 수 있습니다"],
  ])("%s 이면 자동 저장을 끄고 읽기 전용으로 다시 불러오며 같은 내용을 다시 보내지 않는다", async (code, message) => {
    srv.replies.save = { meta: { success: false, code, message } };
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await click("set-autosave");
    srv.views.E2S_CHAIN = { ...draftView(), editable: false }; // 서버에서는 이미 내 DRAFT 가 아니다
    vi.useFakeTimers();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(자동)");
    await advance(2000);
    await advance(50);
    expect(calls("save")).toHaveLength(1);
    expect(calls("view")).toHaveLength(2);
    expect(calls("view")[1].body.params).toEqual({ setId: "E2S_CHAIN", ver: "2.000" }); // 같은 버전을 다시 부른다
    expect(q("set-autosave")).toBeNull(); // 편집할 수 없어 보기 모드로 내려갔다
    expect(q("set-ver-readonly")).not.toBeNull();
    await advance(6000);
    expect(calls("save")).toHaveLength(1);
    expect(localStorage.getItem(storeKeys.autoSave)).toBe("true"); // 보는 사람 설정은 그대로(충돌 처리와 같다)
  });

  it("다른 곳에서 DRAFT 가 삭제되면 저장은 MDM001 이고, [다시 불러오기] 는 없는 버전 대신 기본 버전을 읽기 전용으로 연다", async () => {
    // 지워진 DRAFT 로 저장하면 서버는 행이 없어 row_version 충돌(MDM001)을 준다(VersionPreconditions.loadOrConflict).
    srv.replies.save = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다" } };
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    await click("set-save");
    expect(calls("save")).toHaveLength(1);
    expect(q("set-reload")).not.toBeNull();

    // 서버에는 이제 RELEASED 1.000 만 있다 — view{ver:"2.000"} 은 "버전이 없습니다", view{setId} 는 기본 선택(1.000).
    const released = draftView();
    srv.views.E2S_CHAIN = {
      ...released, editable: false,
      set: { ...released.set, rowVersion: 3, ver: "1.000", verLabel: "v1.000", verStatus: "RELEASED", ownerId: null },
      versions: [versions()[1]],
      flags: { ...released.flags!, unappliedCount: 0, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001" },
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/ruleSetEdit/view")) {
        const params = JSON.parse(String(init?.body)).params as Record<string, string>;
        if (params.ver === "2.000") {
          srv.requests.push({ action: "view", body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify({ meta: { success: false, code: "E002", message: "버전이 없습니다: E2S_CHAIN v2.000" } }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
      }
      return realFetch(input, init);
    }) as typeof fetch;
    await click("set-reload");
    await settle();
    globalThis.fetch = realFetch;

    expect(calls("view").slice(-2).map((c) => c.body.params)).toEqual([{ setId: "E2S_CHAIN", ver: "2.000" }, { setId: "E2S_CHAIN" }]);
    expect(byTestId<HTMLSelectElement>("set-ver-select").value).toBe("1.000");
    expect(q("set-ver-readonly")).not.toBeNull();
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    expect(q("set-reload")).toBeNull();
    expect(visibleText(byTestId("set-message"))).toContain("선택했던 버전 v2.000 이 더 이상 없습니다");
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬");
  });
});
