import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommands } from "../lib/commands.mjs";
import { InputError } from "../lib/flows.mjs";
import {
  deleteModelFlow, diagramCommand, diagramsOf, formatDiagrams, formatModels, importFlow, listDiagramsFlow, listModelsFlow, registerFlow,
} from "../lib/models.mjs";
import { configFromEnv, createOasisClient } from "../lib/oasis.mjs";
import { VIEW, VIEW_ROUTES } from "./fixtures/erd-view.mjs";
import { failure, gridSuccess, startFakeOasis, success, withModels } from "./fixtures/fake-oasis.mjs";

const ROWS = [
  { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM", rev: 12, draftVer: "1.001", ownerId: "admin", status: "INUSE", releasedVer: "1.000", createdBy: "41000207" },
  { modelId: "mdm", moduleId: "mdm", schemaName: "MDMAPUSER", modelName: "MDM", rev: 3, draftVer: null, ownerId: null, status: "CREATED", releasedVer: null, createdBy: null },
];

test("formatModels: 확정본 칸은 값·null(확정 없음)·칸 없음(확인 불가)을 가른다", () => {
  assert.equal(
    formatModels(ROWS),
    [
      "# 모델 2개",
      "mcm mcm MCMAPUSER MCM · rev 12 · DRAFT 1.001 · 소유자 admin · 상태 INUSE · 확정 1.000 · 만든 사람 41000207",
      "mdm mdm MDMAPUSER MDM · rev 3 · DRAFT - · 소유자 - · 상태 CREATED · 확정 없음 · 만든 사람 -",
    ].join("\n"),
  );
  // 서버가 칸을 안 주면(b2 전 서버) 「없음」이 아니라 「확인 불가」 — 지울 수 있는 모델로 오해하지 않게
  assert.match(formatModels([{ modelId: "x", rev: 1 }]), /^x - - - · rev 1 · DRAFT - · 소유자 - · 상태 - · 확정 확인 불가 · 만든 사람 -$/m);
  assert.match(formatModels([{ modelId: "x", releasedVer: "" }]), /확정 확인 불가/); // 빈 글도 값이 아니다
});

test("formatDiagrams: id·업무영역/이름·표 수·경유점 수, sortSeq 순", () => {
  const { text, result } = formatDiagrams(VIEW_ROUTES, "mcm");
  assert.equal(
    text,
    ["# 다이어그램 2개 (모델 mcm · rev 12)", "d-all 기본/전체 · 표 7개 · 경유점 1개", "d-menu 메뉴/메뉴 화면 · 표 3개 · 경유점 2개"].join("\n"),
  );
  assert.deepEqual(result[1], { id: "d-menu", areaName: "메뉴", diagramName: "메뉴 화면", sortSeq: 1, nodeCount: 3, routeCount: 2 });
  // routes 가 없는 view 는 경유점 칸을 뺀다
  assert.equal(formatDiagrams(VIEW, "mcm").text.split("\n")[1], "d-all 기본/전체 · 표 7개");
  assert.match(formatDiagrams({ ...VIEW, diagrams: [], nodes: [] }, "mcm").text, /^# 다이어그램 0개 \(모델 mcm · rev 12\)$/);
});

test("diagramCommand: 이름 바꾸기·지우기·복사 명령. 이름·id 모두 받는다", () => {
  assert.deepEqual(diagramCommand(VIEW, "rename", "메뉴/메뉴 화면", { name: "새 이름" }), { op: "updateDiagram", id: "d-menu", set: { diagramName: "새 이름" } });
  assert.deepEqual(diagramCommand(VIEW, "rename", "d-menu", { name: "A", area: "B" }), { op: "updateDiagram", id: "d-menu", set: { diagramName: "A", areaName: "B" } });
  assert.deepEqual(diagramCommand(VIEW, "delete", "전체", {}), { op: "deleteDiagram", id: "d-all" });
  // 복사: 업무영역은 원본과 같고 이름은 「<이름> 복사」
  assert.deepEqual(diagramCommand(VIEW, "copy", "d-menu", {}), { op: "copyDiagram", from: "d-menu", areaName: "메뉴", diagramName: "메뉴 화면 복사" });
  assert.deepEqual(diagramCommand(VIEW, "copy", "전체", { name: "사본", area: "시험", id: "d-copy1" }), { op: "copyDiagram", from: "d-all", id: "d-copy1", areaName: "시험", diagramName: "사본" });
  assert.throws(() => diagramCommand(VIEW, "rename", "d-menu", {}), (e) => e instanceof InputError && /--name\(새 이름\)이나 --area/.test(e.message));
  // view 를 주지 않으면(rename·delete 가 이름 풀기를 apply 흐름에 맡길 때) 글 그대로 싣는다
  assert.deepEqual(diagramCommand(null, "rename", "메뉴/메뉴 화면", { name: "N" }), { op: "updateDiagram", id: "메뉴/메뉴 화면", set: { diagramName: "N" } });
  assert.deepEqual(diagramCommand(null, "delete", "d-x", {}), { op: "deleteDiagram", id: "d-x" });
  // 못 찾는 이름은 글 그대로 싣는다(apply 흐름의 이름 풀기가 거절한다)
  assert.deepEqual(diagramCommand(VIEW, "delete", "없는것", {}), { op: "deleteDiagram", id: "없는것" });
  assert.deepEqual(diagramCommand(VIEW, "copy", "없는것", { name: "n", area: "a" }), { op: "copyDiagram", from: "없는것", areaName: "a", diagramName: "n" });
});

test("resolveCommands: copyDiagram 의 from 은 다이어그램 이름으로 풀고, 새 id 는 d- 로 만든다. 같은 묶음 뒤 명령이 새 다이어그램을 이름으로 가리킨다", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "copyDiagram", from: "메뉴/메뉴 화면", areaName: "시험", diagramName: "사본" },
      { op: "updateDiagram", id: "시험/사본", set: { sortSeq: 5 } },
      { op: "copyDiagram", from: "d-all", id: "d-fixed", areaName: "a", diagramName: "b" },
    ],
    { newId: (p) => `${p}new` },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(commands[0], { op: "copyDiagram", from: "d-menu", id: "d-new", areaName: "시험", diagramName: "사본" });
  assert.equal(commands[1].id, "d-new");
  assert.equal(commands[2].id, "d-fixed");
  const bad = resolveCommands(VIEW, [{ op: "copyDiagram", from: "nope", areaName: "a", diagramName: "b" }, { op: "copyDiagram", from: "d-all", id: "x-1", areaName: "a", diagramName: "b" }]);
  assert.deepEqual(bad.errors.map((e) => e.field), ["from", "id"]);
});

async function withClient(models, fn, { role } = {}) {
  const fake = await startFakeOasis(withModels(() => failure("MDM000", "모름"), { models }));
  try {
    const client = createOasisClient(configFromEnv({ ERD_BASE: fake.url, ERD_USER: "41000207", ...(role ? { ERD_ROLE: role } : {}) }, { kind: "cli" }));
    await fn(client, fake);
  } finally {
    await fake.close();
  }
}

test("listModelsFlow: search 행을 그대로 글과 JSON 으로", async () => {
  await withClient(ROWS, async (client, fake) => {
    const r = await listModelsFlow(client);
    assert.equal(r.result.length, 2);
    assert.match(r.text, /^# 모델 2개\nmcm /);
    assert.deepEqual(fake.requests.map((q) => [q.action, q.params.kind]), [["search", undefined]]);
  });
});

test("listDiagramsFlow: view 하나만 읽는다", async () => {
  const fake = await startFakeOasis((action) => (action === "view" ? success(VIEW) : failure("MDM000", "모름")));
  try {
    const client = createOasisClient(configFromEnv({ ERD_BASE: fake.url }, { kind: "cli" }));
    const r = await listDiagramsFlow(client, { modelId: "mcm" });
    assert.match(r.text, /^# 다이어그램 2개/);
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].params.modelId, "mcm");
  } finally {
    await fake.close();
  }
});

test("diagramsOf: sortSeq 가 같으면 id 를 이진 순서로(서버 ORDER BY SORT_SEQ, DIAGRAM_ID)", () => {
  const view = { diagrams: [{ id: "d-b", sortSeq: 0 }, { id: "d-B", sortSeq: 0 }, { id: "d-a", sortSeq: 0 }, { id: "d-z", sortSeq: -1 }] };
  assert.deepEqual(diagramsOf(view).map((d) => d.id), ["d-z", "d-B", "d-a", "d-b"]);
});

test("registerFlow: 입력 검사(칸 크기), 시험 실행은 search 만 부르고 겹침을 알린다, 실제 등록은 reg", async () => {
  await withClient([{ modelId: "mcm", moduleId: "mcm", schemaName: "X", modelName: "M", rev: 1 }], async (client, fake) => {
    const dry = await registerFlow(client, { moduleId: "mes", schemaName: "mesapuser", modelName: "MES 모델", dryRun: true });
    assert.deepEqual(fake.requests.map((q) => q.action), ["search"]); // 읽기 전용 확인만, reg 는 안 보낸다
    assert.equal(dry.isError, false);
    assert.match(dry.text, /^시험 실행: 서버에 보내지 않음, --apply 로 실행$/m);
    assert.match(dry.text, /modelId mes · 모듈 mes · 스키마 mesapuser · 이름 MES 모델/);
    assert.match(dry.text, /같은 modelId·모듈의 모델이 없습니다/);

    // 겹치면 시험 실행도 실패(종료 1)
    const sameId = await registerFlow(client, { modelId: "mcm", moduleId: "other", schemaName: "x", modelName: "n", dryRun: true });
    assert.equal(sameId.isError, true);
    assert.match(sameId.text, /^등록할 수 없습니다: 이미 있는 modelId: mcm$/m);
    const sameModule = await registerFlow(client, { modelId: "mcm2", moduleId: "mcm", schemaName: "x", modelName: "n", dryRun: true });
    assert.equal(sameModule.isError, true);
    assert.match(sameModule.text, /모듈 mcm 에는 이미 모델이 있습니다/);
    assert.equal(fake.requests.filter((q) => q.action === "reg").length, 0);

    const r = await registerFlow(client, { moduleId: "mes", schemaName: "mesapuser", modelName: "MES 모델" });
    assert.equal(r.isError, false);
    const q = fake.requests.find((x) => x.action === "reg");
    assert.deepEqual({ ...q.params, session: undefined, source: undefined }, { modelId: "mes", moduleId: "mes", schemaName: "mesapuser", modelName: "MES 모델", session: undefined, source: undefined });
    assert.match(r.text, /^모델 등록됨: mes · 모듈 mes · 스키마 MESAPUSER · 이름 MES 모델/);
    assert.match(r.text, /^다음: import --model mes --apply 로 /m); // CLI 클라이언트는 CLI 명령 이름
    assert.deepEqual(r.result, { modelId: "mes" });

    // 같은 모듈의 둘째 모델·같은 modelId 는 서버가 거절한다(MDM021)
    await assert.rejects(() => registerFlow(client, { modelId: "mes2", moduleId: "mes", schemaName: "x", modelName: "n" }), /모듈 mes 에는 이미 모델이 있습니다/);
    await assert.rejects(() => registerFlow(client, { modelId: "mes", moduleId: "mes9", schemaName: "x", modelName: "n" }), /이미 있는 모델/);
    const named = await registerFlow(client, { modelId: "mes-b", moduleId: "mesb", schemaName: "x", modelName: "n" });
    assert.equal(named.result.modelId, "mes-b");

    // 칸 크기(modelId 50·moduleId 20·schemaName 128·modelName 200)는 서버를 부르기 전에 막는다
    const n = fake.requests.length;
    for (const bad of [
      { modelId: "x".repeat(51), moduleId: "m", schemaName: "s", modelName: "n" },
      { moduleId: "m".repeat(21), schemaName: "s", modelName: "n" },
      { moduleId: "m", schemaName: "s".repeat(129), modelName: "n" },
      { moduleId: "m", schemaName: "s", modelName: "n".repeat(201) },
      { moduleId: "", schemaName: "x", modelName: "n" },
      { moduleId: "m", schemaName: " ", modelName: "n" },
    ]) {
      await assert.rejects(() => registerFlow(client, { ...bad, dryRun: true }), InputError);
    }
    assert.equal(fake.requests.length, n);
  });
});

test("registerFlow: MCP 클라이언트의 다음 안내는 MCP 도구 이름", async () => {
  const fake = await startFakeOasis(withModels(() => failure("MDM000", "모름")));
  try {
    const client = createOasisClient(configFromEnv({ ERD_BASE: fake.url }, { kind: "mcp" }));
    const r = await registerFlow(client, { moduleId: "mes", schemaName: "x", modelName: "n" });
    assert.match(r.text, /^다음: 스키마의 표를 가져오려면 importModel\(modelId=mes\) /m);
  } finally {
    await fake.close();
  }
});

test("importFlow: 시험 실행은 view 로 모델과 표 수를 확인한다. baseRev 가 없으면 view 의 rev. 다시 가져오기는 INVALID 거절", async () => {
  await withClient([], async (client, fake) => {
    await registerFlow(client, { moduleId: "mes", schemaName: "mesapuser", modelName: "MES" });
    const before = fake.requests.length;
    const dry = await importFlow(client, { modelId: "mes", dryRun: true });
    assert.deepEqual(fake.requests.slice(before).map((q) => q.action), ["view"]); // 읽기만
    assert.equal(dry.isError, false);
    assert.match(dry.text, /^시험 실행: 서버에 보내지 않음, --apply 로 실행$/m);
    assert.match(dry.text, /표가 없는 모델이라 첫 가져오기를 할 수 있습니다/);
    assert.equal(fake.requests.filter((q) => q.action === "import").length, 0);
    await assert.rejects(() => importFlow(client, { modelId: "nope", dryRun: true }), /OasisError/); // 없는 모델은 view 가 던진다(CLI 는 종료 1)

    const r = await importFlow(client, { modelId: "mes" });
    const q = fake.requests.find((x) => x.action === "import").params;
    assert.deepEqual([q.modelId, q.kind, q.baseRev, q.dryRun], ["mes", "FROM_DB", 0, undefined]);
    assert.equal(r.isError, false);
    assert.match(r.text, /^가져오기 반영 rev 1 \(baseRev 0\) · 표 3 · 컬럼 21 · 키 4 · 관계 DB 2 \/ 추정 1 · 다이어그램 d-import-all · 경고 1$/m);
    assert.match(r.text, /^경고: SKIPPED 가져오지 않은 표 1개$/m);
    assert.match(r.text, /^다음 baseRev: 1$/m);

    // 다시 가져오기: 실제 서버는 CONFLICT 가 아니라 INVALID "이미 표가 있습니다"(requireEmptyModel)로 거절한다
    const again = await importFlow(client, { modelId: "mes" });
    assert.equal(again.isError, true);
    assert.match(again.text, /^거절 INVALID · 저장한 것 없음$/m);
    assert.match(again.text, /^내용: 이미 표가 있습니다\(3개\)\. 첫 가져오기는 표가 없는 모델에만 합니다$/m);
    assert.match(again.text, /^다음: 다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요$/m);
    // 시험 실행도 표가 있으면 미리 막는다(종료 1)
    const dryAgain = await importFlow(client, { modelId: "mes", dryRun: true });
    assert.equal(dryAgain.isError, true);
    assert.match(dryAgain.text, /첫 가져오기를 할 수 없습니다: 표가 3개 있습니다\. 차이는 db-diff/);
    // baseRev 가 rev 보다 크면 INVALID
    const ahead = await importFlow(client, { modelId: "mes", baseRev: 99 });
    assert.match(ahead.text, /^거절 INVALID/m);
    assert.match(ahead.text, /baseRev 가 현재 rev\(1\)보다 큽니다/);
  });
});

const OWNED = (extra) => ({ ownerId: "41000207", ...extra });

test("deleteModelFlow: search 로 모델을 찾고 경고 뒤 delete kind=MODEL. 거절은 서버가 준 이유를 그대로", async () => {
  const models = [
    OWNED({ modelId: "mdm", moduleId: "mdm", schemaName: "S", modelName: "MDM", rev: 3, releasedVer: null }),
    OWNED({ modelId: "mcm", moduleId: "mcm", schemaName: "S", modelName: "MCM", rev: 3, releasedVer: "1.000" }),
    OWNED({ modelId: "req", moduleId: "req", schemaName: "S", modelName: "REQ", rev: 3, releasedVer: null, versions: ["REQUESTED 2.000"] }),
    { modelId: "oth", moduleId: "oth", schemaName: "S", modelName: "OTH", rev: 3, ownerId: "someone", releasedVer: null },
  ];
  await withClient(models, async (client, fake) => {
    const missing = await deleteModelFlow(client, { modelId: "nope" });
    assert.equal(missing.isError, true);
    assert.match(missing.text, /^지울 모델이 없습니다: nope/);
    assert.equal(fake.requests.filter((q) => q.action === "delete").length, 0);

    // 확정·요청·승인 버전이 있으면 소유자여도 거절 — 이유는 서버 글 그대로
    await assert.rejects(() => deleteModelFlow(client, { modelId: "mcm" }), /확정·요청·승인된 버전\(RELEASED 1\.000\)이 있는 모델은 관리자/);
    await assert.rejects(() => deleteModelFlow(client, { modelId: "req" }), /버전\(REQUESTED 2\.000\)/);
    await assert.rejects(() => deleteModelFlow(client, { modelId: "oth" }), /DRAFT 소유자\(someone\) 또는 관리자\(MDM_STD_ADMIN·SYSADMIN\)만 할 수 있습니다/);

    const seen = [];
    const r = await deleteModelFlow(client, { modelId: "mdm", warn: (t) => seen.push(t) });
    assert.equal(r.isError, false);
    assert.equal(seen.length, 1);
    assert.match(seen[0], /되돌릴 수 없습니다/);
    const del = fake.requests.filter((q) => q.action === "delete").at(-1).params;
    assert.deepEqual([del.modelId, del.kind, del.ver, del.rowVersion], ["mdm", "MODEL", undefined, undefined]);
    assert.match(r.text, /^모델 삭제됨\(되돌릴 수 없음\): mdm /);
    assert.deepEqual(r.result, { ok: true });
  });
  // 관리자(역할이 여럿이어도)는 확정·요청 버전이 있어도 지운다
  await withClient(models, async (client) => {
    assert.equal((await deleteModelFlow(client, { modelId: "mcm" })).isError, false);
    assert.equal((await deleteModelFlow(client, { modelId: "oth" })).isError, false);
  }, { role: "MDM_STEWARD,SYSADMIN" });
});

test("deleteModelFlow: rejection 이 실려 오면 코드·내용·다음 줄. 옛 서버(kind 무시)의 「버전은 필수」는 미지원 안내로", async () => {
  const fake = await startFakeOasis((action, params) => {
    if (action === "search") return gridSuccess([{ modelId: "a", moduleId: "a" }, { modelId: "b", moduleId: "b" }, { modelId: "c", moduleId: "c" }]);
    if (params.modelId === "a") return success({ ok: false, rejection: { code: "NOT_ALLOWED", message: "결재 요청 중인 모델입니다", hint: "관리자에게 부탁하세요" } });
    if (params.modelId === "b") return failure("MDM021", "버전은 필수입니다");
    return success({ ok: false });
  });
  try {
    const client = createOasisClient(configFromEnv({ ERD_BASE: fake.url }, { kind: "cli" }));
    const a = await deleteModelFlow(client, { modelId: "a" });
    assert.equal(a.isError, true);
    assert.equal(a.text, "거절 NOT_ALLOWED · 지운 것 없음\n내용: 결재 요청 중인 모델입니다\n다음: 관리자에게 부탁하세요");
    const b = await deleteModelFlow(client, { modelId: "b" });
    assert.equal(b.isError, true);
    assert.match(b.text, /서버가 delete kind=MODEL 을 아직 지원하지 않습니다/);
    const c = await deleteModelFlow(client, { modelId: "c" });
    assert.equal(c.isError, true);
    assert.match(c.text, /^모델 삭제 실패: c/);
  } finally {
    await fake.close();
  }
});

// ---- b2 alignment: 실제 서버(ErdModelDeletion·ErdEditService)와 맞춘 거절 문구·코드·삭제 뒤 동작 ----

test("fake withModels(b2): search 행에 status·releasedVer(null 이어도 칸이 있다)·createdBy, SCHEMAS = {schemaName}, 모르는 kind = MDM021", async () => {
  const fake = await startFakeOasis(withModels(() => failure("MDM000", "모름"), {
    models: [{ modelId: "a", moduleId: "a", schemaName: "S", modelName: "A", rev: 1, draftVer: "1.000", ownerId: "u" }], schemas: ["APSAPUSER", "MCMAPUSER"],
  }));
  try {
    const client = createOasisClient(configFromEnv({ ERD_BASE: fake.url }, { kind: "cli" }));
    const [row] = await client.rows("search");
    assert.equal(row.status, "CREATED"); // 모델 상태 CREATED·INUSE·DEPRECATED(버전 상태 DRAFT 가 아니다)
    assert.ok("releasedVer" in row && row.releasedVer === null);
    assert.ok("createdBy" in row);
    assert.deepEqual(await client.rows("search", { kind: "SCHEMAS" }), [{ schemaName: "APSAPUSER" }, { schemaName: "MCMAPUSER" }]);
    await assert.rejects(() => client.rows("search", { kind: "NOPE" }), (e) => e.code === "MDM021");
    await assert.rejects(() => client.call("delete", { modelId: "a", kind: "NOPE" }), (e) => e.code === "MDM021");
  } finally {
    await fake.close();
  }
});

test("deleteModelFlow(b2 거절 코드): DRAFT 없음 MDM016, 소유자 없는 DRAFT·소유자 아님·막는 버전 MDM003, 표시 경합 MDM001, 없는 모델 MDM029", async () => {
  const models = [
    { modelId: "nodraft", moduleId: "nodraft", schemaName: "S", modelName: "ND", rev: 1, draftVer: null, ownerId: null, releasedVer: "2.000" },
    { modelId: "ownerless", moduleId: "ownerless", schemaName: "S", modelName: "OL", rev: 1, draftVer: "1.000", ownerId: null },
    { modelId: "multi", moduleId: "multi", schemaName: "S", modelName: "MU", rev: 1, draftVer: "1.000", ownerId: "41000207", versions: ["RELEASED 2.000", "APPROVED 3.000", "CANCELLED 4.000"] },
    { modelId: "busy", moduleId: "busy", schemaName: "S", modelName: "BU", rev: 1, draftVer: "1.000", ownerId: "41000207", deleteBusy: true },
  ];
  await withClient(models, async (client, fake) => {
    const code = (id) => deleteModelFlow(client, { modelId: id }).then(() => null, (e) => [e.code, e.message]);
    assert.deepEqual(await code("nodraft"), ["MDM016", "표준 관리자 역할이 있어야 할 수 있습니다: DRAFT 가 없는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN)만 지울 수 있습니다"]);
    const [c2, m2] = await code("ownerless");
    assert.equal(c2, "MDM003");
    assert.match(m2, /^DRAFT 소유자만 할 수 있습니다: 소유자가 없는 DRAFT 입니다\. 먼저 선점\(lock\)해 소유자가 되거나 관리자/);
    const [c3, m3] = await code("multi");
    assert.equal(c3, "MDM003");
    assert.match(m3, /\(RELEASED 2\.000, APPROVED 3\.000\)이 있는 모델은 관리자/); // CANCELLED 는 막지 않는다
    const [c4, m4] = await code("busy");
    assert.equal(c4, "MDM001");
    assert.match(m4, /잠시 뒤 다시 시도하세요$/);
    assert.equal(fake.requests.filter((q) => q.action === "delete").length, 4);
  });
  // 관리자는 DRAFT 가 없고 확정본이 있어도 지운다. 표시 경합(MDM001)은 관리자에게도 난다
  await withClient(models, async (client) => {
    assert.equal((await deleteModelFlow(client, { modelId: "nodraft" })).isError, false);
    assert.equal((await deleteModelFlow(client, { modelId: "multi" })).isError, false);
    await assert.rejects(() => deleteModelFlow(client, { modelId: "busy" }), (e) => e.code === "MDM001");
  }, { role: "SYSADMIN" });
});

test("모델 삭제 뒤: 같은 modelId 의 view·save·import 는 MDM029, 다시 등록하면 rev 는 0 이 아니라 이어진다", async () => {
  await withClient([], async (client, fake) => {
    await registerFlow(client, { moduleId: "mes", schemaName: "x", modelName: "n" });
    assert.equal((await client.call("view", { modelId: "mes" })).rev, 0);
    assert.equal((await deleteModelFlow(client, { modelId: "mes" })).isError, false);
    for (const [action, params] of [["view", { modelId: "mes" }], ["save", { modelId: "mes", baseRev: 0, commandsJson: "[]" }], ["import", { modelId: "mes", kind: "FROM_DB", baseRev: 0 }]]) {
      await assert.rejects(() => client.call(action, params), (e) => e.code === "MDM029" && e.message === "ERD 모델이 없습니다", action);
    }
    const again = await deleteModelFlow(client, { modelId: "mes" });
    assert.equal(again.isError, true);
    assert.match(again.text, /^지울 모델이 없습니다: mes/); // search 가 먼저 막는다(delete 는 안 보낸다)
    assert.equal(fake.requests.filter((q) => q.action === "delete").length, 1);
    const r = await registerFlow(client, { moduleId: "mes", schemaName: "x", modelName: "n" });
    assert.doesNotMatch(r.text, /rev 0/); // 다시 등록한 모델은 지운 rev 뒤에서 이어 쓴다(b2 fixes 5)
    assert.match(r.text, /DRAFT 1\.000/);
    assert.ok((await client.call("view", { modelId: "mes" })).rev > 0);
  });
});

test("diagramCommand copy: 이름을 안 주면 「<이름> 복사」, 원본이 길면 서버처럼 197자로 잘라 200자 안에 맞춘다", () => {
  const long = "가".repeat(199);
  const view = { diagrams: [{ id: "d-long", areaName: "a", diagramName: long, sortSeq: 0 }] };
  const cmd = diagramCommand(view, "copy", "d-long", {});
  assert.equal(cmd.diagramName.length, 200);
  assert.equal(cmd.diagramName, `${"가".repeat(197)} 복사`);
  assert.equal(diagramCommand({ diagrams: [{ id: "d-s", areaName: "a", diagramName: "x".repeat(197), sortSeq: 0 }] }, "copy", "d-s", {}).diagramName, `${"x".repeat(197)} 복사`);
});
