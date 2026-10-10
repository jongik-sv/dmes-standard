import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OasisError, OasisUnreachableError, configFromEnv, createOasisClient, describeError, sessionName } from "../lib/oasis.mjs";
import { failure, gridSuccess, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

const OASIS = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "oasis.mjs");

/** 새 node 프로세스의 configFromEnv(process.env).session. env 가 그 프로세스의 환경 전부다(이 프로세스 값을 물려주지 않는다). */
function childSession(env) {
  const code = `import { configFromEnv } from ${JSON.stringify(pathToFileURL(OASIS).href)}; console.log(configFromEnv(process.env).session);`;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ["--input-type=module", "-e", code], { env }, (e, out) => (e ? reject(e) : resolve(out.trim())));
  });
}

test("환경변수 기본값과 덮어쓰기", () => {
  const d = configFromEnv({});
  assert.match(d.session, /^mcp-[0-9a-f]{8}$/);
  assert.deepEqual(
    { ...d, session: "-" },
    {
      base: "http://localhost:8096",
      clientKey: "dmes-bff-local-client-key-2026",
      user: "erd-mcp",
      role: "MDM_STEWARD",
      session: "-",
      source: "MCP",
      timeoutMs: 30000,
    },
  );
  const c = configFromEnv({ ERD_BASE: "http://h:1/", ERD_USER: "41000207", ERD_ROLE: "MDM_STD_ADMIN", BACKEND_CLIENT_KEY: "k", ERD_SESSION: "claude-a" });
  assert.deepEqual([c.base, c.user, c.role, c.clientKey, c.session, c.source], ["http://h:1", "41000207", "MDM_STD_ADMIN", "k", "claude-a", "MCP"]);
  assert.equal(configFromEnv({}, { kind: "cli" }).source, "CLI");
});

test("sessionNameDerivesFromClaudeSessionId", async () => {
  // 자기 CLAUDE_CODE_SESSION_ID 가 다르면 이름이 다르다. - 를 빼고 앞 8글자, 소문자.
  const a = configFromEnv({ CLAUDE_CODE_SESSION_ID: "12AEF901-3b4c-4d5e-8f60-718293a4b5c6", ERD_SESSION: "auto" });
  const b = configFromEnv({ CLAUDE_CODE_SESSION_ID: "2f15d175-0000-4000-8000-000000000000", ERD_SESSION: "auto" });
  assert.equal(a.session, "claude-12aef901");
  assert.equal(b.session, "claude-2f15d175");
  assert.equal(configFromEnv({ CLAUDE_CODE_SESSION_ID: "1-2-3-4-5-6-7-8-9" }).session, "claude-12345678");
  // 빈 ERD_SESSION 도 자동이다. 명시한 값은 그대로 이긴다.
  assert.equal(configFromEnv({ CLAUDE_CODE_SESSION_ID: "12aef901-x", ERD_SESSION: "  " }).session, "claude-12aef901");
  assert.equal(configFromEnv({ CLAUDE_CODE_SESSION_ID: "12aef901-x", ERD_SESSION: "claude-a" }).session, "claude-a");
  // 인자(CLI --session)가 가장 먼저다. CLI 의 자동 이름은 cli-<사용자>.
  assert.equal(configFromEnv({ ERD_SESSION: "claude-a" }, { kind: "cli", session: "cli-close" }).session, "cli-close");
  assert.equal(configFromEnv({ ERD_USER: "erd-mcp-b" }, { kind: "cli" }).session, "cli-erd-mcp-b");
  assert.equal(configFromEnv({ ERD_SESSION: "auto" }, { kind: "cli" }).session, "cli-erd-mcp");
  // 세션 id 가 없으면 프로세스마다 mcp-<임의 8글자>: 같은 프로세스에서는 같고, 다른 프로세스와는 다르다.
  const here = configFromEnv({}).session;
  assert.match(here, /^mcp-[0-9a-f]{8}$/);
  assert.equal(configFromEnv({ ERD_SESSION: "auto" }).session, here);
  const other = await childSession({ ERD_SESSION: "auto" });
  assert.match(other, /^mcp-[0-9a-f]{8}$/);
  assert.notEqual(other, here);
  // 중첩 실행: 두 자식 프로세스는 각자 받은 세션 id 로 정한다(부모 id 가 아니다).
  const [n1, n2] = await Promise.all([
    childSession({ ERD_SESSION: "auto", CLAUDE_CODE_SESSION_ID: "aaaaaaaa-1111-4111-8111-111111111111" }),
    childSession({ ERD_SESSION: "auto", CLAUDE_CODE_SESSION_ID: "bbbbbbbb-2222-4222-8222-222222222222" }),
  ]);
  assert.deepEqual([n1, n2], ["claude-aaaaaaaa", "claude-bbbbbbbb"]);
});

test("세션 이름은 1~100자다", () => {
  assert.equal(sessionName({ ERD_SESSION: "x".repeat(100) }).length, 100);
  assert.throws(() => configFromEnv({ ERD_SESSION: "x".repeat(101) }), /세션 이름은 1~100자입니다\(101자\)/);
});

test("요청 경로·헤더·본문(null 제거, session·source)과 data.result", async () => {
  const fake = await startFakeOasis(() => success({ rev: 3 }));
  try {
    const client = createOasisClient({ ...configFromEnv({ ERD_BASE: fake.url, ERD_USER: "41000207", ERD_SESSION: "claude-t" }), timeoutMs: 2000 });
    assert.deepEqual(await client.call("view", { modelId: "mcm", kind: null, ver: undefined }), { rev: 3 });
    const [r] = fake.requests;
    assert.equal(r.action, "view");
    assert.deepEqual(r.body, { meta: { menuId: "erdEdit" }, params: { session: "claude-t", source: "MCP", modelId: "mcm" } });
    assert.equal(r.headers["x-client-key"], "dmes-bff-local-client-key-2026");
    assert.equal(r.headers["x-authenticated-user"], "41000207");
    assert.equal(r.headers["x-authenticated-role"], "MDM_STEWARD");
    assert.equal(r.headers["content-type"], "application/json");
    await client.call("view", { modelId: "mcm", session: "ui-x" }); // 호출자가 준 값이 이긴다
    assert.equal(fake.requests[1].params.session, "ui-x");
  } finally {
    await fake.close();
  }
});

test("목록 액션(search)은 grids.result.rows 로 읽는다", async () => {
  const fake = await startFakeOasis(() => gridSuccess([{ modelId: "mcm" }, { modelId: "mdm" }]));
  try {
    const client = createOasisClient({ ...configFromEnv({ ERD_BASE: fake.url }, { kind: "cli" }), timeoutMs: 2000 });
    assert.deepEqual(await client.rows("search"), [{ modelId: "mcm" }, { modelId: "mdm" }]);
    assert.equal(fake.requests[0].params.source, "CLI");
  } finally {
    await fake.close();
  }
});

test("업무 오류·JSON 아닌 본문은 OasisError, 다음 할 일이 붙는다", async () => {
  const fake = await startFakeOasis((action) =>
    action === "view" ? failure("MDM029", "ERD 모델이 없습니다") : action === "save" ? failure("MDM003", "DRAFT 소유자만 할 수 있습니다") : { status: 401, body: "Unauthorized" },
  );
  try {
    const config = { ...configFromEnv({ ERD_BASE: fake.url }), timeoutMs: 2000 };
    const client = createOasisClient(config);
    const e1 = await client.call("view", { modelId: "x" }).catch((e) => e);
    assert.ok(e1 instanceof OasisError);
    assert.equal(e1.code, "MDM029");
    assert.match(describeError(e1, config), /^\[MDM029\] ERD 모델이 없습니다\n다음: modelId 를 확인하세요/);
    const e2 = await client.call("compare", { modelId: "x" }).catch((e) => e);
    assert.ok(e2 instanceof OasisError);
    assert.equal(e2.status, 401);
    assert.match(describeError(e2, config), /BACKEND_CLIENT_KEY/);
    // MDM002(DRAFT 아님)·MDM003(DRAFT 소유자 아님)은 늘 나는 경우와 경쟁(deferred 27 수정 뒤)이 같은 코드다. 상태를 보고 한 번만 다시 보내라고 한다.
    const e3 = await client.call("save", { modelId: "mcm" }).catch((e) => e);
    assert.match(describeError(e3, config), /^\[MDM003\] .*\n다음: getModelText 머리줄로 DRAFT 인지 보고, .*다시 읽고 한 번만 다시 보내세요\. 아니면 사용자에게/);
  } finally {
    await fake.close();
  }
});

test("닿지 못함·시간 초과는 OasisUnreachableError 이고 ERD_BASE 를 안내한다", async () => {
  const fake = await startFakeOasis(() => ({ ...success({}), delayMs: 1000 }));
  try {
    const config = { ...configFromEnv({ ERD_BASE: fake.url }), timeoutMs: 100 };
    const slow = await createOasisClient(config).call("view", { modelId: "mcm" }).catch((e) => e);
    assert.ok(slow instanceof OasisUnreachableError);
    assert.match(describeError(slow, config), /ERD_BASE/);
  } finally {
    await fake.close();
  }
  const closed = { ...configFromEnv({ ERD_BASE: "http://127.0.0.1:9" }), timeoutMs: 2000 };
  const down = await createOasisClient(closed).call("view", { modelId: "mcm" }).catch((e) => e);
  assert.ok(down instanceof OasisUnreachableError);
  assert.match(down.message, /127\.0\.0\.1:9 에 닿지 못했습니다\(erdEdit\/view\)/);
});
