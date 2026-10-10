import assert from "node:assert/strict";
import test from "node:test";
import { OasisError, OasisUnreachableError, configFromEnv, createOasisClient, describeError } from "../lib/oasis.mjs";
import { failure, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

test("환경변수 기본값과 덮어쓰기", () => {
  assert.deepEqual(configFromEnv({}), {
    base: "http://localhost:8096",
    clientKey: "dmes-bff-local-client-key-2026",
    user: "erd-mcp",
    role: "MDM_STEWARD",
    session: "mcp-erd-mcp",
    timeoutMs: 30000,
  });
  const c = configFromEnv({ ERD_BASE: "http://h:1/", ERD_USER: "41000207", ERD_ROLE: "MDM_STD_ADMIN", BACKEND_CLIENT_KEY: "k", ERD_SESSION: "claude-a" });
  assert.deepEqual([c.base, c.user, c.role, c.clientKey, c.session], ["http://h:1", "41000207", "MDM_STD_ADMIN", "k", "claude-a"]);
});

test("요청 경로·헤더·본문(null 제거)과 data.result", async () => {
  const fake = await startFakeOasis(() => success({ rev: 3 }));
  try {
    const client = createOasisClient({ ...configFromEnv({ ERD_BASE: fake.url, ERD_USER: "41000207" }), timeoutMs: 2000 });
    assert.deepEqual(await client.call("view", { modelId: "mcm", kind: null, ver: undefined }), { rev: 3 });
    const [r] = fake.requests;
    assert.equal(r.action, "view");
    assert.deepEqual(r.body, { meta: { menuId: "erdEdit" }, params: { modelId: "mcm" } });
    assert.equal(r.headers["x-client-key"], "dmes-bff-local-client-key-2026");
    assert.equal(r.headers["x-authenticated-user"], "41000207");
    assert.equal(r.headers["x-authenticated-role"], "MDM_STEWARD");
    assert.equal(r.headers["content-type"], "application/json");
  } finally {
    await fake.close();
  }
});

test("업무 오류·JSON 아닌 본문은 OasisError, 다음 할 일이 붙는다", async () => {
  const fake = await startFakeOasis((action) =>
    action === "view" ? failure("MDM029", "ERD 모델이 없습니다") : { status: 401, body: "Unauthorized" },
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
