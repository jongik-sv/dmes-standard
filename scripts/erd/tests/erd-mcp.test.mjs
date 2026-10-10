import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { handlers } from "../erd-mcp.mjs";
import { GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-mcp.mjs");

function route(action, params) {
  if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
  if (action === "view" && params.kind === "STATUS") return success(STATUS);
  if (action === "view" && params.sinceRev != null) return success({ rev: 12, reload: false, deltas: [] });
  if (action === "view") return success(VIEW);
  if (action === "compare" && params.kind === "DB_DIFF") return success({ modelId: "mcm", rev: 12, schema: "MCMAPUSER", items: [] });
  return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
}

test("stdio MCP 서버: 도구 6개, getModelText 골든, OASIS 오류는 isError", async () => {
  const fake = await startFakeOasis(route);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ERD_BASE: fake.url, ERD_USER: "41000207", ERD_SESSION: "claude-test" },
    stderr: "pipe",
  });
  let log = "";
  transport.stderr?.on("data", (c) => (log += c));
  const client = new Client({ name: "erd-mcp-test", version: "0.0.0" });
  const protocolErrors = []; // stdout 에 프로토콜이 아닌 글이 섞이면 SDK 가 onerror 로만 알린다
  client.onerror = (e) => protocolErrors.push(e);
  try {
    await client.connect(transport);
    assert.match(client.getInstructions() ?? "", /getCurrentView 로 사용자가 화면에서 보는/);

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["getChangesSince", "getCurrentView", "getDbDiff", "getModelText", "listInferredRelations", "listViolations"],
    );
    const gm = tools.find((t) => t.name === "getModelText");
    assert.deepEqual(gm.inputSchema.required, ["modelId"]);
    assert.ok(gm.inputSchema.properties.diagram);
    assert.ok(gm.inputSchema.properties.tables);
    assert.match(gm.description, /tables/);
    assert.equal(gm._meta?.["anthropic/maxResultSizeChars"], 100000);

    const text = await client.callTool({ name: "getModelText", arguments: { modelId: "mcm" } });
    assert.equal(text.isError ?? false, false);
    assert.equal(text.content[0].text, GOLDEN);
    const statusReq = fake.requests.find((r) => r.params.kind === "STATUS");
    assert.deepEqual(statusReq.params, { modelId: "mcm", kind: "STATUS", ver: "1.000" });
    assert.equal(statusReq.headers["x-authenticated-user"], "41000207");

    const one = await client.callTool({ name: "getModelText", arguments: { modelId: "mcm", tables: ["TB_MCM_SEC_OBJ"] } });
    assert.match(one.content[0].text, /^TB_MCM_SEC_OBJ 오브젝트 \{\n {2}OBJECT_ID .*\n\}\nRef TB_MCM_SEC_MENU\.OBJECT_ID > TB_MCM_SEC_OBJ\.OBJECT_ID /m);
    const csv = await client.callTool({ name: "getModelText", arguments: { modelId: "mcm", tables: "TB_MCM_SEC_OBJ,TB_MCM_SEC_MENU" } });
    assert.equal(csv.isError ?? false, false);

    const since = await client.callTool({ name: "getChangesSince", arguments: { modelId: "mcm", rev: 12 } });
    assert.equal(since.content.length, 2);
    assert.deepEqual(JSON.parse(since.content[1].text), { rev: 12, reload: false, deltas: [] });

    const missing = await client.callTool({ name: "getModelText", arguments: { modelId: "nope" } });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /^\[MDM029\] ERD 모델이 없습니다\n다음: modelId 를 확인하세요/);

    assert.match(log, /erd-mcp 시작: http:\/\/127\.0\.0\.1:\d+ · 사용자 41000207 · 역할 MDM_STEWARD · 세션 claude-test/);
    assert.deepEqual(protocolErrors, []);
  } finally {
    await client.close();
    await fake.close();
  }
});

/** 부른 action·params 를 기록하는 가짜 클라이언트. */
function recordingClient(respond) {
  const calls = [];
  return {
    calls,
    config: { user: "u", role: "r" },
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

test("도구마다 부르는 OASIS 액션과 params", async () => {
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

test("STATUS·DB_DIFF 를 모르는 서버의 응답은 빈 결과가 아니라 오류로 올라온다", async () => {
  // 옛 서버: view kind=STATUS 가 모델 view 를 그대로 주고, compare 는 items 가 없다.
  const old = (action) => (action === "compare" ? { modelId: "mcm", rev: 12 } : VIEW);
  const h = handlers(recordingClient(old));
  await assert.rejects(h.listViolations({ modelId: "mcm" }), /view kind=STATUS 응답 모양이 다릅니다/);
  await assert.rejects(h.getModelText({ modelId: "mcm" }), /view kind=STATUS/);
  await assert.rejects(h.getDbDiff({ modelId: "mcm" }), /compare kind=DB_DIFF 응답 모양이 다릅니다/);
});
