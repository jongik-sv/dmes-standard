/** @vitest-environment happy-dom */

// 3단계 계획 Task 5 — 디버거 훅(useSimulation) 의 기록·커서(P-D13)·중단점·여기까지(P-D14)·이전 실행·낡은 기록(P-D9)·최근 입력.
// 훅은 작은 테스트 컴포넌트(Probe)로 불러 ref 로 꺼낸다(renderHook 없음). execute 는 callOasis 목이 골든 응답을 돌려준다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oasis = vi.hoisted(() => ({ callOasis: vi.fn() }));
vi.mock("@/dme/oasis-call", () => ({ callOasis: (...args: unknown[]) => oasis.callOasis(...args) }));

import type { RuleSetSimulateResult } from "../../../pages/dme/ruleSetEdit/types";
import type { RuleIo, RuleIoMap } from "../../../pages/dme/ruleSetEdit/types";
import { toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { useSimulation, type DebugInput, type Simulation } from "../../../pages/dme/ruleSetEdit/debugger/useSimulation";
import { NOT_ON_PATH_NOTICE, PASSED_NOTICE } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { installDomStorage } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null) => ({ name: n, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s]) => ioName(n, s)), results: results.map((r) => ioName(r, null)),
  };
}
const RULES: RuleIoMap = {
  GT_GRADE: io("GT_GRADE", [["GT_THK", "DICT"]], ["GT_G"]),
  GT_FAST: io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]),
  GT_SLOW: io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"]),
};

const A = golden("IF_FIRST_TRUE"); // start, r1, if1, r2, m1, end (6)
const B = golden("IF_NULL_ELSE"); // start, r1, if1, r3, m1, end (6)
const FLOW: EditFlow = toEditFlow(A.flow, []);
const N = A.trace.nodes.length;

interface Props { flow: EditFlow | null; rules: RuleIoMap; flowVersion: number; setId: string | null }
const h: { current: Simulation } = { current: null as unknown as Simulation };
function Probe(p: Props) {
  h.current = useSimulation(p.flow, p.rules, p.flowVersion, p.setId);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let props: Props = { flow: FLOW, rules: RULES, flowVersion: 1, setId: "S1" };
/** execute 응답 줄 — 비면 A. */
let replies: Array<RuleSetSimulateResult | Promise<RuleSetSimulateResult>> = [];

const executes = () => oasis.callOasis.mock.calls.filter((c) => c[1] === "execute");
const sentRecord = (i: number) => (executes()[i][2] as { recordJson: string }).recordJson;

async function mount(p: Partial<Props> = {}) {
  props = { ...props, ...p };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Probe, props));
  });
}
async function rerender(p: Partial<Props>) {
  props = { ...props, ...p };
  await act(async () => {
    root!.render(createElement(Probe, props));
  });
}
async function run(fn: (s: Simulation) => unknown) {
  await act(async () => {
    await fn(h.current);
  });
}

beforeEach(() => {
  installDomStorage();
  globalThis.localStorage.clear();
  replies = [];
  props = { flow: FLOW, rules: RULES, flowVersion: 1, setId: "S1" };
  oasis.callOasis.mockReset();
  oasis.callOasis.mockImplementation(async (_svc: string, action: string) => {
    if (action !== "execute") return {};
    return (await replies.shift()) ?? (A.response as RuleSetSimulateResult);
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("useSimulation — 커서와 기록(P-D13)", () => {
  it("1. 기록이 없으면 cursor=-1, [한 단계] 는 한 번 실행해 0 에 두고, 뒤 단계는 서버를 다시 부르지 않는다", async () => {
    await mount();
    expect(h.current.cursor).toBe(-1);
    expect(h.current.last).toBeNull();
    await run((s) => s.setInput("GT_THK", { value: "12" }));
    await run((s) => s.next());
    expect(executes()).toHaveLength(1);
    expect(h.current.cursor).toBe(0);
    expect(h.current.last?.trace).toBe(A.trace);
    expect(h.current.last?.input).toEqual({ recordJson: '{"GT_THK":"12"}', evalTs: "" });
    await run((s) => s.next());
    await run((s) => s.next());
    expect(h.current.cursor).toBe(2);
    expect(executes()).toHaveLength(1);
    expect(h.current.variables.find((v) => v.name === "GT_G")).toMatchObject({ created: true });
    expect(h.current.valueAt("gt_g")).toEqual({ type: "STRING", value: "A" });
    expect(h.current.valueAt("GT_F")).toBeUndefined();
  });

  it("2. [이전] 은 한 칸 뒤로, [끝내기] 는 n(atEnd), [처음부터] 는 0 — 서버 호출 없음", async () => {
    await mount();
    await run((s) => s.next());
    await run((s) => s.next());
    await run((s) => s.next());
    await run((s) => s.prev());
    expect(h.current.cursor).toBe(1);
    await run((s) => s.finish());
    expect(h.current.cursor).toBe(N);
    expect(h.current.atEnd).toBe(true);
    await run((s) => s.restart());
    expect(h.current.cursor).toBe(0);
    expect(h.current.atEnd).toBe(false);
    await run((s) => s.prev());
    expect(h.current.cursor).toBe(0);
    await run((s) => s.setCursor(99));
    expect(h.current.cursor).toBe(N);
    expect(executes()).toHaveLength(1);
  });

  it("2-1. 기록이 없으면 [이전]·setCursor 는 무시, [끝내기]·[처음부터] 는 새로 실행한다", async () => {
    await mount();
    await run((s) => s.prev());
    await run((s) => s.setCursor(3));
    expect(h.current.cursor).toBe(-1);
    await run((s) => s.finish());
    expect(executes()).toHaveLength(1);
    expect(h.current.cursor).toBe(N);
  });

  it("3. 중단점 r2 를 켜고 [처음부터] 뒤 [계속] 은 r2 칸, 다시 [계속] 은 끝. 저장소 rsf:bp:<setId>", async () => {
    await mount();
    await run((s) => s.next());
    await run((s) => s.toggleBreakpoint("r2"));
    await run((s) => s.toggleBreakpoint("start")); // START 는 걸 수 없다
    await run((s) => s.toggleBreakpoint("ghost")); // 흐름에 없다
    expect([...h.current.breakpoints]).toEqual(["r2"]);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:bp:S1")!)).toEqual(["r2"]);
    await run((s) => s.restart());
    await run((s) => s.resume());
    expect(h.current.cursor).toBe(A.trace.nodes.findIndex((n) => n.nodeId === "r2"));
    await run((s) => s.resume());
    expect(h.current.cursor).toBe(N);
    expect(executes()).toHaveLength(1);
    await run((s) => s.toggleBreakpoint("r2"));
    expect(h.current.breakpoints.size).toBe(0);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:bp:S1")!)).toEqual([]);
  });

  it("3-1. 기록이 없을 때 [계속] 은 새로 실행한 뒤 커서 0 을 포함해 중단점을 찾는다(P-D14)", async () => {
    await mount();
    await run((s) => s.toggleBreakpoint("r1"));
    await run((s) => s.resume());
    expect(executes()).toHaveLength(1);
    expect(h.current.cursor).toBe(1);
  });

  it("4. [여기까지] — 안 탄 갈래면 알림, 커서 그대로. 지난 노드면 이미 지남. 다음 동작에서 알림을 지운다", async () => {
    await mount();
    await run((s) => s.next());
    await run((s) => s.next());
    await run((s) => s.runTo("r3"));
    expect(h.current.notice).toBe(NOT_ON_PATH_NOTICE);
    expect(h.current.cursor).toBe(1);
    await run((s) => s.runTo("m1"));
    expect(h.current.notice).toBeNull();
    expect(h.current.cursor).toBe(4);
    await run((s) => s.runTo("r1"));
    expect(h.current.notice).toBe(PASSED_NOTICE);
    expect(h.current.cursor).toBe(4);
    await run((s) => s.next());
    expect(h.current.notice).toBeNull();
    expect(executes()).toHaveLength(1);
  });

  it("4-1. 기록이 없을 때 [여기까지] 는 새로 실행한 뒤 커서 0 부터 찾는다", async () => {
    await mount();
    await run((s) => s.runTo("start"));
    expect(executes()).toHaveLength(1);
    expect(h.current.cursor).toBe(0);
    expect(h.current.notice).toBeNull();
  });
});

describe("useSimulation — 낡은 기록·이전 실행(P-D9)", () => {
  it("5. 흐름 구조가 바뀌면 stale·옛 멤버 result=null·clearedByEdit, last 는 그대로. [한 단계] 는 새로 실행해 0, previous = 옛 기록", async () => {
    await mount();
    await run((s) => s.next());
    await run((s) => s.next());
    const old = h.current.last;
    await rerender({ flowVersion: 2 });
    expect(h.current.stale).toBe(true);
    expect(h.current.result).toBeNull();
    expect(h.current.clearedByEdit).toBe(true);
    expect(h.current.last).toBe(old);
    expect(h.current.cursor).toBe(1);
    expect(h.current.variables.length).toBeGreaterThan(0); // 낡아도 옛 기록 기준
    replies = [B.response as RuleSetSimulateResult];
    await run((s) => s.next());
    expect(executes()).toHaveLength(2);
    expect(h.current.cursor).toBe(0);
    expect(h.current.previous).toBe(old);
    expect(h.current.last?.trace).toBe(B.trace);
    expect(h.current.last?.flowVersion).toBe(2);
    expect(h.current.stale).toBe(false);
    expect(h.current.clearedByEdit).toBe(false);
    expect(h.current.result).toBe(h.current.last);
  });

  it("5-1. 낡은 기록에서 [처음부터]·[끝내기]·[계속]·[여기까지] 도 새로 실행한다", async () => {
    await mount();
    await run((s) => s.next());
    for (const [i, act_] of ([
      (s: Simulation) => s.restart(),
      (s: Simulation) => s.finish(),
      (s: Simulation) => s.resume(),
      (s: Simulation) => s.runTo("r2"),
    ] as const).entries()) {
      await rerender({ flowVersion: 10 + i });
      expect(h.current.stale).toBe(true);
      await run(act_);
      expect(executes()).toHaveLength(2 + i);
      expect(h.current.stale).toBe(false);
    }
    expect(h.current.cursor).toBe(3); // runTo r2
  });

  it("6. 입력 A·B 를 차례로 실행하면 최근 입력이 새 것 먼저 2개, A 를 다시 하면 A 가 맨 앞으로(2개 그대로)", async () => {
    const inA: DebugInput = { recordJson: '{"GT_THK":"1"}', evalTs: "" };
    const inB: DebugInput = { recordJson: '{"GT_THK":"2"}', evalTs: "" };
    await mount();
    await run((s) => s.loadInput(inA));
    await run((s) => s.next());
    await run((s) => s.loadInput(inB));
    await run((s) => s.next());
    expect(executes()).toHaveLength(2);
    expect(sentRecord(1)).toBe(inB.recordJson);
    expect(h.current.recent).toEqual([inB, inA]);
    await run((s) => s.loadInput(inA));
    await run((s) => s.next());
    expect(executes()).toHaveLength(3);
    expect(sentRecord(2)).toBe(inA.recordJson);
    expect(h.current.recent).toEqual([inA, inB]);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:recent:S1")!)).toEqual([inA, inB]);
  });

  it("6-1. 저장소가 던져도 실행은 된다", async () => {
    const throwing = {
      getItem: () => { throw new Error("막힘"); },
      setItem: () => { throw new Error("막힘"); },
      removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
    };
    const saved = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: throwing, configurable: true, writable: true });
    try {
      await mount();
      await run((s) => s.toggleBreakpoint("r2"));
      await run((s) => s.next());
      expect(executes()).toHaveLength(1);
      expect(h.current.cursor).toBe(0);
      expect(h.current.recent).toHaveLength(1);
      expect(h.current.breakpoints.has("r2")).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: saved, configurable: true, writable: true });
    }
  });

  it("7. 세트가 바뀌면 last·previous·cursor 가 비고, 중단점은 새 세트 것을 읽되 흐름에 없는·걸 수 없는 노드는 버리고 다시 쓴다", async () => {
    globalThis.localStorage.setItem("rsf:bp:S2", JSON.stringify(["r3", "ghost", "start"]));
    globalThis.localStorage.setItem("rsf:recent:S2", JSON.stringify([{ recordJson: '{"GT_THK":"9"}', evalTs: "" }]));
    await mount();
    await run((s) => s.toggleBreakpoint("r2"));
    await run((s) => s.next());
    await run((s) => s.next());
    await rerender({ setId: "S2" });
    expect(h.current.last).toBeNull();
    expect(h.current.previous).toBeNull();
    expect(h.current.cursor).toBe(-1);
    expect([...h.current.breakpoints]).toEqual(["r3"]);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:bp:S2")!)).toEqual(["r3"]);
    expect(h.current.recent).toEqual([{ recordJson: '{"GT_THK":"9"}', evalTs: "" }]);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:bp:S1")!)).toEqual(["r2"]); // 옛 세트 것은 그대로
  });

  it("7-1. 흐름에서 노드가 빠지면 그 중단점을 버린다", async () => {
    await mount();
    await run((s) => s.toggleBreakpoint("r2"));
    await run((s) => s.toggleBreakpoint("r3"));
    const without: EditFlow = {
      ...FLOW,
      nodes: FLOW.nodes.filter((n) => n.id !== "r3"),
      edges: FLOW.edges.filter((e) => e.from !== "r3" && e.to !== "r3"),
    };
    await rerender({ flow: without, flowVersion: 2 });
    expect([...h.current.breakpoints]).toEqual(["r2"]);
    expect(JSON.parse(globalThis.localStorage.getItem("rsf:bp:S1")!)).toEqual(["r2"]);
  });

  it("8. 응답을 기다리는 동안 흐름 구조가 바뀌면 곧바로 running=false, 늦게 온 응답은 버린다", async () => {
    let release!: (v: RuleSetSimulateResult) => void;
    replies = [new Promise<RuleSetSimulateResult>((r) => { release = r; })];
    await mount();
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = h.current.next();
    });
    expect(h.current.running).toBe(true);
    await rerender({ flowVersion: 2 });
    expect(h.current.running).toBe(false);
    await act(async () => {
      release(A.response as RuleSetSimulateResult);
      await pending;
    });
    expect(h.current.last).toBeNull();
    expect(h.current.running).toBe(false);
    expect(h.current.cursor).toBe(-1);
  });

  it("8-1. 실행이 실패하면 error 문구, 기록과 커서는 그대로", async () => {
    await mount();
    await run((s) => s.next());
    await run((s) => s.next());
    const old = h.current.last;
    oasis.callOasis.mockImplementationOnce(async () => {
      throw new Error("서버 거부");
    });
    await run((s) => s.setInput("GT_THK", { value: "99" }));
    await run((s) => s.next());
    expect(h.current.error).toBe("서버 거부");
    expect(h.current.last).toBe(old);
    expect(h.current.cursor).toBe(1);
    expect(h.current.running).toBe(false);
  });
});

describe("useSimulation — 입력(P-D9)", () => {
  it("9. loadInput — 객체면 폼으로 풀고 판정 시각을 채운다, 아니면 JSON 칸에 그대로", async () => {
    await mount();
    await run((s) => s.loadInput({ recordJson: '{"GT_THK":"12"}', evalTs: "2026-06-01 09:00:00" }));
    expect(h.current.fields.find((f) => f.row.key === "GT_THK")?.row.value).toBe("12");
    expect(h.current.evalTs).toBe("2026-06-01 09:00:00");
    expect(h.current.json).toBe("");
    expect(h.current.currentInput()).toEqual({ recordJson: '{"GT_THK":"12"}', evalTs: "2026-06-01 09:00:00" });
    await run((s) => s.loadInput({ recordJson: "[1]", evalTs: "" }));
    expect(h.current.json).toBe("[1]");
    expect(h.current.jsonError).not.toBeNull();
    expect(h.current.currentInput()).toBeNull();
  });

  it("10. 같은 입력이면 서버 없이 한 칸, 입력이 바뀌면 [한 단계]·[처음부터] 가 새로 실행한다. 입력 오류면 기록·커서 그대로 둔다", async () => {
    await mount();
    await run((s) => s.setInput("GT_THK", { value: "12" }));
    await run((s) => s.next());
    await run((s) => s.next());
    await run((s) => s.next());
    expect(h.current.cursor).toBe(2);
    await run((s) => s.next());
    expect(h.current.cursor).toBe(3);
    expect(executes()).toHaveLength(1);

    const old = h.current.last;
    await run((s) => s.setInput("GT_THK", { value: "13" }));
    await run((s) => s.next());
    expect(executes()).toHaveLength(2);
    expect(sentRecord(1)).toBe('{"GT_THK":"13"}');
    expect(h.current.cursor).toBe(0);
    expect(h.current.previous).toBe(old);
    expect(h.current.stale).toBe(false);

    await run((s) => s.next());
    await run((s) => s.restart()); // 같은 입력 — 서버 없이 0
    expect(h.current.cursor).toBe(0);
    expect(executes()).toHaveLength(2);
    await run((s) => s.setEvalTs("2026-06-01 09:00:00"));
    await run((s) => s.restart()); // 판정 시각이 달라졌다 — 새로 실행
    expect(executes()).toHaveLength(3);
    expect(h.current.cursor).toBe(0);

    // 입력 오류(currentInput null) — 낡지 않은 기록이면 다르다고 보지 않고 한 칸, 서버 없음
    await run((s) => s.setJson("[1]"));
    expect(h.current.currentInput()).toBeNull();
    const kept = h.current.last;
    await run((s) => s.next());
    expect(executes()).toHaveLength(3);
    expect(h.current.cursor).toBe(1);
    expect(h.current.last).toBe(kept);
    // 낡은 기록 + 입력 오류 — 새로 실행하지 못하므로 기록·커서 그대로
    await rerender({ flowVersion: 5 });
    await run((s) => s.next());
    expect(executes()).toHaveLength(3);
    expect(h.current.last).toBe(kept);
    expect(h.current.cursor).toBe(1);
  });

  it("11. 한 처리 안에서 loadInput 뒤 곧바로 restart — 새 입력으로 한 번 실행한다(케이스 [디버그로 열기])", async () => {
    await mount();
    await run((s) => s.setInput("GT_THK", { value: "12" }));
    await run((s) => s.next());
    await act(async () => {
      h.current.loadInput({ recordJson: '{"GT_THK":"77"}', evalTs: "" });
      await h.current.restart();
    });
    expect(executes()).toHaveLength(2);
    expect(sentRecord(1)).toBe('{"GT_THK":"77"}');
    expect(h.current.cursor).toBe(0);
    expect(h.current.last?.input.recordJson).toBe('{"GT_THK":"77"}');
  });

  it("11-1. 한 처리 안에서 setInput 뒤 곧바로 next — 바뀐 입력으로 실행한다. 한 처리 안 두 번 next 도 최신 커서를 본다", async () => {
    await mount();
    await run((s) => s.next());
    await act(async () => {
      h.current.setInput("GT_THK", { value: "5" });
      await h.current.next();
    });
    expect(executes()).toHaveLength(2);
    expect(sentRecord(1)).toBe('{"GT_THK":"5"}');
    await act(async () => {
      await h.current.next();
      await h.current.next();
    });
    expect(h.current.cursor).toBe(2);
  });

  it("옛 멤버 run() — 새 실행 뒤 커서는 끝, 옛 step 은 마지막 노드. clear() 는 기록을 지운다", async () => {
    await mount();
    await run((s) => s.run());
    expect(h.current.cursor).toBe(N);
    expect(h.current.step).toBe(N - 1);
    expect(h.current.result).toBe(h.current.last);
    await run((s) => s.setStep(1));
    expect(h.current.step).toBe(1);
    await run((s) => s.clear());
    expect(h.current.last).toBeNull();
    expect(h.current.previous).toBeNull();
    expect(h.current.cursor).toBe(-1);
    expect(h.current.clearedByEdit).toBe(false);
  });
});
