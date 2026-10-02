/** @vitest-environment happy-dom */

// 룰 세트 편집 버전 줄(D-144 2단계 Task 10) — 버전 고르기·버전 버튼(VersionActionBar)·내 DRAFT 에만 저장(Review Focus 2).
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

import type { RuleIo, RuleSetVersionRow, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, selectValue, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, click, installServer, ok, openSet, q, renderPage, settle, srv, uninstallServer, unmountPage } from "../helpers/rule-set-page";

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

/** 지금 적용 중인 RELEASED 1.000 만 있는 view — 읽기 전용, 새 버전 가능. */
function releasedView(): RuleSetView {
  const v = draftView();
  return { ...v, editable: false,
    set: { ...v.set, rowVersion: 3, ver: "1.000", verLabel: "v1.000", verStatus: "RELEASED", ownerId: null },
    versions: [versions()[1]],
    flags: { canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001", unappliedCount: 0, currentVer: "1.000", canDeprecate: true } };
}

async function chooseVer(ver: string) {
  await selectValue(byTestId<HTMLSelectElement>("set-ver-select"), ver);
  await flush();
}

/** VersionActionBar 의 확인창(showMessage, 포털)에서 [확인] 을 누른다. */
async function confirmDialog() {
  await flush();
  const yes = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인");
  if (!yes) throw new Error("확인창 [확인] 없음");
  await act(async () => yes.click());
  await flush();
  await flush();
}

describe("세트 버전 줄", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.openMdmPage.mockClear();
  });
  afterEach(() => uninstallServer());

  it("1. 버전 목록·선택 버전·상태가 보이고 다른 버전을 고르면 그 버전으로 다시 부른다", async () => {
    await openSet("E2S_CHAIN", draftView());
    expect(visibleText(byTestId("set-ver-row"))).toContain("v2.000");
    await chooseVer("1.000");
    expect(calls("view").at(-1)!.body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.000" });
  });

  it("2. 저장하지 않은 변경이 있으면 버전 바꾸기 전에 확인하고, 거절하면 부르지 않는다", async () => {
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    window.confirm = vi.fn(() => false);
    const before = calls("view").length;
    await chooseVer("1.000");
    expect(window.confirm).toHaveBeenCalled();
    expect(calls("view")).toHaveLength(before);
  });

  it("3. 저장하지 않은 변경이 있으면 버전 버튼을 모두 끈다", async () => {
    // 새 버전 단추가 dirty 때문에 꺼지는지 보려고 flags 를 켠다(서버는 DRAFT 가 있으면 끄지만 화면 규칙만 본다).
    const v = draftView();
    await openSet("E2S_CHAIN", { ...v, flags: { ...v.flags!, canNewMajor: true, canNewMinor: true, nextMajor: "3.000", nextMinor: "2.001" } });
    for (const id of ["set-ver-new-major", "set-ver-new-minor", "set-ver-delete", "set-ver-confirm", "set-ver-unlock"]) {
      expect(byTestId<HTMLButtonElement>(id).disabled, `${id} 변경 전`).toBe(false);
    }
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    for (const id of ["set-ver-new-major", "set-ver-new-minor", "set-ver-delete", "set-ver-confirm", "set-ver-unlock"]) {
      expect(byTestId<HTMLButtonElement>(id).disabled, id).toBe(true);
    }
  });

  it("4. 새 버전(minor) 은 copy 를 보내고 만든 DRAFT 를 고른 채로 다시 부른다", async () => {
    srv.replies.copy = ok({ setId: "E2S_CHAIN", ver: "1.001", verKind: "MINOR", rowVersion: 0 });
    await openSet("E2S_CHAIN", releasedView());
    await click("set-ver-new-minor");
    expect(calls("copy")[0].body.params).toEqual({ setId: "E2S_CHAIN", verKind: "MINOR" });
    expect(calls("view").at(-1)!.body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.001" });
  });

  it("5. RELEASED 는 읽기 전용이라 편집 모드가 없고 [확정] 이 꺼진다. 내 DRAFT 의 [확정] 은 확정 화면을 연다", async () => {
    await openSet("E2S_CHAIN", releasedView());
    expect(q("set-ver-readonly")).not.toBeNull();
    expect(byTestId<HTMLButtonElement>("set-ver-confirm").disabled).toBe(true);
    unmountPage();
    await openSet("E2S_CHAIN", draftView());
    await click("set-ver-confirm");
    expect(mocks.openMdmPage).toHaveBeenCalledWith("dme/ruleSetConfirm", { setId: "E2S_CHAIN", ver: "2.000" });
  });

  it("6. 저장은 선택 버전을 싣는다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 1, checks: [] });
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    await click("set-save");
    expect(calls("save")[0].body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "2.000", rowVersion: 0 });
  });

  it("8. 새로 등록한 세트(CREATED + 내 DRAFT 1.000)도 편집 모드에 들어가 선택 버전으로 저장한다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 1, checks: [] });
    const v = draftView();
    await openSet("E2S_CHAIN", { ...v, set: { ...v.set, status: "CREATED", ver: "1.000", verLabel: "v1.000" },
      versions: [{ ...versions()[0], ver: "1.000", verLabel: "v1.000" }] });
    await click("flow-mode-edit");
    expect(q("set-ver-readonly")).toBeNull();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "새 세트");
    await click("set-save");
    expect(calls("save")[0].body.params).toMatchObject({ setId: "E2S_CHAIN", ver: "1.000" });
  });

  it("7. DRAFT 삭제는 delete target VERSION 을 보내고 기본 선택으로 다시 부른다", async () => {
    srv.replies.delete = ok({ setId: "E2S_CHAIN", ver: "2.000" });
    await openSet("E2S_CHAIN", draftView());
    await click("set-ver-delete");
    await confirmDialog();
    expect(calls("delete")[0].body.params).toEqual({ setId: "E2S_CHAIN", target: "VERSION", ver: "2.000", rowVersion: 0 });
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_CHAIN" });
  });

  it("9. 예약된(미래 적용) RELEASED 가 있으면 적용 중 버전을 보여도 예약 버전 배지를 보이고 목록에서 고를 수 있다", async () => {
    const v = releasedView();
    const reserved: RuleSetVersionRow = {
      ...versions()[1], ver: "1.001", verKind: "MINOR", verLabel: "v1.001", applyFrom: "2099-01-01 00:00:00", rowVersion: 1,
    };
    await openSet("E2S_CHAIN", { ...v, versions: [reserved, versions()[1]],
      flags: { ...v.flags!, canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null, unappliedCount: 1, canDeprecate: false } });
    const badge = byTestId("set-ver-reserved");
    expect(visibleText(badge)).toContain("v1.001");
    expect(badge.getAttribute("title")).toContain("2099-01-01 00:00:00");
    const sel = byTestId<HTMLSelectElement>("set-ver-select");
    expect(sel.value).toBe("1.000");
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["v1.001 (RELEASED)", "v1.000 (RELEASED)"]);
    await chooseVer("1.001");
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_CHAIN", ver: "1.001" });
  });

  it("10. 예약 버전이 없으면 예약 배지가 없다", async () => {
    await openSet("E2S_CHAIN", draftView());
    expect(q("set-ver-reserved")).toBeNull();
  });

  it("11. 폐기는 서버 flags.canDeprecate 를 따르고 delete target SET 을 보낸다(내 DRAFT 가 아니어도)", async () => {
    srv.replies.delete = ok({ setId: "E2S_CHAIN", status: "DEPRECATED", rowVersion: null, checks: [] });
    await openSet("E2S_CHAIN", draftView());
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true); // 미적용 버전(내 DRAFT)이 있으면 폐기 불가
    unmountPage();
    await openSet("E2S_CHAIN", releasedView());
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(false);
    await click("set-deprecate");
    await click("set-deprecate-confirm");
    expect(calls("delete")[0].body.params).toEqual({ setId: "E2S_CHAIN", target: "SET" });
  });

  it("13. 테스트 케이스 쓰기는 고른 버전과 무관하게 서버 flags.canEditCases 를 따른다(Ruling P2-18)", async () => {
    const denied = "케이스는 담당자가 폐기하지 않은 세트에서 저장할 수 있다";
    const v = releasedView();   // RELEASED 를 보고 있어 편집 모드는 없다
    await openSet("E2S_CHAIN", { ...v, flags: { ...v.flags!, canEditCases: true } });
    await click("flow-mode-debug");
    expect(byTestId("case-save-current").getAttribute("title")).not.toBe(denied);
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    unmountPage();
    await openSet("E2S_CHAIN", { ...draftView(), flags: { ...draftView().flags!, canEditCases: false } }); // 내 DRAFT 라도 서버가 막으면 끈다
    await click("flow-mode-debug");
    expect(byTestId("case-save-current").getAttribute("title")).toBe(denied);
    expect(byTestId<HTMLButtonElement>("case-save-current").disabled).toBe(true);
  });

  it("14. 새 버전을 만들 수 있고 내 DRAFT 가 없으면 읽기 전용 문구에 새 버전 안내를 붙인다(Ruling P2-22 M-1)", async () => {
    await openSet("E2S_CHAIN", releasedView());   // V18 이행 직후처럼 RELEASED 1.000 만 있다
    expect(visibleText(byTestId("set-ver-readonly"))).toBe("읽기 전용 — 내 DRAFT 가 아니다. 고치려면 새 버전을 만든다");
    unmountPage();
    // 내 DRAFT 2.000 이 있는데 RELEASED 1.000 을 보고 있으면 — 새 버전이 아니라 그 DRAFT 로 고친다(flags 를 켜도 안내 없음)
    const d = draftView();
    await openSet("E2S_CHAIN", { ...d, editable: false,
      set: { ...d.set, rowVersion: 3, ver: "1.000", verLabel: "v1.000", verStatus: "RELEASED", ownerId: null },
      flags: { ...d.flags!, canNewMajor: true, canNewMinor: true, nextMajor: "3.000", nextMinor: "2.001" } });
    expect(visibleText(byTestId("set-ver-readonly"))).toBe("읽기 전용 — 내 DRAFT 가 아니다");
  });

  it("15. [확정] 은 RBAC confirm 도 본다 — 권한이 없으면 내 DRAFT 라도 꺼진다(Ruling P2-22 M-4)", async () => {
    srv.rbacRows = ["search", "view", "save", "delete", "copy", "lock", "unlock", "handover"].map((action) => ({
      objId: "ruleSetEdit", action, endpoint: "*", httpMethod: "*",
    }));
    await openSet("E2S_CHAIN", draftView());
    await settle();
    expect(byTestId<HTMLButtonElement>("set-ver-delete").disabled).toBe(false); // 권한이 있는 버튼은 켜진다(confirm 권한 있는 경우는 5번)
    expect(byTestId<HTMLButtonElement>("set-ver-confirm").disabled).toBe(true);
  });

  it.each([
    ["MDM003", "DRAFT 소유자만 할 수 있습니다"],
    ["MDM002", "DRAFT 상태에서만 할 수 있습니다"],
  ])("16. 수동 [저장] 이 %s 이면 자동 저장처럼 같은 버전을 읽기 전용으로 다시 불러온다(Ruling P2-22 M-6)", async (code, message) => {
    srv.replies.save = { meta: { success: false, code, message } };
    await openSet("E2S_CHAIN", draftView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");
    srv.views.E2S_CHAIN = { ...draftView(), editable: false }; // 서버에서는 이미 내 DRAFT 가 아니다
    await click("set-save");
    await settle();
    expect(calls("save")).toHaveLength(1);
    expect(calls("view")).toHaveLength(2);
    expect(calls("view")[1].body.params).toEqual({ setId: "E2S_CHAIN", ver: "2.000" });
    expect(q("set-ver-readonly")).not.toBeNull();
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
    expect(visibleText(byTestId("set-message"))).toContain("더 이상 내 DRAFT 가 아니다");
    expect(q("set-reload")).toBeNull(); // 충돌(MDM001) 안내가 아니다
  });

  it("12. 화면 넘김의 ver 로 그 버전을 연다", async () => {
    const g = globalThis as Record<string, unknown>;
    srv.views.E2S_CHAIN = releasedView();
    const store = (g.__mdmPageHandoff__ ??= {}) as Record<string, Record<string, string>>;
    store["mdm:dme/ruleSetEdit"] = { setId: "E2S_CHAIN", ver: "1.0" };
    await renderPage();
    expect(calls("view")[0].body.params).toEqual({ setId: "E2S_CHAIN", ver: "1.000" });
  });
});
