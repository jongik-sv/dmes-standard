// CLI 모델 관리 명령(README 7.2): models 새 칸, diagrams, diagram-rename·delete·copy, register, import, delete-model.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APPLIED_13, STATUS, VIEW_ROUTES } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success, withModels } from "./fixtures/fake-oasis.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-cli.mjs");

function cli(args, { env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (c) => (stdout += c));
    child.stderr.setEncoding("utf8").on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end("");
  });
}

const MODELS = [
  { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM", rev: 12, draftVer: "1.001", ownerId: "41000207", status: "INUSE", releasedVer: "1.000", createdBy: "41000207" },
  { modelId: "old", moduleId: "old", schemaName: "OLDUSER", modelName: "OLD", rev: 2, draftVer: "1.000", ownerId: "erd-mcp-b", status: "CREATED", releasedVer: null, createdBy: "erd-mcp-b" },
];

/** mcm 은 inner 가 view·save 를 맡는다(경유점이 든 VIEW_ROUTES, rev 12). 모델 관리는 withModels 가 맡는다. */
function makeRoute() {
  const inner = (action, params) => {
    if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
    if (action === "view" && params.kind === "STATUS") return success(STATUS);
    if (action === "view") return success(VIEW_ROUTES);
    if (action === "save" && params.dryRun === true) return success({ ...APPLIED_13, applied: false, rev: 12, rowVersion: null, dryRun: true, changes: [] });
    if (action === "save") return success({ ...APPLIED_13, changes: [] });
    return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
  };
  return withModels(inner, { models: MODELS });
}

const saved = (fake) => fake.requests.filter((r) => r.action === "save").map((r) => ({ ...r.params, commands: JSON.parse(r.params.commandsJson) }));

test("models: 상태·확정·만든 사람 칸", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const r = await cli(["models"], { env: { ERD_BASE: fake.url } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      r.stdout,
      [
        "# 모델 2개",
        "mcm mcm MCMAPUSER MCM · rev 12 · DRAFT 1.001 · 소유자 41000207 · 상태 INUSE · 확정 1.000 · 만든 사람 41000207",
        "old old OLDUSER OLD · rev 2 · DRAFT 1.000 · 소유자 erd-mcp-b · 상태 CREATED · 확정 없음 · 만든 사람 erd-mcp-b",
        "",
      ].join("\n"),
    );
    const j = await cli(["models", "--json"], { env: { ERD_BASE: fake.url } });
    assert.equal(JSON.parse(j.stdout)[0].releasedVer, "1.000");
  } finally {
    await fake.close();
  }
});

test("diagrams: 다이어그램 id·업무영역/이름·표 수·경유점 수", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const r = await cli(["diagrams", "--model", "mcm"], { env: { ERD_BASE: fake.url } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, "# 다이어그램 2개 (모델 mcm · rev 12)\nd-all 기본/전체 · 표 7개 · 경유점 1개\nd-menu 메뉴/메뉴 화면 · 표 3개 · 경유점 2개\n");
    assert.match(r.stderr, /^erd-cli diagrams: 읽기 · /m);
    const j = await cli(["diagrams", "--model", "mcm", "--json"], { env: { ERD_BASE: fake.url } });
    assert.deepEqual(JSON.parse(j.stdout)[1], { id: "d-menu", areaName: "메뉴", diagramName: "메뉴 화면", sortSeq: 1, nodeCount: 3, routeCount: 2 });
  } finally {
    await fake.close();
  }
});

test("diagram-rename·delete·copy: 기본은 시험 실행, --apply 는 저장. 이름은 업무영역/이름·id", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const rn = await cli(["diagram-rename", "메뉴/메뉴 화면", "--model", "mcm", "--base-rev", "12", "--name", "새 이름"], { env });
    assert.equal(rn.code, 0, rn.stderr);
    assert.equal(rn.stdout.split("\n")[0], "시험 실행(저장 안 함) · 통과");
    assert.match(rn.stderr, /^erd-cli diagram-rename: 시험 실행\(저장 안 함, 저장하려면 --apply\) · /m);
    assert.equal(fake.requests.filter((r) => r.action === "view").length, 1); // rename 은 이름 풀기를 apply 흐름에 맡겨 view 를 한 번만 읽는다
    const s1 = saved(fake)[0];
    assert.deepEqual([s1.dryRun, s1.baseRev, s1.source, s1.commands], [true, 12, "CLI", [{ op: "updateDiagram", id: "d-menu", set: { diagramName: "새 이름" } }]]);

    const both = await cli(["diagram-rename", "d-menu", "--model", "mcm", "--base-rev", "12", "--name", "A", "--area", "B", "--apply"], { env });
    assert.equal(both.code, 0, both.stderr);
    assert.match(both.stdout, /^반영 rev 13 \(baseRev 12\)/m);
    const s2 = saved(fake)[1];
    assert.deepEqual([s2.dryRun, s2.commands], [undefined, [{ op: "updateDiagram", id: "d-menu", set: { diagramName: "A", areaName: "B" } }]]);

    const del = await cli(["diagram-delete", "전체", "--model", "mcm", "--base-rev", "12"], { env });
    assert.equal(del.code, 0, del.stderr);
    assert.deepEqual(saved(fake)[2].commands, [{ op: "deleteDiagram", id: "d-all" }]);
    assert.equal(saved(fake)[2].dryRun, true);

    const cp = await cli(["diagram-copy", "d-menu", "--model", "mcm", "--base-rev", "12"], { env });
    assert.equal(cp.code, 0, cp.stderr);
    const c3 = saved(fake)[3].commands[0];
    assert.match(c3.id, /^d-[0-9a-f-]{36}$/); // 새 id 는 resolveCommands 가 만든다
    assert.deepEqual({ ...c3, id: "d-X" }, { op: "copyDiagram", from: "d-menu", id: "d-X", areaName: "메뉴", diagramName: "메뉴 화면 복사" });

    const cp2 = await cli(["diagram-copy", "메뉴/메뉴 화면", "--model", "mcm", "--base-rev", "12", "--name", "사본", "--area", "시험", "--id", "d-copy1", "--apply"], { env });
    assert.equal(cp2.code, 0, cp2.stderr);
    assert.deepEqual(saved(fake)[4].commands, [{ op: "copyDiagram", from: "d-menu", id: "d-copy1", areaName: "시험", diagramName: "사본" }]);

    // 없는 다이어그램은 apply 와 같은 "이름 풀기 실패"(종료 1)이고 save 를 보내지 않는다
    const n = saved(fake).length;
    for (const args of [["diagram-delete", "nope"], ["diagram-rename", "nope", "--name", "x"], ["diagram-copy", "nope"]]) {
      const nope = await cli([...args, "--model", "mcm", "--base-rev", "12"], { env });
      assert.equal(nope.code, 1, args.join(" "));
      assert.match(nope.stdout, /^이름 풀기 실패 1건/, args.join(" "));
      assert.match(nope.stdout, /다이어그램을 찾을 수 없습니다: nope/, args.join(" "));
    }
    assert.equal(saved(fake).length, n);
  } finally {
    await fake.close();
  }
});

test("register: --apply 없으면 reg 를 보내지 않고(search 만), 겹치면 종료 1. --apply 는 reg 를 보낸다", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const dry = await cli(["register", "--module", "mes", "--schema", "mesapuser", "--name", "MES 모델"], { env });
    assert.equal(dry.code, 0, dry.stderr);
    assert.deepEqual(fake.requests.map((r) => r.action), ["search"]); // 읽기 전용 확인만
    assert.match(dry.stderr, /^erd-cli register: 시험 실행\(등록은 보내지 않음, 등록하려면 --apply\) · /m);
    assert.match(dry.stdout, /^시험 실행: 서버에 보내지 않음, --apply 로 실행$/m);
    assert.match(dry.stdout, /modelId mes · 모듈 mes · 스키마 mesapuser · 이름 MES 모델/);

    // 이미 모델이 있는 모듈·modelId 는 시험 실행에서도 종료 1
    const dupModule = await cli(["register", "--module", "mcm", "--schema", "x", "--name", "n", "--model", "mcm2"], { env });
    assert.equal(dupModule.code, 1);
    assert.match(dupModule.stdout, /모듈 mcm 에는 이미 모델이 있습니다/);
    const dupId = await cli(["register", "--module", "other", "--schema", "x", "--name", "n", "--model", "mcm"], { env });
    assert.equal(dupId.code, 1);
    assert.match(dupId.stdout, /이미 있는 modelId: mcm/);
    assert.equal(fake.requests.filter((r) => r.action === "reg").length, 0);

    const r = await cli(["register", "--module", "mes", "--schema", "mesapuser", "--name", "MES 모델", "--apply"], { env });
    assert.equal(r.code, 0, r.stderr);
    const q = fake.requests.find((x) => x.action === "reg");
    assert.deepEqual([q.params.modelId, q.params.moduleId, q.params.schemaName, q.params.modelName, q.params.source], ["mes", "mes", "mesapuser", "MES 모델", "CLI"]);
    assert.equal(q.headers["x-authenticated-user"], "erd-mcp-b");
    assert.match(r.stdout, /^모델 등록됨: mes · 모듈 mes · 스키마 MESAPUSER/);
    assert.match(r.stdout, /^다음: import --model mes --apply /m);

    const withId = await cli(["register", "--model", "mes-b", "--module", "mesb", "--schema", "x", "--name", "n", "--apply", "--json"], { env });
    assert.deepEqual(JSON.parse(withId.stdout), { modelId: "mes-b" });

    // 같은 모듈의 둘째 모델은 서버가 거절한다(UX_TB_MDM_ERD_MODEL_MODULE → MDM021)
    const dup = await cli(["register", "--model", "mes-c", "--module", "mes", "--schema", "x", "--name", "n", "--apply"], { env });
    assert.equal(dup.code, 1);
    assert.match(dup.stderr, /\[MDM021\] 입력값이 올바르지 않습니다: 모듈 mes 에는 이미 모델이 있습니다: mes/);

    // 칸 크기 검사는 서버를 부르기 전에(사용 오류 2)
    const n = fake.requests.length;
    const long = await cli(["register", "--module", "m".repeat(21), "--schema", "x", "--name", "n"], { env });
    assert.equal(long.code, 2);
    assert.match(long.stderr, /moduleId 는 20자까지입니다/);
    assert.equal(fake.requests.length, n);
  } finally {
    await fake.close();
  }
});

test("import: --apply 없으면 view 만 읽는다(표가 있으면 종료 1). --apply 는 view 의 rev 로 import kind=FROM_DB, 다시 가져오기는 INVALID 로 1", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    await cli(["register", "--module", "mes", "--schema", "x", "--name", "n", "--apply"], { env });
    const before = fake.requests.length;
    const dry = await cli(["import", "--model", "mes"], { env });
    assert.equal(dry.code, 0, dry.stderr);
    assert.deepEqual(fake.requests.slice(before).map((r) => r.action), ["view"]);
    assert.match(dry.stderr, /^erd-cli import: 시험 실행\(가져오기는 보내지 않음, 가져오려면 --apply\) · /m);
    assert.match(dry.stdout, /^시험 실행: 서버에 보내지 않음, --apply 로 실행$/m);

    const r = await cli(["import", "--model", "mes", "--apply"], { env });
    assert.equal(r.code, 0, r.stderr);
    const q = fake.requests.filter((x) => x.action === "import")[0].params;
    assert.deepEqual([q.modelId, q.kind, q.baseRev, q.dryRun], ["mes", "FROM_DB", 0, undefined]);
    assert.match(r.stdout, /^가져오기 반영 rev 1 \(baseRev 0\) · 표 3 · /m);

    // 이미 표가 있는 모델: 시험 실행은 미리 막고, 실제 서버는 INVALID 로 거절한다
    const dryAgain = await cli(["import", "--model", "mes"], { env });
    assert.equal(dryAgain.code, 1);
    assert.match(dryAgain.stdout, /첫 가져오기를 할 수 없습니다: 표가 3개 있습니다/);
    const again = await cli(["import", "--model", "mes", "--base-rev", "1", "--apply"], { env });
    assert.equal(again.code, 1);
    assert.match(again.stdout, /^거절 INVALID/m);
    assert.match(again.stdout, /이미 표가 있습니다\(3개\)/);
    const ahead = await cli(["import", "--model", "mes", "--base-rev", "9", "--apply"], { env });
    assert.equal(ahead.code, 1);
    assert.match(ahead.stdout, /baseRev 가 현재 rev\(1\)보다 큽니다/);
  } finally {
    await fake.close();
  }
});

test("delete-model: --yes 없이는 거절(2, 서버 안 부름). --yes 는 경고를 stderr 에 내고 delete kind=MODEL. 거절은 서버가 준 이유", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const no = await cli(["delete-model", "--model", "old"], { env });
    assert.equal(no.code, 2);
    assert.match(no.stderr, /^오류: delete-model 은 --yes 를 줘야 합니다/);
    assert.match(no.stderr, /되돌릴 수 없습니다/);
    assert.doesNotMatch(no.stderr, /^사용: /m); // 사용 안내 대신 설명만
    assert.equal(fake.requests.length, 0);

    const noUser = await cli(["delete-model", "--model", "old", "--yes"], { env: { ERD_BASE: fake.url } });
    assert.equal(noUser.code, 2);
    assert.match(noUser.stderr, /--yes 에는 --user 나 ERD_USER/);
    assert.equal(fake.requests.length, 0);

    const yes = await cli(["delete-model", "--model", "old", "--yes"], { env });
    assert.equal(yes.code, 0, yes.stderr);
    assert.match(yes.stderr, /^erd-cli delete-model: 모델 완전 삭제\(--yes, 되돌릴 수 없음\) · /m);
    assert.match(yes.stderr, /^경고: 모델 old\(모듈 old · 스키마 OLDUSER · 이름 OLD\) 을 완전히 지웁니다\. 되돌릴 수 없습니다\./m);
    assert.match(yes.stdout, /^모델 삭제됨\(되돌릴 수 없음\): old /);
    const del = fake.requests.find((x) => x.action === "delete").params;
    assert.deepEqual([del.modelId, del.kind, del.source], ["old", "MODEL", "CLI"]);

    // 확정본이 있는 모델은 비관리자 거절(종료 1): 서버의 이유가 나오고 편집 안내(공동 편집자·getModelText)는 나오지 않는다
    const denied = await cli(["delete-model", "--model", "mcm", "--yes"], { env: { ...env, ERD_USER: "41000207" } });
    assert.equal(denied.code, 1);
    assert.match(denied.stderr, /\[MDM003\] DRAFT 소유자만 할 수 있습니다: 확정·요청·승인된 버전\(RELEASED 1\.000\)이 있는 모델은 관리자/);
    assert.match(denied.stderr, /다음: 모델 삭제는 관리자\(MDM_STD_ADMIN·SYSADMIN\)나 RELEASED·REQUESTED·APPROVED 버전이 하나도 없고 DRAFT 소유자일 때만 됩니다/);
    assert.doesNotMatch(denied.stderr, /공동 편집자|getModelText/);
    const n = fake.requests.filter((x) => x.action === "delete").length;
    const none = await cli(["delete-model", "--model", "ghost", "--yes"], { env });
    assert.equal(none.code, 1);
    assert.match(none.stdout, /^지울 모델이 없습니다: ghost/);
    assert.equal(fake.requests.filter((x) => x.action === "delete").length, n);

    const admin = await cli(["delete-model", "--model", "mcm", "--yes"], { env: { ...env, ERD_ROLE: "MDM_STD_ADMIN" } });
    assert.equal(admin.code, 0, admin.stderr);
  } finally {
    await fake.close();
  }
});

/** 같은 이름의 다이어그램이 두 업무영역에 있는 view. */
const DUP_VIEW = { ...VIEW_ROUTES, diagrams: [...VIEW_ROUTES.diagrams, { id: "d-dup", areaName: "기본", diagramName: "메뉴 화면", sortSeq: 2 }] };

test("같은 다이어그램 이름이 두 업무영역에 있으면 이름만으로는 거절(종료 1, save 없음), 업무영역/이름이나 id 는 통과", async () => {
  const fake = await startFakeOasis((action, params) => {
    if (action === "view" && params.kind == null) return success(DUP_VIEW);
    if (action === "save") return success({ ...APPLIED_13, applied: params.dryRun !== true, dryRun: params.dryRun === true, changes: [] });
    return failure("MDM000", "모름");
  });
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    for (const args of [["diagram-rename", "메뉴 화면", "--name", "x"], ["diagram-copy", "메뉴 화면"], ["diagram-delete", "메뉴 화면"]]) {
      const r = await cli([...args, "--model", "mcm", "--base-rev", "12"], { env });
      assert.equal(r.code, 1, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stdout, /^이름 풀기 실패 1건/, args.join(" "));
      assert.match(r.stdout, /다이어그램 이름이 여러 개입니다: 메뉴 화면/, args.join(" "));
      assert.match(r.stdout, /기본\/메뉴 화면/);
      assert.match(r.stdout, /메뉴\/메뉴 화면/);
    }
    assert.equal(saved(fake).length, 0);
    const byArea = await cli(["diagram-rename", "메뉴/메뉴 화면", "--model", "mcm", "--base-rev", "12", "--name", "x"], { env });
    assert.equal(byArea.code, 0, byArea.stdout);
    const byId = await cli(["diagram-copy", "d-dup", "--model", "mcm", "--base-rev", "12"], { env });
    assert.equal(byId.code, 0, byId.stdout);
    const sent = saved(fake);
    assert.equal(sent[0].commands[0].id, "d-menu");
    assert.deepEqual([sent[1].commands[0].from, sent[1].commands[0].areaName, sent[1].commands[0].diagramName], ["d-dup", "기본", "메뉴 화면 복사"]);
  } finally {
    await fake.close();
  }
});

test("모델 관리 명령의 사용 오류는 종료 코드 2 이고 서버를 부르지 않는다", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const cases = [
      [["diagrams"], /--model 이 필요합니다/],
      [["diagram-rename", "d-menu", "--model", "mcm", "--name", "x"], /diagram-rename 에는 --base-rev 가 필요합니다/],
      [["diagram-rename", "--model", "mcm", "--base-rev", "1", "--name", "x"], /diagram-rename 에는 다이어그램 하나가 필요합니다/],
      [["diagram-delete", "a", "b", "--model", "mcm", "--base-rev", "1"], /diagram-delete 에는 다이어그램 하나가 필요합니다/],
      [["diagram-rename", "d-menu", "--model", "mcm", "--base-rev", "1"], /--name\(새 이름\)이나 --area\(새 업무영역\)가 필요합니다/],
      [["diagram-copy", "d-menu", "--model", "mcm", "--base-rev", "1", "--id", "x-1"], /--id 는 d- 로 시작/],
      [["diagram-delete", "d-menu", "--model", "mcm", "--base-rev", "1", "--name", "x"], /--name 은 diagram-rename·diagram-copy·register 에만/],
      [["register", "--schema", "x", "--name", "n"], /register 에는 --module 값이 필요합니다/],
      [["register", "--module", "m", "--name", "n"], /register 에는 --schema 값이 필요합니다/],
      [["register", "--module", "m", "--schema", "s"], /register 에는 --name 값이 필요합니다/],
      [["import"], /--model 이 필요합니다/],
      [["models", "--yes"], /--yes 는 delete-model 에만/],
      [["delete-model", "--yes"], /--model 이 필요합니다/],
      [["delete-model", "--model", "x", "--yes", "--apply"], /--apply 는/],
      [["models", "--module", "x"], /--module 은 register 에만/],
      [["import", "--model", "x", "--base-rev", "-1"], /--base-rev 에 값이 없습니다|--base-rev 는 0 이상의 정수/],
    ];
    for (const [args, re] of cases) {
      const r = await cli(args, { env });
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, re, args.join(" "));
      assert.doesNotMatch(r.stderr, /^erd-cli \S+: /m, `${args.join(" ")}: 모드 머리줄이 먼저 나갔다`);
    }
    assert.equal(fake.requests.length, 0);
    const help = await cli(["--help"]);
    assert.match(help.stdout, /diagrams\s+--model/);
    assert.match(help.stdout, /delete-model --model M --yes/);
    assert.match(help.stdout, /되돌릴 수 없다/);
  } finally {
    await fake.close();
  }
});
