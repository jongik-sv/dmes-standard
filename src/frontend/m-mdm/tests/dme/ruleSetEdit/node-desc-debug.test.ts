/** @vitest-environment happy-dom */

// 노드 설명 — 디버그 모드 노드 상세에 설명이 보인다(실행된 노드·아직 실행하지 않은 노드 모두).
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

import { toEditFlow, updateNodeDesc, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { typeInto, visibleText } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

const nm = (name: string, source: "DICT" | "NONE", dataType: string | null) => ({ name, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
const io = (ruleId: string, conds: ReturnType<typeof nm>[], results: string[]): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds, results: results.map((r) => nm(r, "NONE", "STRING")),
});
const FIRST = golden("IF_FIRST_TRUE");
const COND_IO = { e3: { ok: true, message: null, vars: [nm("GT_G", "NONE", null)] } };
function flowWithDescs(): EditFlow {
  let f = toEditFlow(FIRST.flow as never, []);
  for (const [id, text] of [["r1", "첫 룰 설명\n둘째 줄"], ["r3", "아직 실행하지 않은 노드 설명"]] as const) {
    const r = updateNodeDesc(f, id, text);
    if (!r.ok) throw new Error(r.reason);
    f = r.flow;
  }
  return f;
}
const viewOf = (): RuleSetView =>
  ({
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: flowWithDescs(), branched: true },
    rules: [io("GT_GRADE", [nm("GT_THK", "DICT", "NUMBER")], ["GT_G"]), io("GT_FAST", [nm("GT_G", "NONE", null)], ["GT_F"]), io("GT_SLOW", [nm("GT_G", "NONE", null)], ["GT_S"])], checks: [], condIo: COND_IO, editable: true, restorable: false, cases: [],
  }) as RuleSetView;

describe("노드 설명 — 디버거 노드 상세", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("실행된 노드와 실행 전 노드의 상세에 설명이 보이고, 설명 없는 노드에는 없다", async () => {
    srv.replies.execute = ok(FIRST.response);
    srv.replies.validate = ok({ condIo: COND_IO });
    await openSet("GT_SET", viewOf());
    await click("flow-mode-debug");
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
    await click("dbg-step");
    await settle(50);
    await click("dbg-step");
    await settle(50);
    await click("dbg-step");
    await settle(50);
    await click("flow-node-r1");
    expect(q("sim-detail-reads")).not.toBeNull();
    expect(visibleText(byTestId("sim-detail-desc"))).toContain("첫 룰 설명");
    await click("flow-node-r3");
    expect(visibleText(byTestId("sim-detail"))).toContain("아직 실행하지 않은 노드다");
    expect(visibleText(byTestId("sim-detail-desc"))).toContain("아직 실행하지 않은 노드 설명");
    await click("flow-node-if1");
    expect(q("sim-detail-desc")).toBeNull();
  });
});
