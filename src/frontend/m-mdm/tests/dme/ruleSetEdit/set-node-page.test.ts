/** @vitest-environment happy-dom */
// 하위 세트 spec §9·§10.3·§10.4(계획 Task 8 Step 7) — SET 노드 화면: 그리기(제목·작은 줄·입출력 칩·굵은 테두리 클래스), 링크로 같은 화면의 탭 열기,
// 도구 상자 「룰 세트」·선 메뉴 「룰 세트 넣기」 → 검색 팝업(INUSE·지금 세트 제외) → SET 노드 끼우기·겉모양 받기·되돌리기 한 칸,
// 속성 패널(머리글 「하위 세트」·세트 정보·입출력·부르는 세트 링크), 다른 탭 저장 뒤 겉모양 다시 받기, 메시지 줄 부르는 세트 링크,
// 받는 노드(SET 노드 메뉴 「예외 받기 추가」·SET 종류 목록·목록 밖 저장 종류 풀기), 중단점·디버그 입력 폼이 하위 세트 입력을 받는다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/dme/rule-handoff")>()) }));

import { SET_LOADING_TEXT, SET_MISSING_TEXT } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { CATCH_KIND_OUTSIDE } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { RuleIo, RuleSetView, SetCallIo } from "../../../pages/dme/ruleSetEdit/types";
import { findButton, flush, visibleText } from "../helpers/render";
import { byTestId, calls, click, inDoc, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";
import { activeKey, clickIn, inPanel, qPanel, tabKeys } from "./set-tabs-helpers";

const ioName = (name: string) => ({ name, source: "DICT" as const, label: null, dataType: "NUMBER", scale: 2, dateString: false, maruCodeId: null });
const callOf = (setId: string, outputs: Array<[string, boolean]>, inputs: string[] = [], exists = true): SetCallIo => ({
  setId,
  setName: exists ? `${setId} 세트` : null,
  exists,
  status: exists ? "INUSE" : null,
  inputs: inputs.map(ioName),
  outputs: outputs.map(([name, always]) => ({ name, dataType: "NUMBER", scale: 0, dateString: false, maruCodeId: null, always })),
  endsEarly: false,
});
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

function viewOf(setId: string, flow: unknown = null, callMap?: Record<string, SetCallIo>, rules: RuleIo[] = []): RuleSetView {
  return {
    set: { setId, setName: `${setId} 세트`, description: null, status: "INUSE", rowVersion: 0, ruleIds: rules.map((r) => r.ruleId), flow, branched: false },
    rules, checks: [], editable: true, restorable: false, condIo: {}, cases: [], ...(callMap ? { calls: callMap } : {}),
  } as unknown as RuleSetView;
}

const node = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, ruleId: null, splitId: null, label: null, ...extra });
const edge = (id: string, from: string, to: string) => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
/** start → s1(SET CHILD) → end. */
const PARENT_FLOW = {
  version: 1,
  nodes: [node("start", "START"), node("s1", "SET", { setId: "CHILD" }), node("end", "END")],
  edges: [edge("e1", "start", "s1"), edge("e2", "s1", "end")],
  view: { positions: {}, notes: [], groups: [] },
};
/** start → r1(R_A) → c1 가 붙은 r1 — c1 은 룰에 붙일 수 없는 SUBSET_ENDED 를 저장해 둔 받는 노드(처리 갈래 → end). */
const RULE_CATCH_FLOW = {
  version: 1,
  nodes: [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR", "SUBSET_ENDED"] }), node("end", "END")],
  edges: [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "end")],
  view: { positions: {}, notes: [], groups: [] },
};

const searchTargets = (from = 0) => calls("search").slice(from).map((r) => (r.body.params as Record<string, string>).target);
const callIoAsks = () => calls("search").filter((r) => (r.body.params as Record<string, string>).target === "CALL_IO").map((r) => (r.body.params as Record<string, string>).setIdsJson);
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));

async function ctxMenu(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 160, clientY: 90 }));
  });
  await flush();
}
async function press(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
/** 팝업의 세트 고르기에서 [찾기]를 누른다(IdPicker 는 글자를 쳐도 찾지 않는다). */
async function findInModal() {
  await act(async () => {
    findButton(inDoc("set-pick-modal"), "찾기").click();
  });
  await flush();
}

describe("SET 노드 화면", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(uninstallServer);

  it("SET 노드는 굵은 테두리 클래스·세트명 제목·세트 ID 작은 줄·입출력 칩을 그리고, 라벨이 있으면 제목은 라벨이다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true], ["Q", false]], ["X"]) }), { tabId: "T1" });
    const el = byTestId("flow-node-s1");
    expect(el.getAttribute("data-kind")).toBe("SET");
    expect(el.className).toContain("rsf-set");
    expect(byTestId("flow-set-title-s1").textContent).toBe("CHILD 세트");
    expect(byTestId("flow-set-sub-s1").textContent).toBe("룰 세트 CHILD");
    expect(visibleText(byTestId("flow-set-io-s1"))).toContain("입력 1");
    expect(visibleText(byTestId("flow-set-io-s1"))).toContain("출력 2");
    // view.calls 로 받았으므로 따로 묻지 않는다.
    expect(callIoAsks()).toEqual([]);
    uninstallServer();

    installServer();
    const labeled = { ...PARENT_FLOW, nodes: [node("start", "START"), node("s1", "SET", { setId: "CHILD", label: "단가 결정" }), node("end", "END")] };
    await openSet("PARENT", viewOf("PARENT", labeled, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    expect(byTestId("flow-set-title-s1").textContent).toBe("단가 결정");
  });

  it("겉모양을 받는 중이면 세트 ID 제목에 받는 중, 없는 세트면 없는 세트 줄을 보이고 입출력 칩이 없다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [], [], false) }), { tabId: "T1" });
    expect(byTestId("flow-set-title-s1").textContent).toBe("CHILD");
    expect(byTestId("flow-set-sub-s1").textContent).toBe(SET_MISSING_TEXT);
    expect(q("flow-set-io-s1")).toBeNull();
    uninstallServer();

    installServer();
    // 겉모양 응답에 그 세트가 없다(목 서버 기본 빈 응답) — 아직 모르는 세트로 그린다.
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW), { tabId: "T1" });
    expect(byTestId("flow-set-sub-s1").textContent).toBe(SET_LOADING_TEXT);
    expect(callIoAsks()).toEqual(['["CHILD"]']);
  });

  it("링크 아이콘은 같은 화면의 새 탭으로 열고, 이미 열린 탭이면 그 탭으로 간다(새 view 요청 없음)", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    srv.views.CHILD = viewOf("CHILD");
    await click("flow-set-open-s1");
    await settle();
    const keys = tabKeys();
    expect(keys).toHaveLength(2);
    expect(activeKey()).toBe(keys[1]);
    expect(inPanel(keys[1], "set-edit-current").textContent).toContain("CHILD");

    await press(byTestId(`set-tab-${keys[0]}`));
    const views = calls("view").length;
    await clickIn(keys[0], "flow-set-open-s1");
    await settle();
    expect(tabKeys()).toHaveLength(2);
    expect(activeKey()).toBe(keys[1]);
    expect(calls("view")).toHaveLength(views);
  });

  it("우클릭 메뉴 — 보기 모드는 「세트 탭으로 열기」, 편집 모드는 복사·복제·예외 받기·삭제 뒤 「세트 탭으로 열기」(색상 없음)", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    await ctxMenu(byTestId("flow-node-s1"));
    expect(menuIds()).toEqual(["set-open"]);
    srv.views.CHILD = viewOf("CHILD");
    await press(byTestId("flow-menu-item-set-open"));
    await settle();
    expect(tabKeys()).toHaveLength(2);

    await press(byTestId(`set-tab-${tabKeys()[0]}`));
    await clickIn(tabKeys()[0], "flow-mode-edit");
    await ctxMenu(inPanel(tabKeys()[0], "flow-node-s1"));
    expect(menuIds()).toEqual(["copy", "duplicate", "catch-add", "delete", "set-open"]);
  });

  it("도구 상자 「룰 세트」 — 팝업은 INUSE 이고 지금 세트가 아닌 세트만 보이고, 고르면 고른 선(없으면 END 앞 선)에 SET 노드를 끼우고 겉모양을 받는다. 되돌리기 한 칸", async () => {
    srv.replies["search:SET"] = ok({
      sets: [
        { setId: "PARENT", setName: "자기", status: "INUSE" },
        { setId: "OLD", setName: "폐기", status: "DEPRECATED" },
        { setId: "CHILD", setName: "하위", status: "INUSE" },
      ],
    });
    srv.replies["search:CALL_IO"] = ok({ calls: [callOf("CHILD", [["P", true]])] });
    await openSet("PARENT", viewOf("PARENT", null, undefined, [rule("R_A", "X", "Y")]), { tabId: "T1" });
    await click("flow-mode-edit");
    expect(q("set-pick-modal")).toBeNull();
    await click("flow-add-set");
    expect(inDoc("set-pick-modal")).toBeTruthy();
    await findInModal();
    expect(document.querySelector('[data-testid="set-pick-modal-pick-PARENT"]')).toBeNull();
    expect(document.querySelector('[data-testid="set-pick-modal-pick-OLD"]')).toBeNull();
    await press(inDoc("set-pick-modal-pick-CHILD"));
    await settle(50);
    expect(document.querySelector('[data-testid="set-pick-modal"]')).toBeNull();
    // END 앞 선(r1 → end)에 끼웠다 — 새 SET 노드를 고른다.
    expect(byTestId("flow-node-s1").getAttribute("data-kind")).toBe("SET");
    expect(byTestId("flow-node-s1").getAttribute("data-selected")).toBe("true");
    expect(byTestId("flow-panel-kind").textContent).toBe("하위 세트");
    expect(callIoAsks()).toEqual(['["CHILD"]']);
    expect(visibleText(byTestId("flow-set-io-s1"))).toContain("출력 1");

    await click("flow-undo");
    expect(q("flow-node-s1")).toBeNull();
  });

  it("선 우클릭 「룰 세트 넣기」 는 그 선에 끼우고, [닫기]·편집 모드 나가기는 아무것도 끼우지 않고 팝업을 닫는다", async () => {
    srv.replies["search:SET"] = ok({ sets: [{ setId: "CHILD", setName: "하위", status: "INUSE" }] });
    srv.replies["search:CALL_IO"] = ok({ calls: [callOf("CHILD", [["P", true]])] });
    await openSet("PARENT", viewOf("PARENT", null, undefined, [rule("R_A", "X", "Y")]), { tabId: "T1" });
    await click("flow-mode-edit");

    await ctxMenu(q("rf__edge-e1")!);
    await press(byTestId("flow-menu-item-insert-set"));
    await press(inDoc("set-pick-modal-cancel"));
    expect(document.querySelector('[data-testid="set-pick-modal"]')).toBeNull();
    expect(q("flow-node-s1")).toBeNull();

    await ctxMenu(q("rf__edge-e1")!);
    await press(byTestId("flow-menu-item-insert-set"));
    await click("flow-mode-view");
    expect(document.querySelector('[data-testid="set-pick-modal"]')).toBeNull();
    await click("flow-mode-edit");
    expect(document.querySelector('[data-testid="set-pick-modal"]')).toBeNull(); // 다시 편집 모드가 되어도 저절로 뜨지 않는다

    await ctxMenu(q("rf__edge-e1")!);
    await press(byTestId("flow-menu-item-insert-set"));
    await findInModal();
    await press(inDoc("set-pick-modal-pick-CHILD"));
    await settle(50);
    // 시작 → s1 → r1 — 우클릭한 선(start → r1)에 끼웠다.
    expect(q("rf__edge-e1")).not.toBeNull();
    expect(byTestId("flow-node-s1").getAttribute("data-kind")).toBe("SET");
    const edges = Array.from(byTestId("flow-canvas").querySelectorAll('[data-testid^="rf__edge-"]')).map((e) => e.getAttribute("data-testid"));
    expect(edges).toHaveLength(3);
  });

  it("속성 패널 — 머리글 「하위 세트」, 세트 ID·세트명·상태, 입력·출력(항상·일부 경로), 부르는 세트(CALLERS)는 누르면 탭으로 연다. 룰 목록은 없다", async () => {
    srv.replies["search:CALLERS"] = ok({ sets: [{ setId: "GP", setName: "조부모", status: "INUSE" }] });
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true], ["Q", false]], ["X"]) }), { tabId: "T1" });
    await click("flow-mode-edit");
    await click("flow-node-s1");
    await settle(50);
    expect(byTestId("flow-panel-kind").textContent).toBe("하위 세트");
    expect(byTestId("flow-panel-name").textContent).toBe("CHILD 세트");
    expect(q("flow-prop-set-node")).not.toBeNull();
    expect(q("flow-prop-set")).toBeNull(); // 세트 전체 패널이 아니다
    expect(q("flow-rule-panel-search")).toBeNull();
    expect(byTestId("flow-prop-set-id").textContent).toBe("CHILD");
    expect(visibleText(byTestId("flow-prop-set-name"))).toContain("CHILD 세트");
    expect(visibleText(byTestId("flow-prop-set-name"))).toContain("INUSE");
    expect(q("flow-prop-set-input-X")).not.toBeNull();
    expect(visibleText(byTestId("flow-prop-set-output-P"))).toContain("항상");
    expect(visibleText(byTestId("flow-prop-set-output-Q"))).toContain("일부 경로");
    const asked = calls("search").filter((r) => (r.body.params as Record<string, string>).target === "CALLERS");
    expect(asked.map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["CHILD"]);

    srv.views.GP = viewOf("GP");
    await click("flow-prop-set-caller-GP");
    await settle();
    expect(tabKeys()).toHaveLength(2);
    expect(inPanel(activeKey(), "set-edit-current").textContent).toContain("GP");
  });

  it("다른 탭이 하위 세트를 저장하면 부모 탭이 그 겉모양을 다시 받아 입출력 칩을 바꾼다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    srv.views.CHILD = viewOf("CHILD", null, undefined, [rule("R_C", "X", "Y")]); // 룰이 없으면 EMPTY 거부로 저장이 꺼진다
    await click("flow-set-open-s1");
    await settle();
    const [parentKey, childKey] = tabKeys();
    srv.replies.save = ok({ setId: "CHILD", rowVersion: 1, checks: [] });
    srv.replies["search:CALL_IO"] = ok({ calls: [callOf("CHILD", [["P", true], ["R", true]])] });
    const before = calls("search").length;
    await clickIn(childKey, "flow-mode-edit");
    await clickIn(childKey, "flow-add-note");
    await clickIn(childKey, "set-save");
    await settle();
    expect(searchTargets(before)).toContain("CALL_IO");
    expect(visibleText(inPanel(parentKey, "flow-set-io-s1"))).toContain("출력 2");
  });

  it("저장 경고의 부르는 세트(CALLER_WARN·CALLER_BROKEN 사본)는 메시지 아래 링크 단추이고 누르면 그 세트 탭을 연다", async () => {
    await openSet("CHILD", viewOf("CHILD", null, undefined, [rule("R_C", "X", "Y")]), { tabId: "T1" });
    srv.replies.save = ok({
      setId: "CHILD",
      rowVersion: 1,
      checks: [
        { code: "CALLER_BROKEN", severity: "WARN", ruleId: "CHILD", otherRuleId: null, varName: null, message: "세트 PB v1.001: R1의 조건 변수 X는 컬럼 사전에 없다", nodeId: null, edgeId: null },
        { code: "CALLER_WARN", severity: "WARN", ruleId: "CHILD", otherRuleId: null, varName: null, message: "부르는 세트에 경고가 생겼다: PARENT", nodeId: null, edgeId: null },
      ],
    });
    await click("flow-mode-edit");
    await click("flow-add-note");
    await click("set-save");
    await settle();
    expect(byTestId("set-message").textContent).toContain("부르는 세트에 경고가 생겼다: PARENT");
    const links = Array.from(byTestId("set-message-callers").querySelectorAll("button")).map((b) => b.getAttribute("data-testid"));
    expect(links).toEqual(["set-message-caller-PB", "set-message-caller-PARENT"]); // 경고 줄 순서
    srv.views.PARENT = viewOf("PARENT");
    await click("set-message-caller-PARENT");
    await settle();
    expect(tabKeys()).toHaveLength(2);
    expect(inPanel(activeKey(), "set-edit-current").textContent).toContain("PARENT");
  });

  it("SET 노드에도 「예외 받기 추가」 — 받을 예외는 INPUT_ERROR·EVAL_ERROR·HIT_CONFLICT·하위 세트 예외 끝, 안내에 CATCH_SET 이 있다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    await click("flow-mode-edit");
    expect(q("flow-catch-handle-s1")).not.toBeNull();
    await ctxMenu(byTestId("flow-node-s1"));
    await press(byTestId("flow-menu-item-catch-add"));
    await settle(50);
    expect(byTestId("flow-node-c1").getAttribute("data-kind")).toBe("CATCH");
    await click("flow-node-c1");
    expect(byTestId("flow-panel-kind").textContent).toBe("받는 노드");
    const kinds = Array.from(byTestId("flow-prop-catch").querySelectorAll('[data-testid^="flow-prop-catch-kind-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-prop-catch-kind-".length));
    expect(kinds).toEqual(["INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT", "SUBSET_ENDED"]);
    expect(visibleText(byTestId("flow-prop-catch-kind-SUBSET_ENDED"))).toContain("하위 세트 예외 끝");
    expect(visibleText(byTestId("flow-prop-catch"))).toContain("CATCH_SET");
    expect(visibleText(byTestId("flow-prop-catch"))).toContain("붙은 노드");
  });

  it("목록 밖인데 저장된 받을 예외 종류(룰의 SUBSET_ENDED)는 체크된 칸으로 보여 풀 수 있고, 풀면 칸이 사라진다", async () => {
    await openSet("RC", viewOf("RC", RULE_CATCH_FLOW, undefined, [rule("R_A", "X", "Y")]), { tabId: "T1" });
    await click("flow-mode-edit");
    await click("flow-node-c1");
    const box = byTestId("flow-prop-catch-kind-SUBSET_ENDED");
    expect(box.getAttribute("data-outside")).toBe("true");
    expect(byTestId("flow-prop-catch-outside-SUBSET_ENDED").textContent).toBe(CATCH_KIND_OUTSIDE);
    const input = box.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(false);
    await press(input);
    expect(q("flow-prop-catch-kind-SUBSET_ENDED")).toBeNull();
    expect((byTestId("flow-prop-catch-kind-EVAL_ERROR").querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });

  it("디버그 모드 — SET 노드에 중단점을 걸 수 있고, 입력 폼은 하위 세트의 입력도 받는다", async () => {
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]], ["SUB_IN"]) }), { tabId: "T1" });
    await click("flow-mode-debug");
    expect(q("flow-bp-s1")).not.toBeNull();
    expect(q("dbg-input-SUB_IN")).not.toBeNull();
    await ctxMenu(byTestId("flow-node-s1"));
    expect(menuIds()).toEqual(["bp-toggle", "run-to", "set-open"]);
  });

  it("숨은 탭에서는 세트 검색 팝업을 그리지 않고, 그 탭을 다시 고르면 다시 보인다", async () => {
    srv.replies["search:SET"] = ok({ sets: [{ setId: "CHILD", setName: "하위", status: "INUSE" }] });
    await openSet("PARENT", viewOf("PARENT", PARENT_FLOW, { CHILD: callOf("CHILD", [["P", true]]) }), { tabId: "T1" });
    const parentKey = tabKeys()[0];
    await click("flow-mode-edit");
    await click("flow-add-set");
    expect(inDoc("set-pick-modal")).toBeTruthy();
    // 팝업이 떠 있는 동안 다른 탭으로 옮겨 간다(링크 단추를 직접 누른다).
    srv.views.CHILD = viewOf("CHILD");
    await clickIn(parentKey, "flow-set-open-s1");
    await settle();
    expect(activeKey()).not.toBe(parentKey);
    expect(document.querySelector('[data-testid="set-pick-modal"]')).toBeNull();
    await press(byTestId(`set-tab-${parentKey}`));
    expect(inDoc("set-pick-modal")).toBeTruthy();
  });
});
