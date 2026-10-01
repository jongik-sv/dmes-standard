/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 3 — 오른쪽 패널 「외관」 섹션: 편집 모드의 RULE·TASK 에서만, 조작마다 편집 한 번(되돌리기 한 칸), 크기 칸 Enter·칸 밖 저장.
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

import { insertSplit, insertTask, setNodeStyle, updateEdge, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, typeInto } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, ok, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
/** start → if1{e5 갈래 1 / e6 그 외} → m1 → r1 → r2 → r3(빈 단계) → end. */
function flowOf(): EditFlow {
  let f = toEditFlow(null, ["NP_A", "NP_B"]); // start → r1 → r2 → end, e1 e2 e3
  f = must(insertTask(f, "e3")); // r2 → r3(빈 단계) → end
  f = must(insertSplit(f, "e1", "IF")); // start → if1 → … → r1
  return must(updateEdge(f, "e5", { cond: "true" })); // 조건식이 비면 거부 검사가 저장을 막는다
}
/** IF 갈래 조건식은 읽을 수 있다고 본다 — 아니면 거부 검사(FLOW_COND)가 저장을 막는다. */
const COND_IO = { e5: { ok: true, message: null, vars: [] }, e6: { ok: true, message: null, vars: [] } };
function viewOf(setId: string, flow: EditFlow = flowOf()): RuleSetView {
  return {
    set: { setId, setName: "외관 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["NP_A", "NP_B"], flow, branched: true },
    rules: [io("NP_A"), io("NP_B")], checks: [], condIo: COND_IO, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
/**
 * 저장하고 보낸 흐름 JSON 을 돌려준다. 저장 뒤 화면은 목 서버의 처음 view 를 다시 읽으므로(외관이 사라진다) 시험의 **마지막**에만 부른다.
 */
async function saved(): Promise<EditFlow> {
  await settle(500); // 편집 뒤 검사(validate)가 끝나야 [저장]이 켜진다
  await click("set-save");
  await settle();
  return JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
}
async function keyOn(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}
async function blur(el: Element) {
  await act(async () => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}
const checkbox = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;

describe("오른쪽 패널 「외관」 섹션(S-D9)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    srv.replies.validate = ok({ condIo: COND_IO });
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("편집 모드에서 RULE·TASK 를 골랐을 때만 보인다 — 보기 모드·분기·시작은 없다", async () => {
    await openSet("NP_1", viewOf("NP_1"));
    await click("flow-node-r1");
    expect(q("flow-section-node-style")).toBeNull(); // 보기 모드
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(byTestId("flow-section-node-style-head").textContent).toContain("외관");
    await click("flow-node-r3");
    expect(q("flow-section-node-style")).not.toBeNull();
    await click("flow-node-if1");
    expect(q("flow-section-node-style")).toBeNull();
    await click("flow-node-start");
    expect(q("flow-section-node-style")).toBeNull();
  });

  it("색 견본은 패널에 없다 — 색은 노드 우클릭 메뉴 「색상」으로 옮겼다(C1)", async () => {
    await openSet("NP_2", viewOf("NP_2"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(q("flow-section-node-style")).not.toBeNull();
    expect(document.querySelector('[data-testid^="flow-style-color-"]')).toBeNull();
    expect(document.querySelector(".rsf-style-swatch")).toBeNull();
    expect(q("flow-style-icon-none")).not.toBeNull(); // 나머지 조작은 그대로
  });

  it("아이콘·모양·표시 항목 — 조작마다 편집 한 번(되돌리기 한 칸씩)", async () => {
    await openSet("NP_3", viewOf("NP_3"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-style-icon-calendar");
    await click("flow-style-shape-pill");
    await act(async () => {
      checkbox("종류·정책 줄 보이기")!.click();
    });
    await flush();
    expect(checkbox("종류·정책 줄 보이기")!.checked).toBe(false);
    expect(pressed("flow-style-icon-calendar")).toBe("true");
    expect(pressed("flow-style-shape-pill")).toBe("true");
    await click("flow-undo");
    await click("flow-undo");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 세 번 = 세 칸
    expect(pressed("flow-style-icon-none")).toBe("true");
    expect(pressed("flow-style-shape-round")).toBe("true");
  });

  it("아이콘·모양·표시 항목이 칸 순서대로 저장된다", async () => {
    await openSet("NP_3b", viewOf("NP_3b"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-style-shape-pill");
    await click("flow-style-icon-calendar");
    await act(async () => {
      checkbox("종류·정책 줄 보이기")!.click();
    });
    await flush();
    expect((await saved()).view.styles).toEqual({ r1: { hide: ["sub"], icon: "calendar", shape: "pill" } });
  });

  it("빈 단계는 표시 항목이 「안내 줄」 하나뿐이다", async () => {
    await openSet("NP_4", viewOf("NP_4"));
    await click("flow-mode-edit");
    await click("flow-node-r3");
    expect(checkbox("안내 줄 보이기")).not.toBeNull();
    expect(checkbox("룰 ID 줄 보이기")).toBeNull();
    expect(checkbox("룰 편집 열기 단추 보이기")).toBeNull();
  });

  it("너비 칸 — Enter 에 한 번 저장하고 범위로 자르며, 그린 위치 전부를 저장 위치로 적는다(S-D6)", async () => {
    await openSet("NP_5", viewOf("NP_5"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    const w = byTestId<HTMLInputElement>("flow-style-w");
    expect(w.value).toBe("232");
    await typeInto(w, "9999");
    expect(undoDisabled()).toBe(true); // 치는 동안은 저장하지 않는다
    await keyOn(w, "Enter");
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("640");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 한 칸(Enter 뒤 blur 가 한 번 더 저장하지 않았다)
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("232");
    await typeInto(byTestId<HTMLInputElement>("flow-style-w"), "500");
    await keyOn(byTestId("flow-style-w"), "Enter");
    await blur(byTestId("flow-style-w"));
    const f = await saved();
    expect(f.view.styles).toEqual({ r1: { w: 500 } });
    expect(Object.keys(f.view.positions).sort()).toEqual(f.nodes.map((n) => n.id).sort());
  });

  it("높이 칸 — 칸 밖 누르기에 저장, 같은 값·빈 값·숫자 아님은 기록하지 않고 되돌린다", async () => {
    await openSet("NP_6", viewOf("NP_6"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    const h = () => byTestId<HTMLInputElement>("flow-style-h");
    await typeInto(h(), "68");
    await blur(h());
    await typeInto(h(), "");
    await blur(h());
    expect(undoDisabled()).toBe(true);
    expect(h().value).toBe("68");
    await typeInto(h(), "150");
    await blur(h());
    expect((await saved()).view.styles).toEqual({ r1: { h: 150 } });
  });

  it("[기본 크기]는 w·h 만, [외관 초기화]는 전부 지운다 — 각각 편집 한 번", async () => {
    const styled = must(setNodeStyle(flowOf(), "r1", { color: "blue", w: 400, h: 120 }));
    await openSet("NP_7", viewOf("NP_7", styled));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("400");
    await click("flow-style-size-reset");
    expect((byTestId("flow-style-size-reset") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("232");
    await click("flow-style-reset"); // 색도 지운다
    expect((byTestId("flow-style-reset") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId("flow-node-r1").hasAttribute("data-color")).toBe(false);
    await click("flow-undo");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 두 번 = 두 칸
    expect(byTestId<HTMLInputElement>("flow-style-w").value).toBe("400");
    expect(byTestId("flow-node-r1").getAttribute("data-color")).toBe("blue");
    await click("flow-style-size-reset");
    expect((await saved()).view.styles).toEqual({ r1: { color: "blue" } });
  });
});
