import assert from "node:assert/strict";
import test from "node:test";
import { InputError, applyFlow, changesFlow, claimFlow, newState, parseCommands, releaseAll, releaseFlow, undoFlow } from "../lib/flows.mjs";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, VIEW } from "./fixtures/erd-view.mjs";

/** 부른 action·params 를 기록하는 가짜 클라이언트. createOasisClient 와 같은 모양({config, call}). */
function fakeClient(respond, session = "claude-test") {
  const calls = [];
  return {
    calls,
    config: { session, user: "erd-mcp-a", source: "MCP" },
    call: async (action, params) => {
      calls.push([action, params]);
      return respond(action, params, calls);
    },
  };
}

/** VIEW 는 rev 12. rev 11 은 화면 세션, rev 13 은 내 세션(claude-test) 변경이다. */
function server({ save = () => APPLIED_13, restore = () => ({ ...APPLIED_13, rev: 14 }), deltas = [DELTA_UI_11, DELTA_ME_13] } = {}) {
  return (action, params) => {
    if (action === "restore") {
      // 되돌리기도 서버에는 내 세션의 새 델타(되돌리기로 생긴 rev)로 남는다. 저장되지 않는 시험 실행은 남지 않는다.
      const r = restore(params);
      if (r.applied && !params.dryRun) deltas.push({ ...DELTA_ME_13, rev: r.rev, changes: [] });
      return r;
    }
    if (action === "view" && params.sinceRev != null) return { rev: 13, reload: false, deltas: deltas.filter((d) => d.rev > params.sinceRev) };
    if (action === "view") return VIEW;
    if (action === "save") return save(params);
    if (action === "execute") return params.kind === "CLAIM" ? { ok: true, claimedBy: "claude-test", userId: "erd-mcp-a", expiresAt: "2026-10-11T05:20:00Z" } : { ok: true };
    throw new Error(`모르는 요청 ${action}`);
  };
}

test("apply: 이름을 풀어 호출자의 baseRev 로 보낸다(view 의 rev 가 아니다), 다른 세션 변경을 읽는다", async () => {
  const c = fakeClient(server());
  const state = newState();
  const out = await applyFlow(c, state, { modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU_NM", set: { logical: "메뉴이름" } }] });
  assert.equal(out.isError, false);
  const [view, save, since] = c.calls;
  assert.deepEqual(view, ["view", { modelId: "mcm" }]);
  assert.equal(save[0], "save");
  assert.equal(save[1].baseRev, 10); // VIEW.rev 는 12 다
  assert.equal(save[1].dryRun, undefined); // false 는 싣지 않는다
  assert.deepEqual(JSON.parse(save[1].commandsJson), [{ op: "updateColumn", id: "c-m3", set: { logical: "메뉴이름" } }]);
  assert.deepEqual(since, ["view", { modelId: "mcm", sinceRev: 10 }]);
  assert.match(out.text, /^baseRev 뒤 다른 세션 변경 1건: ui-41000207 rev 11, TB_MCM_SEC_OBJ\. getChangesSince\(10\) 로 확인하세요\.$/m);
  assert.deepEqual(state.applied.get("mcm"), [13]);
});

test("apply: JSON 글 commands·dryRun, 이름 풀기 실패는 save 를 부르지 않는다, 입력 오류", async () => {
  const c = fakeClient(server({ save: () => ({ ...APPLIED_13, applied: false, rev: 12, dryRun: true }) }));
  const state = newState();
  const out = await applyFlow(c, state, { modelId: "mcm", baseRev: 12, commands: '[{"op":"updateColumn","id":"c-m1","set":{"comment":"x"}}]', dryRun: true });
  assert.equal(c.calls[1][1].dryRun, true);
  assert.equal(out.text.split("\n")[0], "시험 실행(저장 안 함) · 통과");
  assert.equal(state.applied.size, 0); // 시험 실행은 되돌릴 대상이 아니다
  assert.equal(c.calls.length, 2); // rev 12 = baseRev 12 → 다른 세션 변경을 읽지 않는다

  const bad = fakeClient(server());
  const miss = await applyFlow(bad, newState(), { modelId: "mcm", baseRev: 12, commands: [{ op: "updateColumn", id: "TB_MCM_SEC_MENU.NOPE", set: {} }] });
  assert.equal(miss.isError, true);
  assert.match(miss.text, /^이름 풀기 실패 1건/);
  assert.deepEqual(bad.calls.map((x) => x[0]), ["view"]);

  assert.throws(() => parseCommands("{x"), InputError);
  assert.throws(() => parseCommands([]), /명령은 1~200개입니다\(0개\)/);
  assert.throws(() => parseCommands(Array.from({ length: 201 }, () => ({ op: "x" }))), /201개/);
  assert.throws(() => parseCommands([{ id: "c-1" }]), /명령 #1 에 op 가 없습니다/);
});

test("apply 거절: 결과 글은 isError, 다른 세션 변경은 읽지 않는다", async () => {
  const c = fakeClient(server({ save: () => ({ applied: false, rev: 12, changes: [], warnings: [], rejection: CONFLICT_REJECTION }) }));
  const out = await applyFlow(c, newState(), { modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "c-m3", set: { logical: "x" } }] });
  assert.equal(out.isError, true);
  assert.match(out.text, /^거절 CONFLICT/);
  assert.deepEqual(c.calls.map((x) => x[0]), ["view", "save"]);
});

test("undo: rev 를 빼면 이 프로세스의 마지막 반영, 되돌린 rev 는 다시 고르지 않는다, 재시작 뒤에는 내 세션 델타를 찾는다", async () => {
  const c = fakeClient(server());
  const state = newState();
  await applyFlow(c, state, { modelId: "mcm", baseRev: 12, commands: [{ op: "updateColumn", id: "c-m3", set: { logical: "메뉴이름" } }] });
  c.calls.length = 0;
  const first = await undoFlow(c, state, { modelId: "mcm" });
  assert.deepEqual(c.calls, [
    ["view", { modelId: "mcm" }],
    ["view", { modelId: "mcm", sinceRev: 12 }],
    ["restore", { modelId: "mcm", rev: 13, dryRun: undefined }],
  ]);
  assert.match(first.text, /^되돌린 변경: rev 13 · 41000207 \(세션 claude-test\) · 1건$/m);
  // 13 은 되돌렸고, 되돌리기로 생긴 rev 14(내 세션 델타)도 다시 고르지 않는다(되돌리기의 되돌리기 = 다시 하기 방지) → 찾지 못한다.
  const before = c.calls.length;
  const again = await undoFlow(c, state, { modelId: "mcm" });
  assert.equal(again.isError, true);
  assert.match(again.text, /^되돌릴 rev 를 찾지 못했습니다/);
  assert.equal(c.calls.slice(before).some((x) => x[0] === "restore"), false); // 서버에 restore 를 보내지 않았다
  // 재시작(새 상태): 최근 500 rev 에서 내 세션의 마지막 델타.
  const fresh = fakeClient(server());
  await undoFlow(fresh, newState(), { modelId: "mcm", dryRun: true });
  assert.deepEqual(fresh.calls[1], ["view", { modelId: "mcm", sinceRev: 0 }]);
  assert.deepEqual(fresh.calls.at(-1), ["restore", { modelId: "mcm", rev: 13, dryRun: true }]);
  // rev 를 주면 그 rev 를 되돌리고 누가 했는지 읽는다.
  const given = fakeClient(server());
  const out = await undoFlow(given, newState(), { modelId: "mcm", rev: 11 });
  assert.deepEqual(given.calls.at(-1), ["restore", { modelId: "mcm", rev: 11, dryRun: undefined }]);
  assert.match(out.text, /^되돌린 변경: rev 11 · 41000207 \(세션 ui-41000207\) · 1건$/m);
});

/** server() 에 다시 읽기 지점을 더한다. 서버 규칙대로 sinceRev 가 marker 보다 작으면 reload(fromRev 는 withFromRev 일 때만 — 옛 서버는 없다). */
function markerServer(marker, { withFromRev = true, ...opts } = {}) {
  const base = server(opts);
  return (action, params, calls) => {
    if (action === "view" && params.sinceRev != null && params.sinceRev < marker) {
      return { rev: 13, reload: true, deltas: [], ...(withFromRev ? { fromRev: marker } : {}) };
    }
    return base(action, params, calls);
  };
}

test("undo: 재시작 뒤 찾는 구간 앞에 다시 읽기 지점(copy 로 만든 DRAFT)이 있으면 fromRev 부터 한 번 더 읽어 내 세션 델타를 찾는다", async () => {
  // defect.mcpUndoReload: 다시 읽기 지점 rev 10. sinceRev 0 은 reload·fromRev 10 이다.
  const c = fakeClient(markerServer(10));
  const out = await undoFlow(c, newState(), { modelId: "mcm" });
  assert.equal(out.isError, false);
  assert.deepEqual(c.calls, [
    ["view", { modelId: "mcm" }],
    ["view", { modelId: "mcm", sinceRev: 0 }],
    ["view", { modelId: "mcm", sinceRev: 10 }],
    ["view", { modelId: "mcm", sinceRev: 12 }],
    ["restore", { modelId: "mcm", rev: 13, dryRun: undefined }],
  ]);
  assert.match(out.text, /^되돌린 변경: rev 13 · 41000207 \(세션 claude-test\) · 1건$/m);
});

test("undo: fromRev 가 없는 reload(옛 서버)는 다시 읽지 않고 찾지 못했다고 알린다. rev 를 줄 때 그 rev 가 다시 읽기 지점 앞이면 누가 했는지 없이 되돌린다", async () => {
  const old = fakeClient(markerServer(10, { withFromRev: false }));
  const out = await undoFlow(old, newState(), { modelId: "mcm" });
  assert.equal(out.isError, true);
  assert.match(out.text, /^되돌릴 rev 를 찾지 못했습니다/);
  assert.deepEqual(old.calls.filter((x) => x[0] === "view" && x[1].sinceRev != null).map((x) => x[1].sinceRev), [0]);
  assert.equal(old.calls.some((x) => x[0] === "restore"), false);
  // rev 11 은 다시 읽기 지점(11) 앞이다: sinceRev 10 → reload·fromRev 11 → 한 번 더 읽어도 rev 11 은 없다. restore 는 보낸다(서버가 판정).
  const given = fakeClient(markerServer(11));
  const g = await undoFlow(given, newState(), { modelId: "mcm", rev: 11 });
  assert.deepEqual(given.calls.filter((x) => x[0] === "view" && x[1].sinceRev != null).map((x) => x[1].sinceRev), [10, 11]);
  assert.deepEqual(given.calls.at(-1), ["restore", { modelId: "mcm", rev: 11, dryRun: undefined }]);
  assert.doesNotMatch(g.text, /세션 ui-41000207/);
});

test("claim·release: 물리명 → t- id, 잡은 표는 상태에 두고 tables 없는 release·종료 때 놓는다", async () => {
  const c = fakeClient(server());
  const state = newState();
  const got = await claimFlow(c, state, { modelId: "mcm", tables: ["TB_MCM_SEC_MENU", "TB_NOPE"] });
  assert.deepEqual(c.calls[1], ["execute", { modelId: "mcm", kind: "CLAIM", tableId: "t-menu" }]);
  assert.equal(got.isError, false);
  assert.match(got.text, /^TB_MCM_SEC_MENU 잡음 · /m);
  assert.match(got.text, /^없는 표 "TB_NOPE": 없는 표입니다/m);
  assert.deepEqual([...state.claimed.get("mcm")], ["t-menu"]);
  await claimFlow(c, state, { modelId: "mcm", tables: "TB_MCM_SEC_OBJ" });
  c.calls.length = 0;
  const rel = await releaseFlow(c, state, { modelId: "mcm", tables: ["TB_MCM_SEC_OBJ"] });
  assert.deepEqual(c.calls[1], ["execute", { modelId: "mcm", kind: "RELEASE", tableId: "t-obj" }]);
  assert.match(rel.text, /^TB_MCM_SEC_OBJ 놓음$/m);
  assert.equal(await releaseAll(c, state), 1); // t-menu 하나 남았다
  assert.deepEqual(c.calls.at(-1), ["execute", { modelId: "mcm", kind: "RELEASE", tableId: "t-menu" }]);
  const none = await releaseFlow(c, state, { modelId: "mcm" });
  assert.match(none.text, /잡은 표가 없습니다/);
  await assert.rejects(claimFlow(c, state, { modelId: "mcm", tables: Array.from({ length: 21 }, (_, i) => `T${i}`) }), /20개까지/);
});

test("changes: view sinceRev + 이름 풀기용 view, reload 면 view 를 읽지 않는다", async () => {
  const c = fakeClient(server());
  const out = await changesFlow(c, { modelId: "mcm", rev: 10, excludeMine: true });
  assert.deepEqual(c.calls, [["view", { modelId: "mcm", sinceRev: 10 }], ["view", { modelId: "mcm" }]]);
  assert.match(out.text, /^rev 11 41000207\/ui-41000207 UI: table upsert TB_MCM_SEC_OBJ \(logical\)$/m);
  const r = fakeClient(() => ({ rev: 900, reload: true, deltas: [] }));
  const re = await changesFlow(r, { modelId: "mcm", rev: 10 });
  assert.equal(r.calls.length, 1);
  assert.match(re.text, /^# reload/);
});
