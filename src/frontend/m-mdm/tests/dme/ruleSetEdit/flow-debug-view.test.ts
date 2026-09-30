/** @vitest-environment happy-dom */

// 룰 세트 흐름 캔버스 표시(3단계 계획 Task 11) — 블록 접기(D16)·중단점 점(E2)·디버그 겹침 모양(E1)·변수 칩 값 툴팁(E3).
// 접기 상태는 page 가 진짜 useCollapse 로 잡는다(mock 이 아니다) — 찾기의 expandFor 실제 연결도 여기서 본다.
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

import type { RunTrace } from "../../../src/contract/engine-contract.generated";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, calls, canvasNodeIds, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null, dataType: string | null = null) => ({ name: n, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src, string?]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s, t]) => ioName(n, s, t ?? null)), results: results.map((r) => ioName(r, null, "STRING")),
  };
}
const RULES: RuleIo[] = [io("GT_GRADE", [["GT_THK", "DICT", "NUMBER"]], ["GT_G"]), io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]), io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"])];
const COND_IO = { e3: { ok: true, message: null, vars: [ioName("GT_G", "NONE")] } };
const FIRST = golden("IF_FIRST_TRUE"); // start, r1, if1(r2 | r3), m1, end

function viewOf(): RuleSetView {
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: FIRST.flow, branched: true },
    rules: RULES, checks: [], condIo: COND_IO, editable: true, restorable: false, cases: [],
  };
}

/** r2(안쪽 룰)가 오류로 끝난 기록. */
function errorResponse() {
  const t = JSON.parse(JSON.stringify(FIRST.trace)) as RunTrace;
  const r2 = t.nodes.find((n) => n.nodeId === "r2")!;
  r2.status = "ERROR";
  return { trace: t, warnings: [] };
}

const nodeState = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-state");
const text = (id: string) => visibleText(byTestId(id)).trim();
const has = (id: string) => q(`flow-node-${id}`) !== null;

async function openView() {
  srv.replies.execute = ok(FIRST.response);
  srv.replies.validate = ok({ condIo: COND_IO });
  await openSet("GT_SET", viewOf());
}
async function ctxMenu(id: string) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 120 }));
  });
  await flush();
}
async function toggleCollapse(nodeId: string) {
  await ctxMenu(`flow-node-${nodeId}`);
  await click("flow-menu-item-collapse");
}
async function run(id: string) {
  await click(id);
  await settle(50);
}
async function inputAndStep(times: number) {
  await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
  for (let i = 0; i < times; i++) await run("dbg-step");
}

beforeEach(() => {
  installServer();
  localStorage.clear();
  mocks.openRuleEdit.mockReset();
  mocks.openMdmPage.mockReset();
});
afterEach(() => {
  uninstallServer();
});

describe("블록 접기(D16)", () => {
  it("1. 분기 우클릭 [접기] → 접힌 블록 문구, 안쪽 노드 없음 → [펼치기]. 보기·디버그 모드에서도 되고 저장 요청에는 접힘 흔적이 없다", async () => {
    await openView();
    expect(has("r2")).toBe(true);
    await ctxMenu("flow-node-if1");
    expect(text("flow-menu-item-collapse")).toBe("접기");
    await click("flow-menu-item-collapse");
    expect(text("flow-collapsed-if1")).toBe("IF 조건 · 노드 2개");
    expect(has("r2")).toBe(false);
    expect(has("r3")).toBe(false);
    expect(has("m1")).toBe(false);
    expect(canvasNodeIds().sort()).toEqual(["end", "if1", "r1", "start"]);

    await ctxMenu("flow-node-if1");
    expect(text("flow-menu-item-collapse")).toBe("펼치기");
    await click("flow-menu-item-collapse");
    expect(q("flow-collapsed-if1")).toBeNull();
    expect(has("r2")).toBe(true);

    await click("flow-mode-debug");
    await toggleCollapse("if1");
    expect(text("flow-collapsed-if1")).toBe("IF 조건 · 노드 2개");
    await click("flow-mode-view");
    expect(text("flow-collapsed-if1")).toBe("IF 조건 · 노드 2개"); // 모드를 오가도 유지
    await toggleCollapse("if1");
    expect(q("flow-collapsed-if1")).toBeNull();

    // 접은 채 편집·저장 — 저장 형식에 접힘이 없다.
    await click("flow-mode-edit");
    await toggleCollapse("if1");
    await click("flow-node-if1");
    if (q("flow-right-tab-props")) await click("flow-right-tab-props");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-label"), "등급 분기");
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: 2, checks: [] });
    await click("set-save");
    const params = calls("save")[0].body.params as { flowJson: string };
    expect(params.flowJson).not.toMatch(/collaps|fold|접/i);
    expect(JSON.parse(params.flowJson).nodes.map((n: { id: string }) => n.id)).toContain("r2");
  });

  it("2. 디버그 기록에서 안쪽 룰이 실행됐으면 '안쪽 실행 1개', 안쪽이 오류면 접힌 블록이 data-error", async () => {
    await openView();
    await click("flow-mode-debug");
    await toggleCollapse("if1");
    await inputAndStep(1);
    await run("dbg-finish");
    expect(text("flow-collapsed-ran-if1")).toBe("안쪽 실행 1개");
    expect(byTestId("flow-collapsed-if1").getAttribute("data-error")).not.toBe("true");

    // 입력이 바뀌면 다음 동작이 새로 실행한다(P-D9) — 이번 기록은 안쪽 r2 가 오류다.
    srv.replies.execute = ok(errorResponse());
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "13");
    await run("dbg-finish");
    expect(calls("execute")).toHaveLength(2);
    expect(byTestId("flow-collapsed-if1").getAttribute("data-error")).toBe("true");
  });

  it("3. 디버그 커서가 접힌 블록 안 노드면 접힌 블록으로 옮기고 펼치지 않는다", async () => {
    await openView();
    await click("flow-mode-debug");
    await toggleCollapse("if1");
    await inputAndStep(4); // 커서 3 = r2 실행 전
    expect(text("dbg-status")).toBe("4/6 · r2 실행 전");
    expect(has("r2")).toBe(false);
    expect(text("flow-collapsed-if1")).toBe("IF 조건 · 노드 2개");
    expect(byTestId("flow-node-if1").className).toContain("rsf-flash");
  });

  it("4. 찾기로 접힌 블록 안 룰을 고르면 실제로 펼쳐진다(Task 8 은 mock 으로만 봤다)", async () => {
    await openView();
    await toggleCollapse("if1");
    expect(has("r3")).toBe(false);
    const box = byTestId<HTMLInputElement>("flow-find");
    await typeInto(box, "GT_SLOW");
    await settle(50);
    await click("flow-find-next");
    expect(has("r3")).toBe(true);
    expect(q("flow-collapsed-if1")).toBeNull();
  });
});

describe("접기와 선택", () => {
  it("먼저 고른 안쪽 노드를 두고 분기를 접으면 선택이 풀려 Delete 가 숨은 노드를 지우지 않는다", async () => {
    await openView();
    await click("flow-mode-edit");
    await click("flow-node-r2");
    expect(byTestId("flow-node-r2").getAttribute("data-selected")).toBe("true");
    await toggleCollapse("if1");
    const ev = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    await act(async () => {
      byTestId("flow-canvas").dispatchEvent(ev);
    });
    await flush();
    await toggleCollapse("if1"); // 펼친다
    expect(has("r2")).toBe(true);
    expect(byTestId("flow-node-r2").getAttribute("data-selected")).toBe("false");
  });
});

describe("중단점 점·디버그 겹침 모양(E2·E1)", () => {
  it("5. 디버그 모드 RULE·IF·MERGE 에 점이 있고 누르면 켜지되 선택은 그대로다. 시작·끝에는 없다", async () => {
    await openView();
    await click("flow-mode-debug");
    for (const id of ["r1", "r2", "r3", "if1", "m1"]) expect(q(`flow-bp-${id}`), id).not.toBeNull();
    expect(q("flow-bp-start")).toBeNull();
    expect(q("flow-bp-end")).toBeNull();
    expect(byTestId("flow-bp-r2").getAttribute("data-on")).toBe("false");
    await click("flow-bp-r2");
    expect(byTestId("flow-bp-r2").getAttribute("data-on")).toBe("true");
    expect(byTestId("flow-bp-r2").getAttribute("aria-label")).toBe("중단점");
    expect(byTestId("flow-node-r2").getAttribute("data-selected")).toBe("false");
    expect(localStorage.getItem("rsf:bp:GT_SET")).toBe('["r2"]');

    // 보기 모드 — 켜진 것만 작은 점, 누를 수 없다.
    await click("flow-mode-view");
    expect(q("flow-bp-r1")).toBeNull();
    expect(byTestId("flow-bp-r2").getAttribute("data-on")).toBe("true");
    await click("flow-bp-r2");
    expect(byTestId("flow-bp-r2").getAttribute("data-on")).toBe("true");
    expect(localStorage.getItem("rsf:bp:GT_SET")).toBe('["r2"]');
  });

  it("6. current 굵은 테두리·next 점선·pending 회색 클래스", async () => {
    await openView();
    await click("flow-mode-debug");
    await inputAndStep(1);
    const cls = (id: string) => byTestId(`flow-node-${id}`).className;
    expect(nodeState("start")).toBe("current");
    expect(cls("start")).toContain("rsf-node-current");
    expect(cls("r1")).toContain("rsf-node-next");
    expect(cls("if1")).toContain("rsf-node-pending");
    expect(cls("r1")).not.toContain("rsf-node-pending");
  });
});

describe("변수 칩 값 툴팁(E3)", () => {
  it("7. 디버그 모드에서 칩 title 은 '이름 = 값' 또는 '이름 · 아직 없음', 낡은 기록이면 값이 없다", async () => {
    await openView();
    await click("flow-mode-debug");
    await inputAndStep(3); // 커서 3 = if1 실행 전
    const chip = (edge: string, name: string) =>
      Array.from(byTestId(`flow-edge-chips-${edge}`).querySelectorAll(".rsf-vchip")).find((c) => c.textContent === name) as HTMLElement;
    expect(chip("e2", "GT_G").getAttribute("title")).toBe("GT_G = A");
    expect(chip("e5", "GT_F").getAttribute("title")).toBe("GT_F · 아직 없음");

    // 보기 모드는 툴팁이 없다.
    await click("flow-mode-view");
    await click("flow-var-toggle");
    expect(chip("e2", "GT_G").getAttribute("title")).toBeNull();
    await click("flow-var-toggle");

    // 구조를 고쳐 기록이 낡으면 툴팁 값이 없다.
    await click("flow-mode-edit");
    await click("flow-node-if1");
    if (q("flow-right-tab-props")) await click("flow-right-tab-props");
    await typeInto(byTestId<HTMLTextAreaElement>("flow-prop-branch-e3-cond"), 'GT_G = "Z"');
    await settle(50);
    await click("flow-mode-debug");
    expect(q("dbg-stale")).not.toBeNull();
    expect(chip("e2", "GT_G").getAttribute("title")).toBeNull();
  });
});
