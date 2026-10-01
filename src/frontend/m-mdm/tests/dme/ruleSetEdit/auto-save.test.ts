/** @vitest-environment happy-dom */

// 룰 세트 편집 자동 저장(켜고 끄기) — 상태 훅 단위 테스트. useRuleSetEdit + useAutoSave 를 작은 컴포넌트(Probe)로 불러 ref 로 꺼낸다.
// api 는 vi.fn 으로 바꿔 저장 응답을 손으로 풀고, oasis-call 은 진짜(isRowVersionConflict)를 쓴다. 타이머는 가짜다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  viewSet: vi.fn(),
  saveSet: vi.fn(),
  validateFlow: vi.fn(),
  deprecateSet: vi.fn(),
  restoreSet: vi.fn(),
}));
vi.mock("../../../pages/dme/ruleSetEdit/api", () => api);

import { OasisCallError } from "@/dme/oasis-call";
import {
  addGroup,
  addNote,
  flowJsonOf,
  insertSplit,
  setGroupPad,
  setLabelOffset,
  setNodeStyle,
  setPositions,
  setRoute,
  toEditFlow,
  updateEdge,
  updateNodeDesc,
  type EditFlow,
  type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { AUTO_SAVE_DELAY_MS, useAutoSave, type AutoSave } from "../../../pages/dme/ruleSetEdit/state/useAutoSave";
import { CONFLICT_MESSAGE, useRuleSetEdit, type RuleSetEditState } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import { storeKeys } from "../../../pages/dme/ruleSetEdit/debugger/local-store";
import type { RuleIo, RuleSetCheck, RuleSetSaveResult, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";
import { goldenCases } from "../helpers/rule-set-golden";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string, exists = true): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

function chainView(opts: { missingRule?: boolean } = {}): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT"], flow: null, branched: false },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT", !opts.missingRule)],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
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

/** IF 의 "그 외" 가 아닌 선마다 읽을 수 있는 조건식 IO(변수 없음). */
async function okCondIo(json: string): Promise<{ condIo: Record<string, { ok: boolean; message: null; vars: [] }> }> {
  const fl = JSON.parse(json) as { nodes: Array<{ id: string; kind: string }>; edges: Array<{ id: string; from: string; otherwise?: boolean }> };
  const ifs = new Set(fl.nodes.filter((n) => n.kind === "IF").map((n) => n.id));
  return { condIo: Object.fromEntries(fl.edges.filter((e) => ifs.has(e.from) && !e.otherwise).map((e) => [e.id, { ok: true, message: null, vars: [] as [] }])) };
}

const saved = (rowVersion: number, checks: RuleSetCheck[] = []): RuleSetSaveResult => ({ setId: "E2S_CHAIN", rowVersion, checks });
const warn = (message: string): RuleSetCheck => ({ code: "DUP_RESULT", severity: "WARN", ruleId: "E2S_FCT", otherRuleId: null, varName: null, message, nodeId: null, edgeId: null });

interface Probe { s: RuleSetEditState; a: AutoSave }
const h: { current: Probe } = { current: null as unknown as Probe };
let canEdit = true;
function ProbeView() {
  const s = useRuleSetEdit();
  const a = useAutoSave(s, s.mode === "edit" && canEdit);
  h.current = { s, a };
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
async function run(fn: (p: Probe) => unknown) {
  await act(async () => {
    await fn(h.current);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
/** 세트를 열고 편집 모드로 둔다. */
async function openEdit(view: RuleSetView = chainView()) {
  api.viewSet.mockResolvedValue(view);
  await mount();
  await run((p) => p.s.open("E2S_CHAIN"));
  await run((p) => p.s.setMode("edit"));
}
/** 위치만 바꾸는 편집(검사·조건식 IO 에 영향 없음). */
let moveSeq = 0;
async function move() {
  moveSeq += 1;
  const x = moveSeq * 10;
  await run((p) => p.s.edit((f) => setPositions(f, { r1: { x, y: 0 } })));
}
const sentJson = (i: number) => api.saveSet.mock.calls[i][4] as string;
const sentRowVersion = (i: number) => api.saveSet.mock.calls[i][3] as number;

beforeEach(() => {
  installDomStorage();
  globalThis.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 1, 15, 42, 10));
  for (const f of Object.values(api)) f.mockReset();
  api.validateFlow.mockResolvedValue({ condIo: {} });
  canEdit = true;
  moveSeq = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe("자동 저장 — 켜고 끄기·디바운스", () => {
  it("1. 기본은 꺼짐이고, 꺼져 있으면 변경이 있어도 저장하지 않는다", async () => {
    await openEdit();
    expect(h.current.a.enabled).toBe(false);
    await move();
    expect(h.current.s.dirty).toBe(true);
    await advance(10_000);
    expect(api.saveSet).not.toHaveBeenCalled();
    expect(h.current.a.status).toBeNull();
  });

  it("2. 켜면 마지막 변경 2초 뒤 한 번 저장하고, 서버를 다시 부르지 않고 기준점·row_version 만 옮긴다", async () => {
    api.saveSet.mockResolvedValue(saved(4));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    expect(globalThis.localStorage.getItem(storeKeys.autoSave)).toBe("true");
    await move();
    await advance(AUTO_SAVE_DELAY_MS - 1);
    expect(api.saveSet).not.toHaveBeenCalled();
    await advance(1);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(api.saveSet.mock.calls[0].slice(0, 4)).toEqual(["E2S_CHAIN", "사슬", "", 3]);
    await advance(0);
    expect(h.current.s.dirty).toBe(false);
    expect(h.current.s.view!.set.rowVersion).toBe(4);
    expect(h.current.s.flow!.view.positions.r1).toEqual({ x: 10, y: 0 });
    expect(api.viewSet).toHaveBeenCalledTimes(1);
    expect(h.current.s.loading).toBe(false);
    // 정보 글은 상태 글로 내지 않고 시각만 savedAt(단추 툴팁)으로 넘긴다.
    expect(h.current.a.status).toBeNull();
    expect(h.current.a.savedAt).toBe("15:42:12");
    await advance(10_000);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
  });

  it("3. 2초 안에 연달아 바꾸면 마지막 변경 2초 뒤 한 번만 저장한다", async () => {
    api.saveSet.mockResolvedValue(saved(4));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(1000);
    await move();
    await advance(1500);
    await move();
    await advance(AUTO_SAVE_DELAY_MS - 1);
    expect(api.saveSet).not.toHaveBeenCalled();
    await advance(1);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sentJson(0)).view.positions.r1).toEqual({ x: 30, y: 0 });
  });

  it("4. 세트명·설명 변경도 저장한다", async () => {
    api.saveSet.mockResolvedValue(saved(4));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await run((p) => p.s.setSetName("사슬(고침)"));
    await advance(500);
    await run((p) => p.s.setDescription("설명"));
    await advance(AUTO_SAVE_DELAY_MS);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(api.saveSet.mock.calls[0].slice(0, 4)).toEqual(["E2S_CHAIN", "사슬(고침)", "설명", 3]);
    await advance(0);
    expect(h.current.s.dirty).toBe(false);
    expect(h.current.s.view!.set.setName).toBe("사슬(고침)");
    expect(h.current.s.view!.set.description).toBe("설명");
  });

  it("5. 켤 때 이미 변경이 있으면 2초 뒤 저장한다", async () => {
    api.saveSet.mockResolvedValue(saved(4));
    await openEdit();
    await move();
    await advance(5000);
    await run((p) => p.a.setEnabled(true));
    await advance(AUTO_SAVE_DELAY_MS - 1);
    expect(api.saveSet).not.toHaveBeenCalled();
    await advance(1);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
  });

  it("6. 끄면 기다리던 저장을 하지 않는다", async () => {
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(1000);
    await run((p) => p.a.setEnabled(false));
    await advance(10_000);
    expect(api.saveSet).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem(storeKeys.autoSave)).toBe("false");
  });
});

describe("자동 저장 — 저장하지 않는 조건", () => {
  it("7. 거부 검사가 있으면 저장하지 않고 보류 문구를 보인다", async () => {
    await openEdit(chainView({ missingRule: true }));
    await run((p) => p.a.setEnabled(true));
    await move();
    expect(h.current.s.checks.some((c) => c.severity === "REJECT")).toBe(true);
    await advance(10_000);
    expect(api.saveSet).not.toHaveBeenCalled();
    expect(h.current.a.status?.text).toBe("거부 검사가 있어 자동 저장 보류");
  });

  it("8. 보기 모드·편집 권한 없음이면 저장하지 않는다", async () => {
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await run((p) => p.s.setMode("view"));
    await move();
    await advance(10_000);
    expect(api.saveSet).not.toHaveBeenCalled();

    canEdit = false;
    await run((p) => p.s.setMode("edit"));
    await advance(10_000);
    expect(api.saveSet).not.toHaveBeenCalled();
  });

  it("9. 조건식 IO 를 기다리는 동안 저장하지 않고, 받은 뒤 2초 지나 저장한다", async () => {
    // validate 는 IF 의 "그 외" 가 아닌 선마다 읽을 수 있는 조건식(변수 없음)으로 답한다 — 거부 검사가 생기지 않는다.
    api.validateFlow.mockImplementation(async (json: string) => okCondIo(json));
    api.saveSet.mockResolvedValueOnce(saved(4)).mockResolvedValueOnce(saved(5));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    let condEdge = "";
    await run((p) =>
      p.s.edit((f) => {
        const r = insertSplit(f, f.edges[0].id, "IF");
        if (!r.ok) return r;
        const ifId = r.flow.nodes.find((n) => n.kind === "IF")!.id;
        condEdge = r.flow.edges.find((e) => e.from === ifId && !e.otherwise)!.id;
        return updateEdge(r.flow, condEdge, { cond: 'S_GRD = "A"' });
      }),
    );
    await advance(400);
    expect(h.current.s.condIoPending).toBe(false);
    expect(h.current.s.checks.some((c) => c.severity === "REJECT")).toBe(false);
    await advance(AUTO_SAVE_DELAY_MS);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    await advance(0);

    // 같은 선의 조건식을 고친다 — 응답을 붙잡아 두면 기다리는 동안 저장하지 않는다(이전 조건식 IO 로는 거부 검사가 없다).
    const held = deferred<{ condIo: Record<string, unknown> }>();
    api.validateFlow.mockReturnValueOnce(held.promise);
    await run((p) => p.s.edit((f) => updateEdge(f, condEdge, { cond: 'S_GRD = "B"' })));
    await advance(400);
    expect(h.current.s.condIoPending).toBe(true);
    expect(h.current.s.checks.some((c) => c.severity === "REJECT")).toBe(false);
    await advance(10_000);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    const lastJson = api.validateFlow.mock.calls.at(-1)![0] as string;
    await run(async () => {
      held.resolve(await okCondIo(lastJson));
    });
    expect(h.current.s.condIoPending).toBe(false);
    await advance(AUTO_SAVE_DELAY_MS);
    expect(api.saveSet).toHaveBeenCalledTimes(2);
  });
});

describe("자동 저장 — 진행 중 변경·실패", () => {
  it("10. 저장 중에 고친 내용은 사라지지 않고, 그 저장이 끝난 뒤 새 row_version 으로 다시 저장한다(동시에 두 요청 없음)", async () => {
    const first = deferred<RuleSetSaveResult>();
    api.saveSet.mockReturnValueOnce(first.promise).mockResolvedValueOnce(saved(5));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(h.current.s.autoSaving).toBe(true);
    expect(h.current.a.status).toBeNull();
    await move(); // 저장 중 변경(x=20)
    await advance(10_000);
    expect(api.saveSet).toHaveBeenCalledTimes(1);

    await run(() => {
      first.resolve(saved(4));
    });
    expect(h.current.s.autoSaving).toBe(false);
    expect(h.current.s.view!.set.rowVersion).toBe(4);
    expect(h.current.s.flow!.view.positions.r1).toEqual({ x: 20, y: 0 });
    expect(h.current.s.dirty).toBe(true);
    expect(api.viewSet).toHaveBeenCalledTimes(1);

    await advance(AUTO_SAVE_DELAY_MS - 1);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.saveSet).toHaveBeenCalledTimes(2);
    expect(sentRowVersion(1)).toBe(4);
    expect(JSON.parse(sentJson(1)).view.positions.r1).toEqual({ x: 20, y: 0 });
    await advance(0);
    expect(h.current.s.dirty).toBe(false);
    expect(h.current.s.view!.set.rowVersion).toBe(5);
  });

  it("11. 행 버전 충돌이면 자동 저장을 끄고 충돌 안내를 보인다(저장한 설정은 그대로)", async () => {
    api.saveSet.mockRejectedValue(new OasisCallError("다른 사용자가 수정했습니다", "MDM001"));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(h.current.a.enabled).toBe(false);
    expect(h.current.s.conflict).toBe(true);
    expect(h.current.s.message).toEqual({ kind: "error", text: CONFLICT_MESSAGE });
    expect(h.current.s.dirty).toBe(true);
    await move();
    await advance(10_000);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(globalThis.localStorage.getItem(storeKeys.autoSave)).toBe("true");
  });

  it("12. 다른 오류는 메시지를 보이고, 다음 변경까지 다시 시도하지 않는다", async () => {
    api.saveSet.mockRejectedValueOnce(new Error("서버가 응답하지 않는다")).mockResolvedValueOnce(saved(4));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(api.saveSet).toHaveBeenCalledTimes(1);
    expect(h.current.s.message).toEqual({ kind: "error", text: "서버가 응답하지 않는다" });
    expect(h.current.a.enabled).toBe(true);
    expect(h.current.a.status?.kind).toBe("error");
    await advance(30_000);
    expect(api.saveSet).toHaveBeenCalledTimes(1);

    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(api.saveSet).toHaveBeenCalledTimes(2);
    expect(sentRowVersion(1)).toBe(3);
    expect(h.current.s.dirty).toBe(false);
    expect(h.current.s.message).toBeNull();
  });

  it("13. 저장 응답의 경고는 메시지 줄을 띄우지 않고 상태 글에 건수와 title 로 보인다", async () => {
    api.saveSet.mockResolvedValue(saved(4, [warn("경고 하나"), warn("경고 둘")]));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(h.current.s.message).toBeNull();
    expect(h.current.a.status).toEqual({ kind: "warning", text: "자동 저장 경고 2건", title: "경고 하나\n경고 둘" });
    expect(h.current.a.savedAt).toBe("15:42:12");
  });

  it("14. 자동 저장 뒤에도 되돌리기 이력이 남고, 되돌리면 다시 dirty 가 되어 저장한다", async () => {
    api.saveSet.mockResolvedValueOnce(saved(4)).mockResolvedValueOnce(saved(5));
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(h.current.s.dirty).toBe(false);
    expect(h.current.s.canUndo).toBe(true);
    await run((p) => p.s.undo());
    expect(h.current.s.dirty).toBe(true);
    expect(h.current.s.flow!.view.positions.r1).toBeUndefined();
    await advance(AUTO_SAVE_DELAY_MS);
    expect(api.saveSet).toHaveBeenCalledTimes(2);
    expect(sentRowVersion(1)).toBe(4);
    await advance(0);
    expect(h.current.s.canRedo).toBe(true);
  });

  it("15. 저장 중에 다른 세트를 열면 늦게 온 응답은 버린다", async () => {
    const first = deferred<RuleSetSaveResult>();
    api.saveSet.mockReturnValueOnce(first.promise);
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    const other = chainView();
    other.set = { ...other.set, setId: "E2S_OTHER", rowVersion: 9 };
    api.viewSet.mockResolvedValue(other);
    await run((p) => p.s.reload());
    await run(() => {
      first.resolve(saved(4));
    });
    expect(h.current.s.view!.set.setId).toBe("E2S_OTHER");
    expect(h.current.s.view!.set.rowVersion).toBe(9);
  });
});

describe("자동 저장 — row_version 없는 응답", () => {
  it("21. 응답에 row_version 이 없으면 다음 저장이 충돌하므로 충돌처럼 자동 저장을 끄고 다시 불러오기를 안내한다", async () => {
    api.saveSet.mockResolvedValue({ setId: "E2S_CHAIN", rowVersion: null, checks: [] });
    await openEdit();
    await run((p) => p.a.setEnabled(true));
    await move();
    await advance(AUTO_SAVE_DELAY_MS);
    await advance(0);
    expect(h.current.a.enabled).toBe(false);
    expect(h.current.s.conflict).toBe(true);
    expect(h.current.s.message?.kind).toBe("error");
    expect(h.current.s.view!.set.rowVersion).toBe(3);
    expect(h.current.s.dirty).toBe(true);
  });
});

describe("자동 저장 — 설정 저장소", () => {
  it("16. 저장된 설정을 읽어 켜진 채로 시작한다", async () => {
    globalThis.localStorage.setItem(storeKeys.autoSave, "true");
    await openEdit();
    expect(h.current.a.enabled).toBe(true);
  });

  it("17. 저장소가 던져도 기본값(꺼짐)으로 동작하고 켜고 끌 수 있다", async () => {
    const get = vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("막힌 저장소");
    });
    const set = vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new Error("막힌 저장소");
    });
    try {
      api.saveSet.mockResolvedValue(saved(4));
      await openEdit();
      expect(h.current.a.enabled).toBe(false);
      await run((p) => p.a.setEnabled(true));
      expect(h.current.a.enabled).toBe(true);
      await move();
      await advance(AUTO_SAVE_DELAY_MS);
      expect(api.saveSet).toHaveBeenCalledTimes(1);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe("자동 저장 기준점 — 보낸 JSON 과 다시 계산한 기준 JSON 이 같다", () => {
  /** 자동 저장이 기준점을 옮기는 식(view.set.flow = 보낸 JSON 을 푼 값)과 dirty 비교의 기준 JSON 계산(toEditFlow → flowJsonOf). */
  const roundTrip = (json: string) => flowJsonOf(toEditFlow(JSON.parse(json), []));
  const okFlow = (r: EditResult): EditFlow => {
    if (!r.ok) throw new Error(r.reason);
    return r.flow;
  };

  it("18. 골든 흐름 전부", () => {
    expect(goldenCases.length).toBeGreaterThan(0);
    for (const c of goldenCases) {
      const json = flowJsonOf(toEditFlow(JSON.parse(c.flowJson), []));
      expect(roundTrip(json), c.name).toBe(json);
    }
  });

  it("19. 위치·메모·그룹(여백)·꺾는 점·이름표 오프셋·외관·노드 설명이 모두 있는 흐름", () => {
    let f = toEditFlow(JSON.parse(goldenCases[0].flowJson), []);
    const ruleNode = f.nodes.find((n) => n.kind === "RULE")!;
    const edge = f.edges[0];
    f = setPositions(f, Object.fromEntries(f.nodes.map((n, i) => [n.id, { x: i * 240, y: i * 10 }])));
    f = addNote(f, { x: 5, y: 6 }, ruleNode.id).flow;
    const g = addGroup(f, [ruleNode.id], "묶음");
    f = okFlow(g);
    f = okFlow(setGroupPad(f, g.id!, { l: 2, t: 10, r: 0, b: 4 }));
    f = okFlow(setRoute(f, edge.id, [{ x: 100, y: 50 }, { x: 120, y: 80 }]));
    f = okFlow(setLabelOffset(f, edge.id, "label", { dx: 12, dy: -8 }));
    f = okFlow(setNodeStyle(f, ruleNode.id, { color: "blue", w: 300, icon: "calc", shape: "pill", hide: ["id"] }));
    // 입력 중인 설명은 앞뒤 공백을 다듬지 않고, 저장 글자(flowJsonOf)에서만 지운다.
    f = okFlow(updateNodeDesc(f, ruleNode.id, "  단가를 정한다\n둘째 줄  "));
    const json = flowJsonOf(f);
    const parsed = JSON.parse(json).view;
    expect(Object.keys(parsed.positions).length).toBeGreaterThan(0);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].pad).toEqual({ l: 2, t: 10, r: 0, b: 4 });
    expect(parsed.routes[edge.id]).toHaveLength(2);
    expect(parsed.labels[edge.id]).toBeDefined();
    expect(parsed.styles[ruleNode.id]).toBeDefined();
    expect(parsed.descs[ruleNode.id]).toBe("단가를 정한다\n둘째 줄");
    expect(roundTrip(json)).toBe(json);
  });

  it("20. 한 줄 목록으로만 저장된 세트(flow null)를 처음 저장한 흐름", () => {
    const json = flowJsonOf(toEditFlow(null, ["A", "B", "C"]));
    expect(roundTrip(json)).toBe(json);
  });
});
