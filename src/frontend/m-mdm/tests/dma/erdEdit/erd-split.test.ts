/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";

import { MAX_BATCH, nextSortSeq, tablePrefix } from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { SplitDialog } from "../../../pages/dma/erdEdit/canvas/SplitDialog";
import { splitCommands, subjectGroups, type SubjectGroup } from "../../../pages/dma/erdEdit/canvas/erd-split";
import type { ApplyOutcome } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson, ErdModelJson } from "../../../pages/dma/erdEdit/types";
import { settleGrid, flush } from "../../dme/helpers/render";
import { mcmModel, mcmState } from "./erd-canvas-fixtures";
import { bigState, emptyModel, relation, table } from "./erd-fixtures";
import { inDoc, mount } from "./grid-fixtures";

const modelOf = (physes: string[]): ErdModelJson => {
  const m = emptyModel();
  physes.forEach((p, i) => {
    m.tables[`t-${i}`] = table(p, p, []);
  });
  return m;
};

describe("주제별 나누기(U52)", () => {
  it("tablePrefix — 절반 넘는 표의 TB_<X>_ ; 절반 이하면 빈 글", () => {
    const names = (n: number, other: number): string[] => [
      ...Array.from({ length: n }, (_, i) => `TB_MCM_T${i}`),
      ...Array.from({ length: other }, (_, i) => (i === 0 ? "TB_X" : `TB_X${i}`)),
    ];
    expect(tablePrefix(modelOf(names(40, 2)))).toBe("TB_MCM_");
    // 정확히 절반은 "넘지" 않는다
    expect(tablePrefix(modelOf(names(2, 2)))).toBe("");
    expect(tablePrefix(modelOf(names(3, 2)))).toBe("TB_MCM_");
    expect(tablePrefix(modelOf([]))).toBe("");
    // 접두가 둘로 갈려 어느 쪽도 절반을 못 넘는다
    expect(tablePrefix(modelOf(["TB_A_1", "TB_A_2", "TB_B_1", "TB_B_2", "TB_C_1"]))).toBe("");
    expect(tablePrefix(mcmModel())).toBe("TB_MCM_");
  });

  it("subjectGroupsBoundedAndStable — 5-20개, 표마다 한 묶음, 같은 결과", () => {
    const m = mcmModel();
    const ids = Object.keys(m.tables);
    expect(ids).toHaveLength(57);
    const g = subjectGroups(m, ids);
    expect(new Set(g.flatMap((x) => x.tables)).size).toBe(ids.length);
    expect(g.flatMap((x) => x.tables)).toHaveLength(ids.length);
    for (const x of g) expect(x.tables.length).toBeLessThanOrEqual(20);
    const small = g.filter((x) => x.tables.length < 5);
    expect(small.every((x) => x.key.startsWith("기타"))).toBe(true);
    expect(small.length).toBeLessThanOrEqual(1);
    expect(g.map((x) => x.name)).toContain("SEC"); // CODE 3개는 관계가 많은 SEC 에 붙음(12+3=15)
    expect(g.find((x) => x.name === "SEC")!.tables).toHaveLength(15);
    expect(g.map((x) => x.name)).not.toContain("CODE");
    expect(g.filter((x) => x.name.startsWith("JOB"))).toHaveLength(2);
    expect(g.filter((x) => x.name.startsWith("JOB")).map((x) => x.tables.length).sort()).toEqual([10, 15]);
    // 관계 없는 17개는 "기타" 하나로 모인다
    expect(g.find((x) => x.name === "기타")!.tables).toHaveLength(17);
    expect(subjectGroups(m, [...ids].reverse())).toEqual(g);
    expect(subjectGroups(m, ids)).toEqual(g);
    // 묶음 이름순, 묶음 안 표는 물리명 순
    expect(g.map((x) => x.name)).toEqual([...g.map((x) => x.name)].sort());
    for (const x of g) {
      const physes = x.tables.map((t) => m.tables[t].phys);
      expect(physes).toEqual([...physes].sort());
    }
  });

  it("20개를 넘는 묶음의 한 덩어리는 20개 이하의 고른 조각으로 자르고(45개 = 15·15·15), 기타도 그렇다", () => {
    const m = emptyModel();
    for (let i = 0; i < 45; i++) m.tables[`t-a${i}`] = table(`TB_P_BIG_${String(i).padStart(2, "0")}`, "", []);
    // 관계로 이어진 45개 한 덩어리 → 15 + 15 + 15
    for (let i = 1; i < 45; i++) m.relations[`r-${i}`] = relation(`t-a${i}`, `t-a${i - 1}`, []);
    for (let i = 0; i < 45; i++) m.tables[`t-z${i}`] = table(`TB_P_Z${String(i).padStart(2, "0")}`, "", []);
    const g = subjectGroups(m, Object.keys(m.tables));
    const big = g.filter((x) => x.name.startsWith("BIG"));
    expect(big.map((x) => [x.name, x.tables.length])).toEqual([["BIG 1", 15], ["BIG 2", 15], ["BIG 3", 15]]);
    // Z00..Z44 는 첫 토막이 모두 달라 5 미만 묶음 45개 → 관계 없음 → 기타 15 + 15 + 15
    expect(g.filter((x) => x.name.startsWith("기타")).map((x) => [x.name, x.tables.length])).toEqual([["기타 1", 15], ["기타 2", 15], ["기타 3", 15]]);
  });

  it("21개 한 덩어리는 20 + 1 이 아니라 11 + 10 으로 자른다", () => {
    const m = emptyModel();
    for (let i = 0; i < 21; i++) m.tables[`t-${i}`] = table(`TB_P_ONE_${String(i).padStart(2, "0")}`, "", []);
    for (let i = 1; i < 21; i++) m.relations[`r-${i}`] = relation(`t-${i}`, `t-${i - 1}`, []);
    const g = subjectGroups(m, Object.keys(m.tables));
    expect(g.map((x) => [x.name, x.tables.length])).toEqual([["ONE 1", 11], ["ONE 2", 10]]);
  });

  it("묶음 이름 끝의 숫자는 수로 겨룬다(SEC 2 < SEC 10)", () => {
    const m = emptyModel();
    const n = 210; // 20개 이하 조각 11개 → 이름 1..11
    for (let i = 0; i < n; i++) m.tables[`t-${i}`] = table(`TB_P_SEC_${String(i).padStart(3, "0")}`, "", []);
    for (let i = 1; i < n; i++) m.relations[`r-${i}`] = relation(`t-${i}`, `t-${i - 1}`, []);
    const names = subjectGroups(m, Object.keys(m.tables)).map((x) => x.name);
    expect(names).toEqual(Array.from({ length: 11 }, (_, i) => `SEC ${i + 1}`));
  });

  it("5개 미만 묶음은 관계가 가장 많은 묶음에 붙고, 합쳐서 20을 넘으면 붙이지 않는다", () => {
    const m = emptyModel();
    for (let i = 0; i < 19; i++) m.tables[`t-b${i}`] = table(`TB_Q_BIG_${String(i).padStart(2, "0")}`, "", []);
    for (let i = 0; i < 6; i++) m.tables[`t-m${i}`] = table(`TB_Q_MID_${i}`, "", []);
    m.tables["t-s0"] = table("TB_Q_SMALL_0", "", []);
    m.tables["t-s1"] = table("TB_Q_SMALL_1", "", []);
    // SMALL(2개) 는 BIG(19) 와 관계 3개, MID(6) 와 관계 1개 → 19+2 > 20 이라 BIG 에는 못 붙고 MID 에 붙는다
    m.relations["r-1"] = relation("t-s0", "t-b0", []);
    m.relations["r-2"] = relation("t-s0", "t-b1", []);
    m.relations["r-3"] = relation("t-s1", "t-b2", []);
    m.relations["r-4"] = relation("t-s1", "t-m0", []);
    // 기각된 관계는 세지 않는다
    m.relations["r-5"] = relation("t-s1", "t-m1", [], { state: "REJECTED" });
    const g = subjectGroups(m, Object.keys(m.tables));
    expect(g.map((x) => [x.name, x.tables.length])).toEqual([["BIG", 19], ["MID", 8]]);
  });

  it("splitCommands — 묶음마다 addDiagram + placeTables, sortSeq 는 nextSortSeq 부터", () => {
    const state = mcmState();
    const groups = subjectGroups(state.model, Object.keys(state.model.tables));
    let n = 0;
    const out = splitCommands(state, groups, "주제별", () => `d-new${++n}`, false, 1.6);
    expect(out).toHaveLength(1);
    const cmds = out[0];
    expect(cmds).toHaveLength(groups.length * 2);
    const start = nextSortSeq(state.diagrams);
    groups.forEach((g, i) => {
      expect(cmds[i * 2]).toEqual({ op: "addDiagram", id: `d-new${i + 1}`, areaName: "주제별", diagramName: g.name, sortSeq: start + i });
      const place = cmds[i * 2 + 1] as { op: string; diagram: string; nodes: { table: string; x: number; y: number }[] };
      expect(place.op).toBe("placeTables");
      expect(place.diagram).toBe(`d-new${i + 1}`);
      expect(place.nodes.map((p) => p.table).sort()).toEqual([...g.tables].sort());
      for (const p of place.nodes) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
      }
    });
    // 같은 입력이면 같은 명령
    let k = 0;
    expect(splitCommands(state, groups, "주제별", () => `d-new${++k}`, false, 1.6)).toEqual(out);
  });

  it("splitCommands — 한 배열은 200개 이하이고 addDiagram 과 그 placeTables 는 늘 같은 배열에 있다", () => {
    const state = bigState(150, 1);
    const groups: SubjectGroup[] = Object.keys(state.model.tables).sort().map((t, i) => ({ key: `G${i}`, name: `G${i}`, tables: [t] }));
    let n = 0;
    const out = splitCommands(state, groups, "주제별", () => `d-new${++n}`, true, 1.6);
    expect(out.length).toBeGreaterThan(1);
    for (const batch of out) {
      expect(batch.length).toBeLessThanOrEqual(MAX_BATCH);
      batch.forEach((c: ErdCommandJson, i) => {
        if (c.op === "addDiagram") expect(batch[i + 1]).toMatchObject({ op: "placeTables", diagram: c.id });
      });
    }
    const adds = out.flat().filter((c) => c.op === "addDiagram");
    expect(adds).toHaveLength(150);
    // 기존 다이어그램(sortSeq 0) 다음부터 끊김 없이 이어진다
    expect(adds.map((c) => c.sortSeq)).toEqual(Array.from({ length: 150 }, (_, i) => 1 + i));
    expect(out.flat().length).toBe(300);
  });

  it("묶음이 없으면 빈 배열", () => {
    expect(splitCommands(mcmState(), [], "주제별", () => "d-x", false, 1.6)).toEqual([]);
  });
});

describe("주제별 나누기 창 — 보내는 동안", () => {
  const props = (apply: () => Promise<ApplyOutcome>, over: Record<string, unknown> = {}) => ({
    state: mcmState(), right: { ok: true, reason: null }, showAudit: false, getAspect: () => 1.6,
    apply, onClose: vi.fn(), onCreated: vi.fn(), ...over,
  });
  const press = async (id: string) => {
    await act(async () => {
      inDoc(id)!.click();
    });
    await flush();
  };

  it("응답을 기다리는 동안 취소는 꺼지고 닫히지 않으며, 끝나면 닫고 알린다", async () => {
    let done!: (o: ApplyOutcome) => void;
    const apply = vi.fn(() => new Promise<ApplyOutcome>((r) => { done = r; }));
    const p = props(apply);
    const view = await mount(h(SplitDialog, p));
    await settleGrid(inDoc("erd-split-dialog")!);
    await press("erd-split-ok");
    expect((inDoc("erd-split-cancel") as HTMLButtonElement).disabled).toBe(true);
    await press("erd-split-cancel");
    expect(p.onClose).not.toHaveBeenCalled();
    await act(async () => {
      done({ ok: true, rev: 4, warnings: [] });
    });
    await flush();
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onCreated).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("하나도 못 만들고 거절되면 \"0개 만들었습니다\" 대신 짧은 실패 글을 보인다", async () => {
    const apply = vi.fn(async (): Promise<ApplyOutcome> => ({
      ok: false, notice: { code: "INVALID", label: "", message: "거절", hint: null, commandIndex: 0, elementId: null, property: null,
        byRev: null, byUserId: null, bySession: null, current: null, mine: null, choices: null },
    }));
    const p = props(apply);
    const view = await mount(h(SplitDialog, p));
    await settleGrid(inDoc("erd-split-dialog")!);
    await press("erd-split-ok");
    expect(inDoc("erd-split-error")?.textContent).toBe("다이어그램을 만들지 못했습니다.");
    expect(p.onCreated).not.toHaveBeenCalled();
    view.unmount();
  });

  it("보내는 중에 창이 사라지면 완료를 알리지 않는다", async () => {
    let done!: (o: ApplyOutcome) => void;
    const apply = vi.fn(() => new Promise<ApplyOutcome>((r) => { done = r; }));
    const p = props(apply);
    const view = await mount(h(SplitDialog, p));
    await settleGrid(inDoc("erd-split-dialog")!);
    await press("erd-split-ok");
    expect(apply).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => {
      done({ ok: true, rev: 4, warnings: [] });
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(p.onCreated).not.toHaveBeenCalled();
  });
});
