// MCP 모델 관리 도구(README 7.2): listModels·listDiagrams·registerModel·importModel. 모델 삭제 도구는 없다.
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { APPLIED_13, STATUS, VIEW_ROUTES } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success, withModels } from "./fixtures/fake-oasis.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-mcp.mjs");

const MODELS = [
  { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM", rev: 12, draftVer: "1.001", ownerId: "41000207", status: "INUSE", releasedVer: "1.000", createdBy: "41000207" },
];

function makeRoute() {
  return withModels((action, params) => {
    if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
    if (action === "view" && params.kind === "STATUS") return success(STATUS);
    if (action === "view") return success(VIEW_ROUTES);
    if (action === "save") return success({ ...APPLIED_13, applied: params.dryRun !== true, dryRun: params.dryRun === true, changes: [] });
    return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
  }, { models: MODELS });
}

async function startMcp(fake) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ERD_BASE: fake.url, ERD_USER: "41000207", ERD_SESSION: "claude-test" }, stderr: "pipe" });
  const client = new Client({ name: "erd-mcp-models-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}
const text = (r) => r.content.map((c) => c.text).join("\n");

test("도구 목록·입력 모양·설명: 모델 삭제 도구는 없다, apply 설명에 다이어그램 이름·삭제·복사 명령", async () => {
  const fake = await startFakeOasis(makeRoute());
  const client = await startMcp(fake);
  try {
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.equal(tools.length, 16);
    assert.ok(!tools.some((t) => /delete|remove|drop/i.test(t.name)), "모델 삭제 도구를 넣지 않는다");
    assert.deepEqual(by.listModels.inputSchema.required ?? [], []);
    assert.deepEqual(by.listDiagrams.inputSchema.required, ["modelId"]);
    assert.deepEqual([...by.registerModel.inputSchema.required].sort(), ["moduleId", "modelName", "schemaName"].sort());
    assert.deepEqual(by.importModel.inputSchema.required, ["modelId"]);
    assert.ok(by.registerModel.inputSchema.properties.modelId);
    assert.ok(by.importModel.inputSchema.properties.baseRev);
    for (const op of ["updateDiagram", "deleteDiagram", "copyDiagram", "setRoute"]) assert.match(by.apply.description, new RegExp(op), op);
    assert.match(by.apply.description, /copyDiagram[^]*from[^]*areaName[^]*diagramName/);
    assert.match(by.registerModel.description, /DRAFT/);
    assert.match(by.registerModel.description, /같은 모듈의 모델이 이미 있으면 거절/);
    assert.match(by.registerModel.description, /사용자가 등록을 요청했을 때만/);
    assert.match(by.importModel.description, /FROM_DB|DB/);
    assert.match(by.listModels.description, /상태/);
    assert.match(by.listModels.description, /확정 없음/);
    assert.match(by.listModels.description, /확인 불가/);

    const ins = client.getInstructions() ?? "";
    for (const name of ["listModels", "listDiagrams", "registerModel", "importModel"]) assert.match(ins, new RegExp(name), name);
    assert.match(ins, /모델 삭제는 MCP 로 할 수 없다/);
    assert.match(ins, /사용자가 직접 한다/);
    assert.doesNotMatch(ins, /delete-model|CLI/); // 에이전트가 셸로 직접 지우도록 안내하지 않는다
    assert.match(ins, /copyDiagram/);
  } finally {
    await client.close();
    await fake.close();
  }
});

test("listModels·listDiagrams·registerModel·importModel 호출", async () => {
  const fake = await startFakeOasis(makeRoute());
  const client = await startMcp(fake);
  try {
    const models = await client.callTool({ name: "listModels", arguments: {} });
    assert.equal(
      text(models),
      "# 모델 1개\nmcm mcm MCMAPUSER MCM · rev 12 · DRAFT 1.001 · 소유자 41000207 · 상태 INUSE · 확정 1.000 · 만든 사람 41000207",
    );
    const dia = await client.callTool({ name: "listDiagrams", arguments: { modelId: "mcm" } });
    assert.match(text(dia), /^# 다이어그램 2개 \(모델 mcm · rev 12\)\nd-all 기본\/전체 · 표 7개 · 경유점 1개\nd-menu /);

    const reg = await client.callTool({ name: "registerModel", arguments: { moduleId: "mes", schemaName: "mesapuser", modelName: "MES 모델" } });
    assert.ok(!reg.isError, text(reg));
    assert.match(text(reg), /^모델 등록됨: mes · 모듈 mes · 스키마 MESAPUSER/);
    const rq = fake.requests.find((r) => r.action === "reg");
    assert.deepEqual([rq.params.modelId, rq.params.moduleId, rq.params.schemaName, rq.params.modelName, rq.params.session, rq.params.source], ["mes", "mes", "mesapuser", "MES 모델", "claude-test", "MCP"]);
    const dup = await client.callTool({ name: "registerModel", arguments: { moduleId: "mes", schemaName: "x", modelName: "n" } });
    assert.equal(dup.isError, true);
    assert.match(text(dup), /이미 있는 모델/);
    const sameModule = await client.callTool({ name: "registerModel", arguments: { modelId: "mes-b", moduleId: "mes", schemaName: "x", modelName: "n" } });
    assert.equal(sameModule.isError, true);
    assert.match(text(sameModule), /모듈 mes 에는 이미 모델이 있습니다/);

    const imp = await client.callTool({ name: "importModel", arguments: { modelId: "mes" } });
    assert.ok(!imp.isError, text(imp));
    assert.match(text(imp), /^가져오기 반영 rev 1 \(baseRev 0\)/);
    const iq = fake.requests.find((r) => r.action === "import").params;
    assert.deepEqual([iq.kind, iq.baseRev, iq.dryRun], ["FROM_DB", 0, undefined]);
    const stale = await client.callTool({ name: "importModel", arguments: { modelId: "mes", baseRev: 0 } });
    assert.equal(stale.isError, true);
    assert.match(text(stale), /^거절 INVALID · 저장한 것 없음$/m); // 실제 서버: 이미 표가 있으면 INVALID(CONFLICT 아님)
    assert.match(text(stale), /이미 표가 있습니다\(3개\)/);

    // 다이어그램 복사는 apply 로: from 은 업무영역/이름으로 풀린다
    const cp = await client.callTool({
      name: "apply",
      arguments: { modelId: "mcm", baseRev: 12, dryRun: true, commands: [{ op: "copyDiagram", from: "메뉴/메뉴 화면", areaName: "시험", diagramName: "사본" }] },
    });
    assert.ok(!cp.isError, text(cp));
    const sent = JSON.parse(fake.requests.filter((r) => r.action === "save").at(-1).params.commandsJson)[0];
    assert.deepEqual([sent.op, sent.from, sent.areaName, sent.diagramName, typeof sent.id], ["copyDiagram", "d-menu", "시험", "사본", "string"]);
  } finally {
    await client.close();
    await fake.close();
  }
});
