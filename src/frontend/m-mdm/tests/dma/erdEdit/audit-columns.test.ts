import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIT_COLUMN_NAMES, SHOW_AUDIT_KEY, auditEndIndex, isAuditColumn, landingIndex, loadShowAudit, needsAuditReveal, saveShowAudit,
  toRealPosition, visibleColumnIds,
} from "../../../pages/dma/erdEdit/audit-columns";
import { buildFlow, type BuildFlowInput } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { nodeHeight } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { autoLayoutCommand, estimatedSize, wizardPlacement } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import { columnRows, gridRows, orderChangeCommandIn } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { jumpRows } from "../../../pages/dma/erdEdit/panels/ColumnJump";
import { enqueue, initLayers, markSending, onResult, onStream, project, projectCommand, type Layers } from "../../../pages/dma/erdEdit/state/pending";
import type { ErdApplyResult, ErdChange, ErdCommandJson, ErdDelta, ErdModelJson } from "../../../pages/dma/erdEdit/types";
import { column, emptyModel, relation, stateOf, table } from "./erd-fixtures";

const AUDIT8 = ["C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID"];

/** 표 t-1: 업무 컬럼 a1(PK)·a2·a3 뒤에 감사 8개(trailing). 표 t-2: 부모(p1 PK). */
function auditModel(order?: (audit: string[]) => string[]): ErdModelJson {
  const m = emptyModel();
  const audit = AUDIT8.map((_, i) => `u-${i}`);
  const cols = order ? order(audit) : ["a1", "a2", "a3", ...audit];
  m.tables["t-1"] = table("TB_ORDER", "주문", cols);
  m.tables["t-2"] = table("TB_PARENT", "부모", ["p1"]);
  m.columns["a1"] = column("t-1", "ORDER_ID", "주문아이디");
  m.columns["a2"] = column("t-1", "ORDER_NM", "주문명");
  m.columns["a3"] = column("t-1", "PARENT_ID", "부모아이디");
  AUDIT8.forEach((p, i) => { m.columns[`u-${i}`] = column("t-1", p, `감사${i}`); });
  m.columns["p1"] = column("t-2", "PARENT_ID", "부모아이디");
  m.keys["k-1"] = { table: "t-1", kind: "PK", name: "PK_ORDER", columns: ["a1"] };
  m.keys["k-2"] = { table: "t-2", kind: "PK", name: "PK_PARENT", columns: ["p1"] };
  m.relations["r-1"] = relation("t-1", "t-2", [["a3", "p1"]]);
  return m;
}
const DIAGRAMS = {
  diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }],
  nodes: [
    { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" as const },
    { diagram: "d-all", table: "t-2", x: 400, y: 0, foldMode: "NONE" as const },
  ],
};
const flowInput = (m: ErdModelJson, over: Partial<BuildFlowInput> = {}): BuildFlowInput => ({
  state: stateOf(m, DIAGRAMS), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: false, showAudit: false,
  statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me", ...over,
});
const physOf = (m: ErdModelJson) => (id: string) => m.columns[id]?.phys;

describe("감사 컬럼 판정", () => {
  it("정확히 8개다 — C_USR_ID·C_AT·C_SVC_ID·C_PGM_ID·U_USR_ID·U_AT·U_SVC_ID·U_PGM_ID", () => {
    expect([...AUDIT_COLUMN_NAMES]).toEqual(AUDIT8);
    expect(AUDIT_COLUMN_NAMES).toHaveLength(8);
  });

  it("물리명 대소문자를 가리지 않고 판정한다. VER 과 비슷한 이름은 감사 컬럼이 아니다", () => {
    for (const n of AUDIT8) expect(isAuditColumn(n)).toBe(true);
    expect(isAuditColumn("c_usr_id")).toBe(true);
    expect(isAuditColumn("U_At")).toBe(true);
    for (const n of ["VER", "C_USR", "C_USR_ID2", "XC_AT", "USR_ID", "", null, undefined]) expect(isAuditColumn(n as string)).toBe(false);
  });
});

describe("보기 상태 저장", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("저장한 값을 읽고, 기본은 숨김이다", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(loadShowAudit()).toBe(false);
    saveShowAudit(true);
    expect(store.get(SHOW_AUDIT_KEY)).toBe("1");
    expect(loadShowAudit()).toBe(true);
    saveShowAudit(false);
    expect(loadShowAudit()).toBe(false);
  });

  it("저장소가 던져도(읽기·쓰기) 화면은 멈추지 않고 숨김으로 돌아간다", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(loadShowAudit()).toBe(false);
    expect(() => saveShowAudit(true)).not.toThrow();
  });

  it("저장소 접근 자체가 던져도 안전하다", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadShowAudit()).toBe(false);
    expect(() => saveShowAudit(true)).not.toThrow();
  });
});

describe("자리 계산", () => {
  const m = auditModel();
  const full = m.tables["t-1"].columnOrder;

  it("auditEndIndex — 끝에 이어진 감사 덩어리의 시작. 덩어리가 없으면 길이", () => {
    expect(auditEndIndex(full, physOf(m))).toBe(3);
    expect(auditEndIndex(["a1", "a2"], physOf(m))).toBe(2);
    expect(auditEndIndex([], physOf(m))).toBe(0);
    // 가운데 감사 컬럼은 덩어리가 아니다(끝이 업무 컬럼이면 길이)
    expect(auditEndIndex(["u-0", "a1"], physOf(m))).toBe(2);
    expect(auditEndIndex(["a1", "u-0", "u-1"], physOf(m))).toBe(1);
  });

  it("landingIndex — 끝 자리는 감사 덩어리 앞(옮기는 컬럼이 감사 컬럼이면 맨 끝), 범위 안 자리는 그대로", () => {
    const rest = full.filter((c) => c !== "a1");
    expect(landingIndex(rest, rest.length, "ORDER_ID", physOf(m))).toBe(2);
    expect(landingIndex(rest, 99, "ORDER_ID", physOf(m))).toBe(2);
    expect(landingIndex(rest, rest.length, "C_AT", physOf(m))).toBe(rest.length);
    expect(landingIndex(rest, 1, "ORDER_ID", physOf(m))).toBe(1);
    expect(landingIndex(rest, -3, "ORDER_ID", physOf(m))).toBe(0);
  });

  it("toRealPosition — 걸러진 목록의 자리를 columnOrder 의 실제 인덱스로 바꾼다(가운데 감사 컬럼이 있어도)", () => {
    const full2 = ["a1", "u-1", "a2", "u-0", "a3"]; // 가져온 표 — 감사 컬럼이 끝이 아니다
    expect(toRealPosition(full2, "a1", ["a2", "a1", "a3"])).toBe(2); // rest=[u-1,a2,u-0,a3] 에서 a2(1) 바로 뒤
    expect(toRealPosition(full2, "a3", ["a3", "a1", "a2"])).toBe(0); // 맨 앞: 바로 뒤의 보이는 컬럼 a1 앞
    expect(toRealPosition(full2, "a2", ["a1", "a2", "a3"])).toBe(1); // rest=[a1,u-1,u-0,a3] 에서 a1(0) 바로 뒤
    expect(toRealPosition(full2, "a2", ["a2"])).toBeNull(); // 앞뒤 이웃이 없으면 호출자가 쓰던 자리
    expect(toRealPosition(full2, "zz", ["a1"])).toBeNull();
  });
});

describe("캔버스 노드 — 감사 컬럼 숨김", () => {
  it("꺼져 있으면 행에서 빼고 머리 배지에 숨긴 수를 싣는다. 켜면 모두 보이고 배지는 0 이다", () => {
    const off = buildFlow(flowInput(auditModel())).nodes.find((n) => n.id === "t-1")!;
    expect(off.data.rows.map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(off.data.auditHidden).toBe(8);
    expect(off.data.hiddenCount).toBe(0); // 접기가 가린 것이 아니다 — 「접힘」 줄이 뜨지 않는다
    const on = buildFlow(flowInput(auditModel(), { showAudit: true })).nodes.find((n) => n.id === "t-1")!;
    expect(on.data.rows).toHaveLength(11);
    expect(on.data.auditHidden).toBe(0);
  });

  it("감사 컬럼이 없는 표는 배지가 0 이다. PK·FK 표시는 그대로다", () => {
    const f = buildFlow(flowInput(auditModel()));
    expect(f.nodes.find((n) => n.id === "t-2")!.data.auditHidden).toBe(0);
    expect(f.nodes.find((n) => n.id === "t-1")!.data.rows.map((r) => r.key)).toEqual(["PK", "", "FK"]);
  });

  it("노드 높이는 보이는 행 수로 어림한다(빈 자리 없음)", () => {
    const n = buildFlow(flowInput(auditModel())).nodes.find((x) => x.id === "t-1")!;
    expect(n.initialHeight).toBe(nodeHeight(3, false));
    const all = buildFlow(flowInput(auditModel(), { showAudit: true })).nodes.find((x) => x.id === "t-1")!;
    expect(all.initialHeight).toBe(nodeHeight(11, false));
  });

  it("접기 KEYS: 접기가 가린 행은 hiddenCount, 감사 보기가 가린 행은 auditHidden — 겹쳐 세지 않는다", () => {
    const m = auditModel();
    const s = stateOf(m, { ...DIAGRAMS, nodes: DIAGRAMS.nodes.map((n) => (n.table === "t-1" ? { ...n, foldMode: "KEYS" as const } : n)) });
    const keys = buildFlow(flowInput(m, { state: s })).nodes.find((n) => n.id === "t-1")!.data;
    expect(keys.rows.map((r) => r.id)).toEqual(["a1", "a3"]); // PK·FK
    expect(keys.auditHidden).toBe(0); // 감사 컬럼은 키가 아니라 접기가 이미 가렸다
    expect(keys.hiddenCount).toBe(9); // a2 + 감사 8 — 보기 전환에 흔들리지 않는다
    const keysOn = buildFlow(flowInput(m, { state: s, showAudit: true })).nodes.find((n) => n.id === "t-1")!.data;
    expect(keysOn.hiddenCount).toBe(9);
    // 감사 컬럼이 UK 로 보이는 접기 행이면 감사 배지에 센다
    m.keys["k-9"] = { table: "t-1", kind: "UK", name: "UK_AUDIT", columns: ["u-1"] };
    const keysNodes = DIAGRAMS.nodes.map((n) => (n.table === "t-1" ? { ...n, foldMode: "KEYS" as const } : n));
    const uk = buildFlow(flowInput(m, { state: stateOf(m, { ...DIAGRAMS, nodes: keysNodes }) })).nodes.find((n) => n.id === "t-1")!.data;
    expect(uk.rows.map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(uk.auditHidden).toBe(1);
    expect(uk.hiddenCount).toBe(8); // a2 + 감사 중 UK 가 아닌 7
  });

  it("접기 NAME·개요 프리셋: 행이 없으니 감사 배지도 없다", () => {
    const m = auditModel();
    const nameS = stateOf(m, { ...DIAGRAMS, nodes: DIAGRAMS.nodes.map((n) => ({ ...n, foldMode: "NAME" as const })) });
    const d = buildFlow(flowInput(m, { state: nameS })).nodes.find((n) => n.id === "t-1")!.data;
    expect([d.rows.length, d.auditHidden, d.hiddenCount]).toEqual([0, 0, 11]);
    const o = buildFlow(flowInput(m, { preset: "overview" })).nodes.find((n) => n.id === "t-1")!.data;
    expect([o.rows.length, o.auditHidden, o.hiddenCount]).toEqual([0, 0, 0]);
  });

  it("관계의 짝 컬럼이 숨긴 감사 컬럼이면 표 머리 손잡이로 돌아간다. 켜면 컬럼 손잡이에 붙는다", () => {
    const m = auditModel();
    m.relations["r-1"] = relation("t-1", "t-2", [["u-0", "p1"]]); // C_USR_ID 가 FK 짝
    const off = buildFlow(flowInput(m));
    expect(off.edges[0]).toMatchObject({ source: "t-1", target: "t-2", sourceHandle: "tbl|R|s" });
    const rowHandles = off.nodes.find((n) => n.id === "t-1")!.data.rows.flatMap((r) => r.handles);
    expect(rowHandles).toEqual([]);
    const on = buildFlow(flowInput(m, { showAudit: true }));
    expect(on.edges[0].sourceHandle).toBe("u-0|R|s");
    // 부모 쪽 짝이 숨긴 감사 컬럼일 때도 같다
    m.relations["r-1"] = relation("t-2", "t-1", [["p1", "u-0"]]);
    expect(buildFlow(flowInput(m)).edges[0]).toMatchObject({ source: "t-2", target: "t-1", targetHandle: "tbl|R|t" });
  });
});

describe("크기 어림·자동 배치", () => {
  const m = auditModel();

  it("estimatedSize — showAudit=false 면 감사 행을 뺀다. 「접힘」 줄은 접기 몫만이다", () => {
    expect(estimatedSize(m, "t-1", "NONE", undefined, false).height).toBe(nodeHeight(3, false));
    expect(estimatedSize(m, "t-1", "NONE", undefined, true).height).toBe(nodeHeight(11, false));
    expect(estimatedSize(m, "t-1", "KEYS", undefined, false).height).toBe(nodeHeight(2, true)); // PK·FK + 접힘
    expect(estimatedSize(m, "t-1", "NAME", undefined, false).height).toBe(nodeHeight(0, true));
  });

  it("buildFlow 의 initialHeight 와 estimatedSize 가 같다(자동 배치 어림이 노드와 어긋나지 않는다)", () => {
    for (const showAudit of [false, true]) {
      const n = buildFlow(flowInput(m, { showAudit })).nodes.find((x) => x.id === "t-1")!;
      expect(n.initialHeight).toBe(estimatedSize(m, "t-1", "NONE", undefined, showAudit).height);
    }
  });

  it("autoLayoutCommand·wizardPlacement 가 보이는 행으로 배치한다(숨기면 더 촘촘)", () => {
    const s = stateOf(m, DIAGRAMS);
    const place = (show: boolean) => wizardPlacement(m, ["t-1", "t-2"], "grid", show);
    expect(place(false)).toHaveLength(2);
    // 자동 배치는 잰 크기가 없으면 어림 — 호출만 해도 던지지 않고 같은 규칙을 쓴다
    expect(() => autoLayoutCommand(s, "d-all", new Map(), false)).not.toThrow();
  });
});

describe("컬럼 그리드 행", () => {
  it("showAudit=false 면 감사 컬럼 행이 빠지고 순서·키 표시는 그대로다", () => {
    const m = auditModel();
    expect(columnRows(m, "t-1", null, false).map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
    expect(columnRows(m, "t-1", null, true)).toHaveLength(11);
    expect(gridRows(m, "t-1", null, new Set(), true, false).map((r) => [r.id, r.key])).toEqual([["a1", "PK"], ["a2", ""], ["a3", "FK"]]);
  });

  it("visibleColumnIds — 모델에 없는 컬럼 id 는 어느 쪽에서도 뺀다", () => {
    const m = auditModel();
    m.tables["t-1"].columnOrder.push("ghost");
    expect(visibleColumnIds(m, "t-1", true)).toHaveLength(11);
    expect(visibleColumnIds(m, "t-1", false)).toEqual(["a1", "a2", "a3"]);
    expect(visibleColumnIds(m, "nope", true)).toEqual([]);
  });
});

describe("행 끌기 자리 → 실제 columnOrder 인덱스", () => {
  const importedOrder = ["a1", "u-1", "a2", "u-0", "a3"]; // 가져온 표 — 감사 컬럼이 끝이 아니라 사이에 섞여 있다
  const m = auditModel(() => importedOrder);
  const phys = physOf(m);
  const vis = visibleColumnIds(m, "t-1", false); // [a1, a2, a3]

  it("a1 을 a2 뒤로 끌면 보이는 자리(1)가 아니라 실제 자리(2)로 보낸다 — 서버 결과가 의도한 순서다", () => {
    // 보이는 자리(1)를 그대로 보내면 [u-1, a1, a2, ...] 가 되어 보이는 순서가 a1 a2 a3 로 그대로다(끌기가 무시된다)
    const naive = importedOrder.filter((c) => c !== "a1");
    naive.splice(1, 0, "a1");
    expect(naive.filter((c) => vis.includes(c))).toEqual(["a1", "a2", "a3"]);
    const cmd = orderChangeCommandIn(importedOrder, vis, ["a2", "a1", "a3"], phys)!;
    expect(cmd).toMatchObject({ op: "moveColumn", id: "a1" });
    expect(cmd.position).toBe(2); // rest=[u-1,a2,u-0,a3] 에서 a2(1) 뒤 = 2 (보이는 자리 1 과 다르다)
    const sim = importedOrder.filter((c) => c !== "a1");
    sim.splice(cmd.position as number, 0, "a1");
    expect(sim).toEqual(["u-1", "a2", "a1", "u-0", "a3"]);
    expect(sim.filter((c) => vis.includes(c))).toEqual(["a2", "a1", "a3"]);
  });

  it("맨 위로 끌면 바로 뒤의 보이는 컬럼 앞이다", () => {
    const cmd = orderChangeCommandIn(importedOrder, vis, ["a3", "a1", "a2"], phys)!;
    expect(cmd.position).toBe(0);
  });

  it("끝에 이어진 감사 덩어리 앞으로 가는 끝 자리는 범위 안 자리라 그대로 간다(서버가 건드리지 않는다)", () => {
    const m2 = auditModel(); // a1,a2,a3 + 감사 8
    const v2 = visibleColumnIds(m2, "t-1", false);
    const cmd = orderChangeCommandIn(m2.tables["t-1"].columnOrder, v2, ["a2", "a3", "a1"], physOf(m2))!;
    expect(cmd).toEqual({ op: "moveColumn", id: "a1", position: 2 });
  });

  it("보이는 목록이 곧 전체(감사 컬럼이 없거나 보기 켬)면 단계 2 끌기 명령과 같다", () => {
    const m3 = auditModel(() => ["a1", "a2", "a3"]);
    const full = m3.tables["t-1"].columnOrder;
    expect(orderChangeCommandIn(full, full, ["a2", "a3", "a1"], physOf(m3))).toEqual({ op: "moveColumn", id: "a1", position: 2 });
    expect(orderChangeCommandIn(full, full, ["a3", "a1", "a2"], physOf(m3))).toEqual({ op: "moveColumn", id: "a3", position: 0 });
    expect(orderChangeCommandIn(full, full, full, physOf(m3))).toBeNull();
  });
});

describe("컬럼 점프·찾기", () => {
  it("jumpRows 는 가려진 감사 컬럼도 찾는다(물리명)", () => {
    const m = auditModel();
    expect(jumpRows(m, "t-1", "c_usr").rows.map((r) => r.column)).toEqual(["C_USR_ID"]);
    expect(jumpRows(m, null, "U_AT").rows.map((r) => r.column)).toEqual(["U_AT"]);
  });

  it("needsAuditReveal — 보기가 꺼져 있고 감사 컬럼일 때만 켠다", () => {
    const m = auditModel();
    expect(needsAuditReveal(m, "u-3", false)).toBe(true);
    expect(needsAuditReveal(m, "u-3", true)).toBe(false);
    expect(needsAuditReveal(m, "a1", false)).toBe(false);
    expect(needsAuditReveal(m, "ghost", false)).toBe(false);
  });
});

describe("대기 모델 — 감사 컬럼 8개가 응답·에코로 들어온다", () => {
  const ME = { userId: "tester", session: "ui-me" };
  const addTable: ErdCommandJson = { op: "addTable", id: "t-new", phys: "TB_NEW", logical: "새 표" };
  const place: ErdCommandJson = { op: "placeTables", diagram: "d-all", nodes: [{ table: "t-new", x: 10, y: 20 }] };
  const base = (): Layers => initLayers(stateOf(auditModel(() => ["a1", "a2", "a3"]), DIAGRAMS)); // rev 3

  /** 서버가 보낼 델타 — 표(columnOrder 에 감사 8개) + 컬럼 8개 + 다이어그램 노드. */
  const serverChanges = (): ErdChange[] => [
    { kind: "table", id: "t-new", op: "put", value: { phys: "TB_NEW", logical: "새 표", comment: null, columnOrder: AUDIT8.map((_, i) => `n-${i}`) } },
    ...AUDIT8.map((p, i): ErdChange => ({ kind: "column", id: `n-${i}`, op: "put", value: column("t-new", p, `감사${i}`) })),
    { kind: "diagramNode", id: "d-all:t-new", op: "put", value: { diagram: "d-all", table: "t-new", x: 10, y: 20, foldMode: "NONE" } },
  ];
  const applied = (rev: number): ErdApplyResult => ({ applied: true, rev, rowVersion: 1, changes: serverChanges(), warnings: [], rejection: null });
  const echo = (rev: number): ErdDelta => ({ modelId: "mcm", rev, userId: "tester", session: "ui-me", source: "UI", rowVersion: 1, changes: serverChanges() });
  const sent = (l: Layers): Layers => markSending(enqueue(l, { id: 1, label: "표 추가", baseRev: l.server.rev, commands: [addTable, place] }), 1)!.layers;
  const cols = (l: Layers) => {
    const s = project(l.server, l.pending);
    return { order: s.model.tables["t-new"]?.columnOrder, count: Object.values(s.model.columns).filter((c) => c.table === "t-new").length };
  };

  it("미리 그린 표는 컬럼이 없고(S2-18), 응답 델타가 오면 표를 갈아 끼워 감사 컬럼 8개가 보인다(중복 없음)", () => {
    const l = sent(base());
    expect(cols(l)).toEqual({ order: [], count: 0 });
    const out = onResult(l, 1, applied(4), ME, 0);
    expect(out.reload).toBe(false);
    expect(out.layers.pending).toEqual([]);
    expect(cols(out.layers)).toEqual({ order: AUDIT8.map((_, i) => `n-${i}`), count: 8 });
    // 노드 하나, 표 하나
    const s = project(out.layers.server, out.layers.pending);
    expect(Object.keys(s.model.tables).filter((t) => t === "t-new")).toHaveLength(1);
    expect(Object.values(s.nodes).filter((n) => n.table === "t-new")).toHaveLength(1);
  });

  it("에코가 응답보다 먼저 와도 8개이고, 늦은 응답은 다시 얹지 않는다", () => {
    const l = sent(base());
    const e = onStream(l, echo(4), 0, ME);
    expect(e.reload).toBe(false);
    expect(e.layers.pending[0].state).toBe("echoed");
    expect(cols(e.layers)).toEqual({ order: AUDIT8.map((_, i) => `n-${i}`), count: 8 });
    const late = onResult(e.layers, 1, applied(4), ME, 0);
    expect(late.layers.pending).toEqual([]);
    expect(cols(late.layers).count).toBe(8);
  });

  it("에코 뒤 같은 에코가 또 와도(재전송) 중복되지 않는다", () => {
    const l = sent(base());
    const first = onStream(l, echo(4), 0, ME);
    const again = onStream(first.layers, echo(4), 0, ME);
    expect(again.layers).toBe(first.layers);
  });

  it("moveColumn 미리보기도 서버와 같다 — 끝 자리는 끝 감사 덩어리 앞, 감사 컬럼은 맨 끝, 범위 안은 그대로", () => {
    const s = stateOf(auditModel(), DIAGRAMS); // a1 a2 a3 + 감사 8
    const order = (cmd: ErdCommandJson) => projectCommand(s, cmd).model.tables["t-1"].columnOrder;
    const endBefore = order({ op: "moveColumn", id: "a1", position: 99 });
    expect(endBefore.slice(0, 3)).toEqual(["a2", "a3", "a1"]);
    expect(endBefore.slice(3)).toEqual(["u-0", "u-1", "u-2", "u-3", "u-4", "u-5", "u-6", "u-7"]);
    const audit = order({ op: "moveColumn", id: "u-0", position: 99 });
    expect(audit.at(-1)).toBe("u-0");
    expect(order({ op: "moveColumn", id: "a3", position: 1 }).slice(0, 3)).toEqual(["a1", "a3", "a2"]);
    // 감사 덩어리가 없는 표의 끝은 진짜 끝
    const plain = stateOf(auditModel(() => ["a1", "a2", "a3"]), DIAGRAMS);
    expect(projectCommand(plain, { op: "moveColumn", id: "a1", position: 99 }).model.tables["t-1"].columnOrder).toEqual(["a2", "a3", "a1"]);
  });
});
