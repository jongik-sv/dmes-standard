import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, STATUS, VIEW } from "./fixtures/erd-view.mjs";
import { failure, gridSuccess, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "erd-cli.mjs");

/**
 * CLI 를 자식 프로세스로 돌린다. 환경은 PATH 와 env 만 준다(이 프로세스의 ERD_*·CLAUDE_CODE_SESSION_ID 를 물려주지 않는다).
 * spawnSync 는 쓰지 않는다 — 같은 프로세스의 가짜 서버가 응답하지 못한다.
 */
function cli(args, { env = {}, input = "" } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (c) => (stdout += c));
    child.stderr.setEncoding("utf8").on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

/** VIEW 는 rev 12. save: baseRev 5 면 CONFLICT, dryRun 이면 통과, 아니면 rev 13. restore: rev 13 은 처음만 반영, 다시 하면 INVALID(S2-24). */
function makeRoute() {
  const undone = new Set();
  return (action, params) => {
    if (action === "search") return gridSuccess([{ modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM", rev: 12, draftVer: "1.001", ownerId: "admin" }]);
    if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
    if (action === "view" && params.kind === "STATUS") return success(STATUS);
    if (action === "view" && params.sinceRev != null) return success({ rev: 13, reload: false, deltas: [DELTA_UI_11, DELTA_ME_13].filter((d) => d.rev > params.sinceRev) });
    if (action === "view") return success(VIEW);
    if (action === "compare") return success({ modelId: "mcm", rev: 12, schema: "MCMAPUSER", items: [] });
    if (action === "save" && params.baseRev === 5) return success({ applied: false, rev: 12, rowVersion: null, dryRun: params.dryRun === true, changes: [], warnings: [], rejection: CONFLICT_REJECTION });
    if (action === "save" && params.dryRun === true) return success({ ...APPLIED_13, applied: false, rev: 12, rowVersion: null, dryRun: true });
    if (action === "save") return success(APPLIED_13);
    if (action === "restore") {
      if (params.dryRun !== true && undone.has(params.rev)) {
        return success({ applied: false, rev: 14, rowVersion: null, dryRun: false, changes: [], warnings: [], rejection: { ...CONFLICT_REJECTION, code: "INVALID", message: "되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다", hint: null, elementId: null, property: null, byRev: null, bySession: null, byUserId: null, current: null } });
      }
      if (params.dryRun !== true) undone.add(params.rev);
      return success({ ...APPLIED_13, applied: params.dryRun !== true, rev: params.dryRun === true ? 13 : 14, dryRun: params.dryRun === true });
    }
    if (action === "execute") return success(params.kind === "CLAIM" ? { ok: false, claimedBy: "claude-a", userId: "erd-mcp-a", expiresAt: "2026-10-11T05:20:00Z" } : { ok: true });
    return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
  };
}

test("apply: 기본은 서버 시험 실행, --apply 는 사용자를 명시해야 저장한다, 거절은 1, 이름 풀기 실패는 save 없이 1", async () => {
  const fake = await startFakeOasis(makeRoute());
  const dir = mkdtempSync(join(tmpdir(), "erd-cli-"));
  try {
    const file = join(dir, "batch.json");
    writeFileSync(file, JSON.stringify({ modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU_NM", set: { comment: "CLI 주석" } }] }));
    const base = { ERD_BASE: fake.url };

    const dry = await cli(["apply", "--model", "mcm", "--file", file], { env: { ...base, ERD_USER: "erd-mcp-b" } });
    assert.equal(dry.code, 0, dry.stderr);
    assert.equal(dry.stdout.split("\n")[0], "시험 실행(저장 안 함) · 통과");
    assert.match(dry.stderr, /^erd-cli apply: 시험 실행\(저장 안 함, 저장하려면 --apply\) · http:\/\/127\.0\.0\.1:\d+ · 사용자 erd-mcp-b · 세션 cli-erd-mcp-b$/m);
    const s1 = fake.requests.filter((r) => r.action === "save")[0].params;
    assert.deepEqual(
      { dryRun: s1.dryRun, source: s1.source, session: s1.session, baseRev: s1.baseRev, commands: JSON.parse(s1.commandsJson) },
      { dryRun: true, source: "CLI", session: "cli-erd-mcp-b", baseRev: 10, commands: [{ op: "updateColumn", id: "c-m3", set: { comment: "CLI 주석" } }] },
    );

    const n = fake.requests.length;
    const noUser = await cli(["apply", "--model", "mcm", "--file", file, "--apply"], { env: base });
    assert.equal(noUser.code, 2);
    assert.match(noUser.stderr, /^오류: --apply 에는 --user 나 ERD_USER/);
    assert.equal(fake.requests.length, n); // 서버를 부르지 않았다

    const applied = await cli(["apply", "--model", "mcm", "--file", file, "--apply", "--session", "cli-close"], { env: { ...base, ERD_USER: "erd-mcp-b" } });
    assert.equal(applied.code, 0, applied.stderr);
    assert.match(applied.stdout, /^반영 rev 13 \(baseRev 10\) · 변경 1 · 경고 0 · 세션 cli-close$/m);
    assert.match(applied.stdout, /^다음 baseRev: 13$/m);
    const s2 = fake.requests.filter((r) => r.action === "save")[1].params;
    assert.deepEqual([s2.dryRun, s2.session, s2.source, typeof s2.commandsJson], [undefined, "cli-close", "CLI", "string"]);
    assert.equal(fake.requests.at(-1).headers["x-authenticated-user"], "erd-mcp-b");

    // --user 도 사용자 명시다. 거절(CONFLICT)은 종료 코드 1.
    writeFileSync(file, JSON.stringify([{ op: "updateColumn", id: "c-m3", set: { logical: "x" } }]));
    const conflict = await cli(["apply", "--model", "mcm", "--file", file, "--base-rev", "5", "--apply", "--user", "erd-mcp-a"], { env: base });
    assert.equal(conflict.code, 1);
    assert.match(conflict.stdout, /^거절 CONFLICT · 명령 #1 updateColumn TB_MCM_SEC_MENU\.MENU_NM\.logical · 저장한 것 없음$/m);

    const saves = fake.requests.filter((r) => r.action === "save").length;
    writeFileSync(file, JSON.stringify([{ op: "updateColumn", id: "TB_NOPE.X", set: {} }]));
    const unknown = await cli(["apply", "--model", "mcm", "--file", file, "--base-rev", "12"], { env: base });
    assert.equal(unknown.code, 1);
    assert.match(unknown.stdout, /^이름 풀기 실패 1건/);
    assert.equal(fake.requests.filter((r) => r.action === "save").length, saves);

    const json = await cli(["apply", "--model", "mcm", "--file", "-", "--base-rev", "12", "--json"], {
      env: { ...base, ERD_USER: "erd-mcp-b" },
      input: JSON.stringify([{ op: "updateColumn", id: "c-m1", set: { comment: "표준 입력" } }]),
    });
    assert.equal(json.code, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout).dryRun, true); // --json 은 서버 결과 그대로
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});

test("사용 오류는 종료 코드 2 이고 서버를 부르지 않는다", async () => {
  const fake = await startFakeOasis(makeRoute());
  const dir = mkdtempSync(join(tmpdir(), "erd-cli-"));
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const bare = join(dir, "bare.json");
    writeFileSync(bare, JSON.stringify([{ op: "updateColumn", id: "c-m1", set: {} }]));
    const cases = [
      [["apply", "--model", "mcm"], /apply 에는 --file 이 필요합니다/], // 표준 입력으로 넘어가지 않는다
      [["apply", "--model", "mcm", "--file", bare], /명령 배열만 준 묶음은 --base-rev 가 필요합니다/],
      [["apply", "--model", "mcm", "--file", join(dir, "nope.json")], /묶음 파일을 읽을 수 없습니다/],
      [["apply", "--model", "mdm", "--file", "-"], /--model\(mdm\)과 묶음의 modelId\(mcm\)가 다릅니다/],
      [["text"], /--model 이 필요합니다/],
      [["claim", "--model", "mcm", "TB_MCM_SEC_MENU", "--apply"], /작업 중 표시는 모델을 바꾸지 않아 --apply 없이 보낸다/],
      [["confirm", "--model", "mcm", "r-1"], /confirm 에는 --base-rev 가 필요합니다/],
      [["undo", "--model", "mcm", "--rev", "0"], /--rev 는 1 이상의 정수입니다/],
      [["changes", "--model", "mcm"], /--since 는 0 이상의 정수입니다/],
      [["violations", "--model", "mcm", "--status", "OK"], /--status 는 NEW·TYPE·DOMAIN·MISS/],
      [["nope"], /모르는 명령: nope/],
      [["text", "--model", "mcm", "--bogus"], /알 수 없는 인자: --bogus/],
      [["release", "--model", "mcm"], /release 에는 표가 하나 이상 필요합니다/],
      // 값 옵션 뒤가 또 다른 옵션이면 값이 없는 것이다(--file --apply 가 파일 이름 "--apply" 로 읽히지 않는다)
      [["apply", "--model", "mcm", "--file", "--apply"], /--file 에 값이 없습니다/],
      [["apply", "--model", "mcm", "--file"], /--file 에 값이 없습니다/],
      [["confirm", "--model", "mcm", "r-1", "--base-rev", "--apply"], /--base-rev 에 값이 없습니다/],
      [["text", "--model", "--json"], /--model 에 값이 없습니다/],
      // --apply 는 쓰기 명령에만 쓴다
      [["text", "--model", "mcm", "--apply"], /--apply 는 apply·confirm·reject·undo 에만 씁니다\(text 는 읽기다\)/],
      [["changes", "--model", "mcm", "--since", "1", "--apply"], /\(changes 는 읽기다\)/],
      [["violations", "--model", "mcm", "--apply"], /\(violations 는 읽기다\)/],
      [["inferred", "--model", "mcm", "--apply"], /\(inferred 는 읽기다\)/],
      [["db-diff", "--model", "mcm", "--apply"], /\(db-diff 는 읽기다\)/],
      [["models", "--apply"], /\(models 는 읽기다\)/],
    ];
    for (const [args, re] of cases) {
      const r = await cli(args, { env, input: JSON.stringify({ modelId: "mcm", baseRev: 1, commands: [{ op: "x" }] }) });
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, re, args.join(" "));
      assert.match(r.stderr, /^사용: node scripts\/erd\/erd-cli\.mjs/m);
      assert.doesNotMatch(r.stderr, /^erd-cli \S+: /m, `${args.join(" ")}: 사용 오류인데 모드 머리줄이 먼저 나갔다`);
    }
    assert.equal(fake.requests.length, 0);
    const help = await cli(["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /시험 실행도 서버가 편집자 검사를 한다\. ERD_USER\(또는 --user\)가 그 DRAFT 의 소유자나 공동 편집자여야 "통과" 가 나온다\./);
    assert.match(help.stdout, /기본 사용자 erd-mcp 로 돌리면 NOT_EDITOR 거절이다\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});

test("undo: --rev·--session, 두 번째 되돌리기는 INVALID 로 1. claim 은 --apply 없이, 읽기 명령", async () => {
  const fake = await startFakeOasis(makeRoute());
  try {
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const dry = await cli(["undo", "--model", "mcm", "--rev", "13"], { env });
    assert.equal(dry.code, 0, dry.stderr);
    assert.equal(dry.stdout.split("\n")[0], "시험 실행(저장 안 함) · 통과");
    const first = await cli(["undo", "--model", "mcm", "--rev", "13", "--apply", "--session", "cli-close"], { env });
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /^반영 rev 14 \(되돌리기 rev 13\) · 변경 1 · 경고 0 · 세션 cli-close$/m);
    assert.match(first.stdout, /^되돌린 변경: rev 13 · 41000207 \(세션 claude-test\) · 1건$/m);
    const restores = fake.requests.filter((r) => r.action === "restore").map((r) => [r.params.rev, r.params.session, r.params.dryRun ?? false]);
    assert.deepEqual(restores, [[13, "cli-erd-mcp-b", true], [13, "cli-close", false]]);
    const again = await cli(["undo", "--model", "mcm", "--rev", "13", "--apply", "--session", "cli-close"], { env });
    assert.equal(again.code, 1);
    assert.match(again.stdout, /^거절 INVALID · 되돌리기 rev 13 · 저장한 것 없음$/m);
    assert.match(again.stdout, /^내용: 되돌릴 변경이 없습니다\. 이미 되돌렸거나 값이 같습니다$/m);

    // 작업 중 표시: ERD_USER 없이도 보낸다. 못 잡아도 오류가 아니다.
    const claim = await cli(["claim", "--model", "mcm", "TB_MCM_SEC_MENU"], { env: { ERD_BASE: fake.url } });
    assert.equal(claim.code, 0, claim.stderr);
    assert.match(claim.stdout, /^TB_MCM_SEC_MENU 못 잡음: claude-a \(erd-mcp-a\) 가 \d\d:\d\d\([+-]\d\d:\d\d\)까지 작업 중$/m);
    const exec = fake.requests.find((r) => r.action === "execute").params;
    assert.deepEqual([exec.kind, exec.tableId, exec.session, exec.source, exec.dryRun], ["CLAIM", "t-menu", "cli-erd-mcp", "CLI", undefined]);

    const models = await cli(["models"], { env });
    assert.equal(models.stdout, "# 모델 1개\nmcm mcm MCMAPUSER MCM · rev 12 · DRAFT 1.001 · 소유자 admin\n");
    const text = await cli(["text", "--model", "mcm", "--tables", "TB_MCM_SEC_OBJ"], { env });
    assert.match(text.stdout, /^# MCM 모델 \(MCMAPUSER\) ver 1\.000 DRAFT rev 12\nTB_MCM_SEC_OBJ 오브젝트 \{/);
    const changes = await cli(["changes", "--model", "mcm", "--since", "10", "--session", "ui-41000207"], { env });
    assert.match(changes.stdout, /^# rev 10 이후 변경 2건 \(현재 rev 13\) · 보인 것 1건\(세션 ui-41000207 만\)$/m);
    assert.equal(fake.requests.at(-1).params.session, "cli-erd-mcp-b"); // changes 의 --session 은 거르기다
    const down = await cli(["text", "--model", "mcm"], { env: { ERD_BASE: "http://127.0.0.1:9" } });
    assert.equal(down.code, 1);
    assert.match(down.stderr, /에 닿지 못했습니다/);
  } finally {
    await fake.close();
  }
});

test("apply: --base-rev 는 묶음 파일의 baseRev 를 덮는다", async () => {
  const fake = await startFakeOasis(makeRoute());
  const dir = mkdtempSync(join(tmpdir(), "erd-cli-"));
  try {
    const file = join(dir, "batch.json");
    writeFileSync(file, JSON.stringify({ modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "c-m1", set: { comment: "덮기" } }] }));
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const over = await cli(["apply", "--model", "mcm", "--file", file, "--base-rev", "12"], { env });
    assert.equal(over.code, 0, over.stderr);
    const keep = await cli(["apply", "--model", "mcm", "--file", file], { env });
    assert.equal(keep.code, 0, keep.stderr);
    const saves = fake.requests.filter((r) => r.action === "save").map((r) => r.params.baseRev);
    assert.deepEqual(saves, [12, 10]); // 옵션이 있으면 12, 없으면 파일의 10
    assert.match(over.stdout, /\(baseRev 12\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});

test("서버가 dryRun 을 몰라 저장했다면 주의 줄을 내고 종료 코드 1", async () => {
  const route = makeRoute();
  const fake = await startFakeOasis((action, params, req) => (action === "save" ? success({ ...APPLIED_13, applied: true, dryRun: false }) : route(action, params, req)));
  const dir = mkdtempSync(join(tmpdir(), "erd-cli-"));
  try {
    const file = join(dir, "batch.json");
    writeFileSync(file, JSON.stringify({ modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "c-m1", set: { comment: "무시" } }] }));
    const r = await cli(["apply", "--model", "mcm", "--file", file], { env: { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" } });
    assert.equal(fake.requests.find((q) => q.action === "save").params.dryRun, true); // 시험 실행으로 보냈다
    assert.equal(r.code, 1);
    assert.match(r.stdout, /^주의: 서버가 시험 실행\(dryRun\)을 지원하지 않아 실제로 반영했습니다 · 반영 rev 13 \(baseRev 10\)/m);
    assert.match(r.stdout, /^다음: 저장을 원하지 않았다면 undo\(rev=13\) 로 되돌리세요\.$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});

test("세션 이름: --session > ERD_SESSION > cli-<사용자>(ERD_SESSION=auto 는 건너뛴다)", async () => {
  const fake = await startFakeOasis(makeRoute());
  const dir = mkdtempSync(join(tmpdir(), "erd-cli-"));
  try {
    const file = join(dir, "batch.json");
    writeFileSync(file, JSON.stringify({ modelId: "mcm", baseRev: 10, commands: [{ op: "updateColumn", id: "c-m1", set: { comment: "세션" } }] }));
    const env = { ERD_BASE: fake.url, ERD_USER: "erd-mcp-b" };
    const run = async (extra, e) => {
      const before = fake.requests.length;
      const r = await cli(["apply", "--model", "mcm", "--file", file, ...extra], { env: e });
      assert.equal(r.code, 0, r.stderr);
      return { session: fake.requests.slice(before).find((q) => q.action === "save").params.session, stderr: r.stderr };
    };
    const fromEnv = await run([], { ...env, ERD_SESSION: "env-sess" });
    assert.equal(fromEnv.session, "env-sess");
    assert.match(fromEnv.stderr, / · 세션 env-sess$/m);
    assert.equal((await run(["--session", "opt-sess"], { ...env, ERD_SESSION: "env-sess" })).session, "opt-sess");
    assert.equal((await run([], { ...env, ERD_SESSION: "auto" })).session, "cli-erd-mcp-b");
    assert.equal((await run([], env)).session, "cli-erd-mcp-b");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});

/** 소스의 모듈 지정자: import … from, export … from, import "x", import("x"), require("x"). 주석은 먼저 걷는다. */
function moduleSpecifiers(source) {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const patterns = [
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((re) => [...src.matchAll(re)].map((m) => m[1]));
}
const FORBIDDEN = /^(@modelcontextprotocol\/|zod($|\/))/;

test("import 훑기: from 없는 import·동적 import·export from 도 잡는다", () => {
  const src = [
    '// import { z } from "zod";',
    "/* import 'zod'; */",
    'import { a } from "./a.mjs";',
    "import {",
    "  b,",
    '} from "../b.mjs";',
    'import "./side.mjs";',
    'import "zod";',
    'const m = await import("@modelcontextprotocol/sdk/server/mcp.js");',
    'export * from "./c.mjs";',
    'import fs from "node:fs";',
  ].join("\n");
  assert.deepEqual(moduleSpecifiers(src).sort(), ["../b.mjs", "./a.mjs", "./c.mjs", "./side.mjs", "@modelcontextprotocol/sdk/server/mcp.js", "node:fs", "zod"].sort());
  assert.deepEqual(moduleSpecifiers(src).filter((s) => FORBIDDEN.test(s)).sort(), ["@modelcontextprotocol/sdk/server/mcp.js", "zod"]);
});

test("CLI 는 MCP SDK·zod 를 import 하지 않는다(pnpm install 없이 돈다)", () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of moduleSpecifiers(readFileSync(file, "utf8"))) {
      assert.doesNotMatch(spec, FORBIDDEN, `${file}: ${spec}`);
      if (/^\.{1,2}\//.test(spec)) walk(join(dirname(file), spec));
    }
  };
  walk(CLI);
  assert.ok(seen.size >= 5, [...seen].join(", ")); // erd-cli, flows, commands, results, model-text, oasis
});
