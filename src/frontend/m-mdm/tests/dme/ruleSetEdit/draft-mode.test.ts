/** @vitest-environment happy-dom */

// 룰 버전 선택 칸(spec 2026-10-06 §7.1·§7.4) — 칸이 있고 기본값이 "적용 중(기본)", 내 DRAFT 우선일 때만 검사 기준 안내가 보인다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { recentLabel } from "../../../pages/dme/ruleSetEdit/debugger/DebugInputs";
import { DRAFT_CASES_NOTE, draftRunText, isDraftNode, modeDiffNote } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { DRAFT_CHECK_NOTE, InputForm } from "../../../pages/dme/ruleSetEdit/debugger/InputForm";
import { DRAFT_CORRUPT_TIP } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { DebugToolbar } from "../../../pages/dme/ruleSetEdit/debugger/DebugToolbar";
import { RunCompare } from "../../../pages/dme/ruleSetEdit/debugger/RunCompare";
import { TraceDetail } from "../../../pages/dme/ruleSetEdit/debugger/TraceDetail";
import type { Simulation } from "../../../pages/dme/ruleSetEdit/debugger/useSimulation";
import type { DraftVersions, RuleVersionMode } from "../../../pages/dme/ruleSetEdit/types";
import { golden } from "../helpers/rule-set-golden";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const simOf = (ruleVersions: RuleVersionMode, setRuleVersions = vi.fn()) =>
  ({ fields: [], json: "", evalTs: "", evalTsError: null, setEvalTs: vi.fn(), ruleVersions, setRuleVersions }) as unknown as Simulation;

async function mount(sim: Simulation) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(InputForm, { sim })));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("InputForm — 룰 버전 선택 칸", () => {
  it("칸이 있고 기본값은 적용 중(기본), 안내는 보이지 않는다", async () => {
    await mount(simOf("RELEASED"));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe("RELEASED");
    expect(select!.selectedOptions[0].textContent).toBe("적용 중(기본)");
    expect(container!.querySelector('[data-testid="dbg-draft-check-note"]')).toBeNull();
  });
  it("내 DRAFT 우선이면 검사 기준 안내가 보인다", async () => {
    await mount(simOf("MY_DRAFT"));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]');
    expect(select!.selectedOptions[0].textContent).toBe("내 DRAFT 우선");
    expect(container!.querySelector('[data-testid="dbg-draft-check-note"]')?.textContent).toBe(DRAFT_CHECK_NOTE);
  });
  it("선택을 바꾸면 setRuleVersions 가 불린다", async () => {
    const setRuleVersions = vi.fn();
    await mount(simOf("RELEASED", setRuleVersions));
    const select = container!.querySelector<HTMLSelectElement>('[data-testid="dbg-rule-versions"]')!;
    await act(async () => {
      select.value = "MY_DRAFT";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(setRuleVersions).toHaveBeenCalledWith("MY_DRAFT");
  });
});

describe("DRAFT 표시 판정(spec 2026-10-06 §7.4)", () => {
  const drafts = { rules: { R_A: "2.000" }, sets: { S_SUB: "2.001" } };
  it("룰 ID 와 VER 가 같을 때만 DRAFT", () => {
    expect(isDraftNode(drafts, "R_A", 2)).toBe(true);
    expect(isDraftNode(drafts, "R_A", "2.000")).toBe(true);
    expect(isDraftNode(drafts, "R_A", 1)).toBe(false);
    expect(isDraftNode(drafts, "R_B", 2)).toBe(false);
    expect(isDraftNode(drafts, null, 2)).toBe(false);
  });
  it("실행 요약과 모드 차이 문구", () => {
    expect(draftRunText(drafts)).toBe("내 DRAFT 우선으로 실행 · DRAFT 룰 1개·세트 1개");
    expect(modeDiffNote("RELEASED", "MY_DRAFT")).toBe("이전 실행은 적용 중, 지금은 내 DRAFT 우선으로 돌렸다");
    expect(modeDiffNote("MY_DRAFT", "MY_DRAFT")).toBeNull();
  });
  it("케이스 결과 안내 문구", () => {
    expect(DRAFT_CASES_NOTE).toBe("내 DRAFT 우선으로 돌렸다 — 확정 검사는 적용 중 버전으로 돌린다");
  });
  it("최근 입력 라벨은 내 DRAFT 우선 항목에만 DRAFT 를 붙인다", () => {
    expect(recentLabel("", "{}", "MY_DRAFT")).toBe("DRAFT · 지금 · {}");
    expect(recentLabel("", "{}", "RELEASED")).toBe("지금 · {}");
    expect(recentLabel("", "{}")).toBe("지금 · {}");
  });
});

describe("TraceDetail — 룰 노드 DRAFT 배지", () => {
  const g = golden("IF_FIRST_TRUE");
  const ruleNode = g.trace.nodes.find((n) => n.kind === "RULE")!;
  async function draw(ver: number | null, draftVersions?: DraftVersions) {
    const node = { ...ruleNode, ruleId: "R_A", ver };
    await mount0(createElement(TraceDetail, { nodeId: node.nodeId, node, flow: g.flow, traceViolations: [], onOpenRule: () => {}, draftVersions }));
  }
  it("그 룰의 DRAFT 버전으로 돌았으면 배지가 보인다", async () => {
    await draw(2, { rules: { R_A: "2.000" }, sets: {} });
    expect(container!.querySelector('[data-testid="sim-detail-draft"]')?.textContent).toBe("DRAFT");
  });
  it("버전이 다르거나 draftVersions 가 없으면 배지가 없다", async () => {
    await draw(1, { rules: { R_A: "2.000" }, sets: {} });
    expect(container!.querySelector('[data-testid="sim-detail-draft"]')).toBeNull();
    await draw(2);
    expect(container!.querySelector('[data-testid="sim-detail-draft"]')).toBeNull();
  });
});

describe("툴바·실행 비교 — DRAFT 안내", () => {
  const g = golden("IF_FIRST_TRUE");
  const result = (ruleVersions: RuleVersionMode) => ({ trace: g.trace, flow: g.flow, warnings: [], flowVersion: 1, input: {}, ruleVersions, draftVersions: { rules: { R_A: "2.000" }, sets: {} } });
  const toolbarSim = (over: Record<string, unknown>) =>
    ({ running: false, last: result("MY_DRAFT"), cursor: 6, pendingEdit: null, appliedEdits: [], notice: null, error: null, stale: false, ruleVersions: "MY_DRAFT", ...over }) as unknown as Simulation;
  it("내 DRAFT 우선 실행이면 요약 배지가 보이고 적용 중 실행이면 없다", async () => {
    await mount0(createElement(DebugToolbar, { sim: toolbarSim({}), canRun: true, selectedId: null }));
    expect(container!.querySelector('[data-testid="dbg-draft-run"]')?.textContent).toBe("내 DRAFT 우선으로 실행 · DRAFT 룰 1개·세트 0개");
    await mount0(createElement(DebugToolbar, { sim: toolbarSim({ last: result("RELEASED") }), canRun: true, selectedId: null }));
    expect(container!.querySelector('[data-testid="dbg-draft-run"]')).toBeNull();
  });
  it("내 DRAFT 버전이 깨진 오류는 적용 중으로 돌리는 방법을 덧붙인다", async () => {
    const msg = "룰 R 의 내 DRAFT 버전 2.000: 읽을 수 없다";
    await mount0(createElement(DebugToolbar, { sim: toolbarSim({ error: msg }), canRun: true, selectedId: null }));
    expect(container!.querySelector('[data-testid="dbg-notice"]')?.textContent).toBe(`${msg} ${DRAFT_CORRUPT_TIP}`);
    await mount0(createElement(DebugToolbar, { sim: toolbarSim({ error: msg, ruleVersions: "RELEASED" }), canRun: true, selectedId: null }));
    expect(container!.querySelector('[data-testid="dbg-notice"]')?.textContent).toBe(msg);
  });
  it("실행 비교는 두 실행의 모드가 다를 때만 안내한다", async () => {
    await mount0(createElement(RunCompare, { sim: { previous: result("RELEASED"), last: result("MY_DRAFT") } as unknown as Simulation }));
    expect(container!.querySelector('[data-testid="run-compare-mode"]')?.textContent).toBe("이전 실행은 적용 중, 지금은 내 DRAFT 우선으로 돌렸다");
    await mount0(createElement(RunCompare, { sim: { previous: result("MY_DRAFT"), last: result("MY_DRAFT") } as unknown as Simulation }));
    expect(container!.querySelector('[data-testid="run-compare-mode"]')).toBeNull();
  });
});

async function mount0(el: ReturnType<typeof createElement>) {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, el));
  });
}
