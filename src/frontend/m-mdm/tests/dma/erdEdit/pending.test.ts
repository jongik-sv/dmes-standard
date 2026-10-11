import { describe, expect, it } from "vitest";

import {
  enqueue, initLayers, markSending, onReloaded, onResult, onStream, onTick, pendingIds, project, projectCommand, type Layers,
} from "../../../pages/dma/erdEdit/state/pending";
import type { ErdApplyResult, ErdChange, ErdCommandJson, ErdDelta, ErdRejection } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, MENU_ROUTES, menuModel, stateOf } from "./erd-fixtures";

const ME = { userId: "tester", session: "ui-me" };
const base = (): Layers => initLayers(stateOf(menuModel(), MENU_DIAGRAMS)); // rev 3, rowVersion 0
const rename = (logical: string): ErdCommandJson => ({ op: "updateColumn", id: "c-4", set: { logical } });
const colPatch = (id: string, value: Record<string, unknown>): ErdChange => ({ kind: "column", id, op: "patch", value });
const delta = (rev: number, session: string, changes: ErdChange[], userId = "peer"): ErdDelta =>
  ({ modelId: "mcm", rev, userId, session, source: "UI", rowVersion: null, changes });
const applied = (rev: number, changes: ErdChange[], rowVersion: number | null = 1): ErdApplyResult =>
  ({ applied: true, rev, rowVersion, changes, warnings: [], rejection: null });

/** 묶음을 줄에 넣고 보내기 시작한 층. */
function sent(l: Layers, id: number, commands: ErdCommandJson[]): Layers {
  const s = markSending(enqueue(l, { id, label: `묶음 ${id}`, baseRev: l.server.rev, commands }), id);
  if (!s) throw new Error("보내기를 시작하지 못했다");
  return s.layers;
}
const logicalOf = (l: Layers, id: string) => project(l.server, l.pending).model.columns[id]?.logical;

describe("두 층 모델(스펙 4.4, 시험 8)", () => {
  it("반영: 응답 rev 가 아래층 + 1 이면 응답 델타를 얹고 묶음을 뺀다. rowVersion 과 내 rev 를 돌려준다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    expect(l.pending[0]).toMatchObject({ state: "sending", baseRev: 3 });
    expect(logicalOf(l, "c-4")).toBe("메뉴이름");
    expect(l.server.model.columns["c-4"].logical).toBe("메뉴명");
    const out = onResult(l, 1, applied(4, [colPatch("c-4", { logical: "메뉴이름" })], 7), ME, 0);
    expect(out).toMatchObject({ notice: null, reload: false, mine: 4 });
    expect(out.layers.pending).toEqual([]);
    expect([out.layers.server.rev, out.layers.server.rowVersion, out.layers.server.model.columns["c-4"].logical]).toEqual([4, 7, "메뉴이름"]);
  });

  it("거절: 묶음을 빼서 투영이 원래 값으로 돌아가고, CONFLICT 알림에 바꾼 사람·내 값을 싣는다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    const rejection: ErdRejection = {
      code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(3) 로 바뀐 값을 읽고 다시 보내세요",
      elementId: "c-4", property: "logical", byRev: 4, bySession: "ui-peer", byUserId: "41000207", current: "역할설명", choices: null, ownerId: null,
    };
    const out = onResult(l, 1, { applied: false, rev: 4, rowVersion: null, changes: [], warnings: [], rejection }, ME, 0);
    expect(out.layers.pending).toEqual([]);
    expect(logicalOf(out.layers, "c-4")).toBe("메뉴명");
    expect(out.notice).toMatchObject({ code: "CONFLICT", elementId: "c-4", property: "logical", mine: "메뉴이름", byUserId: "41000207" });
    expect(out.mine).toBeNull();
  });

  it("다른 세션 변경이 SSE 로 오면 아래층에 얹고 내 대기 묶음을 그 위에 다시 얹는다", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    const peer = onStream(l, delta(4, "ui-peer", [colPatch("c-1", { logical: "메뉴ID" })]), 0, ME);
    expect(peer.reload).toBe(false);
    const view = project(peer.layers.server, peer.layers.pending);
    expect([view.rev, view.model.columns["c-1"].logical, view.model.columns["c-4"].logical]).toEqual([4, "메뉴ID", "메뉴이름"]);
    expect(peer.layers.pending[0].state).toBe("sending");
  });

  it("pendingHoldsResultUntilStreamCatchesUp", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    // 내 응답(rev 5)이 남의 rev 4 SSE 보다 먼저 왔다 — 모델 전체를 다시 읽지 않고 보관한다
    const r = onResult(l, 1, applied(5, [colPatch("c-4", { logical: "메뉴이름" })], 9), ME, 1000);
    expect(r).toMatchObject({ reload: false, mine: 5, notice: null });
    expect(r.layers.server.rev).toBe(3);
    expect(r.layers.pending[0]).toMatchObject({ id: 1, state: "held", heldRev: 5, heldSince: 1000 });
    expect(r.layers.held.map((d) => d.rev)).toEqual([5]);
    expect(logicalOf(r.layers, "c-4")).toBe("메뉴이름"); // 보관하는 동안에도 내 값이 보인다
    expect(onTick(r.layers, 6000).reload).toBe(false);
    // rev 4 가 오면 그 뒤에 보관한 rev 5 를 얹는다
    const s = onStream(r.layers, delta(4, "ui-peer", [colPatch("c-1", { logical: "메뉴ID" })]), 2000, ME);
    expect(s.reload).toBe(false);
    expect([s.layers.server.rev, s.layers.server.rowVersion]).toEqual([5, 9]);
    expect([s.layers.server.model.columns["c-1"].logical, s.layers.server.model.columns["c-4"].logical]).toEqual(["메뉴ID", "메뉴이름"]);
    expect([s.layers.pending, s.layers.held]).toEqual([[], []]);
    // 같은 rev 의 SSE 에코는 stale 로 버린다
    const echo = onStream(s.layers, delta(5, "ui-me", [colPatch("c-4", { logical: "메뉴이름" })], "tester"), 2100, ME);
    expect(echo).toEqual({ layers: s.layers, reload: false });
  });

  it("pendingDropsBatchWhenEchoArrivesFirst", () => {
    const l = sent(base(), 1, [rename("메뉴이름")]);
    // 커밋 뒤 전달 실행기 때문에 내 묶음의 SSE 에코가 응답보다 먼저 왔다
    const e = onStream(l, delta(4, "ui-me", [colPatch("c-4", { logical: "메뉴이름" })], "tester"), 0, ME);
    expect(e.reload).toBe(false);
    expect(e.layers.server.rev).toBe(4);
    expect(e.layers.pending[0].state).toBe("echoed");
    expect(project(e.layers.server, e.layers.pending)).toBe(e.layers.server); // 투영에서 뺐다 — 두 번 그리지 않는다
    expect(pendingIds(e.layers.pending).size).toBe(0);
    const r = onResult(e.layers, 1, applied(4, [colPatch("c-4", { logical: "메뉴이름" })]), ME, 10);
    expect(r.layers.pending).toEqual([]);
    expect(r.layers.server).toBe(e.layers.server); // 늦은 응답의 델타는 다시 얹지 않는다
    expect(r.mine).toBe(4); // 내 rev 는 응답이 온 뒤에만 정해진다
    expect(r.notice).toBeNull();
  });

  it("보관이 5초를 넘거나 rev 가 비면 다시 읽게 하고, 다시 읽으면 보내지 않은 묶음 수만 센다", () => {
    let l = sent(base(), 1, [rename("메뉴이름")]);
    l = enqueue(l, { id: 2, label: "묶음 2", baseRev: 3, commands: [{ op: "confirmRelation", id: "r-1" }] });
    expect(markSending(l, 2)).toBeNull(); // 보내는 묶음이 있으면 다음 묶음은 기다린다
    const r = onResult(l, 1, applied(6, [colPatch("c-4", { logical: "메뉴이름" })]), ME, 0);
    expect(onTick(r.layers, 5000).reload).toBe(false);
    expect(onTick(r.layers, 5001).reload).toBe(true);
    expect(onStream(r.layers, delta(5, "ui-peer", []), 0, ME).reload).toBe(true); // rev 4 를 건너뛰었다
    const fresh = stateOf(menuModel(), { ...MENU_DIAGRAMS, rev: 6 });
    const back = onReloaded(r.layers, fresh);
    expect(back.dropped).toBe(1);
    expect(back.layers).toEqual({ server: fresh, pending: [], held: [] });
  });

  it("미리 그리는 명령만 투영하고, 서버가 결과를 정하는 명령은 자리표시(pendingIds)만 한다(S2-18)", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const dc = projectCommand(s, { op: "deleteColumn", id: "c-2" });
    expect([dc.model.columns["c-2"], dc.model.relations["r-1"]]).toEqual([undefined, undefined]);
    expect(dc.model.tables["t-1"].columnOrder).toEqual(["c-1", "c-4"]);
    const dt = projectCommand(s, { op: "deleteTable", id: "t-2" });
    expect(Object.keys(dt.model.tables)).toEqual(["t-1"]);
    expect([dt.model.columns["c-3"], dt.model.keys["k-2"], dt.model.relations["r-1"]]).toEqual([undefined, undefined, undefined]);
    const mv = projectCommand(s, { op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-2", x: 10, y: 20 }] });
    expect(mv.nodes["d-all:t-2"]).toMatchObject({ x: 10, y: 20 });
    expect(mv.model).toBe(s.model);
    const mc = projectCommand(s, { op: "moveColumn", id: "c-4", position: 0 });
    expect(mc.model.tables["t-1"].columnOrder).toEqual(["c-4", "c-1", "c-2"]);
    expect(projectCommand(s, { op: "addColumn", table: "t-1", logical: "비고" })).toBe(s);
    const ids = pendingIds([{ id: 1, label: "", baseRev: 3, state: "queued", commands: [
      { op: "addColumn", table: "t-1", logical: "비고" }, { op: "setFold", diagram: "d-all", tables: ["t-2"], foldMode: "KEYS" },
    ] }]);
    expect([...ids].sort()).toEqual(["t-1", "t-2"]);
  });
});

describe("경유점 명령 미리 보기(§7.1)", () => {
  const routed = () => initLayers(stateOf(menuModel(), { ...MENU_DIAGRAMS, ...MENU_ROUTES }));

  it("setRoute 는 경유점을 바꿔 보이고, clearRoutes 는 지운다. 서버층은 그대로", () => {
    const l = enqueue(routed(), { id: 1, label: "꺾임", baseRev: 3, commands: [
      { op: "setRoute", diagram: "d-all", relation: "r-1", points: [{ x: 5, y: 6 }] },
    ] });
    expect(project(l.server, l.pending).routes["d-all:r-1"].points).toEqual([{ x: 5, y: 6 }]);
    expect(l.server.routes["d-all:r-1"].points).toHaveLength(2);
    const c = enqueue(routed(), { id: 2, label: "꺾임 지움", baseRev: 3, commands: [{ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] }] });
    expect(project(c.server, c.pending).routes).toEqual({});
  });

  it("빈 points 는 미리 보이지 않고, deleteDiagram 은 그 다이어그램의 경유점을 함께 뺀다", () => {
    const e = enqueue(routed(), { id: 1, label: "빈", baseRev: 3, commands: [{ op: "setRoute", diagram: "d-all", relation: "r-1", points: [] }] });
    expect(project(e.server, e.pending).routes["d-all:r-1"].points).toHaveLength(2);
    const d = enqueue(routed(), { id: 2, label: "삭제", baseRev: 3, commands: [{ op: "deleteDiagram", id: "d-all" }] });
    expect(project(d.server, d.pending).routes).toEqual({});
  });

  it("이 버전에 없는 관계의 setRoute 는 미리 보이지 않고(서버 INVALID), 빈 relations 의 clearRoutes 는 아무것도 바꾸지 않는다(서버 no-op)", () => {
    const n = enqueue(routed(), { id: 1, label: "없는 관계", baseRev: 3, commands: [
      { op: "setRoute", diagram: "d-all", relation: "r-nope", points: [{ x: 1, y: 2 }] },
    ] });
    expect(project(n.server, n.pending).routes["d-all:r-nope"]).toBeUndefined();
    const c = enqueue(routed(), { id: 2, label: "빈 지움", baseRev: 3, commands: [{ op: "clearRoutes", diagram: "d-all", relations: [] }] });
    expect(project(c.server, c.pending).routes["d-all:r-1"].points).toHaveLength(2);
  });
});
