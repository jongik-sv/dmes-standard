// 감사 컬럼 8개(README S2-30): 판정·getModelText 접기·addTable audit 통과·결과 글 접기.
import assert from "node:assert/strict";
import test from "node:test";
import { handlers } from "../erd-mcp.mjs";
import { UsageError, checkArgs, readArgs } from "../erd-cli.mjs";
import { AUDIT_COLUMNS, isAuditColumn } from "../lib/audit.mjs";
import { resolveCommands } from "../lib/commands.mjs";
import { applyFlow, newState } from "../lib/flows.mjs";
import { TEXT_LIMIT, getModelText } from "../lib/model-text.mjs";
import { formatChangesText, formatWriteResult } from "../lib/results.mjs";
import { STATUS, VIEW } from "./fixtures/erd-view.mjs";

const EIGHT = ["C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID"];
const FOLD = `감사 컬럼 8개: ${EIGHT.join(" ")}`;

const col = (table, phys, over = {}) => ({
  table, phys, logical: "", domainId: null, dataType: "VARCHAR2", length: 100, scale: null, notNull: false, default: null, comment: "", _rev: {}, ...over,
});

/** 표 하나(TB_AUD: ID + 일반 컬럼 + 감사 8개 + VER)를 가진 view. 감사 이름은 일부러 대소문자를 섞는다. */
function auditView(phys = EIGHT) {
  const columns = { "c-1": col("t-a", "ID", { logical: "아이디", length: 30, notNull: true }), "c-2": col("t-a", "VER", { dataType: "NUMBER", length: 10 }) };
  const order = ["c-1"];
  phys.forEach((p, i) => {
    columns[`c-a${i}`] = col("t-a", p, { dataType: /_AT$/i.test(p) ? "TIMESTAMP" : "VARCHAR2", length: /_AT$/i.test(p) ? null : 100 });
    order.push(`c-a${i}`);
  });
  order.push("c-2");
  const model = {
    schemaVersion: 1,
    model: { module: "mcm", schema: "S" },
    tables: { "t-a": { phys: "TB_AUD", logical: "시험", comment: "", columnOrder: order, _rev: {} } },
    columns,
    keys: { "k-1": { table: "t-a", kind: "PK", name: "PK_TB_AUD", columns: ["c-1"], _rev: {} } },
    relations: {},
    _tombstones: {},
  };
  return { ...VIEW, model: JSON.stringify(model), diagrams: [], nodes: [] };
}
const status = { ...STATUS, statuses: {} };

test("AUDIT_COLUMNS 는 정확히 8개이고 VER 는 감사 컬럼이 아니다", () => {
  assert.deepEqual([...AUDIT_COLUMNS], EIGHT);
  assert.equal(isAuditColumn("VER"), false);
  assert.equal(isAuditColumn("CREATED_AT"), false);
  assert.equal(isAuditColumn(null), false);
});

test("isAuditColumn 은 대소문자를 가리지 않는다", () => {
  for (const p of EIGHT) {
    assert.equal(isAuditColumn(p), true);
    assert.equal(isAuditColumn(p.toLowerCase()), true);
  }
  assert.equal(isAuditColumn("c_Usr_Id"), true);
  assert.equal(isAuditColumn(" U_AT "), true);
});

test("getModelText: 감사 컬럼은 표마다 한 줄로 접고 VER 는 그대로 둔다", () => {
  const text = getModelText(auditView(), status);
  const lines = text.split("\n");
  assert.ok(lines.includes(`  ${FOLD}`));
  assert.ok(lines.some((l) => l.startsWith("  VER ")));
  assert.ok(lines.some((l) => l.startsWith("  ID 아이디")));
  for (const p of EIGHT) assert.ok(!lines.some((l) => l.startsWith(`  ${p} `)), p);
});

test("getModelText: 대소문자가 섞인 이름도 접고, 있는 것만 세어 표 순서로 적는다", () => {
  const text = getModelText(auditView(["u_at", "C_Usr_Id", "C_AT"]), status);
  assert.match(text, /^  감사 컬럼 3개: u_at C_Usr_Id C_AT$/m);
});

test("getModelText audit:true 는 감사 컬럼을 보통 컬럼 줄로 펼친다", () => {
  const text = getModelText(auditView(), status, { audit: true });
  assert.ok(!text.includes("감사 컬럼"));
  assert.match(text, /^ {2}C_USR_ID - VARCHAR2\(100\)$/m);
  assert.match(text, /^ {2}U_AT - TIMESTAMP$/m);
  for (const p of EIGHT) assert.match(text, new RegExp(`^  ${p} `, "m"));
});

test("getModelText: 감사 컬럼이 없는 표에는 접는 줄이 없다", () => {
  const text = getModelText(VIEW, status, { tables: ["TB_MCM_SEC_MENU"] });
  assert.ok(!text.includes("감사 컬럼 "));
  assert.match(getModelText(VIEW, status), /^ {2}감사 컬럼 1개: C_AT$/m); // 픽스처의 TB_MCM_SEC_USER 만 C_AT 하나를 가진다
});

test("getModelText: 40,000자 상한은 그대로다(표가 많아도 접힌 글이 상한을 넘지 않는다)", () => {
  const tables = {};
  const columns = {};
  for (let i = 0; i < 400; i++) {
    const order = [];
    for (let j = 0; j < 12; j++) {
      columns[`c-${i}-${j}`] = col(`t-${i}`, `COL_${j}_LONG_NAME_FOR_SIZE`, { logical: "긴 논리 이름을 길게 적는다" });
      order.push(`c-${i}-${j}`);
    }
    EIGHT.forEach((p, k) => {
      columns[`c-${i}-a${k}`] = col(`t-${i}`, p);
      order.push(`c-${i}-a${k}`);
    });
    tables[`t-${i}`] = { phys: `TB_BIG_${String(i).padStart(3, "0")}`, logical: "큰 표", comment: "", columnOrder: order, _rev: {} };
  }
  const view = { ...VIEW, model: JSON.stringify({ schemaVersion: 1, model: { module: "mcm", schema: "S" }, tables, columns, keys: {}, relations: {}, _tombstones: {} }), diagrams: [], nodes: [] };
  for (const audit of [false, true]) {
    const all = getModelText(view, status, { audit });
    assert.ok(all.length <= TEXT_LIMIT, `전체 ${all.length}`);
    assert.match(all, /개요만 보인다/);
    const some = getModelText(view, status, { audit, tables: ["TB_BIG_*"] });
    assert.ok(some.length <= TEXT_LIMIT, `고른 표 ${some.length}`);
  }
  // 접으면 작아져서 더 많은 표가 들어간다.
  const folded = getModelText(view, status, { tables: ["TB_BIG_*"] });
  const open = getModelText(view, status, { audit: true, tables: ["TB_BIG_*"] });
  const shown = (t) => t.split("\n").filter((l) => /^TB_BIG_\d+ .*\{$/.test(l)).length;
  assert.ok(shown(folded) > shown(open), `${shown(folded)} > ${shown(open)}`);
});

test("MCP getModelText 처리기는 audit 입력을 getModelText 로 넘긴다", async () => {
  const view = auditView();
  const client = {
    config: { user: "u", role: "r", session: "claude-rec", source: "MCP" },
    call: async (action, params) => (action === "view" && params.kind === "STATUS" ? status : view),
  };
  const h = handlers(client);
  const folded = await h.getModelText({ modelId: "mcm" });
  assert.ok(folded.content[0].text.includes(FOLD));
  const open = await h.getModelText({ modelId: "mcm", audit: true });
  assert.ok(!open.content[0].text.includes("감사 컬럼 "));
  assert.match(open.content[0].text, /^ {2}C_USR_ID /m);
});

test("CLI text 는 --audit 를 읽고 text 외 명령에는 쓸 수 없다", () => {
  const o = readArgs(["text", "--model", "mcm", "--audit"]);
  assert.equal(o.audit, true);
  assert.doesNotThrow(() => checkArgs(o, {}));
  assert.equal(readArgs(["text", "--model", "mcm"]).audit, false);
  assert.throws(() => checkArgs(readArgs(["violations", "--model", "mcm", "--audit"]), {}), UsageError);
});

test("addTable 의 audit 은 이름 풀기에서 그대로 서버로 간다(true·false·없음)", async () => {
  const { commands, errors } = resolveCommands(VIEW, [
    { op: "addTable", phys: "TB_A" },
    { op: "addTable", phys: "TB_B", audit: false },
    { op: "addTable", phys: "TB_C", audit: true },
  ]);
  assert.deepEqual(errors, []);
  assert.equal("audit" in commands[0], false);
  assert.equal(commands[1].audit, false);
  assert.equal(commands[2].audit, true);

  const calls = [];
  const client = {
    config: { session: "claude-test", user: "erd-mcp-a", source: "MCP" },
    call: async (action, params) => {
      calls.push([action, params]);
      if (action === "view" && params.sinceRev != null) return { rev: 13, reload: false, deltas: [] };
      if (action === "view") return VIEW;
      return { applied: true, rev: 13, rowVersion: 4, dryRun: false, changes: [], warnings: [], rejection: null };
    },
  };
  await applyFlow(client, newState(), { modelId: "mcm", baseRev: 12, commands: [{ op: "addTable", phys: "TB_X", audit: false }, { op: "addTable", phys: "TB_Y" }] });
  const sent = JSON.parse(calls.find(([a]) => a === "save")[1].commandsJson);
  assert.equal(sent[0].audit, false);
  assert.equal("audit" in sent[1], false);
});

/** addTable 한 번의 서버 변경: 표 1 + 컬럼 2(일반) + 감사 8. */
function addTableChanges() {
  const t = { op: "upsert", kind: "table", id: "t-new", value: { phys: "TB_NEW", logical: "", comment: "", columnOrder: ["c-n1", ...EIGHT.map((_, i) => `c-na${i}`)], _rev: {} } };
  const cols = [{ id: "c-n1", phys: "ID" }, ...EIGHT.map((p, i) => ({ id: `c-na${i}`, phys: p }))].map(({ id, phys }) => ({
    op: "upsert", kind: "column", id, value: col("t-new", phys),
  }));
  return [t, ...cols];
}

test("결과 글: 새 표와 같이 생긴 감사 컬럼 8건은 한 줄로 접는다", () => {
  const changes = addTableChanges();
  const out = formatWriteResult(
    { applied: true, rev: 13, rowVersion: 4, dryRun: false, changes, warnings: [], rejection: null },
    { op: "apply", commands: [{ op: "addTable", id: "t-new", phys: "TB_NEW" }], view: VIEW, baseRev: 12, dryRun: false, session: "s", user: "u", others: null },
  );
  assert.match(out.text, /^column upsert TB_NEW\.\(감사 컬럼 8개 추가\)$/m);
  assert.match(out.text, /^column upsert TB_NEW\.ID \(새\)$/m);
  assert.equal((out.text.match(/^column upsert /gm) ?? []).length, 2);
  for (const p of EIGHT) assert.ok(!out.text.includes(`TB_NEW.${p}`), p);
});

test("결과 글: 이미 있는 표에 감사 컬럼을 직접 더하면 접지 않는다", () => {
  const changes = [{ op: "upsert", kind: "column", id: "c-x", value: col("t-menu", "C_AT") }, { op: "upsert", kind: "column", id: "c-y", value: col("t-menu", "U_AT") }];
  const out = formatWriteResult(
    { applied: true, rev: 13, rowVersion: 4, dryRun: false, changes, warnings: [], rejection: null },
    { op: "apply", commands: [], view: VIEW, baseRev: 12, dryRun: false, session: "s", user: "u", others: null },
  );
  assert.match(out.text, /TB_MCM_SEC_MENU\.C_AT/);
  assert.ok(!out.text.includes("감사 컬럼"));
});

test("getChangesSince 글도 같은 델타의 새 표 + 감사 컬럼을 한 줄로 접는다", () => {
  const cv = { rev: 13, reload: false, deltas: [{ rev: 13, userId: "u", session: "claude-a", source: "MCP", changes: addTableChanges() }] };
  const { text } = formatChangesText(cv, { view: VIEW, sinceRev: 12, mySession: "claude-test" });
  assert.match(text, /column upsert TB_NEW\.\(감사 컬럼 8개 추가\)/);
  assert.ok(!text.includes("TB_NEW.C_USR_ID"));
});

/** 표 두 개: TB_P(PK ID) 와 TB_C(감사 컬럼마다 다른 표시). 감사 컬럼의 PK·NN·FK·표준 상태를 시험한다. */
function marksView() {
  const columns = {
    "c-p1": col("t-p", "ID", { length: 30, notNull: true }),
    "c-1": col("t-c", "ID", { length: 30, notNull: true }),
    "c-2": col("t-c", "C_USR_ID", { notNull: true }),
    "c-3": col("t-c", "C_AT", { dataType: "TIMESTAMP", length: null }),
    "c-4": col("t-c", "U_USR_ID"),
    "c-5": col("t-c", "U_AT", { dataType: "TIMESTAMP", length: null }),
  };
  const model = {
    schemaVersion: 1,
    model: { module: "mcm", schema: "S" },
    tables: {
      "t-p": { phys: "TB_P", logical: "", comment: "", columnOrder: ["c-p1"], _rev: {} },
      "t-c": { phys: "TB_C", logical: "", comment: "", columnOrder: ["c-1", "c-2", "c-3", "c-4", "c-5"], _rev: {} },
    },
    columns,
    keys: {
      "k-p": { table: "t-p", kind: "PK", name: "PK_P", columns: ["c-p1"], _rev: {} },
      "k-c": { table: "t-c", kind: "PK", name: "PK_C", columns: ["c-1", "c-2"], _rev: {} },
    },
    relations: {
      "r-1": {
        child: "t-c", parent: "t-p", pairs: [["c-4", "c-p1"]], identifying: false, cardinality: { parent: "ONE", child: "ZERO_OR_MORE" },
        state: "INFERRED", dbFk: false, evidence: [{ kind: "NAME_RULE", ref: "x" }], parentRef: null, candidateRank: null, _rev: {},
      },
    },
    _tombstones: {},
  };
  return { ...VIEW, model: JSON.stringify(model), diagrams: [], nodes: [] };
}

test("접은 감사 컬럼 줄은 PK·NN·FK 표시와 표준 상태를 이름 뒤에 남긴다", () => {
  const st = { ...status, statuses: { "c-3": "DOMAIN" } };
  const text = getModelText(marksView(), st);
  assert.match(text, /^ {2}감사 컬럼 4개: C_USR_ID\(PK,NN\) C_AT!DOMAIN U_USR_ID\(FK>TB_P\.ID\?\) U_AT$/m);
  // 펼친 줄과 같은 표시다.
  const open = getModelText(marksView(), st, { audit: true });
  assert.match(open, /^ {2}C_USR_ID - VARCHAR2\(100\) PK NN$/m);
  assert.match(open, /^ {2}U_USR_ID - VARCHAR2\(100\) FK>TB_P\.ID\?$/m);
  assert.match(open, /^ {2}C_AT - TIMESTAMP !DOMAIN$/m);
  // OK·ALIAS 는 표시하지 않는다.
  const quiet = getModelText(marksView(), { ...status, statuses: { "c-3": "OK", "c-5": "ALIAS" } });
  assert.match(quiet, /C_AT U_USR_ID/);
  assert.ok(!quiet.includes("!OK") && !quiet.includes("!ALIAS"));
});

test("감사 컬럼만 있는 표도 접는다", () => {
  const view = auditView();
  const model = JSON.parse(view.model);
  model.tables["t-a"].columnOrder = model.tables["t-a"].columnOrder.filter((id) => id.startsWith("c-a"));
  model.keys = {};
  const text = getModelText({ ...view, model: JSON.stringify(model) }, status);
  assert.equal(text.split("\n").slice(1).join("\n"), `TB_AUD 시험 {\n  ${FOLD}\n}`);
});

test("표 하나가 상한을 넘어 잘려도 감사 컬럼 줄은 남고, 못 실은 수는 보통 컬럼만 센다", () => {
  const columns = {};
  const order = [];
  for (let j = 0; j < 1500; j++) {
    columns[`c-${j}`] = col("t-big", `COL_${j}_LONG_NAME_FOR_SIZE`, { logical: "긴 논리 이름을 길게 적는다" });
    order.push(`c-${j}`);
  }
  EIGHT.forEach((p, k) => {
    columns[`c-a${k}`] = col("t-big", p);
    order.push(`c-a${k}`);
  });
  const model = {
    schemaVersion: 1, model: { module: "mcm", schema: "S" },
    tables: { "t-big": { phys: "TB_BIG", logical: "", comment: "", columnOrder: order, _rev: {} } },
    columns, keys: {}, relations: {}, _tombstones: {},
  };
  const view = { ...VIEW, model: JSON.stringify(model), diagrams: [], nodes: [] };
  const text = getModelText(view, status, { tables: ["TB_BIG"] });
  assert.ok(text.length <= TEXT_LIMIT, `${text.length}`);
  const shown = text.split("\n").filter((l) => /^ {2}COL_\d+_LONG/.test(l)).length;
  const omitted = Number(/… 컬럼 (\d+)개를 더 싣지 못했다/.exec(text)[1]);
  assert.ok(shown > 0 && omitted > 0);
  assert.equal(shown + omitted, 1500); // 감사 컬럼 8개는 세지 않는다
  assert.ok(text.includes(`  ${FOLD}`));
  assert.ok(text.trimEnd().endsWith(`${FOLD}\n}`));
});

test("getChangesSince: 표 이름만 바꾸고 감사 컬럼 값을 고친 델타는 접지 않는다", () => {
  const rename = [
    { op: "upsert", kind: "table", id: "t-x", value: { phys: "TB_RENAMED", logical: "옛 이름", comment: "", columnOrder: ["c-x1", ...EIGHT.map((_, i) => `c-xa${i}`)], _rev: { phys: { rev: 13 }, logical: { rev: 5 } } } },
    ...EIGHT.map((p, i) => ({ op: "upsert", kind: "column", id: `c-xa${i}`, value: col("t-x", p, { _rev: { phys: { rev: 5 }, logical: { rev: 13 } } }) })),
  ];
  const cv = { rev: 13, reload: false, deltas: [{ rev: 13, userId: "u", session: "claude-a", source: "MCP", changes: rename }] };
  const { text } = formatChangesText(cv, { view: VIEW, sinceRev: 12, mySession: "claude-test" });
  assert.ok(!text.includes("감사 컬럼 8개 추가"));
  assert.ok(text.includes("C_USR_ID"));
});

test("getChangesSince: 감사 컬럼이 표 columnOrder 끝이 아니면 접지 않는다", () => {
  const changes = addTableChanges();
  changes[0].value.columnOrder = [...changes[0].value.columnOrder.slice(1, 4), "c-n1", ...changes[0].value.columnOrder.slice(4)]; // 끝 8개가 감사 컬럼 8개가 아니다
  const cv = { rev: 13, reload: false, deltas: [{ rev: 13, userId: "u", session: "claude-a", source: "MCP", changes }] };
  const { text } = formatChangesText(cv, { view: VIEW, sinceRev: 12, mySession: "claude-test" });
  assert.ok(!text.includes("감사 컬럼 8개 추가"));
});

test("getChangesSince: 새로 만든 표(모든 속성이 이 rev)는 접는다", () => {
  const changes = addTableChanges().map((c) => ({ ...c, value: { ...c.value, _rev: { phys: { rev: 13 }, logical: { rev: 13 } } } }));
  const cv = { rev: 13, reload: false, deltas: [{ rev: 13, userId: "u", session: "claude-a", source: "MCP", changes }] };
  const { text } = formatChangesText(cv, { view: VIEW, sinceRev: 12, mySession: "claude-test" });
  assert.match(text, /column upsert TB_NEW\.\(감사 컬럼 8개 추가\)/);
});
