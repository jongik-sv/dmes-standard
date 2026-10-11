import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { handlers } from "../erd-mcp.mjs";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success, withRoutes } from "./fixtures/fake-oasis.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-mcp.mjs");
const TOOL_NAMES = [
  "apply", "claimTable", "confirmRelation", "getChangesSince", "getCurrentView", "getDbDiff",
  "getModelText", "importModel", "listDiagrams", "listInferredRelations", "listModels", "listViolations", "registerModel",
  "rejectRelation", "releaseTable", "undo",
];

/** VIEW 는 rev 12. save 는 baseRev 5 면 CONFLICT, dryRun 이면 통과(저장 안 함), 아니면 rev 13 반영. restore 는 rev 14. */
function route(action, params) {
  if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
  if (action === "view" && params.kind === "STATUS") return success(STATUS);
  if (action === "view" && params.sinceRev != null) {
    return success({ rev: 13, reload: false, deltas: [DELTA_UI_11, DELTA_ME_13].filter((d) => d.rev > params.sinceRev) });
  }
  if (action === "view") return success(VIEW);
  if (action === "compare" && params.kind === "DB_DIFF") return success({ modelId: "mcm", rev: 12, schema: "MCMAPUSER", items: [] });
  if (action === "save" && params.baseRev === 5) return success({ applied: false, rev: 12, rowVersion: null, dryRun: false, changes: [], warnings: [], rejection: { ...CONFLICT_REJECTION, hint: "getChangesSince(5) 로 바뀐 값을 읽고 다시 보내세요" } });
  if (action === "save" && params.dryRun === true) return success({ ...APPLIED_13, applied: false, rev: 12, rowVersion: null, dryRun: true });
  if (action === "save") return success(APPLIED_13);
  if (action === "restore") return success({ ...APPLIED_13, rev: 14, rowVersion: 5 });
  if (action === "execute" && params.kind === "CLAIM") return success({ ok: true, claimedBy: params.session, userId: "41000207", expiresAt: "2026-10-11T05:20:00Z" });
  if (action === "execute") return success({ ok: true });
  return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
}

/** erd-mcp.mjs 를 stdio 로 띄운다. env 는 자식 환경에 더해진다(SDK 기본 환경 HOME·PATH 등 + env). */
async function startMcp(fake, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ERD_BASE: fake.url, ERD_USER: "41000207", ...env },
    stderr: "pipe",
  });
  const out = { log: "", protocolErrors: [] };
  transport.stderr?.on("data", (c) => (out.log += c));
  const client = new Client({ name: "erd-mcp-test", version: "0.0.0" });
  client.onerror = (e) => out.protocolErrors.push(e); // stdout 에 프로토콜이 아닌 글이 섞이면 SDK 가 onerror 로만 알린다
  await client.connect(transport);
  return Object.assign(out, { client });
}

const text = (r) => r.content.map((c) => c.text).join("\n");

test("stdio MCP 서버: 도구 16개, 읽기 도구 그대로, 모든 요청에 session·source", async () => {
  const fake = await startFakeOasis(route);
  const mcp = await startMcp(fake, { ERD_SESSION: "claude-test" });
  try {
    const ins = mcp.client.getInstructions() ?? "";
    assert.match(ins, /getCurrentView 로 사용자가 화면에서 보는/);
    assert.match(ins, /내 세션 이름: claude-test\./);
    assert.match(ins, /baseRev 는 마지막으로 읽은 rev\(getModelText 머리줄, getChangesSince 결과, 마지막 apply 결과\)다\. 더 큰 rev 를 짐작하지 마세요\./);
    assert.doesNotMatch(ins, /단계 2 에서 추가/);

    const { tools } = await mcp.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOL_NAMES);
    const gm = tools.find((t) => t.name === "getModelText");
    assert.deepEqual(gm.inputSchema.required, ["modelId"]);
    assert.equal(gm._meta?.["anthropic/maxResultSizeChars"], 100000);
    const ap = tools.find((t) => t.name === "apply");
    assert.deepEqual([...ap.inputSchema.required].sort(), ["baseRev", "commands", "modelId"]);
    assert.ok(ap.inputSchema.properties.dryRun);
    assert.deepEqual(tools.find((t) => t.name === "undo").inputSchema.required, ["modelId"]);
    assert.deepEqual(tools.find((t) => t.name === "releaseTable").inputSchema.required, ["modelId"]);

    const gmText = await mcp.client.callTool({ name: "getModelText", arguments: { modelId: "mcm" } });
    assert.equal(gmText.content[0].text, GOLDEN);
    const statusReq = fake.requests.find((r) => r.params.kind === "STATUS");
    assert.deepEqual(statusReq.params, { modelId: "mcm", kind: "STATUS", ver: "1.000", session: "claude-test", source: "MCP" });
    assert.equal(statusReq.headers["x-authenticated-user"], "41000207");

    const since = await mcp.client.callTool({ name: "getChangesSince", arguments: { modelId: "mcm", rev: 10 } });
    assert.equal(since.content.length, 1); // 원래 JSON 은 raw 일 때만
    assert.match(text(since), /^rev 11 41000207\/ui-41000207 UI: table upsert TB_MCM_SEC_OBJ \(logical\)$/m);
    const raw = await mcp.client.callTool({ name: "getChangesSince", arguments: { modelId: "mcm", rev: 10, excludeMine: true, raw: true } });
    assert.equal(raw.content.length, 2);
    assert.deepEqual(JSON.parse(raw.content[1].text).deltas.map((d) => d.rev), [11]);

    const missing = await mcp.client.callTool({ name: "getModelText", arguments: { modelId: "nope" } });
    assert.equal(missing.isError, true);
    assert.match(text(missing), /^\[MDM029\] ERD 모델이 없습니다\n다음: modelId 를 확인하세요/);

    assert.ok(fake.requests.every((r) => r.params.session === "claude-test" && r.params.source === "MCP"));
    assert.match(mcp.log, /erd-mcp 시작: http:\/\/127\.0\.0\.1:\d+ · 사용자 41000207 · 역할 MDM_STEWARD · 세션 claude-test/);
    assert.deepEqual(mcp.protocolErrors, []);
  } finally {
    await mcp.client.close();
    await fake.close();
  }
});

test("stdio MCP 쓰기: 이름으로 쓴 apply, JSON 글 commands 와 dryRun, CONFLICT, undo, claim", async () => {
  const fake = await startFakeOasis(route);
  const mcp = await startMcp(fake, { ERD_SESSION: "claude-test" });
  const saves = () => fake.requests.filter((r) => r.action === "save");
  try {
    // 물리명으로 쓴 명령(마감 07 6-1 모양). set 같은 모르는 키가 zod 를 지나 서버까지 간다(looseObject).
    const applied = await mcp.client.callTool({
      name: "apply",
      arguments: { modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU_NM", set: { logical: "메뉴이름" } }] },
    });
    assert.equal(applied.isError ?? false, false);
    const s1 = saves()[0].params;
    assert.deepEqual(
      { baseRev: s1.baseRev, session: s1.session, source: s1.source, dryRun: s1.dryRun, commands: JSON.parse(s1.commandsJson) },
      { baseRev: 10, session: "claude-test", source: "MCP", dryRun: undefined, commands: [{ op: "updateColumn", id: "c-m3", set: { logical: "메뉴이름" } }] },
    );
    const lines = text(applied).split("\n");
    assert.equal(lines[0], "반영 rev 13 (baseRev 10) · 변경 1 · 경고 0 · 세션 claude-test");
    assert.ok(lines.includes("baseRev 뒤 다른 세션 변경 1건: ui-41000207 rev 11, TB_MCM_SEC_OBJ. getChangesSince(10) 로 확인하세요."));
    assert.equal(lines.at(-1), "다음 baseRev: 13");

    // commands 를 JSON 글로(마감 07 9-1 모양), id 그대로, 시험 실행.
    const dry = await mcp.client.callTool({
      name: "apply",
      arguments: { modelId: "mcm", baseRev: 12, commands: JSON.stringify([{ op: "updateColumn", id: "c-m1", set: { comment: "x" } }]), dryRun: true },
    });
    assert.equal(saves()[1].params.dryRun, true);
    assert.equal(text(dry).split("\n")[0], "시험 실행(저장 안 함) · 통과");

    const conflict = await mcp.client.callTool({ name: "apply", arguments: { modelId: "mcm", baseRev: 5, commands: [{ op: "updateColumn", id: "c-m3", set: { logical: "x" } }] } });
    assert.equal(conflict.isError, true);
    assert.match(text(conflict), /^거절 CONFLICT · 명령 #1 updateColumn TB_MCM_SEC_MENU\.MENU_NM\.logical · 저장한 것 없음$/m);
    assert.match(text(conflict), /^바꾼 사람: 41000207 \(세션 ui-41000207\) rev 11 · 지금 값: "메뉴명"$/m);
    assert.match(text(conflict), /^다음: getChangesSince\(5\) 로/m);

    const unknown = await mcp.client.callTool({ name: "apply", arguments: { modelId: "mcm", baseRev: 12, commands: [{ op: "updateColumn", id: "TB_NOPE.X", set: {} }] } });
    assert.equal(unknown.isError, true);
    assert.match(text(unknown), /TB_NOPE\.X/); // 글이 풀지 못한 값을 가리킨다
    assert.equal(saves().length, 3); // 이름 풀기 실패는 save 를 부르지 않는다

    const badJson = await mcp.client.callTool({ name: "apply", arguments: { modelId: "mcm", baseRev: 12, commands: "[{op" } });
    assert.equal(badJson.isError, true);
    assert.match(text(badJson), /^commands 를 JSON 으로 읽을 수 없습니다.*\n다음: 입력을 고쳐 다시 부르세요\.$/);

    const confirm = await mcp.client.callTool({ name: "confirmRelation", arguments: { modelId: "mcm", baseRev: 12, relation: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" } });
    assert.equal(confirm.isError ?? false, false);
    assert.deepEqual(JSON.parse(saves()[3].params.commandsJson), [{ op: "confirmRelation", id: "r-1" }]);

    // rev 없는 undo: 이 프로세스가 마지막으로 반영한 rev 13(확정의 rev 도 13 이라 같다).
    const undo = await mcp.client.callTool({ name: "undo", arguments: { modelId: "mcm" } });
    const restore = fake.requests.filter((r) => r.action === "restore");
    assert.deepEqual([restore.length, restore[0].params.rev, restore[0].params.session], [1, 13, "claude-test"]);
    assert.match(text(undo), /^되돌린 변경: rev 13 · 41000207 \(세션 claude-test\) · 1건$/m);

    const claim = await mcp.client.callTool({ name: "claimTable", arguments: { modelId: "mcm", tables: ["TB_MCM_SEC_MENU"] } });
    const exec = fake.requests.find((r) => r.action === "execute").params;
    assert.deepEqual([exec.kind, exec.tableId, exec.session, exec.source], ["CLAIM", "t-menu", "claude-test", "MCP"]);
    assert.match(text(claim), /^TB_MCM_SEC_MENU 잡음 · \d\d:\d\d\([+-]\d\d:\d\d\)까지$/m);

    const reject = await mcp.client.callTool({ name: "rejectRelation", arguments: { modelId: "mcm", baseRev: 13, relation: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" } });
    assert.equal(reject.isError ?? false, false);
    assert.deepEqual(JSON.parse(saves()[4].params.commandsJson), [{ op: "rejectRelation", id: "r-1" }]);
    assert.equal(saves()[4].params.baseRev, 13);

    const release = await mcp.client.callTool({ name: "releaseTable", arguments: { modelId: "mcm", tables: ["TB_MCM_SEC_MENU"] } });
    assert.equal(release.isError ?? false, false);
    const rel = fake.requests.filter((r) => r.action === "execute" && r.params.kind === "RELEASE");
    assert.deepEqual(rel.map((r) => [r.params.tableId, r.params.session, r.params.source]), [["t-menu", "claude-test", "MCP"]]);
    assert.match(text(release), /^TB_MCM_SEC_MENU 놓음/m);
    assert.deepEqual(mcp.protocolErrors, []);
  } finally {
    await mcp.client.close();
    await fake.close();
  }
});

test("종료하면 이 프로세스가 잡은 표를 놓는다(한 번만)", async () => {
  const fake = await startFakeOasis(route);
  const mcp = await startMcp(fake, { ERD_SESSION: "claude-exit" });
  await mcp.client.callTool({ name: "claimTable", arguments: { modelId: "mcm", tables: "TB_MCM_SEC_MENU,TB_MCM_SEC_OBJ" } });
  await mcp.client.close(); // 표준 입력을 닫는다(2초 안에 안 끝나면 SDK 가 SIGTERM)
  try {
    const releases = () => fake.requests.filter((r) => r.action === "execute" && r.params.kind === "RELEASE");
    for (let i = 0; i < 50 && (releases().length < 2 || !/erd-mcp 종료\(/.test(mcp.log)); i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(releases().map((r) => r.params.tableId).sort(), ["t-menu", "t-obj"]);
    assert.ok(releases().every((r) => r.params.session === "claude-exit"));
    assert.match(mcp.log, /erd-mcp 종료\(.+\): 잡은 표 2개를 놓아 봤다/);
    // 표준 입력 닫힘과 SIGTERM 이 겹쳐도 놓기는 한 번만 돈다: 잠시 뒤에도 요청 2건, 종료 로그 1줄.
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(releases().length, 2);
    assert.equal(mcp.log.split("erd-mcp 종료(").length - 1, 1);
  } finally {
    await fake.close();
  }
});

test("ERD_SESSION=auto 면 프로세스마다 자기 CLAUDE_CODE_SESSION_ID 로 이름을 만든다", async () => {
  const fake = await startFakeOasis(route);
  const a = await startMcp(fake, { ERD_SESSION: "auto", CLAUDE_CODE_SESSION_ID: "aaaaaaaa-1111-4111-8111-111111111111" });
  const b = await startMcp(fake, { ERD_SESSION: "auto", CLAUDE_CODE_SESSION_ID: "bbbbbbbb-2222-4222-8222-222222222222" });
  try {
    await a.client.callTool({ name: "getCurrentView", arguments: { modelId: "mcm" } });
    await b.client.callTool({ name: "getCurrentView", arguments: { modelId: "mcm" } });
    assert.deepEqual(fake.requests.map((r) => r.params.session).sort(), ["claude-aaaaaaaa", "claude-bbbbbbbb"]);
    assert.match(a.client.getInstructions(), /내 세션 이름: claude-aaaaaaaa\./);
  } finally {
    await a.client.close();
    await b.client.close();
    await fake.close();
  }
});

/** 부른 action·params 를 기록하는 가짜 클라이언트. */
function recordingClient(respond) {
  const calls = [];
  return {
    calls,
    config: { user: "u", role: "r", session: "claude-rec", source: "MCP" },
    call: async (action, params) => {
      calls.push([action, params]);
      return respond(action, params);
    },
  };
}

const answer = (action, params) => {
  if (action === "view" && params.kind === "STATUS") return STATUS;
  if (action === "view" && params.sinceRev != null) return { rev: 12, reload: false, deltas: [] };
  if (action === "view") return VIEW;
  return { modelId: "mcm", rev: 12, schema: "MCMAPUSER", items: [] };
};

test("읽기 도구마다 부르는 OASIS 액션과 params", async () => {
  const c = recordingClient(answer);
  const h = handlers(c);
  await h.getCurrentView({ modelId: "mcm", session: "ui-41000207" });
  await h.listViolations({ modelId: "mcm", status: "MISS" });
  await h.listInferredRelations({ modelId: "mcm", includeFolded: true });
  await h.getDbDiff({ modelId: "mcm" });
  assert.deepEqual(c.calls, [
    ["view", { modelId: "mcm" }],
    ["view", { modelId: "mcm" }],
    ["view", { modelId: "mcm", kind: "STATUS", ver: "1.000" }],
    ["view", { modelId: "mcm" }],
    ["compare", { modelId: "mcm", kind: "DB_DIFF" }],
  ]);
  const only = await handlers(recordingClient(answer)).listViolations({ modelId: "mcm", status: "MISS" });
  assert.equal(only.content[0].text.split("\n").length, 2);
  const folded = await handlers(recordingClient(answer)).listInferredRelations({ modelId: "mcm", includeFolded: true });
  assert.match(folded.content[0].text, /후보 2/);
});

test("쓰기 도구마다 부르는 OASIS 액션과 params(이름은 id 로 풀려 save·restore·execute 에 간다)", async () => {
  const respond = (action, params) => {
    if (action === "save") return APPLIED_13;
    if (action === "restore") return { ...APPLIED_13, rev: 14, rowVersion: 5 };
    if (action === "execute") return { ok: true, claimedBy: "claude-rec", userId: "u", expiresAt: "2026-10-11T05:20:00Z" };
    return answer(action, params);
  };
  const writes = (c) => c.calls.filter(([a]) => ["save", "restore", "execute"].includes(a));
  const c = recordingClient(respond);
  const h = handlers(c);

  await h.apply({ modelId: "mcm", baseRev: 12, commands: [{ op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU_NM", set: { logical: "x" } }], dryRun: true });
  await h.undo({ modelId: "mcm", rev: 13 });
  await h.claimTable({ modelId: "mcm", tables: ["TB_MCM_SEC_MENU"] });
  await h.releaseTable({ modelId: "mcm", tables: ["TB_MCM_SEC_MENU"] });
  const [save, restore, claim, release] = writes(c);

  assert.equal(save[0], "save");
  assert.deepEqual(
    { ...save[1], commandsJson: JSON.parse(save[1].commandsJson) },
    { modelId: "mcm", baseRev: 12, dryRun: true, commandsJson: [{ op: "updateColumn", id: "c-m3", set: { logical: "x" } }] },
  );
  assert.deepEqual(restore, ["restore", { modelId: "mcm", rev: 13, dryRun: undefined }]);
  assert.deepEqual(claim, ["execute", { modelId: "mcm", kind: "CLAIM", tableId: "t-menu" }]);
  assert.deepEqual(release, ["execute", { modelId: "mcm", kind: "RELEASE", tableId: "t-menu" }]);
  assert.equal(writes(c).length, 4);

  // confirmRelation·rejectRelation 도 같은 save 이고, 관계는 id 로 풀린다. dryRun 을 안 주면 params 에 싣지 않는다.
  const c2 = recordingClient(respond);
  const h2 = handlers(c2);
  const rel = "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID";
  await h2.confirmRelation({ modelId: "mcm", baseRev: 12, relation: rel });
  await h2.rejectRelation({ modelId: "mcm", baseRev: 12, relation: rel });
  const saves = writes(c2);
  assert.deepEqual(saves.map(([a]) => a), ["save", "save"]);
  assert.deepEqual(saves.map(([, p]) => JSON.parse(p.commandsJson)), [[{ op: "confirmRelation", id: "r-1" }], [{ op: "rejectRelation", id: "r-1" }]]);
  assert.ok(saves.every(([, p]) => p.modelId === "mcm" && p.baseRev === 12 && p.dryRun === undefined));
});

test("STATUS·DB_DIFF 를 모르는 서버의 응답은 빈 결과가 아니라 오류로 올라온다", async () => {
  // 옛 서버: view kind=STATUS 가 모델 view 를 그대로 주고, compare 는 items 가 없다.
  const old = (action) => (action === "compare" ? { modelId: "mcm", rev: 12 } : VIEW);
  const h = handlers(recordingClient(old));
  await assert.rejects(h.listViolations({ modelId: "mcm" }), /view kind=STATUS 응답 모양이 다릅니다/);
  await assert.rejects(h.getModelText({ modelId: "mcm" }), /view kind=STATUS/);
  await assert.rejects(h.getDbDiff({ modelId: "mcm" }), /compare kind=DB_DIFF 응답 모양이 다릅니다/);
});

test("stdio MCP 경유점: setRoute·clearRoutes 를 이름으로 보내고 getModelText diagram·getCurrentView·getChangesSince 에 보인다", async () => {
  const fake = await startFakeOasis(withRoutes(route));
  const mcp = await startMcp(fake, { ERD_SESSION: "claude-test" });
  const REL = "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID";
  try {
    const set = await mcp.client.callTool({
      name: "apply",
      arguments: { modelId: "mcm", baseRev: 12, commands: [{ op: "setRoute", diagram: "메뉴/메뉴 화면", relation: REL, points: [{ x: 120, y: 40 }, { x: 120, y: 200 }] }] },
    });
    assert.equal(set.isError ?? false, false, text(set));
    assert.deepEqual(JSON.parse(fake.requests.find((r) => r.action === "save").params.commandsJson), [
      { op: "setRoute", diagram: "d-menu", relation: "r-1", points: [{ x: 120, y: 40 }, { x: 120, y: 200 }] },
    ]);
    assert.match(text(set), /^diagramRoute upsert 메뉴\/메뉴 화면:TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID via \(120,40\) → \(120,200\)$/m);

    const model = await mcp.client.callTool({ name: "getModelText", arguments: { modelId: "mcm", diagram: "d-menu" } });
    assert.match(text(model), /^Ref TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID INFERRED .*\n {2}via \(120,40\) → \(120,200\)$/m);
    const cur = await mcp.client.callTool({ name: "getCurrentView", arguments: { modelId: "mcm" } });
    assert.match(text(cur), /^경유점 메뉴\/메뉴 화면 1개:\n {2}TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID: \(120,40\) → \(120,200\)$/m);
    const ch = await mcp.client.callTool({ name: "getChangesSince", arguments: { modelId: "mcm", rev: 12 } });
    assert.match(text(ch), /diagramRoute upsert 메뉴\/메뉴 화면:TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID via \(120,40\) → \(120,200\)/);

    const clear = await mcp.client.callTool({
      name: "apply",
      arguments: { modelId: "mcm", baseRev: 13, commands: [{ op: "clearRoutes", diagram: "d-menu", relations: [REL] }] },
    });
    assert.equal(clear.isError ?? false, false, text(clear));
    assert.match(text(clear), /^diagramRoute delete 메뉴\/메뉴 화면:TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID$/m);
  } finally {
    await mcp.client.close();
    await fake.close();
  }
});
