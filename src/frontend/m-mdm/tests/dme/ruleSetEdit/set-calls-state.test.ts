/** @vitest-environment happy-dom */

// 하위 세트 spec §8·§10.4(계획 Task 8 Step 3) — 상태 훅의 겉모양 맵 `calls`: view.calls 로 채우기, 모르는 세트 ID 만 묻기(받는 중·빈 응답 다시 묻지 않음),
// 다시 불러오면 늦은 응답 버리기, 다른 탭 쓰기 알림(written)에 다시 받기, 검사·structKey 반영. useRuleSetEdit 를 작은 컴포넌트(Probe)로 불러 꺼낸다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  viewSet: vi.fn(),
  saveSet: vi.fn(),
  validateFlow: vi.fn(),
  deprecateSet: vi.fn(),
  restoreSet: vi.fn(),
  callIo: vi.fn(),
}));
vi.mock("../../../pages/dme/ruleSetEdit/api", () => api);

import { flowJsonOf, insertSet, insertTask, setPositions, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { useRuleSetEdit, type RuleSetEditState } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetCallIoResult, RuleSetView, SetCallIo } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";

const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule: RuleIo = {
  ruleId: "R_A", ruleName: "R_A 이름", ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName("X")], results: [{ ...ioName("Y"), source: null }],
};
const callOf = (setId: string, outputs: string[] = ["OUT"], setName = `${setId} 세트`): SetCallIo => ({
  setId, setName, exists: true, status: "INUSE", inputs: [],
  outputs: outputs.map((name) => ({ name, dataType: null, scale: null, dateString: false, maruCodeId: null, always: true })), endsEarly: false,
});

/** start → r1(R_A) → s1(S_A) → end. */
const setFlow = (): EditFlow => ok(insertSet(toEditFlow(null, ["R_A"]), "e2", "S_A"));

function viewOf(flow: EditFlow, calls?: Record<string, SetCallIo>, setId = "E2S_MAIN"): RuleSetView {
  return {
    set: { setId, setName: "주 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["R_A"], flow: JSON.parse(flowJsonOf(flow)), branched: false },
    rules: [rule],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
    ...(calls ? { calls } : {}),
  };
}

interface Deferred<T> { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const h: { current: RuleSetEditState } = { current: null as unknown as RuleSetEditState };
let written: { setId: string; seq: number } | null = null;
function ProbeView() {
  h.current = useRuleSetEdit({ written });
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ProbeView));
  });
}
async function rerender() {
  await act(async () => {
    root!.render(createElement(ProbeView));
  });
}
async function run(fn: (s: RuleSetEditState) => unknown) {
  await act(async () => {
    await fn(h.current);
  });
}
async function flushAll() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}
async function openWith(view: RuleSetView) {
  api.viewSet.mockResolvedValue(view);
  await mount();
  await run((s) => s.open(view.set.setId));
  await run((s) => s.setMode("edit"));
}
async function notifyWritten(setId: string) {
  written = { setId, seq: (written?.seq ?? 0) + 1 };
  await rerender();
  await flushAll();
}
const asked = () => api.callIo.mock.calls.map((c) => c[0] as string[]);
const missingChecks = () => h.current.checks.filter((c) => c.code === "CALL_MISSING");

beforeEach(() => {
  installDomStorage();
  for (const f of Object.values(api)) f.mockReset();
  api.validateFlow.mockResolvedValue({ condIo: {} });
  api.callIo.mockImplementation(async (ids: string[]): Promise<RuleSetCallIoResult> => ({ calls: ids.map((id) => callOf(id)) }));
  written = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("겉모양 맵(calls) 채우기", () => {
  it("view.calls 가 있으면 묻지 않고 그 값으로 검사한다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A") }));
    await flushAll();
    expect(api.callIo).not.toHaveBeenCalled();
    expect(h.current.calls.S_A?.setName).toBe("S_A 세트");
    expect(missingChecks()).toEqual([]);
  });

  it("view.calls 가 없으면(옛 응답) 흐름의 세트 ID 를 한 번 묻고, 받으면 CALL_MISSING 이 사라진다", async () => {
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await openWith(viewOf(setFlow()));
    expect(asked()).toEqual([["S_A"]]);
    expect(missingChecks().map((c) => c.nodeId)).toEqual(["s1"]);
    await run(() => d.resolve({ calls: [callOf("S_A")] }));
    expect(h.current.calls.S_A?.exists).toBe(true);
    expect(missingChecks()).toEqual([]);
  });

  it("SET 노드를 놓으면 모르는 ID 만 묻고, 받는 중에 같은 ID 가 더 생기거나 위치만 바꿔도 다시 묻지 않는다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A") }));
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await run((s) => s.edit((f) => insertSet(f, "e1", "S_B")));
    expect(asked()).toEqual([["S_B"]]);
    await run((s) => s.edit((f) => setPositions(f, { r1: { x: 40, y: 0 } })));
    const e = h.current.flow!.edges.find((x) => x.to === "end")!;
    await run((s) => s.edit((f) => insertSet(f, e.id, "S_B")));
    expect(asked()).toEqual([["S_B"]]);
    await run(() => d.resolve({ calls: [callOf("S_B", ["P", "Q"])] }));
    expect(h.current.calls.S_B?.outputs.map((o) => o.name)).toEqual(["P", "Q"]);
    expect(Object.keys(h.current.calls).sort()).toEqual(["S_A", "S_B"]);
  });

  it("빈 응답이면 그 ID 는 다시 묻지 않는다(되풀이 없음) — 검사는 CALL_MISSING 경고로 남는다", async () => {
    api.callIo.mockResolvedValue({});
    await openWith(viewOf(setFlow()));
    await flushAll();
    await run((s) => s.edit((f) => setPositions(f, { r1: { x: 10, y: 0 } })));
    await flushAll();
    expect(asked()).toEqual([["S_A"]]);
    expect(missingChecks().map((c) => c.severity)).toEqual(["WARN"]);
    // 다른 ID 를 받아 맵이 바뀌어도 빈 응답이던 S_A 는 다시 묻지 않는다
    api.callIo.mockImplementation(async (ids: string[]): Promise<RuleSetCallIoResult> => ({ calls: ids.map((id) => callOf(id)) }));
    const e = h.current.flow!.edges.find((x) => x.to === "end")!;
    await run((s) => s.edit((f) => insertSet(f, e.id, "S_D")));
    await flushAll();
    expect(asked()).toEqual([["S_A"], ["S_D"]]);
    expect(Object.keys(h.current.calls)).toEqual(["S_D"]);
  });

  it("받는 중인 ID 는 맵이 바뀌어도 다시 묻지 않는다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A") }));
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await run((s) => s.edit((f) => insertSet(f, "e1", "S_B")));
    const e = h.current.flow!.edges.find((x) => x.to === "end")!;
    await run((s) => s.edit((f) => insertSet(f, e.id, "S_C")));
    await flushAll();
    expect(asked()).toEqual([["S_B"], ["S_C"]]);
    await run(() => d.resolve({ calls: [callOf("S_B")] }));
    await flushAll();
    expect(asked()).toEqual([["S_B"], ["S_C"]]);
    expect(Object.keys(h.current.calls).sort()).toEqual(["S_A", "S_B", "S_C"]);
  });

  it("다시 불러오면 앞서 떠난 응답은 버린다", async () => {
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await openWith(viewOf(setFlow()));
    expect(asked()).toEqual([["S_A"]]);
    api.viewSet.mockResolvedValue(viewOf(setFlow(), { S_A: callOf("S_A", ["NEW"], "새 이름") }));
    await run((s) => s.reload());
    await run(() => d.resolve({ calls: [callOf("S_A", ["OLD"], "옛 이름")] }));
    await flushAll();
    expect(h.current.calls.S_A?.setName).toBe("새 이름");
    expect(asked()).toEqual([["S_A"]]);
  });

  it("다른 세트를 열면 앞 세트의 늦은 응답은 버리고 새 세트의 겉모양만 남는다", async () => {
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await openWith(viewOf(setFlow()));
    api.viewSet.mockResolvedValue(viewOf(toEditFlow(null, ["R_A"]), {}, "E2S_OTHER"));
    await run((s) => s.open("E2S_OTHER"));
    await run(() => d.resolve({ calls: [callOf("S_A")] }));
    await flushAll();
    expect(h.current.calls).toEqual({});
  });

  it("받기에 실패하면 오류를 보이고, 흐름이 바뀌면 다시 묻는다", async () => {
    api.callIo.mockRejectedValueOnce(new Error("서버 오류"));
    await openWith(viewOf(setFlow()));
    await flushAll();
    expect(h.current.error).toBe("서버 오류");
    const e = h.current.flow!.edges.find((x) => x.to === "end")!;
    await run((s) => s.edit((f) => insertSet(f, e.id, "S_C")));
    await flushAll();
    expect(asked()).toEqual([["S_A"], ["S_A", "S_C"]]);
    expect(Object.keys(h.current.calls).sort()).toEqual(["S_A", "S_C"]);
  });

  it("받기에 실패한 ID 는 callsFailed 에 두고, 세트 ID 가 그대로인 편집(빈 단계 넣기)에도 다시 묻는다 — 위치만 바꾸면 묻지 않는다(ui:8 리뷰)", async () => {
    api.callIo.mockRejectedValueOnce(new Error("서버 오류"));
    await openWith(viewOf(setFlow()));
    await flushAll();
    expect([...h.current.callsFailed]).toEqual(["S_A"]);
    await run((s) => s.edit((f) => setPositions(f, { s1: { x: 10, y: 10 } })));
    await flushAll();
    expect(asked()).toEqual([["S_A"]]);
    const e = h.current.flow!.edges.find((x) => x.to === "end")!;
    const d = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(d.promise);
    await run((s) => s.edit((f) => insertTask(f, e.id)));
    await flushAll();
    expect(asked()).toEqual([["S_A"], ["S_A"]]);
    expect(h.current.callsFailed.size).toBe(0); // 다시 묻는 동안은 받는 중이다
    await run(() => d.resolve({ calls: [callOf("S_A")] }));
    expect(h.current.calls.S_A?.exists).toBe(true);
    expect(h.current.callsFailed.size).toBe(0);
  });

  it("받기에 실패한 ID 는 다시 불러오면 비운다", async () => {
    api.callIo.mockRejectedValueOnce(new Error("서버 오류"));
    await openWith(viewOf(setFlow()));
    await flushAll();
    expect(h.current.callsFailed.has("S_A")).toBe(true);
    api.viewSet.mockResolvedValue(viewOf(setFlow(), { S_A: callOf("S_A") }));
    await run((s) => s.reload());
    await flushAll();
    expect(h.current.callsFailed.size).toBe(0);
  });
});

describe("다른 탭 쓰기 알림(written)", () => {
  it("흐름이 부르는 세트면 이미 받았어도 다시 받는다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A", ["OLD"]) }));
    api.callIo.mockResolvedValueOnce({ calls: [callOf("S_A", ["NEW"])] });
    await notifyWritten("S_A");
    expect(asked()).toEqual([["S_A"]]);
    expect(h.current.calls.S_A?.outputs.map((o) => o.name)).toEqual(["NEW"]);
  });

  it("자기 세트·부르지 않는 세트 알림은 묻지 않는다 — 들고 있던 부르지 않는 세트의 겉모양은 버린다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A"), S_GONE: callOf("S_GONE") }));
    await notifyWritten("E2S_MAIN");
    await notifyWritten("S_ZZZ");
    expect(api.callIo).not.toHaveBeenCalled();
    await notifyWritten("S_GONE");
    expect(api.callIo).not.toHaveBeenCalled();
    expect(Object.keys(h.current.calls)).toEqual(["S_A"]);
  });

  it("마운트 때 이미 있던 알림은 새 알림이 아니다", async () => {
    written = { setId: "S_A", seq: 7 };
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A") }));
    await flushAll();
    expect(api.callIo).not.toHaveBeenCalled();
  });

  it("알림으로 다시 물으면 받는 중이던 앞 요청의 응답은 쓰지 않는다", async () => {
    const first = deferred<RuleSetCallIoResult>();
    const second = deferred<RuleSetCallIoResult>();
    api.callIo.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await openWith(viewOf(setFlow()));
    await notifyWritten("S_A");
    expect(asked()).toEqual([["S_A"], ["S_A"]]);
    await run(() => second.resolve({ calls: [callOf("S_A", ["NEW"])] }));
    await run(() => first.resolve({ calls: [callOf("S_A", ["OLD"])] }));
    await flushAll();
    expect(h.current.calls.S_A?.outputs.map((o) => o.name)).toEqual(["NEW"]);
  });

  it("refreshCalls 는 받은 ID 도 다시 묻는다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A") }));
    await run((s) => s.refreshCalls(["S_A"]));
    expect(asked()).toEqual([["S_A"]]);
  });
});

describe("structKey", () => {
  it("SET 노드의 세트를 바꾸면 flowVersion 이 오르고, 라벨만 바꾸면 그대로다", async () => {
    await openWith(viewOf(setFlow(), { S_A: callOf("S_A"), S_B: callOf("S_B") }));
    const v0 = h.current.flowVersion;
    await run((s) => s.edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === "s1" ? { ...n, label: "이름" } : n)) })));
    expect(h.current.flowVersion).toBe(v0);
    await run((s) => s.edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === "s1" ? { ...n, setId: "S_B" } : n)) })));
    expect(h.current.flowVersion).toBe(v0 + 1);
  });
});
