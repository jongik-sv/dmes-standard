/** @vitest-environment happy-dom */

// 노드 설명 — 속성 패널 입력 → 캔버스 아이콘·툴팁, 보기 모드 읽기 전용, 되돌리기 묶기, 표시 항목 숨기기, 저장, 디버거 상세.
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

import { insertSplit, insertTask, setNodeStyle, toEditFlow, updateEdge, updateNodeDesc, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
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
  let f = toEditFlow(null, ["ND_A", "ND_B"]);
  f = must(insertTask(f, "e3"));
  f = must(insertSplit(f, "e1", "IF"));
  return must(updateEdge(f, "e5", { cond: "true" }));
}
const COND_IO = { e5: { ok: true, message: null, vars: [] }, e6: { ok: true, message: null, vars: [] } };
function viewOf(setId: string, flow: EditFlow = flowOf()): RuleSetView {
  return {
    set: { setId, setName: "설명 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["ND_A", "ND_B"], flow, branched: true },
    rules: [io("ND_A"), io("ND_B")], checks: [], condIo: COND_IO, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const withDesc = (f: EditFlow, id: string, text: string) => must(updateNodeDesc(f, id, text));
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const input = () => byTestId<HTMLTextAreaElement>("flow-prop-desc");
const icon = (id: string) => q(`flow-node-desc-${id}`);
const checkbox = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
async function saved(): Promise<EditFlow> {
  await settle(500);
  await click("set-save");
  await settle();
  return JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
}

describe("노드 설명 — 속성 패널과 캔버스", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    srv.replies.validate = ok({ condIo: COND_IO });
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("편집 모드에서 룰·빈 단계·분기·시작·끝에 입력 칸이 있고 합류에는 없다", async () => {
    await openSet("ND_1", viewOf("ND_1"));
    await click("flow-mode-edit");
    for (const id of ["r1", "r3", "if1", "start", "end"]) {
      await click(`flow-node-${id}`);
      expect(input().readOnly, id).toBe(false);
      expect(input().maxLength, id).toBe(1000);
    }
    await click("flow-node-m1");
    expect(q("flow-prop-desc")).toBeNull();
  });

  it("입력하면 캔버스 노드 제목 옆에 설명 아이콘이 생기고 title 이 설명 전체다. 지우면 아이콘이 없어진다", async () => {
    await openSet("ND_2", viewOf("ND_2"));
    await click("flow-mode-edit");
    expect(icon("r1")).toBeNull();
    await click("flow-node-r1");
    await typeInto(input(), "재고가 있을 때만\n다음 단계로 간다");
    expect(icon("r1")!.getAttribute("title")).toBe("재고가 있을 때만\n다음 단계로 간다");
    expect(icon("r2")).toBeNull();
    await typeInto(input(), "");
    expect(icon("r1")).toBeNull();
  });

  it("시작·끝·분기 노드에도 아이콘이 생긴다", async () => {
    await openSet("ND_3", viewOf("ND_3"));
    await click("flow-mode-edit");
    for (const id of ["start", "end", "if1", "r3"]) {
      await click(`flow-node-${id}`);
      await typeInto(input(), `설명 ${id}`);
      expect(icon(id)!.getAttribute("title"), id).toBe(`설명 ${id}`);
    }
  });

  it("입력하는 동안은 되돌리기 한 칸으로 묶인다", async () => {
    await openSet("ND_4", viewOf("ND_4"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(undoDisabled()).toBe(true);
    await typeInto(input(), "가");
    await typeInto(input(), "가나");
    await typeInto(input(), "가나다");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true);
    expect(icon("r1")).toBeNull();
  });

  it("보기 모드에서는 읽기 전용이고 아이콘은 보인다", async () => {
    await openSet("ND_5", viewOf("ND_5", withDesc(flowOf(), "r1", "보기 모드 설명")));
    expect(icon("r1")!.getAttribute("title")).toBe("보기 모드 설명");
    await click("flow-node-r1");
    expect(input().readOnly).toBe(true);
    expect(input().value).toBe("보기 모드 설명");
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(input().readOnly).toBe(false);
  });

  it("표시 항목 「설명 아이콘」을 끄면 룰·빈 단계 아이콘이 숨고 다시 켜면 보인다. hide 에 desc 가 저장된다", async () => {
    let f = withDesc(withDesc(flowOf(), "r1", "룰 설명"), "r3", "빈 단계 설명");
    f = must(setNodeStyle(f, "r1", { hide: ["sub"] }));
    await openSet("ND_6", viewOf("ND_6", f));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(checkbox("설명 아이콘 보이기")!.checked).toBe(true);
    await act(async () => {
      checkbox("설명 아이콘 보이기")!.click();
    });
    await flush();
    expect(icon("r1")).toBeNull();
    expect(icon("r3")).not.toBeNull();
    await click("flow-node-r3");
    expect(checkbox("설명 아이콘 보이기")!.checked).toBe(true);
    await act(async () => {
      checkbox("설명 아이콘 보이기")!.click();
    });
    await flush();
    expect(icon("r3")).toBeNull();
    await click("flow-node-r1");
    await act(async () => {
      checkbox("설명 아이콘 보이기")!.click();
    });
    await flush();
    expect(icon("r1")).not.toBeNull();
    await act(async () => {
      checkbox("설명 아이콘 보이기")!.click();
    });
    await flush();
    const out = await saved();
    expect(out.view.styles).toEqual({ r1: { hide: ["sub", "desc"] }, r3: { hide: ["desc"] } });
    expect(out.view.descs).toEqual({ r1: "룰 설명", r3: "빈 단계 설명" });
  });

  it("저장 글자 — 설명은 view.descs 의 마지막 키로 앞뒤 공백 없이 저장된다", async () => {
    await openSet("ND_7", viewOf("ND_7"));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await typeInto(input(), "  둘째 룰 설명  ");
    await click("flow-node-start");
    await typeInto(input(), "시작 설명");
    const out = await saved();
    expect(out.view.descs).toEqual({ start: "시작 설명", r2: "둘째 룰 설명" });
    expect(Object.keys(out.view).at(-1)).toBe("descs");
  });

  it("노드를 지우면 설명도 따라 지워진다", async () => {
    await openSet("ND_8", viewOf("ND_8", withDesc(withDesc(flowOf(), "r1", "지울 설명"), "r2", "남을 설명")));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-prop-delete");
    const out = await saved();
    expect(out.view.descs).toEqual({ r2: "남을 설명" });
  });
});
