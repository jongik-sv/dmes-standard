# ERD 도구 단계 2 — Task 6·7·8: 스크립트 공용 lib, MCP 쓰기 도구, CLI

> 공통 제약(Global Constraints)·단계 2 에서 정한 점(S2-1~S2-29)·Review Focus·인터페이스는 [README](README.md) 에 있다. 이 문서의 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [02-backend-contracts.md](02-backend-contracts.md) · [README](README.md) · 다음: [04-frontend-core.md](04-frontend-core.md)

레인 S(sonnet)다. 세 Task 는 `scripts/erd/**` 와 `.mcp.json` 만 고친다. 다른 레인의 파일은 건드리지 않는다. 서버 새 계약(`dryRun`, `byUserId`, `rowVersion`, `CLAIM` 응답, 시한 접속자)은 README "인터페이스 (정본)" 의 JSON 모양으로 만든 가짜 OASIS 서버로 시험한다(S2-1). 실제 서버와의 연결은 마감(Task 16, 07-close.md Step 5·6·9)에서 확인한다.

README Review Focus 가운데 이 문서에 속하는 것은 6번이다. 시험 이름은 `sessionNameDerivesFromClaudeSessionId`(Task 6, `scripts/erd/tests/oasis.test.mjs`)다. 마감 Step 1-6 이 이 이름을 `node --test` 출력에서 센다.

**모든 명령은 레인 워크트리 루트**(예: `/Users/jji/project/dmes-standard-wt/erd-stage2-s`)에서 부른다. 시험은 `node --test scripts/erd/tests/` 로 돈다. 로컬 node 는 v26 이라 node 18.17 하한을 시험이 증명하지 못한다. 그래서 Global Constraints 의 금지 API 와 아래 API 를 쓰지 않는다. 각 Task 끝의 `grep` 이 이것을 본다.
- 금지: `import.meta.dirname`, `toSorted`·`toReversed`·`toSpliced`·`with`(배열), `Object.groupBy`·`Map.groupBy`, `Set` 의 `union`·`intersection`·`difference`·`isSubsetOf`, `util.parseArgs`, 전역 `crypto`(`node:crypto` 의 `randomUUID` 를 쓴다), `readdirSync({recursive})`.
- 써도 되는 것(node 18 에 있다): `Array.prototype.at`, `??=`, `fetch`, `AbortSignal.timeout`, `structuredClone`.

**세 Task 가 함께 정하는 것:**

| 주제 | 규칙 |
|---|---|
| 파일 나눔 | `lib/oasis.mjs`(HTTP·세션 이름), `lib/commands.mjs`(이름 → id, 이름표, 순수), `lib/results.mjs`(결과 글, 순수), `lib/flows.mjs`(view → 이름 풀기 → save·restore·execute → 결과 글). `flows.mjs` 는 MCP SDK·zod 를 import 하지 않는다. MCP(`erd-mcp.mjs`)와 CLI(`erd-cli.mjs`)가 같은 흐름을 쓴다. 그래서 Task 7·8 은 서로 기대지 않고 Task 6 에만 기댄다(README 6 → 7, 6 → 8) |
| 요청 꼬리표 | `createOasisClient` 가 모든 요청 params 앞에 `session`·`source` 를 넣는다(MCP 는 `MCP`, CLI 는 `CLI`). 호출자가 준 값이 이긴다. 읽기도 싣는다(README "MCP·CLI", S2-11) |
| baseRev | `apply` 의 `baseRev` 는 호출자 값 그대로다. 이름을 풀려고 읽은 `view` 의 rev 를 쓰지 않는다(S2-22). 반영 결과만 `다음 baseRev: N` 을 쓴다. 시험 실행·거절은 쓰지 않는다(시험 실행의 rev 는 지금 rev 라 다음 baseRev 로 주면 충돌 검사가 꺼진다) |
| 글 상한 | 쓰기·거절·변경 글은 `WRITE_TEXT_LIMIT` 25,000자(S2-21). 넘치면 변경 줄을 앞에서부터 들어가는 데까지 싣고 `… n줄 더 있습니다. getChangesSince(B) 로 나눠 읽으세요.` 를 붙인다. 마지막 줄(`다음 baseRev:`·`다음:`)은 늘 남긴다. 값 하나(지금 값·고를 값)는 200자에서 `…(n자 더)` 로 자른다. 줄 하나는 2,000자 상한이다 |
| 경고 묶음 | 경고는 코드별 수로 묶는다. 코드마다 처음 50건만 이름을 적는다(S2-28). `CLAIMED` 줄은 `표 작업 중: 세션 (사용자), 시:분(+09:00)까지` 다. `CLAIMED` 경고에는 사용자 칸이 없다(`claimedBy` 는 세션이다). 그래서 보내기 전에 읽은 `view.presence` 에서 그 세션의 사용자를 찾고, 없으면 세션만 적는다 |
| 빠진 칸 | 서버 레인이 늦게 머지될 수 있다. `byUserId`·`rowVersion`·`dryRun`·`summary`·`claimedBy`·`userId`·`expiresAt` 이 없으면 null 로 읽는다(글에 `undefined` 가 나오지 않는다) |
| 시험 실행 안전판 | 시험 실행을 요청했는데 서버가 `applied:true` 이고 `dryRun:true` 가 아니면(옛 서버가 `dryRun` 을 모른다) 실제로 저장된 것이다. 결과를 오류(`isError`, CLI 종료 코드 1)로 올리고 `undo(rev=N)` 을 안내한다 |
| 가져오기 | MCP·CLI 는 `import` 를 부르지 않는다. `import` 에 `dryRun` 을 실으면 서버가 MDM021 로 거절한다(README 표). MCP `applyDbDiff` 는 deferred 새 행이다 |
| 업무 오류 | 권한 확인과 쓰기 가드 사이 경쟁은 MDM003·MDM002 오류(success=false)로 온다(deferred 27 수정). 같은 코드가 늘 나는 경우(DRAFT 아님, 소유자 없는 DRAFT)에도 온다. `describeError` 는 상태를 확인하고, 맞는데도 나면 다시 읽고 한 번만 다시 보내라고 적는다 |

**선행 조건(레인 시작 때 한 번):** 루트 `pnpm install --frozen-lockfile`. 루트에 `node_modules` 가 없으면 MCP SDK 를 못 찾아 `erd-mcp.test.mjs` 가 1건 실패로 잡힌다(S2-7, 조사 C 0.5). 의존성을 새로 더하지 않는다.

---

### Task 6: 공용 lib — 세션 이름, 이름 → id, 결과 글, 쓰기 흐름

MCP 와 CLI 가 함께 쓰는 lib 를 만든다. 네 부분이다.
- 세션 이름(`configFromEnv`, S2-7)과 요청 꼬리표(`session`·`source`). 목록 액션(`search`)을 읽는 `rows`.
- 이름 → id 해석(`lib/commands.mjs`, S2-22). `getModelText` 에는 요소 id 가 없으므로 LLM 은 물리명으로 명령을 쓴다.
- 결과 글(`lib/results.mjs`, S2-21·S2-28). 반영·거절·시험 실행·되돌리기·작업 중 표시·변경 글과 25,000자 상한.
- 쓰기 흐름(`lib/flows.mjs`). view → 이름 풀기 → save·restore·execute → 결과 글. 프로세스 상태(반영한 rev, 되돌린 rev, 잡은 표)를 둔다.

이 Task 는 길다. 조정자가 나누면 경계는 Step 8 이다: t6a = Step 0~8(oasis·commands, Step 8 끝에 바뀐 파일만 커밋), t6b = Step 9~15.

**Files:**
- Modify: `scripts/erd/lib/oasis.mjs` (세션 이름, 요청 꼬리표, `rows`, MDM003·MDM002 안내)
- Create: `scripts/erd/lib/commands.mjs`, `scripts/erd/lib/results.mjs`, `scripts/erd/lib/flows.mjs`
- Modify: `scripts/erd/tests/oasis.test.mjs` (전체 교체), `scripts/erd/tests/fixtures/fake-oasis.mjs` (`gridSuccess`), `scripts/erd/tests/fixtures/erd-view.mjs` (델타·결과 픽스처 추가), `scripts/erd/tests/erd-mcp.test.mjs` (단언 한 줄: STATUS 요청 params 에 session·source)
- Create: `scripts/erd/tests/commands.test.mjs`, `scripts/erd/tests/results.test.mjs`, `scripts/erd/tests/flows.test.mjs`

**Interfaces:**
- Consumes: OASIS `erdEdit` 의 `view`(모델·`sinceRev`), `save`, `restore`, `execute kind=CLAIM·RELEASE`, `search`. 응답 모양은 README "인터페이스 (정본)" 의 `ErdApplyResult`(+`rowVersion`·`dryRun`), `ErdRejection`(+`byUserId`), `ErdClaimResult`, `ErdDelta`, `ErdPresence`. `lib/model-text.mjs` 의 `findDiagram`·`tableArgs`.
- Produces:
  - `lib/oasis.mjs`: `sessionName(env, { kind, session, user })`, `configFromEnv(env, { kind?: "mcp"|"cli", session? })` → `{ base, clientKey, user, role, session, source, timeoutMs }`, `createOasisClient(config)` → `{ config, call(action, params), rows(action, params) }`, `SESSION_MAX`, `describeError`(MDM003·MDM002 안내 추가).
  - `lib/commands.mjs`: `resolveCommands(view, commands, { newId })` → `{ commands, errors: [{ index, field, value, message, near }] }`, `describeTargets(view, ids, changes?)` → `Map<id, 이름>`, `newId(prefix)`, `ELEMENT_ID`, `modelOf(view)`, `relText(m, r)`, `resolveTables(view, names)`, `pickTableIds(view, names)`, `tablesOfChange(m, change)`.
  - `lib/results.mjs`: `WRITE_TEXT_LIMIT=25000`, `GROUP_LIMIT=50`, `CHOICE_LIMIT=20`, `VALUE_LIMIT=200`, `formatWriteResult(result, ctx)` → `{ text, isError }`, `formatResolveErrors(errors, commands)`, `formatClaimText(kind, rows, errors, ctx)`, `formatChangesText(cv, ctx)` → `{ text, raw }`, `othersLine`, `fitBlocks`, `fitBlocksDetail`, `clip`, `valueText`, `clock`.
  - `lib/flows.mjs`: `InputError`, `newState()`, `parseCommands(commands)`, `applyFlow(client, state, { modelId, baseRev, commands, dryRun })`, `undoFlow(client, state, { modelId, rev?, dryRun })`, `claimFlow(client, state, { modelId, tables })`, `releaseFlow(client, state, { modelId, tables? })`, `releaseAll(client, state)`, `changesFlow(client, { modelId, rev, session?, excludeMine?, tables?, raw? })`. 흐름은 모두 `{ text, isError, result }` 를 돌려준다(`changesFlow` 는 `raw` 도). `MAX_COMMANDS=200`, `MAX_TABLES=20`, `UNDO_SCAN=500`.
  - 시험 픽스처: `gridSuccess(rows)`, `DELTA_UI_11`, `DELTA_ME_13`, `APPLIED_13`, `CONFLICT_REJECTION`.

결과 글 모양(시험이 고정한다):

```
반영 rev 13 (baseRev 10) · 변경 1 · 경고 1 · 세션 claude-test
column upsert TB_MCM_SEC_MENU.MENU_NM (logical)
경고: CLAIMED 1
TB_MCM_SEC_MENU 작업 중: claude-a (41000207), 14:20(+09:00)까지
baseRev 뒤 다른 세션 변경 1건: ui-41000207 rev 11, TB_MCM_SEC_OBJ. getChangesSince(10) 로 확인하세요.
다음 baseRev: 13
```
```
거절 CONFLICT · 명령 #1 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · 저장한 것 없음
바꾼 사람: 41000207 (세션 ui-41000207) rev 11 · 지금 값: "메뉴명"
다음: getChangesSince(10) 로 바뀐 값을 읽고, 묶음 전체를 baseRev 11 이상으로 다시 보내세요.
```
- 명령 번호는 `commandIndex + 1` 이다(README 예 `commandIndex: 2` → `명령 #3`).
- 변경 줄의 괄호는 바뀐 속성이다. 반영 결과는 보내기 전 view 의 요소와 값을 비교하고, 없던 요소는 `(새)` 다. `getChangesSince` 는 `_rev` 가 그 델타 rev 인 속성이다. 지운 요소는 지우기 전 이름, 이름을 모르면 `id(지움)` 이다.
- 시험 실행 통과는 `시험 실행(저장 안 함) · 통과` / `지금 rev R (baseRev B) · 변경 n · 경고 w · 세션 S` / … / `다음: dryRun 없이 같은 묶음을 보내면 저장한다(CLI 는 --apply). baseRev 는 B 그대로 쓴다.` 다. 시험 실행 거절은 `시험 실행(저장 안 함) · 거절 CONFLICT` 로 시작한다.
- 되돌리기는 `반영 rev 14 (되돌리기 rev 13) · …` 다음 줄에 `되돌린 변경: rev 13 · 41000207 (세션 claude-test) · 1건` 을 적는다(누구의 몇 rev, README MCP 표). 누구인지 못 읽으면 `(누구의 변경인지 읽지 못했습니다)` 다.
- `baseRev 뒤 다른 세션 변경` 줄은 반영이면 `baseRev < rev-1`, 시험 실행이면 `baseRev < rev` 일 때만 `view sinceRev=baseRev` 를 한 번 더 읽어 만든다. 내 세션 델타는 뺀다. 마감 07 Step 6-2 가 이 줄을 본다.

- [ ] **Step 0: 준비와 기준선**

```bash
pnpm install --frozen-lockfile; echo install=$?
node -e 'import("@modelcontextprotocol/sdk/client/index.js").then(()=>console.log("sdk ok"))'
node --test scripts/erd/tests/ 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `install=0`, `sdk ok`, `tests 38`·`pass 38`·`fail 0`(단계 1 시험 전체. SDK 가 없으면 35/1 이다). 다르면 멈추고 조정 세션에 알린다.

- [ ] **Step 1: 세션 이름·요청 꼬리표 시험 작성 (실패)**

`scripts/erd/tests/fixtures/fake-oasis.mjs` 의 `failure` 줄 바로 뒤에 더한다.

```js
/** 목록 결과(search). OASIS 는 List 를 grids.result.rows 로 싣는다. */
export const gridSuccess = (rows) => ({ status: 200, body: { meta: { success: true }, data: {}, grids: { result: { rows } } } });
```

`scripts/erd/tests/oasis.test.mjs` 를 아래로 바꾼다. 앞의 두 시험(기본값, 요청 본문)은 단계 1 시험을 새 칸(`session`·`source`)에 맞춘 것이다. `sessionNameDerivesFromClaudeSessionId` 는 Review Focus 6 이다. 이 프로세스의 `process.env` 는 Claude Code 의 `CLAUDE_CODE_SESSION_ID` 를 가질 수 있으므로, 시험은 환경 객체를 직접 넘기고 자식 프로세스에도 환경 전부를 따로 준다.

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/erd/tests/oasis.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../lib/oasis.mjs' does not provide an export named 'sessionName'`.

- [ ] **Step 3: 세션 이름·요청 꼬리표 구현**

`scripts/erd/lib/oasis.mjs` 를 아래로 바꾼다. 단계 1 과 다른 곳은 `sessionName`·`configFromEnv`(kind·session·source), 요청 params 의 `session`·`source`, `rows`, `describeError` 의 MDM003·MDM002 줄이다.

```js
// MDM 서버 OASIS erdEdit 를 부르는 작은 클라이언트. scripts/mdm-meta/register-columns.mjs 의 oasis() 와 같은 규칙이다.
// 로컬 전용 인증(스펙 D12): X-Client-Key + 사용자 헤더. node 18.17 내장 fetch·AbortSignal.timeout 만 쓴다.
// 모든 요청은 session·source 를 싣는다. 서버는 MCP·CLI 세션을 접속자 목록에 시한 항목으로 둔다(README S2-11).
import { randomUUID } from "node:crypto";

export const DEFAULTS = Object.freeze({
  base: "http://localhost:8096",
  clientKey: "dmes-bff-local-client-key-2026",
  user: "erd-mcp",
  role: "MDM_STEWARD",
  timeoutMs: 30000,
});

/** 서버 SESSION_NM 칸 크기(ErdCommandService·ErdEditService 가 1~100자를 검사한다). */
export const SESSION_MAX = 100;

/** 이 프로세스의 임의 꼬리표. 세션 이름 규칙 3(CLAUDE_CODE_SESSION_ID 가 없을 때)에 쓴다. 프로세스마다 한 번 정한다. */
const PROCESS_TAG = randomUUID().slice(0, 8);

/**
 * 세션 이름(README "MCP·CLI", S2-7).
 * 1. opts.session(CLI --session)이 있으면 그 값.
 * 2. ERD_SESSION 이 비어 있지 않고 auto 가 아니면 그 값.
 * 3. kind mcp: CLAUDE_CODE_SESSION_ID 가 있으면 claude- + 그 값에서 - 를 뺀 앞 8글자(소문자), 없으면 mcp- + 프로세스 임의 8글자.
 * 4. kind cli: cli- + 사용자.
 * .mcp.json 이 ${CLAUDE_CODE_SESSION_ID} 를 풀면 바깥 셸 값(중첩 실행이면 부모 세션 id)이 들어온다. 그래서 이름은 여기서
 * 이 프로세스의 env 로 만든다. Claude Code 는 MCP 프로세스에 자기 세션 id 를 넣는다(조사 C 4.2 실측).
 */
export function sessionName(env, { kind = "mcp", session, user } = {}) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  let name = text(session);
  if (!name) {
    const fromEnv = text(env.ERD_SESSION);
    if (fromEnv && fromEnv !== "auto") name = fromEnv;
  }
  if (!name && kind === "cli") name = `cli-${user || text(env.ERD_USER) || DEFAULTS.user}`;
  if (!name) {
    const claude = text(env.CLAUDE_CODE_SESSION_ID).replace(/-/g, "").toLowerCase();
    name = claude ? `claude-${claude.slice(0, 8)}` : `mcp-${PROCESS_TAG}`;
  }
  if (name.length > SESSION_MAX) {
    throw new Error(`세션 이름은 1~${SESSION_MAX}자입니다(${name.length}자): ${name.slice(0, 40)}…`);
  }
  return name;
}

/**
 * 환경변수 → 설정. ERD_BASE·ERD_USER·ERD_ROLE·BACKEND_CLIENT_KEY·ERD_SESSION, 비면 기본값.
 * opts.kind: "mcp"(기본, source MCP) | "cli"(source CLI). opts.session: CLI --session.
 */
export function configFromEnv(env, opts = {}) {
  const kind = opts.kind === "cli" ? "cli" : "mcp";
  const user = env.ERD_USER || DEFAULTS.user;
  return {
    base: (env.ERD_BASE || DEFAULTS.base).replace(/\/+$/, ""),
    clientKey: env.BACKEND_CLIENT_KEY || DEFAULTS.clientKey,
    user,
    role: env.ERD_ROLE || DEFAULTS.role,
    session: sessionName(env, { kind, session: opts.session, user }),
    source: kind === "cli" ? "CLI" : "MCP",
    timeoutMs: DEFAULTS.timeoutMs,
  };
}

/** 서버가 업무 오류(meta.success=false)나 JSON 이 아닌 본문을 돌려줬다. */
export class OasisError extends Error {
  constructor(message, { action, code = null, status = null } = {}) {
    super(message);
    this.name = "OasisError";
    this.action = action;
    this.code = code;
    this.status = status;
  }
}

/** 서버에 닿지 못했다(연결 거부·시간 초과). */
export class OasisUnreachableError extends Error {
  constructor(message, { action, cause } = {}) {
    super(message);
    this.name = "OasisUnreachableError";
    this.action = action;
    this.cause = cause;
  }
}

/** null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못한다. */
export function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

/** @returns {{config: object, call: (action: string, params: object) => Promise<any>, rows: (action: string, params: object) => Promise<any[]>}} */
export function createOasisClient(config, fetchImpl = globalThis.fetch) {
  async function post(action, params) {
    const url = `${config.base}/api/mdm/oasis/erdEdit/${action}`;
    let res;
    let text;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "X-Client-Key": config.clientKey,
          "X-Authenticated-User": config.user,
          "X-Authenticated-Role": config.role,
        },
        // 세션·출처를 먼저 두고 params 로 덮는다(호출자가 준 값이 이긴다).
        body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: compact({ session: config.session, source: config.source, ...params }) }),
      });
      text = await res.text(); // 본문 읽기도 같은 시간 제한 안에서
    } catch (e) {
      throw new OasisUnreachableError(`${config.base} 에 닿지 못했습니다(erdEdit/${action}): ${e.cause?.code ?? e.name} ${e.message}`, {
        action,
        cause: e,
      });
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OasisError(`erdEdit/${action} HTTP ${res.status}: ${text.slice(0, 200)}`, { action, status: res.status });
    }
    if (body?.meta?.success !== true) {
      throw new OasisError(body?.meta?.message || `erdEdit/${action} HTTP ${res.status}`, {
        action,
        code: body?.meta?.code ?? null,
        status: res.status,
      });
    }
    return body;
  }
  async function call(action, params = {}) {
    const body = await post(action, params);
    return body.data?.result ?? body.data ?? {};
  }
  /** 목록을 돌려주는 액션(search). OASIS 는 List 결과를 data.result 가 아니라 grids.result.rows 로 싣는다. */
  async function rows(action, params = {}) {
    const body = await post(action, params);
    const list = body.grids?.result?.rows ?? body.data?.result;
    return Array.isArray(list) ? list : [];
  }
  return { config, call, rows };
}

/** 오류를 LLM 이 다음에 할 일까지 읽을 수 있는 문장으로(스펙 4.5). */
export function describeError(e, config) {
  if (e instanceof OasisUnreachableError) {
    return `${e.message}\n다음: MDM 서버(기본 포트 8096)를 켜거나 ERD_BASE 환경변수를 확인한 뒤 같은 도구를 다시 부르세요.`;
  }
  if (e instanceof OasisError) {
    if (e.status === 401 || e.status === 403) {
      return `인증이 거절되었습니다(HTTP ${e.status}): ${e.message}\n다음: BACKEND_CLIENT_KEY 가 서버의 cactus.security.client-key 와 같은지, ERD_USER(${config.user})·ERD_ROLE(${config.role})이 맞는지 확인하세요.`;
    }
    if (e.code === "MDM029") {
      return `[MDM029] ${e.message}\n다음: modelId 를 확인하세요. 모델 목록은 m-mdm ERD 화면에서 보거나 OASIS erdEdit/search 로 읽습니다.`;
    }
    if (e.code === "MDM003" || e.code === "MDM002") {
      return `[${e.code}] ${e.message}\n다음: getModelText 머리줄로 DRAFT 인지 보고, 소유자·공동 편집자인지 확인하세요. 둘 다 맞는데 이 오류면 그사이 DRAFT 소유자나 상태가 바뀐 것이니 다시 읽고 한 번만 다시 보내세요. 아니면 사용자에게 DRAFT 선점·공동 편집자 등록을 부탁하세요.`;
    }
    return `[${e.code ?? `HTTP ${e.status}`}] ${e.message}\n다음: 입력을 고쳐 다시 부르세요. 같은 오류가 이어지면 사용자에게 서버 로그 확인을 부탁하세요.`;
  }
  return `${e?.message ?? e}\n다음: 입력을 확인하고 다시 부르세요.`;
}
```

이 바꿈으로 단계 1 MCP 시험의 STATUS 요청 단언이 달라진다. `scripts/erd/tests/erd-mcp.test.mjs` 에서 이 한 줄을 고친다(Task 7 이 이 파일을 다시 쓴다).

```js
// 전
    assert.deepEqual(statusReq.params, { modelId: "mcm", kind: "STATUS", ver: "1.000" });
// 후
    assert.deepEqual(statusReq.params, { modelId: "mcm", kind: "STATUS", ver: "1.000", session: "claude-test", source: "MCP" });
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/erd/tests/oasis.test.mjs scripts/erd/tests/erd-mcp.test.mjs`
Expected: PASS 10건(oasis 7, erd-mcp 3).

- [ ] **Step 5: 이름 → id 시험 작성 (실패)**

`scripts/erd/tests/fixtures/erd-view.mjs` 끝에 더한다(결과 글·흐름·MCP·CLI 시험이 함께 쓴다).

```js
// 단계 2: 변경 델타와 쓰기 결과(README "인터페이스 (정본)" 의 ErdDelta·ErdApplyResult 모양). VIEW 는 rev 12 이고, 아래는 그 뒤를 꾸민다.
const stamp = (rev, session, ...props) => Object.fromEntries(props.map((p) => [p, { rev, session }]));
/** 화면 세션이 rev 11 에 TB_MCM_SEC_OBJ 의 논리명을 바꿨다. */
export const DELTA_UI_11 = {
  modelId: "mcm", rev: 11, userId: "41000207", session: "ui-41000207", source: "UI", rowVersion: null,
  changes: [{ kind: "table", id: "t-obj", op: "upsert", value: { ...MODEL.tables["t-obj"], logical: "오브젝트표", _rev: stamp(11, "ui-41000207", "logical") } }],
};
/** MCP 세션 claude-test 가 rev 13 에 MENU_NM 논리명을 바꿨다. */
export const DELTA_ME_13 = {
  modelId: "mcm", rev: 13, userId: "41000207", session: "claude-test", source: "MCP", rowVersion: null,
  changes: [{ kind: "column", id: "c-m3", op: "upsert", value: { ...MODEL.columns["c-m3"], logical: "메뉴이름", _rev: stamp(13, "claude-test", "logical") } }],
};
/** save 반영 결과: rev 13, MENU_NM 논리명. */
export const APPLIED_13 = {
  applied: true, rev: 13, rowVersion: 4, dryRun: false, changes: DELTA_ME_13.changes, warnings: [], rejection: null,
};
/** CONFLICT 거절 정본 예(README). byUserId 를 싣는다. */
export const CONFLICT_REJECTION = {
  code: "CONFLICT", commandIndex: 0, message: "다른 세션이 먼저 바꾼 값입니다", hint: "getChangesSince(10) 로 바뀐 값을 읽고 다시 보내세요",
  elementId: "c-m3", property: "logical", byRev: 11, bySession: "ui-41000207", byUserId: "41000207", current: "메뉴명", choices: null, ownerId: null,
};
```

`scripts/erd/tests/commands.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENT_ID, describeTargets, modelOf, newId, pickTableIds, resolveCommands, resolveTables, tablesOfChange } from "../lib/commands.mjs";
import { MODEL, VIEW } from "./fixtures/erd-view.mjs";

let seq = 0;
const ids = (prefix) => `${prefix}new${++seq}`; // 시험용 순번 id(요소 id 규칙을 지킨다)
const viewWith = (patch) => ({ ...VIEW, model: JSON.stringify({ ...MODEL, ...patch }) });

test("표·컬럼·관계·키·다이어그램을 이름이나 id 로 가리킨다", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "updateTable", id: "tb_mcm_sec_menu", set: { logical: "메뉴" } },
      { op: "updateColumn", id: "MCMAPUSER.TB_MCM_SEC_MENU.menu_nm", set: { logical: "메뉴이름" } },
      { op: "updateColumn", id: "c-m1", set: { comment: "id 그대로" } },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "rejectRelation", id: "TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)" },
      { op: "updateKey", id: "TB_MCM_SEC_MENU:PK", set: { columns: ["TB_MCM_SEC_MENU.MENU_ID", "TB_MCM_SEC_MENU.OBJECT_ID"] } },
      { op: "deleteKey", id: "ix_tb_mcm_sec_menu_obj" },
      { op: "moveNodes", diagram: "메뉴 화면", nodes: [{ table: "TB_MCM_SEC_OBJ", x: 10, y: 20 }] },
      { op: "setFold", diagram: "기본/전체", tables: ["TB_MCM_SEC_USER", "t-fav"], foldMode: "PK_ONLY" },
      { op: "deleteRelation", id: "r-zzz" },
    ],
    { newId: ids },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    commands.map((c) => c.id ?? c.diagram),
    ["t-menu", "c-m3", "c-m1", "r-1", "r-6", "k-1", "k-8", "d-menu", "d-all", "r-zzz"],
  );
  assert.deepEqual(commands[0].set, { logical: "메뉴" }); // 다른 칸은 그대로 남는다
  assert.deepEqual(commands[5].set.columns, ["c-m1", "c-m2"]);
  assert.deepEqual(commands[7].nodes, [{ table: "t-obj", x: 10, y: 20 }]);
  assert.deepEqual(commands[8].tables, ["t-user", "t-fav"]);
});

test("묶음 안에서 앞에서 만든 표·컬럼·키를 이름으로 가리킨다", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "addTable", phys: "TB_MCM_NEW", logical: "새 표" },
      { op: "addColumn", table: "TB_MCM_NEW", phys: "NEW_ID", logical: "새아이디", dataType: "VARCHAR2", length: 30 },
      { op: "setPrimaryKey", table: "tb_mcm_new", columns: ["TB_MCM_NEW.NEW_ID"] },
      { op: "addRelation", child: "TB_MCM_NEW", parent: "TB_MCM_SEC_MENU", pairs: [["TB_MCM_NEW.NEW_ID", "TB_MCM_SEC_MENU.MENU_ID"]], identifying: false },
      { op: "addKey", table: "TB_MCM_NEW", kind: "IX", name: "IX_TB_MCM_NEW_1", columns: ["TB_MCM_NEW.NEW_ID"] },
      { op: "deleteKey", id: "IX_TB_MCM_NEW_1" },
      { op: "addRelation", child: "TB_MCM_NEW", parentRef: { model: "mdm", table: "t-x", columns: ["c-x"] }, pairs: [["TB_MCM_NEW.NEW_ID", "c-x"]] },
    ],
    { newId: ids },
  );
  assert.deepEqual(errors, []);
  const [t, c, pk, rel, k, del, ref] = commands;
  assert.match(t.id, /^t-new\d+$/);
  assert.match(c.id, /^c-new\d+$/);
  assert.equal(c.table, t.id);
  assert.deepEqual([pk.table, pk.columns], [t.id, [c.id]]);
  assert.match(rel.id, /^r-new\d+$/);
  assert.deepEqual([rel.child, rel.parent, rel.pairs], [t.id, "t-menu", [[c.id, "c-m1"]]]);
  assert.match(k.id, /^k-new\d+$/);
  assert.equal(del.id, k.id);
  assert.deepEqual(ref.pairs, [[c.id, "c-x"]]); // 다른 모델 부모 쪽은 그대로
  // 준 새 id 는 그대로 쓰고, 요소 id 모양이 아니면 오류다.
  const given = resolveCommands(VIEW, [{ op: "addTable", id: "t-mine1", phys: "TB_A" }, { op: "addTable", id: "TB_B", phys: "TB_B" }], { newId: ids });
  assert.equal(given.commands[0].id, "t-mine1");
  assert.deepEqual(given.errors.map((e) => [e.index, e.field]), [[1, "id"]]);
});

test("모르거나 겹치는 이름은 서버를 부르기 전에 오류이고 가까운 이름을 보인다", () => {
  const dup = viewWith({ relations: { ...MODEL.relations, "r-9": { ...MODEL.relations["r-1"], state: "REJECTED" } } });
  const { errors } = resolveCommands(
    dup,
    [
      { op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU", set: {} },
      { op: "updateTable", id: "TB_MCM_SEC_MENUX", set: {} },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "updateColumn", id: "MENU_NM", set: {} },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.MENU_NM > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "moveNodes", diagram: "없는 그림", nodes: [] },
    ],
    { newId: ids },
  );
  assert.deepEqual(
    errors.map((e) => [e.index, e.field, e.message]),
    [
      [0, "id", "없는 컬럼입니다"],
      [1, "id", "없는 표입니다"],
      [2, "id", "같은 글의 관계가 여러 개입니다. r- id 로 고르세요"],
      [3, "id", "컬럼은 \"표.컬럼\" 또는 c- id 로 씁니다"],
      [4, "id", "없는 관계입니다"],
      [5, "diagram", "다이어그램을 찾을 수 없습니다: 없는 그림. 있는 다이어그램: d-all(기본/전체), d-menu(메뉴/메뉴 화면)"],
    ],
  );
  assert.deepEqual(errors[0].near, ["TB_MCM_SEC_MENU.MENU_ID", "TB_MCM_SEC_MENU.MENU_NM"]);
  assert.deepEqual(errors[1].near, ["TB_MCM_SEC_MENU"]);
  assert.deepEqual(errors[2].near, ["r-1(INFERRED)", "r-9(REJECTED)"]);
  assert.deepEqual(errors[4].near, ["r-1 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID", "r-5 TB_MCM_SEC_MENU.MENU_ID > TB_MCM_SEC_MENU_FLD.MENU_ID", "r-9 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID"]);
});

test("이름표: 표·컬럼·키·관계·다이어그램·노드, 새 요소는 변경 값으로", () => {
  const labels = describeTargets(VIEW, ["t-menu", "c-m3", "k-1", "k-8", "r-6", "d-menu", "d-menu:t-obj", "c-x", "c-gone"], [
    { kind: "column", id: "c-x", op: "upsert", value: { table: "t-obj", phys: "NEW_COL" } },
    { kind: "column", id: "c-gone", op: "delete", value: null },
  ]);
  assert.deepEqual(
    [...labels.values()],
    [
      "TB_MCM_SEC_MENU",
      "TB_MCM_SEC_MENU.MENU_NM",
      "TB_MCM_SEC_MENU:PK",
      "TB_MCM_SEC_MENU:IX_TB_MCM_SEC_MENU_OBJ",
      "TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)",
      "메뉴/메뉴 화면",
      "메뉴/메뉴 화면:TB_MCM_SEC_OBJ",
      "TB_MCM_SEC_OBJ.NEW_COL",
      "c-gone",
    ],
  );
  const m = modelOf(VIEW);
  assert.deepEqual(tablesOfChange(m, { kind: "column", id: "c-m3", op: "delete", value: null }), ["t-menu"]);
  assert.deepEqual(tablesOfChange(m, { kind: "relation", id: "r-2", op: "upsert", value: MODEL.relations["r-2"] }), ["t-fav", "t-user"]);
  assert.deepEqual(tablesOfChange(m, { kind: "diagramNode", id: "d-menu:t-obj", op: "upsert", value: {} }), ["t-obj"]);
  assert.deepEqual([...pickTableIds(VIEW, ["TB_MCM_SEC_USER*", "nope"]).ids].sort(), ["t-fav", "t-tab", "t-user", "t-wid"]);
  assert.deepEqual(pickTableIds(VIEW, ["nope"]).missing, ["nope"]);
  const rt = resolveTables(VIEW, ["TB_MCM_SEC_MENU", "t-obj", "tb_mcm_sec_menu", "TB_X"]);
  assert.deepEqual(rt.resolved, [{ ref: "TB_MCM_SEC_MENU", id: "t-menu" }, { ref: "t-obj", id: "t-obj" }]);
  assert.deepEqual(rt.errors.map((e) => [e.index, e.value, e.message]), [[3, "TB_X", "없는 표입니다"]]);
});

test("newId 는 서버 요소 id 규칙을 지킨다", () => {
  for (const p of ["t-", "c-", "k-", "r-", "d-"]) {
    for (let i = 0; i < 50; i++) {
      const id = newId(p);
      assert.ok(id.startsWith(p));
      assert.match(id, ELEMENT_ID);
    }
  }
});
```

- [ ] **Step 6: 실패 확인**

Run: `node --test scripts/erd/tests/commands.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`scripts/erd/lib/commands.mjs` 가 없다).

- [ ] **Step 7: 이름 → id 구현**

`scripts/erd/lib/commands.mjs`:

```js
// 이름 → 요소 id 해석과 요소 이름표(README "MCP·CLI", S2-22). MCP apply 와 CLI apply 가 같이 쓴다.
// 순수 함수다 — 네트워크·파일을 쓰지 않는다. view 는 OASIS erdEdit view 응답(ErdModelView: model 은 MODEL_JSON 문자열,
// diagrams 는 다이어그램 목록)이다. 이미 읽은 모델 JSON 을 줘도 된다(다이어그램 이름은 view 에만 있다).
// baseRev 는 여기서 정하지 않는다. 이름을 풀려고 읽은 view 의 rev 를 baseRev 로 쓰면 충돌 검사가 꺼진다(S2-22).
import { randomUUID } from "node:crypto";
import { findDiagram } from "./model-text.mjs";

/** 서버 ErdIds 의 요소 id 규칙. */
export const ELEMENT_ID = /^[a-z]-[0-9a-zA-Z-]{1,48}$/;
const NEAR = 5;

/** 새 요소 id. prefix 는 "t-"·"c-"·"k-"·"r-"·"d-". randomUUID 는 36글자라 규칙의 48글자 안이다. */
export function newId(prefix) {
  return `${prefix}${randomUUID()}`;
}

const parsed = new WeakMap();

/** view(또는 모델 JSON) → { info, tables, columns, keys, relations }. 같은 view 객체는 한 번만 읽는다. */
export function modelOf(view) {
  if (view && typeof view === "object" && parsed.has(view)) return parsed.get(view);
  let m = view ?? {};
  if (typeof m.model === "string") m = JSON.parse(m.model);
  else if (!m.tables && m.model && typeof m.model === "object") m = m.model;
  const out = { info: m.model ?? {}, tables: m.tables ?? {}, columns: m.columns ?? {}, keys: m.keys ?? {}, relations: m.relations ?? {} };
  if (view && typeof view === "object") parsed.set(view, out);
  return out;
}

const up = (s) => String(s).trim().toUpperCase();
/** 앞의 '스키마.' 를 뗀다(점이 하나 남을 때만): MCMAPUSER.TB_X → TB_X. */
const dropSchema = (s) => s.replace(/^[A-Z0-9_$#]+\.(?=[^.]+$)/, "");
const isId = (v, prefix) => typeof v === "string" && v.startsWith(prefix) && ELEMENT_ID.test(v);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 가까운 이름: key 를 품은 이름, 없으면 key 가 품은 이름. 5개까지. */
function nearOf(names, key) {
  const k = key.replace(/\*+$/, "");
  const inside = names.filter((n) => n.includes(k));
  return (inside.length ? inside : names.filter((n) => k.includes(n))).sort().slice(0, NEAR);
}

function colsText(m, ids) {
  const names = ids.map((id) => m.columns[id]?.phys ?? "?");
  return names.length === 1 ? names[0] : `(${names.join(", ")})`;
}

/** 관계 글. getModelText 의 Ref 줄과 같은 모양: 자식표.컬럼 > 부모표.컬럼, 복합은 (A, B), 다른 모델 부모는 @모델. */
export function relText(m, r) {
  const pairs = r.pairs ?? [];
  const child = `${m.tables[r.child]?.phys ?? "?"}.${colsText(m, pairs.map((p) => p[0]))}`;
  const parent = r.parentRef ? `@${r.parentRef.model}` : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, pairs.map((p) => p[1]))}`;
  return `${child} > ${parent}`;
}

/** 이름 찾기 색인. 묶음 안에서 새로 만든 표·컬럼·키·다이어그램을 더하므로 부를 때마다 새로 만든다. */
function indexOf(view) {
  const m = modelOf(view);
  const tables = new Map(); // 물리명(대문자) → 표 id
  const tablePhys = new Map(); // 표 id → 물리명
  for (const [id, t] of Object.entries(m.tables)) {
    tables.set(up(t.phys), id);
    tablePhys.set(id, t.phys);
  }
  const columns = new Map(); // "표.컬럼"(대문자) → 컬럼 id
  for (const [id, c] of Object.entries(m.columns)) {
    const tp = tablePhys.get(c.table);
    if (tp != null) columns.set(`${up(tp)}.${up(c.phys)}`, id);
  }
  const keys = new Map(); // 키 이름(대문자) → 키 id 목록
  const pks = new Map(); // 표 id → PK id
  for (const [id, k] of Object.entries(m.keys)) {
    if (k.name) keys.set(up(k.name), [...(keys.get(up(k.name)) ?? []), id]);
    if (k.kind === "PK") pks.set(k.table, id);
  }
  return { view: { ...(view ?? {}), diagrams: [...(view?.diagrams ?? [])] }, m, tables, tablePhys, columns, keys, pks };
}

function table(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "표 물리명이나 t- id 가 비었습니다", near: [] };
  if (isId(value, "t-")) return { id: value };
  const key = dropSchema(up(value));
  const id = ix.tables.get(key);
  return id ? { id } : { error: "없는 표입니다", near: nearOf([...ix.tables.keys()], key) };
}

function column(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "컬럼 \"표.컬럼\" 이나 c- id 가 비었습니다", near: [] };
  if (isId(value, "c-")) return { id: value };
  const parts = up(value).split(".");
  if (parts.length === 3) parts.shift(); // 스키마.표.컬럼
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { error: "컬럼은 \"표.컬럼\" 또는 c- id 로 씁니다", near: [] };
  const [t, c] = parts;
  const id = ix.columns.get(`${t}.${c}`);
  if (id) return { id };
  if (!ix.tables.has(t)) return { error: `없는 표입니다(${t})`, near: nearOf([...ix.tables.keys()], t) };
  const inTable = [...ix.columns.keys()].filter((k) => k.startsWith(`${t}.`)).map((k) => k.slice(t.length + 1));
  const near = nearOf(inTable, c);
  return { error: "없는 컬럼입니다", near: (near.length ? near : inTable.sort().slice(0, NEAR)).map((x) => `${t}.${x}`) };
}

/** 관계 글 한쪽: "표.컬럼" | "표.(A, B)" | "@모델". 못 읽으면 null. */
function side(text) {
  const s = up(text);
  if (s.startsWith("@")) return s.length > 1 ? { model: s.slice(1).trim() } : null;
  const mt = /^(.+?)\.(?:\(([^)]*)\)|([^.()]+))$/.exec(s);
  if (!mt) return null;
  const cols = (mt[2] ?? mt[3]).split(",").map((x) => x.trim()).filter(Boolean);
  return cols.length ? { table: dropSchema(mt[1].trim()), cols } : null;
}

function relation(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "관계 글이나 r- id 가 비었습니다", near: [] };
  if (isId(value, "r-")) return { id: value };
  const at = value.indexOf(">");
  const child = at > 0 ? side(value.slice(0, at)) : null;
  const parent = at > 0 ? side(value.slice(at + 1)) : null;
  if (!child || child.model || !parent) {
    return { error: "관계는 \"자식표.컬럼 > 부모표.컬럼\"(복합은 \"자식표.(A, B) > 부모표.(A, B)\") 또는 r- id 로 씁니다", near: [] };
  }
  const { m } = ix;
  const ph = (cid) => up(m.columns[cid]?.phys ?? "?");
  const tp = (tid) => up(m.tables[tid]?.phys ?? "?");
  const hits = Object.entries(m.relations).filter(([, r]) => {
    const pairs = r.pairs ?? [];
    if (tp(r.child) !== child.table || !sameList(pairs.map((p) => ph(p[0])), child.cols)) return false;
    if (parent.model) return up(r.parentRef?.model ?? "") === parent.model;
    if (r.parentRef) return false;
    return tp(r.parent) === parent.table && sameList(pairs.map((p) => ph(p[1])), parent.cols);
  });
  if (hits.length === 1) return { id: hits[0][0] };
  if (hits.length > 1) {
    return { error: "같은 글의 관계가 여러 개입니다. r- id 로 고르세요", near: hits.map(([id, r]) => `${id}(${r.state})`).sort() };
  }
  const near = Object.entries(m.relations)
    .filter(([, r]) => tp(r.child) === child.table)
    .map(([id, r]) => `${id} ${relText(m, r)}`)
    .sort()
    .slice(0, NEAR);
  return { error: "없는 관계입니다", near };
}

function key(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "키 이름, \"표:PK\", k- id 가 비었습니다", near: [] };
  if (isId(value, "k-")) return { id: value };
  const s = up(value);
  const pk = /^(.+):PK$/.exec(s);
  if (pk) {
    const t = table(ix, pk[1]);
    if (t.error) return t;
    const id = ix.pks.get(t.id);
    return id ? { id } : { error: `${pk[1]} 에 PK 가 없습니다`, near: [] };
  }
  const ids = ix.keys.get(s) ?? [];
  if (ids.length === 1) return { id: ids[0] };
  if (ids.length > 1) return { error: "같은 이름의 키가 여러 개입니다. k- id 로 고르세요", near: [...ids].sort() };
  return { error: "없는 키입니다", near: nearOf([...ix.keys.keys()], s) };
}

function diagram(ix, value) {
  if (typeof value !== "string" || !value.trim()) return { error: "다이어그램 이름이나 d- id 가 비었습니다", near: [] };
  if (isId(value, "d-")) return { id: value };
  try {
    return { id: findDiagram(ix.view, value).id };
  } catch (e) {
    return { error: e.message, near: [] };
  }
}

/** 새 요소를 만드는 명령과 id 앞글자. id 를 주지 않으면 newId 로 만든다. */
const NEW_PREFIX = { addTable: "t-", addColumn: "c-", addKey: "k-", addRelation: "r-", addDiagram: "d-" };
/** 기존 요소를 id 칸으로 가리키는 명령과 그 요소 종류. */
const ID_OF = {
  updateTable: table, deleteTable: table,
  updateColumn: column, moveColumn: column, deleteColumn: column, applyDomain: column,
  updateKey: key, deleteKey: key,
  updateRelation: relation, confirmRelation: relation, rejectRelation: relation, deleteRelation: relation,
  updateDiagram: diagram, deleteDiagram: diagram,
};

/** 해석한 새 요소를 색인에 더한다. 같은 묶음의 뒤 명령이 물리명으로 가리킬 수 있다. */
function remember(ix, cmd) {
  if (cmd.op === "addTable" && typeof cmd.phys === "string") {
    ix.tables.set(up(cmd.phys), cmd.id);
    ix.tablePhys.set(cmd.id, cmd.phys);
  } else if (cmd.op === "addColumn" && typeof cmd.phys === "string") {
    const tp = ix.tablePhys.get(cmd.table);
    if (tp != null) ix.columns.set(`${up(tp)}.${up(cmd.phys)}`, cmd.id);
  } else if (cmd.op === "addKey" && typeof cmd.name === "string") {
    ix.keys.set(up(cmd.name), [...(ix.keys.get(up(cmd.name)) ?? []), cmd.id]);
    if (cmd.kind === "PK" && typeof cmd.table === "string") ix.pks.set(cmd.table, cmd.id);
  } else if (cmd.op === "addDiagram") {
    ix.view.diagrams.push({ id: cmd.id, areaName: cmd.areaName, diagramName: cmd.diagramName });
  }
}

/**
 * 명령의 이름을 id 로 바꾼다(README "이름 → id 해석" 표).
 * - 표: id(표 명령)·table·child·parent·tables[]·nodes[].table — t- id 또는 물리명(대소문자·앞의 스키마 무시)
 * - 컬럼: id(컬럼 명령)·columns[]·updateKey 의 set.columns[]·pairs[][] — c- id 또는 "표.컬럼". parentRef 가 있으면 pairs 의 부모 쪽은 그대로 둔다
 * - 관계: id(관계 명령) — r- id 또는 "자식표.컬럼 > 부모표.컬럼"
 * - 키: id(키 명령) — k- id, 키 이름, "표:PK"
 * - 다이어그램: diagram·id(다이어그램 명령) — d- id, "업무영역/이름", 이름(유일할 때)
 * id 모양(t-·c-·…)의 값은 있는지 보지 않고 그대로 보낸다. 지운 요소면 서버가 누가 언제 지웠는지 NOT_FOUND 로 알려 준다.
 * 모르는 op 는 고치지 않고 보낸다(서버 ErdStrictReader 가 판정한다).
 * @returns {{ commands: object[], errors: { index: number, field: string, value: string, message: string, near: string[] }[] }}
 */
export function resolveCommands(view, commands, { newId: makeId = newId } = {}) {
  const ix = indexOf(view);
  const out = [];
  const errors = [];
  commands.forEach((src, index) => {
    const cmd = JSON.parse(JSON.stringify(src));
    const before = errors.length;
    const fail = (field, value, r) =>
      errors.push({ index, field, value: typeof value === "string" ? value : JSON.stringify(value), message: r.error, near: r.near ?? [] });
    const fix = (holder, prop, fn, field) => {
      const v = holder[prop];
      if (v === null || v === undefined) return;
      const r = fn(ix, v);
      if (r.error) fail(field, v, r);
      else holder[prop] = r.id;
    };
    const fixList = (list, fn, field) => {
      if (Array.isArray(list)) list.forEach((_, i) => fix(list, i, fn, `${field}[${i}]`));
    };
    const op = cmd.op;
    if (NEW_PREFIX[op]) {
      if (cmd.id === null || cmd.id === undefined) cmd.id = makeId(NEW_PREFIX[op]);
      else if (!isId(cmd.id, NEW_PREFIX[op])) {
        fail("id", cmd.id, { error: `새 요소 id 는 ${NEW_PREFIX[op]} 로 시작하는 id 여야 합니다(빼면 새로 만든다)`, near: [] });
      }
    } else if (ID_OF[op]) fix(cmd, "id", ID_OF[op], "id");
    for (const f of ["table", "child", "parent"]) fix(cmd, f, table, f);
    fixList(cmd.tables, table, "tables");
    if (Array.isArray(cmd.nodes)) cmd.nodes.forEach((n, i) => n && typeof n === "object" && fix(n, "table", table, `nodes[${i}].table`));
    fixList(cmd.columns, column, "columns");
    if (op === "updateKey" && cmd.set && typeof cmd.set === "object") fixList(cmd.set.columns, column, "set.columns");
    if (Array.isArray(cmd.pairs)) {
      cmd.pairs.forEach((p, i) => {
        if (!Array.isArray(p)) return;
        fix(p, 0, column, `pairs[${i}][0]`);
        if (!cmd.parentRef) fix(p, 1, column, `pairs[${i}][1]`);
      });
    }
    fix(cmd, "diagram", diagram, "diagram");
    if (errors.length === before) remember(ix, cmd);
    out.push(cmd);
  });
  return { commands: out, errors };
}

/** 표 이름·id 목록 → [{ref, id}] (겹친 표는 한 번). claimTable·releaseTable 이 쓴다. */
export function resolveTables(view, names) {
  const ix = indexOf(view);
  const resolved = [];
  const errors = [];
  names.forEach((ref, index) => {
    const r = table(ix, ref);
    if (r.error) errors.push({ index, field: "tables", value: String(ref), message: r.error, near: r.near ?? [] });
    else if (!resolved.some((x) => x.id === r.id)) resolved.push({ ref, id: r.id });
  });
  return { resolved, errors };
}

/** getChangesSince 의 tables 거르기: 정확한 물리명, 끝이 * 면 접두사, t- id. */
export function pickTableIds(view, names) {
  const ix = indexOf(view);
  const ids = new Set();
  const missing = [];
  for (const raw of names) {
    let hit = isId(raw, "t-");
    if (hit) ids.add(raw);
    const key = dropSchema(up(raw));
    const prefix = key.endsWith("*") ? key.replace(/\*+$/, "") : null;
    for (const [phys, id] of ix.tables) {
      if (prefix !== null ? phys.startsWith(prefix) : phys === key) {
        ids.add(id);
        hit = true;
      }
    }
    if (!hit) missing.push(raw);
  }
  return { ids, missing };
}

/** 델타 한 건이 건드린 표 id. 지운 요소는 m(지우기 전 모델)에서 찾는다. */
export function tablesOfChange(m, ch) {
  const v = ch?.value ?? null;
  switch (ch?.kind) {
    case "table":
      return [ch.id];
    case "column":
      return [v?.table ?? m.columns[ch.id]?.table].filter(Boolean);
    case "key":
      return [v?.table ?? m.keys[ch.id]?.table].filter(Boolean);
    case "relation": {
      const r = v ?? m.relations[ch.id];
      return r ? [r.child, r.parent].filter(Boolean) : [];
    }
    case "diagramNode":
      return [String(ch.id).split(":")[1]].filter(Boolean);
    default:
      return [];
  }
}

/**
 * 요소 id → 사람이 읽는 이름: 표 "TB_X", 컬럼 "TB_X.COL", 키 "TB_X:PK"·"TB_X:키이름", 관계 "TB_X.COL > TB_Y.COL",
 * 다이어그램 "업무영역/이름", 다이어그램 노드 "업무영역/이름:TB_X". 모르는 id 는 그대로 둔다.
 * changes(델타의 upsert 값)를 주면 그 값을 먼저 쓴다 — 새로 만든 요소와 이름을 바꾼 요소도 이름이 나온다.
 * @returns {Map<string, string>}
 */
export function describeTargets(view, ids, changes = []) {
  const base = modelOf(view);
  const m = { tables: { ...base.tables }, columns: { ...base.columns }, keys: { ...base.keys }, relations: { ...base.relations } };
  const bucket = { table: "tables", column: "columns", key: "keys", relation: "relations" };
  for (const ch of changes ?? []) {
    if (ch?.op === "upsert" && bucket[ch.kind] && ch.value && typeof ch.value === "object") m[bucket[ch.kind]][ch.id] = ch.value;
  }
  const diagrams = new Map((view?.diagrams ?? []).map((d) => [d.id, `${d.areaName}/${d.diagramName}`]));
  const tp = (id) => m.tables[id]?.phys;
  const label = (id) => {
    if (typeof id !== "string") return String(id);
    if (m.tables[id]) return tp(id) ?? id;
    const c = m.columns[id];
    if (c) return `${tp(c.table) ?? "?"}.${c.phys}`;
    const k = m.keys[id];
    if (k) return k.kind === "PK" ? `${tp(k.table) ?? "?"}:PK` : `${tp(k.table) ?? "?"}:${k.name}`;
    const r = m.relations[id];
    if (r) return relText(m, r);
    if (diagrams.has(id)) return diagrams.get(id);
    const node = /^(d-[^:]+):(t-.+)$/.exec(id);
    if (node) return `${diagrams.get(node[1]) ?? node[1]}:${tp(node[2]) ?? node[2]}`;
    return id;
  };
  return new Map(ids.map((id) => [id, label(id)]));
}
```

- [ ] **Step 8: 통과 확인**

Run: `node --test scripts/erd/tests/commands.test.mjs`
Expected: PASS 5건.

- [ ] **Step 9: 결과 글 시험 작성 (실패)**

`scripts/erd/tests/results.test.mjs`. 크기 시험은 마감 07 Step 9 의 세 경우(한글 주석 200건 반영, 델타 500건, 한글 24,000자 지금 값)를 가짜 응답으로 먼저 본다.

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUP_LIMIT,
  WRITE_TEXT_LIMIT,
  clock,
  formatChangesText,
  formatClaimText,
  formatResolveErrors,
  formatWriteResult,
} from "../lib/results.mjs";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, MODEL, VIEW } from "./fixtures/erd-view.mjs";

const KST = { offsetMin: 540 };
const UPDATE = [{ op: "updateColumn", id: "c-m3", set: { logical: "메뉴이름" } }];
const ctx = (over = {}) => ({ op: "apply", commands: UPDATE, view: VIEW, baseRev: 10, dryRun: false, session: "claude-test", user: "erd-mcp-a", others: null, ...KST, ...over });
const claimed = (table, session) => ({ code: "CLAIMED", elementId: table, message: `${session} 가 작업 중인 표입니다`, claimedBy: session, expiresAt: "2026-10-11T05:20:00Z" });
const reject = (over) => ({ applied: false, rev: 12, rowVersion: null, dryRun: false, changes: [], warnings: [], rejection: { ...CONFLICT_REJECTION, ...over } });

test("반영 글: 변경 줄(바뀐 속성), CLAIMED(세션의 사용자), 다른 세션 변경, 다음 baseRev", () => {
  const r = { ...APPLIED_13, warnings: [claimed("t-menu", "claude-a")] };
  const out = formatWriteResult(r, ctx({ others: { reload: false, deltas: [DELTA_UI_11] } }));
  assert.equal(out.isError, false);
  assert.equal(
    out.text,
    [
      "반영 rev 13 (baseRev 10) · 변경 1 · 경고 1 · 세션 claude-test",
      "column upsert TB_MCM_SEC_MENU.MENU_NM (logical)",
      "경고: CLAIMED 1",
      "TB_MCM_SEC_MENU 작업 중: claude-a (41000207), 14:20(+09:00)까지",
      "baseRev 뒤 다른 세션 변경 1건: ui-41000207 rev 11, TB_MCM_SEC_OBJ. getChangesSince(10) 로 확인하세요.",
      "다음 baseRev: 13",
    ].join("\n"),
  );
  // 접속자 목록에 없는 세션은 사용자를 모른다 → 세션만 적는다.
  const unknown = formatWriteResult({ ...APPLIED_13, warnings: [claimed("t-menu", "claude-zz")] }, ctx());
  assert.match(unknown.text, /^TB_MCM_SEC_MENU 작업 중: claude-zz, 14:20\(\+09:00\)까지$/m);
  assert.equal(clock("2026-10-11T05:20:00Z", { offsetMin: 0 }), "05:20(+00:00)");
});

test("새 요소는 (새), 지운 요소는 지우기 전 이름", () => {
  const r = {
    ...APPLIED_13,
    changes: [
      { kind: "table", id: "t-n1", op: "upsert", value: { phys: "TB_MCM_NEW", logical: "새 표", comment: "", columnOrder: [], _rev: {} } },
      { kind: "column", id: "c-n1", op: "upsert", value: { table: "t-n1", phys: "NEW_ID", _rev: {} } },
      { kind: "column", id: "c-m2", op: "delete", value: null },
    ],
  };
  const lines = formatWriteResult(r, ctx()).text.split("\n");
  assert.deepEqual(lines.slice(1, 4), ["table upsert TB_MCM_NEW (새)", "column upsert TB_MCM_NEW.NEW_ID (새)", "column delete TB_MCM_SEC_MENU.OBJECT_ID"]);
});

test("CONFLICT 거절 글(README 정본)과 byUserId 가 없는 옛 응답", () => {
  const out = formatWriteResult(reject({}), ctx());
  assert.equal(out.isError, true);
  assert.equal(
    out.text,
    [
      "거절 CONFLICT · 명령 #1 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · 저장한 것 없음",
      "바꾼 사람: 41000207 (세션 ui-41000207) rev 11 · 지금 값: \"메뉴명\"",
      "다음: getChangesSince(10) 로 바뀐 값을 읽고, 묶음 전체를 baseRev 11 이상으로 다시 보내세요.",
    ].join("\n"),
  );
  const { byUserId, ...old } = CONFLICT_REJECTION; // 서버 레인 머지 전 응답: 칸이 아예 없다
  const oldOut = formatWriteResult({ ...reject({}), rejection: old }, ctx());
  assert.match(oldOut.text, /^바꾼 사람: 세션 ui-41000207 rev 11 · 지금 값: "메뉴명"$/m);
  assert.doesNotMatch(oldOut.text, /undefined|null \(/);
});

test("NOT_FOUND·NEEDS_CHOICE(20건)·NOT_EDITOR·INVALID(낡은 차이 항목) 글", () => {
  const nf = formatWriteResult(reject({ code: "NOT_FOUND", message: "이미 지워진 요소입니다: c-m3", property: null, current: null }), ctx()).text;
  assert.match(nf, /^거절 NOT_FOUND · 명령 #1 updateColumn TB_MCM_SEC_MENU\.MENU_NM · 저장한 것 없음$/m);
  assert.match(nf, /^지운 사람: 41000207 \(세션 ui-41000207\) rev 11$/m);
  assert.match(nf, /다음: getChangesSince\(10\) 로 지운 변경을 확인하고/);

  const choices = Array.from({ length: 25 }, (_, i) => `MENU_NM_${i}`);
  const nc = formatWriteResult(reject({ code: "NEEDS_CHOICE", message: "이름이 겹칩니다", choices, byRev: null, bySession: null, byUserId: null }), ctx()).text;
  assert.match(nc, /^고를 수 있는 값 25개: "MENU_NM_0", .*"MENU_NM_19" 외 5개$/m);
  assert.match(nc, /onNameClash 를 REUSE/);

  const ne = formatWriteResult(reject({ code: "NOT_EDITOR", message: "편집 권한이 없습니다", ownerId: "admin", byRev: null, bySession: null, byUserId: null, elementId: null }), ctx()).text;
  assert.match(ne, /^소유자: admin · 서버가 보는 사용자\(ERD_USER\): erd-mcp-a$/m);
  assert.match(ne, /소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값\(erd-mcp-a\)을 등록해 달라고 하세요/);

  const stale = ["COLUMN_ADDED:TB_X.Y", "FK_ADDED:TB_X(Y)>TB_Z(Y)"];
  const inv = formatWriteResult(
    reject({ code: "INVALID", message: "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 2개가 있습니다", hint: "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", elementId: stale[0], property: "itemsJson", choices: stale, byRev: null, bySession: null, byUserId: null, current: null }),
    ctx(),
  ).text;
  assert.match(inv, /^내용: 차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 2개가 있습니다$/m);
  assert.match(inv, /^해당 항목 2개: "COLUMN_ADDED:TB_X\.Y", "FK_ADDED:TB_X\(Y\)>TB_Z\(Y\)"$/m);
  assert.match(inv, /^다음: compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요$/m);
});

test("시험 실행: 통과·거절 머리줄, baseRev 는 그대로, 서버가 dryRun 을 모르면 경고", () => {
  const pass = formatWriteResult({ ...APPLIED_13, applied: false, rev: 12, rowVersion: null, dryRun: true }, ctx({ dryRun: true }));
  assert.equal(pass.isError, false);
  const lines = pass.text.split("\n");
  assert.equal(lines[0], "시험 실행(저장 안 함) · 통과");
  assert.equal(lines[1], "지금 rev 12 (baseRev 10) · 변경 1 · 경고 0 · 세션 claude-test");
  assert.equal(lines.at(-1), "다음: dryRun 없이 같은 묶음을 보내면 저장한다(CLI 는 --apply). baseRev 는 10 그대로 쓴다.");
  assert.doesNotMatch(pass.text, /다음 baseRev/); // 시험 실행의 rev 를 다음 baseRev 로 주지 않는다(S2-22)

  const dryReject = formatWriteResult({ ...reject({}), dryRun: true }, ctx({ dryRun: true })).text.split("\n");
  assert.deepEqual(dryReject.slice(0, 2), ["시험 실행(저장 안 함) · 거절 CONFLICT", "명령 #1 updateColumn TB_MCM_SEC_MENU.MENU_NM.logical · baseRev 10"]);

  const old = formatWriteResult({ applied: true, rev: 13, changes: [], warnings: [], rejection: null }, ctx({ dryRun: true }));
  assert.equal(old.isError, true);
  assert.match(old.text, /^주의: 서버가 시험 실행\(dryRun\)을 지원하지 않아 실제로 반영했습니다 · 반영 rev 13/);
  assert.match(old.text, /undo\(rev=13\)/);
});

test("되돌리기 글: 누구의 몇 rev, 되돌리기 CONFLICT", () => {
  const ok = formatWriteResult({ ...APPLIED_13, rev: 14 }, ctx({ op: "undo", baseRev: null, undoRev: 13, undone: DELTA_ME_13 })).text.split("\n");
  assert.equal(ok[0], "반영 rev 14 (되돌리기 rev 13) · 변경 1 · 경고 0 · 세션 claude-test");
  assert.equal(ok[1], "되돌린 변경: rev 13 · 41000207 (세션 claude-test) · 1건");
  assert.equal(ok.at(-1), "다음 baseRev: 14");
  const unknown = formatWriteResult({ ...APPLIED_13, rev: 14 }, ctx({ op: "undo", baseRev: null, undoRev: 13, undone: null })).text;
  assert.match(unknown, /^되돌린 변경: rev 13 \(누구의 변경인지 읽지 못했습니다\)$/m);
  const c = formatWriteResult(reject({ byUserId: "erd-mcp-b", bySession: "claude-b", byRev: 15 }), ctx({ op: "undo", baseRev: null, undoRev: 13 })).text;
  assert.match(c, /^거절 CONFLICT · 되돌리기 rev 13 TB_MCM_SEC_MENU\.MENU_NM\.logical · 저장한 것 없음$/m);
  assert.match(c, /^바꾼 사람: erd-mcp-b \(세션 claude-b\) rev 15/m);
  assert.match(c, /^다음: rev 13 뒤에 같은 속성이 바뀌어 되돌릴 수 없습니다/m);
});

test("경고는 코드별 수로 묶고 코드마다 처음 50건만 이름을 적는다(S2-28)", () => {
  const std = Array.from({ length: 120 }, () => ({ code: "STD_NEW", elementId: "c-m3", message: "컬럼 사전에 아직 없는 이름입니다", claimedBy: null, expiresAt: null }));
  const text = formatWriteResult({ ...APPLIED_13, warnings: [...std, claimed("t-menu", "claude-a")] }, ctx()).text;
  assert.match(text, /^경고: CLAIMED 1, STD_NEW 120$/m);
  assert.equal(text.split("\n").filter((l) => l.startsWith("STD_NEW TB_MCM_SEC_MENU.MENU_NM:")).length, GROUP_LIMIT);
  assert.match(text, /^… STD_NEW 70건 더\(이름은 처음 50건만 적는다\)$/m);
});

test("크기: 한글 주석 200건 반영과 24,000자 지금 값도 25,000자 안이고 마지막 줄은 남는다", () => {
  const cols = Array.from({ length: 200 }, (_, i) => `c-k${i}`);
  const big = { ...VIEW, model: JSON.stringify({ ...MODEL, columns: { ...MODEL.columns, ...Object.fromEntries(cols.map((id, i) => [id, { ...MODEL.columns["c-m3"], phys: `KOREAN_COMMENT_COLUMN_${i}` }])) } }) };
  const changes = cols.map((id, i) => ({
    kind: "column", id, op: "upsert",
    value: { ...MODEL.columns["c-m3"], phys: `KOREAN_COMMENT_COLUMN_${i}`, comment: "마감 크기 시험 한글 주석 — 표준 용어와 도메인 확인용 ".repeat(30) },
  }));
  const text = formatWriteResult({ ...APPLIED_13, rev: 300, changes }, ctx({ view: big, baseRev: 299 })).text;
  assert.ok(text.length <= WRITE_TEXT_LIMIT, `${text.length}`);
  assert.equal(text.split("\n").at(-1), "다음 baseRev: 300");
  const veryLong = Array.from({ length: 900 }, (_, i) => ({ ...changes[i % 200], id: `c-x${i}` }));
  const cut = formatWriteResult({ ...APPLIED_13, rev: 300, changes: veryLong }, ctx({ view: big, baseRev: 299 })).text.split("\n");
  assert.ok(cut.join("\n").length <= WRITE_TEXT_LIMIT);
  assert.match(cut.at(-2), /^… \d+줄 더 있습니다\. getChangesSince\(299\) 로 나눠 읽으세요\.$/);
  assert.equal(cut.at(-1), "다음 baseRev: 300");

  const ko = "가나다라마바사아자차카타파하".repeat(2000).slice(0, 24000);
  const r = formatWriteResult(reject({ current: ko }), ctx());
  assert.ok(r.text.length < 1000, `${r.text.length}`);
  assert.match(r.text, /지금 값: "가나다.*…\(\d+자 더\)/);
});

test("이름 풀기 실패와 작업 중 표시 글", () => {
  const e = formatResolveErrors([{ index: 0, field: "id", value: "TB_MCM_SEC_MENU.MENU", message: "없는 컬럼입니다", near: ["TB_MCM_SEC_MENU.MENU_ID"] }], UPDATE);
  assert.equal(
    e,
    [
      "이름 풀기 실패 1건 · 서버에 보내지 않음(저장한 것 없음)",
      "명령 #1 updateColumn id \"TB_MCM_SEC_MENU.MENU\": 없는 컬럼입니다 · 비슷한 이름: TB_MCM_SEC_MENU.MENU_ID",
      "다음: getModelText(tables=[…]) 로 물리명을 확인하고 묶음 전체를 다시 보내세요. id(t-·c-·k-·r-·d-)를 그대로 써도 됩니다.",
    ].join("\n"),
  );
  const c = formatClaimText(
    "CLAIM",
    [
      { label: "TB_A", result: { ok: true, claimedBy: "claude-test", userId: "u", expiresAt: "2026-10-11T05:30:00Z" } },
      { label: "TB_B", result: { ok: false, claimedBy: "claude-b", userId: "erd-mcp-b", expiresAt: "2026-10-11T05:20:00Z" } },
      { label: "TB_C", result: { ok: false, claimedBy: null, userId: null, expiresAt: null } },
      { label: "TB_D", result: { ok: false } }, // 옛 서버: ok 만 온다
    ],
    [{ index: 4, field: "tables", value: "TB_X", message: "없는 표입니다", near: [] }],
    { session: "claude-test", ...KST },
  );
  assert.equal(c.isError, false); // 못 잡은 것은 오류가 아니다
  assert.deepEqual(c.text.split("\n"), [
    "작업 중 표시 4개 · 세션 claude-test · 600초 뒤 저절로 풀린다(오래 걸리면 다시 부른다)",
    "TB_A 잡음 · 14:30(+09:00)까지",
    "TB_B 못 잡음: claude-b (erd-mcp-b) 가 14:20(+09:00)까지 작업 중",
    "TB_C 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.",
    "TB_D 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.",
    "없는 표 \"TB_X\": 없는 표입니다",
  ]);
  assert.equal(formatClaimText("RELEASE", [], [{ index: 0, field: "tables", value: "TB_X", message: "없는 표입니다", near: [] }], { session: "s" }).isError, true);
});

test("getChangesSince 글: 이름, 거르기, raw 는 원할 때만, 500건도 25,000자 안", () => {
  const cv = { rev: 13, reload: false, deltas: [DELTA_UI_11, DELTA_ME_13] };
  const base = { view: VIEW, sinceRev: 10, mySession: "claude-test" };
  const out = formatChangesText(cv, base);
  assert.equal(out.raw, null);
  assert.equal(
    out.text,
    [
      "# rev 10 이후 변경 2건 (현재 rev 13)",
      "rev 11 41000207/ui-41000207 UI: table upsert TB_MCM_SEC_OBJ (logical)",
      "rev 13 41000207/claude-test MCP: column upsert TB_MCM_SEC_MENU.MENU_NM (logical)",
      "다음 baseRev: 13",
    ].join("\n"),
  );
  const mine = formatChangesText(cv, { ...base, excludeMine: true }).text.split("\n");
  assert.equal(mine[0], "# rev 10 이후 변경 2건 (현재 rev 13) · 보인 것 1건(내 세션 claude-test 뺌)");
  assert.equal(mine.length, 3);
  const byTable = formatChangesText(cv, { ...base, tables: "TB_MCM_SEC_MENU,TB_NOPE" }).text.split("\n");
  assert.equal(byTable[0], "# rev 10 이후 변경 2건 (현재 rev 13) · 보인 것 1건(표 TB_MCM_SEC_MENU,TB_NOPE)");
  assert.equal(byTable[1], "없는 표: TB_NOPE");
  assert.deepEqual(JSON.parse(formatChangesText(cv, { ...base, session: "ui-41000207", raw: true }).raw).deltas.map((d) => d.rev), [11]);
  assert.match(formatChangesText({ rev: 900, reload: true, deltas: [] }, base).text, /^# reload: .*현재 rev 900\. getModelText 로/);

  const many = Array.from({ length: 500 }, (_, i) => ({
    ...DELTA_ME_13,
    rev: 14 + i,
    changes: Array.from({ length: 12 }, (_, j) => ({ kind: "diagramNode", id: `d-menu:t-menu`, op: "upsert", value: { x: j, y: i } })),
  }));
  const big = formatChangesText({ rev: 513, reload: false, deltas: many }, { ...base, sinceRev: 13 });
  assert.ok(big.text.length <= WRITE_TEXT_LIMIT, `${big.text.length}`);
  assert.match(big.text.split("\n").at(-1), /^… \d+줄 더 있습니다\. getChangesSince\(\d+\) 로 나눠 읽으세요\.$/);
  const withRaw = formatChangesText({ rev: 513, reload: false, deltas: many }, { ...base, sinceRev: 13, raw: true });
  assert.ok(withRaw.text.length + withRaw.raw.length <= WRITE_TEXT_LIMIT);
  assert.ok(JSON.parse(withRaw.raw).truncated > 0);
});
```

- [ ] **Step 10: 실패 확인**

Run: `node --test scripts/erd/tests/results.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`scripts/erd/lib/results.mjs` 가 없다).

- [ ] **Step 11: 결과 글 구현**

`scripts/erd/lib/results.mjs`:

```js
// MCP·CLI 결과 글(README "결과 글", S2-21). 순수 함수 — 네트워크·파일을 쓰지 않는다.
// 쓰기·거절·변경 글은 WRITE_TEXT_LIMIT 를 넘지 않는다. 넘치면 몸통 줄(변경 줄)을 자르고 마지막 줄(다음 baseRev·다음 할 일)은 남긴다.
// 서버가 아직 싣지 않을 수 있는 칸(byUserId·rowVersion·dryRun·summary)은 없으면 null 로 읽는다(S2-1).
import { describeTargets, modelOf, pickTableIds, tablesOfChange } from "./commands.mjs";
import { tableArgs } from "./model-text.mjs";

/** 쓰기·변경 결과 글 상한(S2-21). getModelText 의 TEXT_LIMIT(40,000)보다 작다 — 한글이 많아 같은 글자 수에 토큰이 더 든다. */
export const WRITE_TEXT_LIMIT = 25000;
/** 경고는 코드마다 묶어 수를 적고, 코드마다 처음 50건만 이름을 적는다(S2-28). */
export const GROUP_LIMIT = 50;
/** NEEDS_CHOICE·INVALID 의 고를 값·해당 항목은 20건까지(README 결과 글). */
export const CHOICE_LIMIT = 20;
/** 값 하나(지금 값·고를 값)를 적는 글자 상한. 넘치면 "…(n자 더)". */
export const VALUE_LIMIT = 200;
const LINE_LIMIT = 2000;
const CHANGES_PER_DELTA = 10;
const TABLES_IN_LINE = 10;

const pad = (n) => String(n).padStart(2, "0");

/** 글을 n 자로 자르고 남은 길이를 적는다. */
export function clip(text, n = VALUE_LIMIT) {
  const s = String(text ?? "");
  return s.length <= n ? s : `${s.slice(0, n)}…(${s.length - n}자 더)`;
}

/** 값 하나를 JSON 글로(문자열은 따옴표), VALUE_LIMIT 안에서. */
export function valueText(v) {
  return v === null || v === undefined ? "null" : clip(JSON.stringify(v));
}

/** ISO 시각 → "14:20(+09:00)". opts.offsetMin(UTC 에서 동쪽으로 몇 분)은 시험용. */
export function clock(at, opts = {}) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return String(at ?? "-");
  const off = opts.offsetMin ?? -new Date(t).getTimezoneOffset();
  const d = new Date(t + off * 60000);
  const sign = off >= 0 ? "+" : "-";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}(${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)})`;
}

/**
 * 블록 목록을 limit 글자 안의 글로 잇는다. 블록은 { lines, more? }. more 가 없는 블록은 그대로 남기고,
 * more 가 있는 블록은 남은 자리만큼 앞에서부터 싣고 more(남은 줄 수, 실은 줄 수) 한 줄을 붙인다(앞 블록이 먼저 자리를 받는다).
 * 줄 하나는 LINE_LIMIT 를 넘지 않는다. 고정 블록만으로 넘치면 마지막 줄을 남기고 앞을 자른다.
 * 반환 { text, kept }: kept[i] = i 번째 블록에서 실은 줄 수.
 */
export function fitBlocksDetail(blocks, limit) {
  const norm = blocks.map((b) => ({ ...b, lines: b.lines.map((s) => clip(s, LINE_LIMIT)) }));
  const kept = norm.map((b) => b.lines.length);
  const whole = norm.flatMap((b) => b.lines).join("\n");
  if (whole.length <= limit) return { text: whole, kept };
  const size = (lines) => lines.reduce((s, x) => s + x.length + 1, 0);
  let budget = limit + 1 - size(norm.filter((b) => !b.more).flatMap((b) => b.lines));
  budget -= norm.reduce((s, b) => s + (b.more ? b.more(b.lines.length, 0).length + 8 : 0), 0); // 더 줄 자리(숫자 자리 여유 포함)
  norm.forEach((b, i) => {
    if (!b.more) return;
    let n = 0;
    for (const s of b.lines) {
      if (s.length + 1 > budget) break;
      budget -= s.length + 1;
      n++;
    }
    kept[i] = n;
  });
  const out = norm
    .flatMap((b, i) => (!b.more || kept[i] === b.lines.length ? b.lines : [...b.lines.slice(0, kept[i]), b.more(b.lines.length - kept[i], kept[i])]))
    .join("\n");
  if (out.length <= limit) return { text: out, kept };
  const last = out.slice(out.lastIndexOf("\n") + 1);
  return { text: `${out.slice(0, Math.max(0, limit - last.length - 2))}…\n${last}`, kept };
}

/** fitBlocksDetail 의 글만. */
export function fitBlocks(blocks, limit) {
  return fitBlocksDetail(blocks, limit).text;
}

/** 이 변경에서 바뀐 속성. before(보내기 전 모델)가 있으면 값 비교, 없으면 _rev 가 이 rev 인 속성. 이전에 없던 요소는 "새". */
function propsText(c, before, rev) {
  const v = c.value;
  if (!v || typeof v !== "object") return "";
  const bucket = { table: "tables", column: "columns", key: "keys", relation: "relations" }[c.kind];
  if (before && bucket) {
    const old = before[bucket][c.id];
    if (!old) return " (새)";
    const props = Object.keys(v).filter((k) => k !== "_rev" && JSON.stringify(v[k]) !== JSON.stringify(old[k]));
    return props.length ? ` (${props.join(", ")})` : "";
  }
  const props = Object.entries(v._rev ?? {})
    .filter(([, pr]) => pr && pr.rev === rev)
    .map(([k]) => k);
  return props.length ? ` (${props.join(", ")})` : "";
}

function changeText(c, labels, before, rev) {
  let name = labels.get(c.id) ?? c.id;
  if (c.op === "delete" && name === c.id) name = `${c.id}(지움)`;
  return `${c.kind} ${c.op} ${name}${c.op === "delete" ? "" : propsText(c, before, rev)}`;
}

/** 접속자 목록에서 세션 → 사용자. CLAIMED 경고에는 사용자 칸이 없다(claimedBy 는 세션이다). */
function userOf(presence, session) {
  return (presence ?? []).find((p) => p.session === session)?.userId ?? null;
}

/** 경고 묶음: [요약 줄, CLAIMED 줄들], [STD 등 줄들]. 코드마다 GROUP_LIMIT 건까지 이름을 적는다. */
function warningBlocks(warnings, labels, presence, opts) {
  if (!warnings.length) return { head: [], rest: [] };
  const groups = new Map();
  for (const w of warnings) {
    const code = w?.code ?? "?";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(w);
  }
  const codes = [...groups.keys()].sort();
  const head = [`경고: ${codes.map((c) => `${c} ${groups.get(c).length}`).join(", ")}`];
  const rest = [];
  for (const code of codes) {
    const list = groups.get(code);
    const into = code === "CLAIMED" ? head : rest;
    for (const w of list.slice(0, GROUP_LIMIT)) {
      const name = labels.get(w.elementId) ?? w.elementId ?? "-";
      if (code === "CLAIMED") {
        const user = userOf(presence, w.claimedBy);
        const until = w.expiresAt ? `, ${clock(w.expiresAt, opts)}까지` : "";
        into.push(`${name} 작업 중: ${w.claimedBy ?? "?"}${user ? ` (${user})` : ""}${until}`);
      } else into.push(`${code} ${name}: ${w.message ?? ""}`);
    }
    if (list.length > GROUP_LIMIT) into.push(`… ${code} ${list.length - GROUP_LIMIT}건 더(이름은 처음 ${GROUP_LIMIT}건만 적는다)`);
  }
  return { head, rest };
}

/** baseRev 뒤 다른 세션 변경 한 줄. others = { reload, deltas }(이미 다른 세션·rev 범위로 거른 것). */
export function othersLine(others, baseRev, view) {
  if (!others) return null;
  if (others.reload) {
    return `baseRev ${baseRev} 뒤 변경을 다 읽지 못했습니다(500건이 넘거나 DRAFT 가 바뀌었습니다). getModelText 로 다시 읽으세요.`;
  }
  const ds = others.deltas ?? [];
  if (!ds.length) return null;
  const range = new Map();
  for (const d of ds) {
    const r = range.get(d.session) ?? { min: d.rev, max: d.rev };
    range.set(d.session, { min: Math.min(r.min, d.rev), max: Math.max(r.max, d.rev) });
  }
  const sessions = [...range].map(([s, r]) => `${s} rev ${r.min === r.max ? r.min : `${r.min}~${r.max}`}`).join(", ");
  const m = modelOf(view);
  const changes = ds.flatMap((d) => d.changes ?? []);
  const tableIds = [...new Set(changes.flatMap((c) => tablesOfChange(m, c)))];
  const labels = describeTargets(view, tableIds, changes);
  const names = [...new Set(tableIds.map((id) => labels.get(id)))].sort();
  const shown = names.slice(0, TABLES_IN_LINE).join(", ") + (names.length > TABLES_IN_LINE ? ` 외 ${names.length - TABLES_IN_LINE}개` : "");
  return `baseRev 뒤 다른 세션 변경 ${ds.length}건: ${sessions}${shown ? `, ${shown}` : ""}. getChangesSince(${baseRev}) 로 확인하세요.`;
}

function who(userId, session) {
  return userId ? `${userId} (세션 ${session ?? "?"})` : `세션 ${session ?? "?"}`;
}

/** 거절 줄: [자세한 줄들], 다음 할 일 한 줄. */
function rejectionDetail(rej, ctx) {
  const lines = [];
  let next;
  const choices = Array.isArray(rej.choices) ? rej.choices : rej.choices === null || rej.choices === undefined ? [] : [rej.choices];
  const choiceText = () =>
    choices.slice(0, CHOICE_LIMIT).map(valueText).join(", ") + (choices.length > CHOICE_LIMIT ? ` 외 ${choices.length - CHOICE_LIMIT}개` : "");
  if (rej.code !== "CONFLICT" && rej.message) lines.push(`내용: ${rej.message}`);
  switch (rej.code) {
    case "CONFLICT":
      lines.push(`바꾼 사람: ${who(rej.byUserId, rej.bySession)} rev ${rej.byRev ?? "?"} · 지금 값: ${valueText(rej.current)}`);
      next =
        ctx.op === "undo"
          ? `다음: rev ${ctx.undoRev} 뒤에 같은 속성이 바뀌어 되돌릴 수 없습니다. getChangesSince(${ctx.undoRev}) 로 뒤 변경을 읽고, 필요하면 apply 로 직접 고치세요.`
          : `다음: getChangesSince(${ctx.baseRev}) 로 바뀐 값을 읽고, 묶음 전체를 baseRev ${rej.byRev ?? "(마지막으로 읽은 rev)"} 이상으로 다시 보내세요.`;
      break;
    case "NOT_FOUND":
      lines.push(`지운 사람: ${who(rej.byUserId, rej.bySession)} rev ${rej.byRev ?? "?"}`);
      next = `다음: getChangesSince(${ctx.baseRev ?? ctx.undoRev}) 로 지운 변경을 확인하고, 그 요소를 뺀 묶음을 다시 보내세요.`;
      break;
    case "NEEDS_CHOICE":
      lines.push(`고를 수 있는 값 ${choices.length}개: ${choiceText()}`);
      next = "다음: addRelation 이면 onNameClash 를 REUSE(있는 컬럼 쓰기) 또는 RENAME(새 이름)으로 주고, 이름을 골라야 하면 phys 에 위 값 하나를 넣어 묶음을 다시 보내세요.";
      break;
    case "NOT_EDITOR":
      lines.push(`소유자: ${rej.ownerId ?? "없음"} · 서버가 보는 사용자(ERD_USER): ${ctx.user ?? "?"}`);
      next = rej.ownerId
        ? `다음: 소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값(${ctx.user ?? "?"})을 등록해 달라고 하세요.`
        : `다음: 이 버전에 소유자가 없습니다. 사람이 DRAFT 를 선점(lock)한 뒤, 소유자에게 execute kind=ADD_EDITOR 로 ERD_USER 값(${ctx.user ?? "?"})을 등록해 달라고 하세요.`;
      break;
    default:
      if (choices.length) lines.push(`해당 항목 ${choices.length}개: ${choiceText()}`);
      next = `다음: ${rej.hint ?? "입력을 고쳐 다시 보내세요."}`;
  }
  return { lines, next };
}

/**
 * apply·confirmRelation·rejectRelation·undo 결과 글. 반환 { text, isError }.
 * ctx: { op: "apply"|"undo", commands(보낸 명령, 해석 뒤), view(보내기 전 view), baseRev, undoRev, undone(되돌린 델타 또는 null),
 *        dryRun(요청), session, user, others, offsetMin?, limit? }
 */
export function formatWriteResult(result, ctx) {
  const r = result ?? {};
  const rej = r.rejection ?? null;
  const changes = r.changes ?? [];
  const warnings = r.warnings ?? [];
  const ignored = ctx.dryRun === true && r.applied === true && r.dryRun !== true; // 서버가 dryRun 을 몰라 저장했다
  const dry = ctx.dryRun === true && !ignored;
  const before = modelOf(ctx.view);
  const ids = [...changes.map((c) => c.id), ...warnings.map((w) => w?.elementId), rej?.elementId].filter((x) => typeof x === "string");
  const labels = describeTargets(ctx.view, [...new Set(ids)], changes);
  const undo = ctx.op === "undo";
  const where = undo ? `되돌리기 rev ${ctx.undoRev}` : `baseRev ${ctx.baseRev}`;
  const stats = `변경 ${changes.length} · 경고 ${warnings.length} · 세션 ${ctx.session}`;

  const head = [];
  let next;
  if (rej) {
    const cmd = undo ? null : ctx.commands?.[rej.commandIndex];
    const el = rej.elementId ? ` ${labels.get(rej.elementId) ?? rej.elementId}${rej.property ? `.${rej.property}` : ""}` : "";
    const target = undo ? `되돌리기 rev ${ctx.undoRev}${el}` : `명령 #${(rej.commandIndex ?? 0) + 1}${cmd ? ` ${cmd.op}` : ""}${el}`;
    if (dry) head.push(`시험 실행(저장 안 함) · 거절 ${rej.code}`, undo ? target : `${target} · ${where}`);
    else head.push(`거절 ${rej.code} · ${target} · 저장한 것 없음`);
    const d = rejectionDetail(rej, ctx);
    head.push(...d.lines);
    next = [d.next];
  } else if (ignored) {
    head.push(`주의: 서버가 시험 실행(dryRun)을 지원하지 않아 실제로 반영했습니다 · 반영 rev ${r.rev} (${where}) · ${stats}`);
    next = [`다음: 저장을 원하지 않았다면 undo(rev=${r.rev}) 로 되돌리세요.`, `다음 baseRev: ${r.rev}`];
  } else if (dry) {
    head.push("시험 실행(저장 안 함) · 통과", `지금 rev ${r.rev} (${where}) · ${stats}`);
    next = [undo ? "다음: dryRun 없이 다시 부르면 되돌린다(CLI 는 --apply)." : `다음: dryRun 없이 같은 묶음을 보내면 저장한다(CLI 는 --apply). baseRev 는 ${ctx.baseRev} 그대로 쓴다.`];
  } else {
    head.push(`반영 rev ${r.rev} (${where}) · ${stats}`);
    next = [`다음 baseRev: ${r.rev}`];
  }
  if (undo && !rej) {
    const d = ctx.undone;
    head.push(
      d
        ? `되돌린 변경: rev ${ctx.undoRev} · ${who(d.userId, d.session)} · ${(d.changes ?? []).length}건`
        : `되돌린 변경: rev ${ctx.undoRev} (누구의 변경인지 읽지 못했습니다)`,
    );
  }

  const changeLines = rej ? [] : changes.map((c) => changeText(c, labels, before, r.rev));
  const w = warningBlocks(warnings, labels, ctx.view?.presence, ctx);
  const others = othersLine(ctx.others, ctx.baseRev, ctx.view);
  const moreFrom = ctx.baseRev ?? (r.rev ?? 1) - 1;
  const text = fitBlocks(
    [
      { lines: head },
      { lines: changeLines, more: (n) => `… ${n}줄 더 있습니다. getChangesSince(${moreFrom}) 로 나눠 읽으세요.` },
      { lines: w.head },
      { lines: w.rest, more: (n) => `… 경고 ${n}줄 더 있습니다.` },
      { lines: others ? [others] : [] },
      { lines: next },
    ],
    ctx.limit ?? WRITE_TEXT_LIMIT,
  );
  return { text, isError: rej !== null || ignored };
}

/** 이름 풀기 실패 글(서버를 부르지 않았다). commands 를 주면 명령 번호와 op 를 적는다. */
export function formatResolveErrors(errors, commands, limit = WRITE_TEXT_LIMIT) {
  const lines = errors.map((e) => {
    const where = commands && e.index >= 0 && commands[e.index] ? `명령 #${e.index + 1} ${commands[e.index].op} ${e.field}` : e.field;
    return `${where} ${JSON.stringify(e.value)}: ${e.message}${e.near?.length ? ` · 비슷한 이름: ${e.near.join(", ")}` : ""}`;
  });
  return fitBlocks(
    [
      { lines: [`이름 풀기 실패 ${errors.length}건 · 서버에 보내지 않음(저장한 것 없음)`] },
      { lines, more: (n) => `… ${n}줄 더 있습니다.` },
      { lines: ["다음: getModelText(tables=[…]) 로 물리명을 확인하고 묶음 전체를 다시 보내세요. id(t-·c-·k-·r-·d-)를 그대로 써도 됩니다."] },
    ],
    limit,
  );
}

/**
 * claimTable·releaseTable 글. rows = [{ label, result }], kind "CLAIM" | "RELEASE".
 * CLAIM 의 ok:false 는 오류가 아니다. claimedBy 가 null 이면(두 세션이 같은 때 처음 표시) 쥔 세션을 모를 뿐이다(README ErdClaimResult).
 */
export function formatClaimText(kind, rows, errors, ctx) {
  const head =
    kind === "CLAIM"
      ? `작업 중 표시 ${rows.length}개 · 세션 ${ctx.session} · 600초 뒤 저절로 풀린다(오래 걸리면 다시 부른다)`
      : `작업 중 표시 풀기 ${rows.length}개 · 세션 ${ctx.session}`;
  const lines = rows.map(({ label, result: res }) => {
    if (kind === "RELEASE") return `${label} 놓음`;
    const r = res ?? {};
    if (r.ok) return `${label} 잡음${r.expiresAt ? ` · ${clock(r.expiresAt, ctx)}까지` : ""}`;
    if (!r.claimedBy) return `${label} 못 잡음: 다른 세션이 같은 때 잡았습니다(누구인지 아직 모릅니다). 잠시 뒤 다시 부르세요.`;
    return `${label} 못 잡음: ${r.claimedBy}${r.userId ? ` (${r.userId})` : ""} 가 ${r.expiresAt ? `${clock(r.expiresAt, ctx)}까지 ` : ""}작업 중`;
  });
  const errs = errors.map((e) => `없는 표 ${JSON.stringify(e.value)}: ${e.message}${e.near?.length ? ` · 비슷한 이름: ${e.near.join(", ")}` : ""}`);
  return {
    text: fitBlocks([{ lines: [head] }, { lines: [...lines, ...errs], more: (n) => `… ${n}줄 더 있습니다.` }], ctx.limit ?? WRITE_TEXT_LIMIT),
    isError: rows.length === 0 && errors.length > 0,
  };
}

/**
 * getChangesSince 글. 반환 { text, raw }. raw 는 ctx.raw 일 때만 JSON 글(아니면 null). 둘을 합쳐 limit 를 넘지 않는다.
 * ctx: { view(지금 view, 이름 풀기), sinceRev, mySession, session(이 세션만), excludeMine, tables, raw, limit? }
 */
export function formatChangesText(cv, ctx) {
  const limit = ctx.limit ?? WRITE_TEXT_LIMIT;
  const textLimit = ctx.raw ? Math.floor(limit * 0.4) : limit;
  if (cv?.reload) {
    const text = `# reload: rev ${ctx.sinceRev} 이후 변경을 이어 줄 수 없습니다(DRAFT 를 새로 만들었거나 지웠거나, 500건을 넘었습니다). 현재 rev ${cv.rev}. getModelText 로 모델 전체를 다시 읽으세요.`;
    return { text, raw: ctx.raw ? JSON.stringify({ rev: cv.rev, reload: true, deltas: [] }) : null };
  }
  const all = cv?.deltas ?? [];
  const m = modelOf(ctx.view);
  const names = tableArgs(ctx.tables);
  const picked = names.length ? pickTableIds(ctx.view, names) : null;
  const shown = all.filter(
    (d) =>
      (!ctx.session || d.session === ctx.session) &&
      !(ctx.excludeMine && d.session === ctx.mySession) &&
      (!picked || (d.changes ?? []).some((c) => tablesOfChange(m, c).some((t) => picked.ids.has(t)))),
  );
  const filters = [
    ctx.session ? `세션 ${ctx.session} 만` : null,
    ctx.excludeMine ? `내 세션 ${ctx.mySession} 뺌` : null,
    names.length ? `표 ${names.join(",")}` : null,
  ].filter(Boolean);
  const head = [`# rev ${ctx.sinceRev} 이후 변경 ${all.length}건 (현재 rev ${cv?.rev})${filters.length ? ` · 보인 것 ${shown.length}건(${filters.join(", ")})` : ""}`];
  if (picked?.missing.length) head.push(`없는 표: ${picked.missing.join(", ")}`);
  const allChanges = shown.flatMap((d) => d.changes ?? []);
  const labels = describeTargets(ctx.view, [...new Set(allChanges.map((c) => c.id))], allChanges);
  const lines = shown.map((d) => {
    const cs = d.changes ?? [];
    const what = cs.slice(0, CHANGES_PER_DELTA).map((c) => changeText(c, labels, null, d.rev));
    const rest = cs.length > CHANGES_PER_DELTA ? ` 외 ${cs.length - CHANGES_PER_DELTA}건` : "";
    return `rev ${d.rev} ${d.userId}/${d.session} ${d.source}: ${what.join(", ") || "(변경 없음)"}${rest}`;
  });
  const full = [...head, ...lines, `다음 baseRev: ${cv?.rev}`].join("\n");
  let text = full;
  let keptDeltas = shown.length;
  if (full.length > textLimit) {
    const more = (n, k) => `… ${n}줄 더 있습니다. getChangesSince(${k ? shown[k - 1].rev : ctx.sinceRev}) 로 나눠 읽으세요.`;
    const fit = fitBlocksDetail([{ lines: head }, { lines, more }], textLimit);
    text = fit.text;
    keptDeltas = fit.kept[1];
  }
  if (!ctx.raw) return { text, raw: null };
  const room = limit - text.length - 1;
  let ds = shown.slice(0, keptDeltas);
  let raw = JSON.stringify({ rev: cv?.rev, reload: false, deltas: ds });
  while (raw.length > room && ds.length) {
    ds = ds.slice(0, Math.max(0, Math.floor(ds.length * 0.8)));
    raw = JSON.stringify({ rev: cv?.rev, reload: false, deltas: ds, truncated: shown.length - ds.length });
  }
  return { text, raw: raw.length <= room ? raw : JSON.stringify({ rev: cv?.rev, truncated: shown.length }) };
}
```

Run: `node --test scripts/erd/tests/results.test.mjs`
Expected: PASS 10건.

- [ ] **Step 12: 쓰기 흐름 시험 작성 (실패)**

`scripts/erd/tests/flows.test.mjs`. 가짜 클라이언트는 `createOasisClient` 와 같은 모양(`{ config, call }`)이고, 부른 액션·params 를 기록한다. `session`·`source` 는 진짜 클라이언트가 싣는 것이라 여기 params 에는 없다.

```js
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
    if (action === "view" && params.sinceRev != null) return { rev: 13, reload: false, deltas: deltas.filter((d) => d.rev > params.sinceRev) };
    if (action === "view") return VIEW;
    if (action === "save") return save(params);
    if (action === "restore") return restore(params);
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
  // 13 은 되돌렸고, 서버에 남은 내 세션 델타도 13 뿐이다 → 찾지 못한다.
  const again = await undoFlow(c, state, { modelId: "mcm" });
  assert.equal(again.isError, true);
  assert.match(again.text, /^되돌릴 rev 를 찾지 못했습니다/);
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
```

Run: `node --test scripts/erd/tests/flows.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`scripts/erd/lib/flows.mjs` 가 없다).

- [ ] **Step 13: 쓰기 흐름 구현**

`scripts/erd/lib/flows.mjs`:

```js
// MCP 쓰기·변경 도구와 CLI 가 함께 쓰는 흐름: view(이름 풀기) → save·restore·execute → 결과 글.
// MCP SDK·zod 를 import 하지 않는다(CLI 가 이 파일을 쓰고, CLI 는 pnpm install 없이 돈다 — S2-23).
// client 는 lib/oasis.mjs 의 createOasisClient 값이다. 요청마다 session·source 는 client 가 싣는다.
// 오류(OasisError·OasisUnreachableError·InputError)는 던진다. 받는 쪽(MCP 처리기·CLI)이 글로 바꾼다.
import { describeTargets, newId, resolveCommands, resolveTables } from "./commands.mjs";
import { tableArgs } from "./model-text.mjs";
import { formatChangesText, formatClaimText, formatResolveErrors, formatWriteResult } from "./results.mjs";

/** 서버 묶음 상한(ErdCommandService 1..200). */
export const MAX_COMMANDS = 200;
/** claimTable·releaseTable 한 번에 다루는 표 수 상한(README MCP 표). */
export const MAX_TABLES = 20;
/** rev 없는 undo 가 내 세션 변경을 찾는 범위(view sinceRev 의 재전송 상한과 같다). */
export const UNDO_SCAN = 500;

/** 입력이 틀렸다(서버를 부르지 않았다). MCP 는 isError 글, CLI 는 사용 오류(종료 코드 2)로 바꾼다. */
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * 프로세스 상태: 모델마다 이 프로세스가 반영한 rev, 되돌렸거나 되돌리기로 만든 rev(건너뛸 것), 잡은 표 id.
 * MCP 서버는 프로세스 동안 하나를 쓰고, CLI 는 명령마다 새로 만든다.
 */
export function newState() {
  return { applied: new Map(), skip: new Map(), claimed: new Map() };
}
const listIn = (map, key) => {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
};
const setIn = (map, key) => {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
};

/** commands 인자(배열 또는 JSON 배열 글) → 명령 배열. LLM 은 배열을 글로 보내기도 한다. */
export function parseCommands(commands) {
  let list = commands;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch (e) {
      throw new InputError(`commands 를 JSON 으로 읽을 수 없습니다: ${e.message}`);
    }
  }
  if (!Array.isArray(list)) throw new InputError("commands 는 명령 객체 배열(또는 그 JSON 글)이어야 합니다");
  if (list.length < 1 || list.length > MAX_COMMANDS) throw new InputError(`명령은 1~${MAX_COMMANDS}개입니다(${list.length}개)`);
  list.forEach((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.op !== "string" || !c.op) {
      throw new InputError(`명령 #${i + 1} 에 op 가 없습니다(예: {"op":"updateColumn","id":"TB_X.COL","set":{"logical":"…"}})`);
    }
  });
  return list;
}

/** baseRev 뒤 다른 세션 변경(반영이면 내 rev 앞까지, 시험 실행이면 지금 rev 까지). 거절이면 읽지 않는다. */
async function othersSince(client, { modelId, baseRev, result }) {
  if (!result || result.rejection) return null;
  const upto = result.applied ? result.rev - 1 : result.rev;
  if (!(upto > baseRev)) return null;
  const cv = await client.call("view", { modelId, sinceRev: baseRev });
  if (cv.reload) return { reload: true, deltas: [] };
  return { reload: false, deltas: (cv.deltas ?? []).filter((d) => d.rev <= upto && d.session !== client.config.session) };
}

/**
 * apply(MCP apply·confirmRelation·rejectRelation, CLI apply·confirm·reject).
 * baseRev 는 호출자가 준 값을 그대로 보낸다. 이름을 풀려고 읽은 view 의 rev 를 쓰지 않는다(S2-22).
 * dryRun 은 true 일 때만 싣는다(빼면 서버는 false 로 본다).
 * @returns {Promise<{ text: string, isError: boolean, result: object|null }>}
 */
export async function applyFlow(client, state, { modelId, baseRev, commands, dryRun = false }) {
  const list = parseCommands(commands);
  const view = await client.call("view", { modelId });
  const { commands: resolved, errors } = resolveCommands(view, list, { newId });
  if (errors.length) return { text: formatResolveErrors(errors, list), isError: true, result: null };
  const result = await client.call("save", { modelId, baseRev, commandsJson: JSON.stringify(resolved), dryRun: dryRun ? true : undefined });
  if (result.applied) listIn(state.applied, modelId).push(result.rev); // 서버가 dryRun 을 몰라 저장한 경우도 반영으로 센다
  const others = await othersSince(client, { modelId, baseRev, result });
  const { config } = client;
  const out = formatWriteResult(result, { op: "apply", commands: resolved, view, baseRev, dryRun, session: config.session, user: config.user, others });
  return { ...out, result };
}

/** rev 하나의 델타(누가 했는가). 500건을 넘게 지났거나 없으면 null. */
async function deltaAt(client, modelId, rev) {
  if (!(rev >= 1)) return null;
  const cv = await client.call("view", { modelId, sinceRev: rev - 1 });
  if (cv.reload) return null;
  return (cv.deltas ?? []).find((d) => d.rev === rev) ?? null;
}

/** rev 없는 undo 의 대상: 이 프로세스가 반영한 마지막 rev, 없으면(재시작) 최근 500 rev 에서 내 세션의 마지막 델타. 건너뛸 rev 는 뺀다. */
async function lastOwnRev(client, state, modelId, view) {
  const skip = setIn(state.skip, modelId);
  const mine = state.applied.get(modelId) ?? [];
  for (let i = mine.length - 1; i >= 0; i--) if (!skip.has(mine[i])) return mine[i];
  const cv = await client.call("view", { modelId, sinceRev: Math.max(0, (view.rev ?? 0) - UNDO_SCAN) });
  if (cv.reload) return null;
  const ds = cv.deltas ?? [];
  for (let i = ds.length - 1; i >= 0; i--) {
    if (ds[i].session === client.config.session && !skip.has(ds[i].rev)) return ds[i].rev;
  }
  return null;
}

/**
 * undo(MCP undo, CLI undo). rev 를 빼면 lastOwnRev. 무엇을 되돌렸는지(누구의 몇 rev) 글에 적는다.
 * 되돌린 rev 와 되돌리기로 생긴 rev 는 이 프로세스에서 다시 고르지 않는다(되돌리기의 되돌리기 = 다시 하기를 막는다).
 */
export async function undoFlow(client, state, { modelId, rev, dryRun = false }) {
  const view = await client.call("view", { modelId });
  const target = rev ?? (await lastOwnRev(client, state, modelId, view));
  const { config } = client;
  if (target === null || target === undefined) {
    return {
      text: `되돌릴 rev 를 찾지 못했습니다. 이 세션(${config.session})이 최근 ${UNDO_SCAN} rev 안에 반영한 변경이 없거나 모두 되돌렸습니다.\n다음: getChangesSince 로 되돌릴 rev 를 찾아 rev 를 주세요.`,
      isError: true,
      result: null,
    };
  }
  const undone = await deltaAt(client, modelId, target);
  const result = await client.call("restore", { modelId, rev: target, dryRun: dryRun ? true : undefined });
  if (result.applied) {
    const skip = setIn(state.skip, modelId);
    skip.add(target);
    skip.add(result.rev);
  }
  const out = formatWriteResult(result, { op: "undo", undoRev: target, undone, view, baseRev: null, dryRun, session: config.session, user: config.user, others: null });
  return { ...out, result };
}

function tableList(tables) {
  const names = tableArgs(tables);
  if (names.length > MAX_TABLES) throw new InputError(`표는 한 번에 ${MAX_TABLES}개까지입니다(${names.length}개)`);
  return names;
}

/** claimTable(MCP)·claim(CLI): 표마다 execute kind=CLAIM. 잡은 표는 state 에 둔다(종료 때 놓는다). */
export async function claimFlow(client, state, { modelId, tables }) {
  const names = tableList(tables);
  if (!names.length) throw new InputError("잡을 표를 tables 로 주세요(물리명 또는 t- id)");
  const view = await client.call("view", { modelId });
  const { resolved, errors } = resolveTables(view, names);
  const labels = describeTargets(view, resolved.map((x) => x.id));
  const held = setIn(state.claimed, modelId);
  const rows = [];
  const results = [];
  for (const { id } of resolved) {
    const r = await client.call("execute", { modelId, kind: "CLAIM", tableId: id });
    if (r?.ok) held.add(id);
    rows.push({ label: labels.get(id), result: r });
    results.push({ tableId: id, ...r });
  }
  return { ...formatClaimText("CLAIM", rows, errors, { session: client.config.session }), result: results };
}

/** releaseTable(MCP)·release(CLI): tables 를 빼면 이 프로세스가 잡은 표 전부. */
export async function releaseFlow(client, state, { modelId, tables }) {
  const names = tableList(tables);
  const held = setIn(state.claimed, modelId);
  const view = await client.call("view", { modelId });
  let resolved;
  let errors = [];
  if (names.length) ({ resolved, errors } = resolveTables(view, names));
  else resolved = [...held].map((id) => ({ ref: id, id }));
  if (!resolved.length && !errors.length) {
    return { text: `이 프로세스(세션 ${client.config.session})가 잡은 표가 없습니다. 놓을 표를 tables 로 주세요.`, isError: false, result: [] };
  }
  const labels = describeTargets(view, resolved.map((x) => x.id));
  const rows = [];
  const results = [];
  for (const { id } of resolved) {
    const r = await client.call("execute", { modelId, kind: "RELEASE", tableId: id });
    held.delete(id);
    rows.push({ label: labels.get(id), result: r });
    results.push({ tableId: id, ...r });
  }
  return { ...formatClaimText("RELEASE", rows, errors, { session: client.config.session }), result: results };
}

/** 종료 때 잡은 표를 모두 놓아 본다. 실패는 버린다(600초 뒤 만료된다). 놓아 본 수를 돌려준다. */
export async function releaseAll(client, state) {
  const jobs = [];
  for (const [modelId, ids] of state.claimed) {
    for (const id of ids) jobs.push(client.call("execute", { modelId, kind: "RELEASE", tableId: id }));
    ids.clear();
  }
  await Promise.allSettled(jobs);
  return jobs.length;
}

/** getChangesSince(MCP)·changes(CLI): view sinceRev + 이름 풀기용 view. */
export async function changesFlow(client, { modelId, rev, session, excludeMine, tables, raw }) {
  const cv = await client.call("view", { modelId, sinceRev: rev });
  const view = cv.reload ? null : await client.call("view", { modelId });
  const out = formatChangesText(cv, { view, sinceRev: rev, mySession: client.config.session, session, excludeMine, tables, raw });
  return { text: out.text, raw: out.raw, isError: false, result: cv };
}
```

- [ ] **Step 14: 통과 확인과 node 18 API 확인**

```bash
node --test scripts/erd/tests/ 2>&1 | grep -E "^ℹ (tests|pass|fail)"
grep -nE "import\.meta\.dirname|\.(toSorted|toReversed|toSpliced)\(|(Object|Map)\.groupBy|\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(|parseArgs|globalThis\.crypto|[^.]crypto\.randomUUID|recursive: *true|@modelcontextprotocol|from \"zod\"" scripts/erd/lib/oasis.mjs scripts/erd/lib/commands.mjs scripts/erd/lib/results.mjs scripts/erd/lib/flows.mjs; echo grep=$?
```
Expected: `tests 62`·`pass 62`·`fail 0`(Step 0 의 38 + oasis 3 + commands 5 + results 10 + flows 6). `grep=1`(찾은 줄 없음). 줄이 나오면 그 API 를 node 18 에 있는 것으로 바꾼다.

- [ ] **Step 15: 커밋**

```bash
/usr/bin/git add scripts/erd/lib/oasis.mjs scripts/erd/lib/commands.mjs scripts/erd/lib/results.mjs scripts/erd/lib/flows.mjs \
  scripts/erd/tests/oasis.test.mjs scripts/erd/tests/commands.test.mjs scripts/erd/tests/results.test.mjs scripts/erd/tests/flows.test.mjs \
  scripts/erd/tests/erd-mcp.test.mjs scripts/erd/tests/fixtures/fake-oasis.mjs scripts/erd/tests/fixtures/erd-view.mjs
/usr/bin/git status --short
/usr/bin/git commit -F - <<'EOF'
feat(erd): 스크립트 공용 lib — 세션 이름·이름 → id·결과 글·쓰기 흐름

MCP·CLI 세션 이름을 CLAUDE_CODE_SESSION_ID 로 만들고(S2-7) 모든 요청에 session·source 를 싣는다.
물리명으로 쓴 명령을 요소 id 로 풀고(S2-22), 반영·거절·변경 글을 25,000자 안에서 만든다(S2-21·S2-28).
쓰기 흐름은 MCP SDK 없이 돌아 CLI 도 쓴다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```
Expected: `git status --short` 에 `node_modules/` 가 없다. 커밋 1개.

---

### Task 7: MCP 쓰기 도구 6개, `getChangesSince` 상한·이름, 도구 설명, `.mcp.json` `auto`

`erd-mcp.mjs` 에 쓰기 도구 6개(`apply`·`confirmRelation`·`rejectRelation`·`undo`·`claimTable`·`releaseTable`)를 더한다. 도구 처리는 Task 6 의 `lib/flows.mjs` 를 부르기만 한다. `getChangesSince` 는 이름으로 쓴 요약을 주고, 원래 JSON 은 `raw:true` 일 때만 붙인다(S2-21). 도구 설명(instructions)의 "(단계 2 에서 추가)" 를 지우고 세션 이름과 baseRev 규칙을 적는다. `.mcp.json` 의 `ERD_SESSION` 기본값을 `auto` 로 바꾼다(S2-7). 종료 때 잡은 표를 놓는다.

마감(07-close.md)이 이 Task 에 기대는 것:
- 서버 키 `erd`, 도구 12개(`ERD_TOOLS`): `getModelText,getCurrentView,getChangesSince,listViolations,listInferredRelations,getDbDiff,apply,confirmRelation,rejectRelation,undo,claimTable,releaseTable`. 이름을 바꾸면 07 Step 0-2 도 함께 고친다.
- 키 변수 이름은 `BACKEND_CLIENT_KEY` 다(`ERD_KEY` 가 아니다). `.mcp.json` 은 `"ERD_SESSION": "${ERD_SESSION:-auto}"` 다.
- `apply.commands` 는 배열과 JSON 배열 글을 모두 받는다(07 Step 9-1 은 글로 보낸다). 이름(`"표.컬럼"`)과 id(`c-…`)를 모두 받는다(07 Step 6-1·9-1).
- 결과 글은 Task 6 의 모양이다. CONFLICT 글에 `CONFLICT`·byUserId·세션·`rev N` 이 있고(07 6-1), 다른 세션 변경 줄이 있고(6-2), CLAIMED 줄에 `세션 (사용자)` 와 만료 시각이 있다(6-3).

**Files:**
- Modify: `scripts/erd/erd-mcp.mjs` (전체 교체)
- Modify: `scripts/erd/lib/model-text.mjs` (`formatDbDiff` 머리줄의 "반영은 단계 2 에서 합니다." 한 곳)
- Modify: `.mcp.json` (`ERD_SESSION` 기본값)
- Modify: `scripts/erd/tests/erd-mcp.test.mjs` (전체 교체), `scripts/erd/tests/mcp-config.test.mjs` (전체 교체), `scripts/erd/tests/model-text.test.mjs` (`formatDbDiff` 기대 글 한 줄)

**Interfaces:**
- Consumes: Task 6 `lib/flows.mjs`(`applyFlow`·`undoFlow`·`claimFlow`·`releaseFlow`·`releaseAll`·`changesFlow`·`newState`·`InputError`·`MAX_COMMANDS`·`MAX_TABLES`), `lib/results.mjs`(`WRITE_TEXT_LIMIT`), `lib/oasis.mjs`(`configFromEnv(env, { kind: "mcp" })`). `@modelcontextprotocol/sdk` 1.30.1(`McpServer.registerTool`, `StdioServerTransport`), `zod` 4.6.5(`z.looseObject`).
- Produces:
  - 도구 12개(README "MCP·CLI" 표). 새 입력: `apply{modelId, baseRev, commands: array(1..200) of looseObject({op}) | string, dryRun?}`, `confirmRelation·rejectRelation{modelId, baseRev, relation}`, `undo{modelId, rev?, dryRun?}`, `claimTable{modelId, tables: string[](1..20) | string}`, `releaseTable{modelId, tables?}`, `getChangesSince{modelId, rev, session?, excludeMine?, tables?, raw?}`.
  - `instructions(session)`(내보냄), `handlers(client, state?)`, `createErdServer(client, state?)`, `TOOLS`, `UnsupportedResponseError`.
  - 거절·이름 풀기 실패·입력 오류는 `isError:true` 결과다. 던지지 않는다.
  - 종료(표준 입력 닫힘·SIGTERM·SIGINT) 때 잡은 표를 3초 상한으로 놓아 본다. 한 번만 돈다. stdout 에 쓰지 않는다.

- [ ] **Step 1: MCP 시험 작성 (실패)**

`scripts/erd/tests/erd-mcp.test.mjs` 를 아래로 바꾼다. stdio 시험 넷(도구·읽기, 쓰기, 종료 때 놓기, 자동 세션 이름)과 단계 1 의 처리기 시험 둘이다. 가짜 OASIS 는 `VIEW`(rev 12)를 주고, `save` 는 baseRev 5 면 CONFLICT, `dryRun` 이면 통과(저장 안 함), 아니면 rev 13 반영을 준다.

```js
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { handlers } from "../erd-mcp.mjs";
import { APPLIED_13, CONFLICT_REJECTION, DELTA_ME_13, DELTA_UI_11, GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-mcp.mjs");
const TOOL_NAMES = [
  "apply", "claimTable", "confirmRelation", "getChangesSince", "getCurrentView", "getDbDiff",
  "getModelText", "listInferredRelations", "listViolations", "rejectRelation", "releaseTable", "undo",
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

test("stdio MCP 서버: 도구 12개, 읽기 도구 그대로, 모든 요청에 session·source", async () => {
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
    assert.deepEqual(mcp.protocolErrors, []);
  } finally {
    await mcp.client.close();
    await fake.close();
  }
});

test("종료하면 이 프로세스가 잡은 표를 놓는다", async () => {
  const fake = await startFakeOasis(route);
  const mcp = await startMcp(fake, { ERD_SESSION: "claude-exit" });
  await mcp.client.callTool({ name: "claimTable", arguments: { modelId: "mcm", tables: "TB_MCM_SEC_MENU,TB_MCM_SEC_OBJ" } });
  await mcp.client.close(); // 표준 입력을 닫는다(2초 안에 안 끝나면 SDK 가 SIGTERM)
  try {
    const released = () => fake.requests.filter((r) => r.action === "execute" && r.params.kind === "RELEASE").map((r) => r.params.tableId).sort();
    for (let i = 0; i < 50 && released().length < 2; i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(released(), ["t-menu", "t-obj"]);
    assert.ok(fake.requests.filter((r) => r.params.kind === "RELEASE").every((r) => r.params.session === "claude-exit"));
    assert.match(mcp.log, /erd-mcp 종료\(.+\): 잡은 표 2개를 놓았다/);
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
```

`scripts/erd/tests/mcp-config.test.mjs` 를 아래로 바꾼다.

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test(".mcp.json: erd 서버가 저장소의 erd-mcp.mjs 를 띄우고, 환경변수마다 기본값이 있다", () => {
  const raw = readFileSync(join(ROOT, ".mcp.json"), "utf8");
  const erd = JSON.parse(raw).mcpServers.erd;
  assert.equal(erd.command, "node");
  assert.deepEqual(erd.args, ["scripts/erd/erd-mcp.mjs"]);
  assert.ok(existsSync(join(ROOT, erd.args[0])));
  assert.deepEqual(Object.keys(erd.env).sort(), ["BACKEND_CLIENT_KEY", "ERD_BASE", "ERD_ROLE", "ERD_SESSION", "ERD_USER"]);
  for (const [k, v] of Object.entries(erd.env)) assert.match(v, new RegExp(`^\\$\\{${k}:-[^}]+\\}$`), `${k} 에 기본값이 없다`);
  // 세션 이름은 코드가 프로세스 자기 CLAUDE_CODE_SESSION_ID 로 만든다(S2-7). 설정 확장은 바깥 셸 값(중첩이면 부모 id)이라 넣지 않는다.
  assert.equal(erd.env.ERD_SESSION, "${ERD_SESSION:-auto}");
  assert.doesNotMatch(raw, /CLAUDE_CODE_SESSION_ID/);
});
```

`scripts/erd/tests/model-text.test.mjs` 의 `formatDbDiff` 기대 글 한 줄을 고친다(MCP 반영 도구는 단계 2 에도 없다. README "뒤 단계 개요" 의 `applyDbDiff` deferred 행).

```js
// 전
    "# DB 차이 2건 (스키마 MCMAPUSER, 모델 rev 12). 반영은 단계 2 에서 합니다.\n" +
// 후
    "# DB 차이 2건 (스키마 MCMAPUSER, 모델 rev 12). 반영은 m-mdm ERD 화면의 DB 차이 탭에서 합니다.\n" +
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/erd/tests/erd-mcp.test.mjs scripts/erd/tests/mcp-config.test.mjs scripts/erd/tests/model-text.test.mjs`
Expected: FAIL 6건 — stdio 시험 넷(도구가 6개다, 세션 이름 줄이 없다, 쓰기 도구가 없다), `.mcp.json` 시험(`${ERD_SESSION:-claude-erd}`), `getDbDiff` 글 시험. 처리기 시험 둘과 나머지 model-text 시험은 통과한다. "종료하면" 시험은 RELEASE 를 5초 기다린 뒤 실패한다.

- [ ] **Step 3: MCP 서버 구현**

`scripts/erd/erd-mcp.mjs` 를 아래로 바꾼다. 읽기 도구 5개(`getModelText`·`getCurrentView`·`listViolations`·`listInferredRelations`·`getDbDiff`)의 처리는 단계 1 그대로다(설명만 다듬었다). `getChangesSince` 는 `changesFlow` 를 부른다.

```js
#!/usr/bin/env node
// ERD 모델 stdio MCP 서버(단계 1 읽기 6개 + 단계 2 쓰기 6개). MDM 서버 OASIS erdEdit 를 감싸기만 한다(스펙 2.3).
// stdout 은 MCP 프로토콜 전용이다. 로그는 stderr(console.error)로만 쓴다.
// 환경변수: ERD_BASE(기본 http://localhost:8096) · ERD_USER(erd-mcp) · ERD_ROLE(MDM_STEWARD)
//           · BACKEND_CLIENT_KEY(dmes-bff-local-client-key-2026)
//           · ERD_SESSION(비었거나 auto 면 claude-<CLAUDE_CODE_SESSION_ID 앞 8글자>, 그것도 없으면 mcp-<임의 8글자>, README S2-7)
// 의존성: @modelcontextprotocol/sdk·zod(루트 package.json). 처음 한 번 저장소 루트에서 pnpm install 을 돌린다.
// 쓰기 흐름(이름 풀기·결과 글)은 lib/flows.mjs 에 있다. CLI(erd-cli.mjs)가 같은 흐름을 SDK 없이 쓴다.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { applyFlow, changesFlow, claimFlow, InputError, MAX_COMMANDS, MAX_TABLES, newState, releaseAll, releaseFlow, undoFlow } from "./lib/flows.mjs";
import { formatCurrentView, formatDbDiff, formatInferred, formatViolations, getModelText, TEXT_LIMIT } from "./lib/model-text.mjs";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";
import { WRITE_TEXT_LIMIT } from "./lib/results.mjs";

/** 종료 때 잡은 표를 놓는 요청의 시간 상한. 기본 30초를 기다리면 Claude Code 가 프로세스를 먼저 죽인다. */
const RELEASE_TIMEOUT_MS = 3000;

/** 스펙 4.6 "LLM 이 쓰는 순서". 세션 이름과 baseRev 규칙을 적는다(README MCP 표 아래). */
export function instructions(session) {
  return [
    "ERD 모델(모듈 하나 = 모델 하나, 예: mcm·mdm)을 읽고 고치는 서버다.",
    `내 세션 이름: ${session}. 다른 세션이 내 baseRev 뒤에 같은 속성을 바꿨으면 CONFLICT 다. 권한은 ERD_USER(사용자)로, 충돌은 세션 이름으로 가린다.`,
    "쓰는 순서:",
    "1. getCurrentView 로 사용자가 화면에서 보는 다이어그램과 선택한 표를 확인하거나, getModelText 로 모델을 읽는다.",
    "   getModelText 는 큰 모델이면 개요(표 목록·컬럼 수·PK)만 준다. 질문에 표 이름이 있으면 처음부터 tables 에 그 표를 넣어 부른다.",
    "2. claimTable 로 작업할 표를 선언한다. 다른 세션이 그 표를 고치면 그쪽 결과에 CLAIMED 경고가 붙는다.",
    "3. apply 로 명령을 묶어 보낸다. 묶음은 모두 반영되거나 모두 거절된다. 요소는 물리명(표, 표.컬럼, 자식표.컬럼 > 부모표.컬럼, 표:PK)이나 id 로 가리킨다.",
    "   baseRev 는 마지막으로 읽은 rev(getModelText 머리줄, getChangesSince 결과, 마지막 apply 결과)다. 더 큰 rev 를 짐작하지 마세요.",
    "   저장 전에 확인하려면 dryRun=true 로 보낸다(서버가 모든 검사를 하고 저장하지 않는다). 추정 관계는 confirmRelation·rejectRelation, 되돌리기는 undo 다.",
    "4. CONFLICT 를 받으면 getChangesSince(rev) 로 최신 상태를 확인하고 다시 보낸다.",
    "5. 끝나면 releaseTable 로 선언을 푼다. 선언은 600초가 지나면 저절로 풀린다.",
    "표준 위반은 listViolations, 사람이 확인할 추정 관계는 listInferredRelations, DB 와 모델의 차이는 getDbDiff 로 본다.",
    "쓰기가 NOT_EDITOR 로 거절되면 DRAFT 소유자에게 ERD_USER 를 공동 편집자로 등록해 달라고 한다(execute kind=ADD_EDITOR).",
  ].join("\n");
}

const modelId = z.string().min(1).max(50).describe("ERD 모델 ID. 모듈 이름과 같다(예: mcm, mdm)");
const baseRev = z
  .number()
  .int()
  .min(0)
  .describe("마지막으로 읽은 rev(getModelText 머리줄·getChangesSince 결과·마지막 apply 결과). 더 큰 rev 를 짐작하지 않는다");
const tableNames = z
  .union([z.array(z.string().min(1)).min(1).max(MAX_TABLES), z.string().min(1)])
  .describe(`표 물리명이나 t- id 목록(${MAX_TABLES}개까지). 쉼표로 이은 글도 받는다`);
const relation = z.string().min(1).describe("r- id(listInferredRelations 앞의 id) 또는 '자식표.컬럼 > 부모표.컬럼'(복합은 '자식표.(A, B) > 부모표.(A, B)')");

export const TOOLS = {
  getModelText: {
    description:
      "모델을 DBML 비슷한 텍스트로 읽는다. 컬럼 줄: 물리명 논리명 타입 [PK] [NN] [FK>부모표.부모컬럼(?=추정)] [도메인] [!표준상태]. " +
      "끝에 Ref 줄(관계 상태와 근거)이 붙는다. 순서 1단계: 화면 상태가 없으면 이 도구로 시작한다. 머리줄의 rev 가 apply 의 baseRev 다. " +
      `결과는 ${TEXT_LIMIT}자를 넘지 않는다. 모델 전체가 그보다 크면 tables 없이 부를 때 개요만 온다` +
      "(표 수, PK 없는 표, 표마다 논리명·컬럼 수·PK 컬럼·관계 수·표준 위반 수). 개요에는 컬럼 줄과 Ref 줄이 없다. " +
      "질문에 표 이름이 나오면 처음부터 tables 에 그 물리명을 넣어 부른다(예: tables=[\"TB_MCM_SEC_MENU\"]). " +
      "tables 는 정확한 물리명(대소문자 무관)이고, 끝에 * 를 붙이면 접두사다(예: TB_MCM_SEC_*). " +
      "tables 를 주면 Ref 줄은 고른 표가 자식이든 부모든 나온다. diagram 을 주면 그 다이어그램의 표만 쓴다.",
    inputSchema: {
      modelId,
      tables: z
        .union([z.array(z.string().min(1)).min(1), z.string().min(1)])
        .optional()
        .describe("읽을 표의 물리명 목록. 끝이 * 면 접두사. 쉼표로 이은 글도 받는다"),
      diagram: z.string().min(1).optional().describe("다이어그램 id, 이름, 또는 '업무영역/이름'"),
    },
    // Claude Code 가 큰 결과를 파일로 빼는 기준을 올리는 힌트. 결과는 TEXT_LIMIT 안이라 이 값에 기대지 않는다.
    _meta: { "anthropic/maxResultSizeChars": 100000 },
  },
  getCurrentView: {
    description:
      "사용자가 m-mdm ERD 화면에서 보고 있는 다이어그램과 선택한 표(물리명·논리명)를 세션마다 돌려준다. 순서 1단계: 사용자가 '이 표', '선택한 표' 라고 하면 먼저 부른다.",
    inputSchema: { modelId, session: z.string().min(1).optional().describe("화면 세션 이름. 주지 않으면 화면 세션 전부") },
  },
  getChangesSince: {
    description:
      "rev 이후의 변경을 이름(표·표.컬럼·관계 글)과 바뀐 속성으로 요약한다. 순서 4단계: CONFLICT 를 받았거나 오래 쉬었으면 부른다. " +
      `결과는 ${WRITE_TEXT_LIMIT}자를 넘지 않는다. 넘치면 끝에 이어 읽을 rev 를 적는다. 마지막 줄의 rev 가 다음 baseRev 다. ` +
      "reload 가 오면 getModelText 로 다시 읽는다. 원래 JSON 은 raw=true 일 때만 붙는다.",
    inputSchema: {
      modelId,
      rev: z.number().int().min(0).describe("마지막으로 본 rev"),
      session: z.string().min(1).optional().describe("이 세션의 변경만 본다"),
      excludeMine: z.boolean().optional().describe("내 세션(이 MCP 서버)의 변경을 뺀다"),
      tables: z
        .union([z.array(z.string().min(1)).min(1), z.string().min(1)])
        .optional()
        .describe("이 표를 건드린 변경만 본다. 끝이 * 면 접두사"),
      raw: z.boolean().optional().describe("요약 뒤에 변경 JSON 을 붙인다(상한 안에서)"),
    },
  },
  listViolations: {
    description:
      "표준 상태가 OK·ALIAS 가 아닌 컬럼(NEW 사전에 없는 새 이름, TYPE 같은 이름 다른 타입, DOMAIN 도메인과 다른 타입, MISS 사전에 없는 토막)을 돌려준다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, status: z.enum(["NEW", "TYPE", "DOMAIN", "MISS"]).optional().describe("이 상태만 본다") },
  },
  listInferredRelations: {
    description:
      "사람이 확정·기각할 추정(INFERRED) 관계를 관계 id·근거·후보 순위와 함께 돌려준다. 허브 컬럼의 2순위 이하 후보는 includeFolded=true 일 때만 나온다. 확정·기각은 confirmRelation·rejectRelation 이다.",
    inputSchema: { modelId, includeFolded: z.boolean().optional().describe("접힌 후보(candidateRank 2 이상)도 볼지") },
  },
  getDbDiff: {
    description:
      "DB 딕셔너리와 모델의 차이(표·컬럼 추가·사라짐·타입 변경, FK 추가·사라짐)를 돌려준다. 읽기만 한다. 반영은 사람이 m-mdm ERD 화면의 DB 차이 탭에서 골라 한다.",
    inputSchema: { modelId },
  },
  apply: {
    description:
      "모델·다이어그램 명령 묶음을 한 번에 반영한다(모두 반영 또는 모두 거절). 순서 3단계. " +
      "명령 예: {\"op\":\"updateColumn\",\"id\":\"TB_X.COL\",\"set\":{\"logical\":\"…\"}}, {\"op\":\"addColumn\",\"table\":\"TB_X\",\"logical\":\"사용여부\"}, " +
      "{\"op\":\"addRelation\",\"child\":\"TB_C\",\"parent\":\"TB_P\",\"pairs\":[[\"TB_C.P_ID\",\"TB_P.P_ID\"]],\"identifying\":false}, {\"op\":\"moveNodes\",\"diagram\":\"업무영역/이름\",\"nodes\":[{\"table\":\"TB_X\",\"x\":0,\"y\":0}]}. " +
      "요소는 id 대신 이름으로 써도 된다: 표 = 물리명, 컬럼 = '표.컬럼', 관계 = '자식표.컬럼 > 부모표.컬럼', 키 = 키 이름 또는 '표:PK', 다이어그램 = '업무영역/이름'. " +
      "같은 묶음에서 앞에서 만든 표·컬럼은 뒤 명령이 물리명으로 가리킬 수 있다. 결과 끝의 '다음 baseRev' 를 다음 apply 에 쓴다. " +
      "거절(CONFLICT·NOT_FOUND·INVALID·NEEDS_CHOICE·NOT_EDITOR)은 오류 결과이고 '다음:' 줄에 할 일이 있다. dryRun=true 면 저장하지 않고 판정만 본다.",
    inputSchema: {
      modelId,
      baseRev,
      commands: z
        .union([z.array(z.looseObject({ op: z.string().min(1) })).min(1).max(MAX_COMMANDS), z.string().min(2)])
        .describe(`명령 객체 배열(1~${MAX_COMMANDS}개). JSON 배열 글도 받는다`),
      dryRun: z.boolean().optional().describe("true 면 서버가 판정만 하고 저장하지 않는다(rev 그대로)"),
    },
  },
  confirmRelation: {
    description: "추정·기각 관계를 확정한다(apply 의 confirmRelation 명령 하나). 결과는 apply 와 같다.",
    inputSchema: { modelId, baseRev, relation },
  },
  rejectRelation: {
    description: "추정 관계를 기각한다(apply 의 rejectRelation 명령 하나). 결과는 apply 와 같다.",
    inputSchema: { modelId, baseRev, relation },
  },
  undo: {
    description:
      "rev 하나의 변경을 되돌린다. rev 를 빼면 이 세션이 마지막으로 반영한 rev 다. 결과에 누구의 몇 rev 를 되돌렸는지 적는다. " +
      "그 뒤 같은 속성을 다른 변경이 바꿨으면 CONFLICT, 이미 되돌렸으면 INVALID 다.",
    inputSchema: {
      modelId,
      rev: z.number().int().min(1).optional().describe("되돌릴 rev. 빼면 이 세션의 마지막 반영"),
      dryRun: z.boolean().optional().describe("true 면 판정만 하고 되돌리지 않는다"),
    },
  },
  claimTable: {
    description:
      "작업할 표에 작업 중 표시를 한다(순서 2단계). 표마다 잡음 또는 쥔 세션(사용자)·만료 시각을 돌려준다. 못 잡아도 오류가 아니다. 표시는 600초 뒤 저절로 풀린다.",
    inputSchema: { modelId, tables: tableNames },
  },
  releaseTable: {
    description: "작업 중 표시를 푼다(순서 5단계). tables 를 빼면 이 세션이 잡은 표 전부를 푼다.",
    inputSchema: { modelId, tables: tableNames.optional() },
  },
};

const ok = (...texts) => ({ content: texts.map((text) => ({ type: "text", text })) });
const fromFlow = (r) => ({ ...(r.isError ? { isError: true } : {}), content: [{ type: "text", text: r.text }] });

/** 서버가 kind 를 모르는 옛 응답을 돌려줬다. 빈 결과로 오해하지 않게 오류로 올린다. */
export class UnsupportedResponseError extends Error {
  constructor(what) {
    super(`${what} 응답 모양이 다릅니다. MDM 서버가 이 kind 를 아직 지원하지 않을 수 있습니다.\n다음: 서버가 단계 1 백엔드(Task 5)를 포함해 떠 있는지 확인한 뒤 다시 부르세요.`);
    this.name = "UnsupportedResponseError";
  }
}

const needStatus = (st) => {
  if (!st || typeof st.statuses !== "object" || st.statuses === null) throw new UnsupportedResponseError("view kind=STATUS");
  return st;
};
const needDiff = (diff) => {
  if (!diff || !Array.isArray(diff.items)) throw new UnsupportedResponseError("compare kind=DB_DIFF");
  return diff;
};

/** 도구 처리기. OASIS 오류는 던지고 createErdServer 가 isError 결과로 바꾼다. state 는 프로세스 동안 하나다. */
export function handlers(client, state = newState()) {
  return {
    async getModelText({ modelId, diagram, tables }) {
      const view = await client.call("view", { modelId });
      const status = needStatus(await client.call("view", { modelId, kind: "STATUS", ver: view.ver }));
      return ok(getModelText(view, status, { diagram, tables }));
    },
    async getCurrentView({ modelId, session }) {
      return ok(formatCurrentView(await client.call("view", { modelId }), { session }));
    },
    async getChangesSince({ modelId, rev, session, excludeMine, tables, raw }) {
      const r = await changesFlow(client, { modelId, rev, session, excludeMine, tables, raw });
      return r.raw ? ok(r.text, r.raw) : ok(r.text);
    },
    async listViolations({ modelId, status }) {
      const view = await client.call("view", { modelId });
      const st = needStatus(await client.call("view", { modelId, kind: "STATUS", ver: view.ver }));
      return ok(formatViolations(view, st, { only: status }));
    },
    async listInferredRelations({ modelId, includeFolded }) {
      return ok(formatInferred(await client.call("view", { modelId }), { includeFolded }));
    },
    async getDbDiff({ modelId }) {
      return ok(formatDbDiff(needDiff(await client.call("compare", { modelId, kind: "DB_DIFF" }))));
    },
    async apply({ modelId, baseRev, commands, dryRun }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands, dryRun: dryRun === true }));
    },
    async confirmRelation({ modelId, baseRev, relation }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands: [{ op: "confirmRelation", id: relation }] }));
    },
    async rejectRelation({ modelId, baseRev, relation }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands: [{ op: "rejectRelation", id: relation }] }));
    },
    async undo({ modelId, rev, dryRun }) {
      return fromFlow(await undoFlow(client, state, { modelId, rev, dryRun: dryRun === true }));
    },
    async claimTable({ modelId, tables }) {
      return fromFlow(await claimFlow(client, state, { modelId, tables }));
    },
    async releaseTable({ modelId, tables }) {
      return fromFlow(await releaseFlow(client, state, { modelId, tables }));
    },
  };
}

export function createErdServer(client, state = newState()) {
  const server = new McpServer({ name: "erd", version: "0.2.0" }, { instructions: instructions(client.config.session) });
  const h = handlers(client, state);
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, def, async (args) => {
      try {
        return await h[name](args);
      } catch (e) {
        const text =
          e instanceof UnsupportedResponseError
            ? e.message
            : e instanceof InputError
              ? `${e.message}\n다음: 입력을 고쳐 다시 부르세요.`
              : describeError(e, client.config);
        return { isError: true, content: [{ type: "text", text }] };
      }
    });
  }
  return server;
}

async function main() {
  const config = configFromEnv(process.env, { kind: "mcp" });
  const state = newState();
  const server = createErdServer(createOasisClient(config), state);
  await server.connect(new StdioServerTransport());
  console.error(`erd-mcp 시작: ${config.base} · 사용자 ${config.user} · 역할 ${config.role} · 세션 ${config.session}`);
  // 종료(표준 입력 닫힘·SIGTERM·SIGINT) 때 이 프로세스가 잡은 표를 놓아 본다. 실패해도 600초 뒤 만료된다. 한 번만 돈다.
  let stopping = false;
  const stop = async (why) => {
    if (stopping) return;
    stopping = true;
    const n = await releaseAll(createOasisClient({ ...config, timeoutMs: RELEASE_TIMEOUT_MS }), state).catch(() => 0);
    if (n) console.error(`erd-mcp 종료(${why}): 잡은 표 ${n}개를 놓았다`);
    process.exit(0);
  };
  process.stdin.on("end", () => void stop("stdin 닫힘"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => {
    console.error(`erd-mcp 시작 실패: ${e?.stack ?? e}`);
    process.exitCode = 1;
  });
}
```

`scripts/erd/lib/model-text.mjs` 의 `formatDbDiff` 머리줄을 고친다.

```js
// 전
  const lines = [`# DB 차이 ${items.length}건 (스키마 ${diff.schema}, 모델 rev ${diff.rev}). 반영은 단계 2 에서 합니다.`];
// 후
  const lines = [`# DB 차이 ${items.length}건 (스키마 ${diff.schema}, 모델 rev ${diff.rev}). 반영은 m-mdm ERD 화면의 DB 차이 탭에서 합니다.`];
```

`.mcp.json` 의 `ERD_SESSION` 한 줄을 고친다. 다른 줄은 그대로다.

```json
        "ERD_SESSION": "${ERD_SESSION:-auto}"
```

- [ ] **Step 4: 통과 확인과 stdout 확인**

```bash
node --test scripts/erd/tests/ 2>&1 | grep -E "^ℹ (tests|pass|fail)"
T=$(mktemp -d)
node scripts/erd/erd-mcp.mjs < /dev/null > "$T/out" 2> "$T/err"; echo exit=$?; wc -c < "$T/out"; cat "$T/err"; rm -rf "$T"
ERD_SESSION=claude-x node scripts/erd/erd-mcp.mjs < /dev/null 2>&1 >/dev/null | head -1
```
Expected:
- `tests 65`·`pass 65`·`fail 0`(Task 6 의 62 + erd-mcp 3).
- `exit=0`, stdout `0` 바이트(프로토콜 전용). stderr 는 `erd-mcp 시작: http://localhost:8096 · 사용자 erd-mcp · 역할 MDM_STEWARD · 세션 claude-<8글자>` 다. Claude Code 밖의 셸이면 `세션 mcp-<8글자>` 다. 잡은 표가 없으므로 종료 줄은 없다.
- 마지막 줄은 `… · 세션 claude-x` 다.

- [ ] **Step 5: Claude Code 로 도구 목록 확인**

중첩 `claude -p` 가 `.mcp.json` 을 읽어 도구 12개를 보는지 확인한다. 서버를 부르지 않는다(도구 이름만 묻는다). MCP 도구는 지연 로드라 자식이 ToolSearch 로 한 턴을 쓰므로 `--max-turns` 는 5 다.

```bash
claude -p "erd MCP 서버의 도구 이름만 쉼표로 나열해라. 도구를 부르지 마라." --mcp-config .mcp.json --strict-mcp-config \
  --permission-mode default --disallowedTools "Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Agent" --max-turns 5 --no-session-persistence < /dev/null
```
Expected: 답에 12개 이름이 모두 있다. 도구가 안 보이면 `node scripts/erd/erd-mcp.mjs < /dev/null` 의 stderr 를 보고, 루트 `node_modules` 가 있는지 확인한다(Step 0 선행 조건). `claude` 명령을 쓸 수 없는 환경이면 이 Step 을 건너뛰고 레인 보고에 적는다(마감 07 Step 5-1 이 같은 확인을 한다).

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add scripts/erd/erd-mcp.mjs scripts/erd/lib/model-text.mjs .mcp.json \
  scripts/erd/tests/erd-mcp.test.mjs scripts/erd/tests/mcp-config.test.mjs scripts/erd/tests/model-text.test.mjs
/usr/bin/git status --short
/usr/bin/git commit -F - <<'EOF'
feat(erd): MCP 쓰기 도구 — apply·관계 확정·기각·되돌리기·작업 중 표시

apply·confirmRelation·rejectRelation·undo·claimTable·releaseTable 을 더한다. 이름으로 쓴 명령을 id 로 풀고
결과를 25,000자 안의 글로 준다. getChangesSince 는 이름 요약을 주고 JSON 은 raw 일 때만 붙인다.
세션 이름은 ERD_SESSION=auto 면 프로세스의 CLAUDE_CODE_SESSION_ID 로 만들고(S2-7), 종료 때 잡은 표를 놓는다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```
Expected: 커밋 1개.

---

### Task 8: CLI `erd-cli.mjs` — 기본 시험 실행, `--apply`, JSON 묶음

셸에서 쓰는 CLI 를 만든다(스펙 2.3, S2-23). 읽기 명령은 MCP 읽기 도구와 같은 글을 내고, 쓰기 명령은 Task 6 의 흐름을 부른다. MCP SDK·zod 를 import 하지 않으므로 `pnpm install` 없이 돈다. 쓰기의 기본은 서버 `dryRun:true` 이고, `--apply` 를 줄 때만 저장한다.

마감(07-close.md Step 6-8)이 이 Task 에 기대는 것:
- `ERD_USER=<편집자> erd-cli apply --model mcm --file f` → 첫 줄 `시험 실행(저장 안 함) · 통과`, 종료 코드 0. 서버 rev·ROW_VERSION·명령 기록이 그대로다(서버 `dryRun`).
- `ERD_USER` 도 `--user` 도 없는 `--apply` → 종료 코드 2(서버를 부르지 않는다).
- `--session cli-close` 는 `apply` 와 `undo` 에서 쓴다. 같은 rev 를 두 번 되돌리면 서버 INVALID 라 종료 코드 1 이다.
- `--file` 없는 `apply` → 종료 코드 2. 표준 입력으로 넘어가지 않는다(표준 입력은 `--file -` 로만 읽는다).
- `--help` 는 "시험 실행도 편집자여야 통과" 를 적는다(README CLI 절, 마감 메모).

정한 규칙(시험이 고정한다):

| 주제 | 규칙 |
|---|---|
| 인자 | 손으로 짠 고리(`scripts/mdm-meta/register-columns.mjs` 선례). 값 옵션: `--model --tables --diagram --since --status --file --base-rev --rev --base --user --role --client-key --session`. 켜기 옵션: `--apply --json --include-folded --help(-h)`. 모르는 `--옵션`·남는 위치 인자는 사용 오류 |
| 사용자 | `--user` 가 `ERD_USER` 를 덮는다. `--apply` 는 둘 중 하나가 있어야 한다. 기본값 `erd-mcp` 는 명시가 아니다 |
| 세션 | `--session` > `ERD_SESSION`(비어 있지 않고 `auto` 가 아니면) > `cli-<사용자>`(Task 6 `configFromEnv` kind cli). 단, `changes` 의 `--session` 은 README 표대로 "그 세션의 변경만" 거르기다. 이때 내 세션 이름은 `ERD_SESSION` 이나 `cli-<사용자>` 다 |
| `--apply` 범위 | `apply`·`confirm`·`reject`·`undo` 만. `claim`·`release` 에 주면 사용 오류다(모델을 바꾸지 않아 늘 보낸다). 읽기 명령에 주어도 사용 오류다 |
| 묶음 파일 | `{"modelId","baseRev","commands":[...]}` 또는 명령 배열. 배열이면 `--base-rev` 필수. `--base-rev` 는 파일 값을 덮는다. `--model` 과 파일 `modelId` 가 다르면 사용 오류. 파일 없음·JSON 아님도 사용 오류 |
| 종료 코드 | 0 = 반영·시험 통과·읽기 성공·작업 중 표시 응답(못 잡음 포함), 1 = 거절·이름 풀기 실패·서버 오류·연결 실패·서버가 `dryRun` 을 몰라 저장함, 2 = 사용 오류(사용 안내를 stderr 에) |
| 출력 | stdout 은 결과 글(`--json` 이면 서버 결과 JSON 그대로, 이름 풀기 실패는 `{"error": 글}`). stderr 는 모드 머리줄(`erd-cli <명령>: <모드> · <서버> · 사용자 <id> · 세션 <이름>`)과 오류 |
| 가져오기 | `import` 명령이 없다. MCP 와 같다 |

**Files:**
- Create: `scripts/erd/erd-cli.mjs`
- Create: `scripts/erd/tests/erd-cli.test.mjs`

**Interfaces:**
- Consumes: Task 6 `lib/flows.mjs`(`applyFlow`·`undoFlow`·`claimFlow`·`releaseFlow`·`changesFlow`·`newState`·`InputError`), `lib/oasis.mjs`(`configFromEnv(env, { kind: "cli", session })`, `createOasisClient().rows`, `describeError`), `lib/model-text.mjs`(`getModelText`·`formatViolations`·`formatInferred`·`formatDbDiff`). 시험은 Task 6 픽스처(`gridSuccess`, `DELTA_*`, `APPLIED_13`, `CONFLICT_REJECTION`).
- Produces:
  - `node scripts/erd/erd-cli.mjs <명령> --model mcm [옵션]`(README "CLI" 블록과 같은 명령 12개: `models text changes violations inferred db-diff apply confirm reject undo claim release`).
  - 내보냄(시험·재사용): `USAGE`, `UsageError`, `readArgs(argv)`, `checkArgs(opt, env)`, `readBatch(opt, readStdin)`, `run(argv, { env, stdout, stderr, readStdin })` → 종료 코드.

- [ ] **Step 1: CLI 시험 작성 (실패)**

`scripts/erd/tests/erd-cli.test.mjs`. CLI 를 자식 프로세스로 돌린다(종료 코드·stdout·stderr 를 본다). 자식 환경은 `PATH` 와 시험이 준 값만이다. 그래서 이 프로세스의 `ERD_USER`·`CLAUDE_CODE_SESSION_ID` 가 섞이지 않는다. 가짜 서버가 같은 프로세스에 있으므로 `spawnSync` 를 쓰지 않는다.

```js
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
    ];
    for (const [args, re] of cases) {
      const r = await cli(args, { env, input: JSON.stringify({ modelId: "mcm", baseRev: 1, commands: [{ op: "x" }] }) });
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, re, args.join(" "));
      assert.match(r.stderr, /^사용: node scripts\/erd\/erd-cli\.mjs/m);
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

test("CLI 는 MCP SDK·zod 를 import 하지 않는다(pnpm install 없이 돈다)", () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /from\s+["'](@modelcontextprotocol\/|zod)/, file);
    for (const [, rel] of src.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) walk(join(dirname(file), rel));
  };
  walk(CLI);
  assert.ok(seen.size >= 5, [...seen].join(", ")); // erd-cli, flows, commands, results, model-text, oasis
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/erd/tests/erd-cli.test.mjs`
Expected: FAIL 4건 — 자식 프로세스가 `Cannot find module …/scripts/erd/erd-cli.mjs` 로 종료 코드 1 이라 코드 단언에서 실패하고, import 확인 시험은 `ENOENT` 다.

- [ ] **Step 3: CLI 구현**

`scripts/erd/erd-cli.mjs`:

```js
#!/usr/bin/env node
// ERD 모델 CLI(스펙 2.3 "CLI 기본 dry-run", README S2-23). MCP 도구와 같은 흐름(lib/flows.mjs)을 셸에서 부른다.
// MCP SDK·zod 를 import 하지 않는다 — pnpm install 없이 돈다(단계 1 S16 예외는 erd-mcp.mjs 만).
// 쓰기(apply·confirm·reject·undo)의 기본은 서버 시험 실행(dryRun)이다. --apply 를 줄 때만 저장하고, 그때는 --user 나 ERD_USER 가 있어야 한다.
// 작업 중 표시(claim·release)는 모델을 바꾸지 않으므로 --apply 없이 보낸다.
// 종료 코드: 0 = 반영·시험 통과·읽기 성공, 1 = 거절·실패, 2 = 사용 오류. 사용 안내는 --help.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyFlow, changesFlow, claimFlow, InputError, newState, releaseFlow, undoFlow } from "./lib/flows.mjs";
import { formatDbDiff, formatInferred, formatViolations, getModelText } from "./lib/model-text.mjs";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";

export const USAGE = `사용: node scripts/erd/erd-cli.mjs <명령> --model mcm [옵션]
  models                                     모델 목록(search)
  text      [--tables A,B*] [--diagram D]    getModelText 와 같은 글
  changes   --since R [--session S]          getChangesSince 와 같은 글. 여기의 --session 은 "그 세션의 변경만" 거르기다
  violations [--status NEW|TYPE|DOMAIN|MISS]
  inferred  [--include-folded]
  db-diff
  apply     --file batch.json|- [--base-rev R] [--apply]
  confirm|reject <관계> --base-rev R [--apply]
  undo      [--rev R] [--apply]
  claim|release <표>...                      (--apply 없이 보낸다)
공통: --base URL --user ID --role R --client-key K --session S --json

묶음 파일: {"modelId":"mcm","baseRev":212,"commands":[...]} 또는 명령 배열(이때 --base-rev 필수). --file - 는 표준 입력이다.
  명령 모양은 MCP apply 와 같다. 요소는 id 나 이름(표 물리명, "표.컬럼", "자식표.컬럼 > 부모표.컬럼", "표:PK", "업무영역/이름")으로 쓴다.
  baseRev 는 마지막으로 읽은 rev 다(text 머리줄, changes 끝 줄, 마지막 --apply 결과). 더 큰 rev 를 짐작하지 않는다.
쓰기(apply·confirm·reject·undo)의 기본은 서버 시험 실행(dryRun)이다. 서버가 잠금·편집자·충돌·표준 검사를 모두 하고 저장하지 않는다.
  시험 실행도 서버가 편집자 검사를 한다. ERD_USER(또는 --user)가 그 DRAFT 의 소유자나 공동 편집자여야 "통과" 가 나온다.
  기본 사용자 erd-mcp 로 돌리면 NOT_EDITOR 거절이다.
--apply 는 저장한다. --user 나 ERD_USER 를 꼭 준다(명령 기록에 남고, 권한을 그 사용자로 판정한다).
세션 이름: --session > ERD_SESSION(비어 있지 않고 auto 가 아니면) > cli-<사용자>. 충돌은 세션 이름으로 가린다.
환경변수: ERD_BASE(기본 http://localhost:8096) ERD_USER(기본 erd-mcp) ERD_ROLE(기본 MDM_STEWARD) BACKEND_CLIENT_KEY ERD_SESSION
종료 코드: 0 = 반영·시험 통과·읽기 성공, 1 = 거절·실패, 2 = 사용 오류. --json 은 서버 결과 JSON 을 그대로 낸다.
윈도우 콘솔에서 한글이 깨지면 chcp 65001 을 먼저 한다.`;

/** 인자가 틀렸다. 종료 코드 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

const VALUE_OPTS = {
  "--model": "model", "--tables": "tables", "--diagram": "diagram", "--since": "since", "--status": "status",
  "--file": "file", "--base-rev": "baseRev", "--rev": "rev", "--base": "base", "--user": "user", "--role": "role",
  "--client-key": "clientKey", "--session": "session",
};
const COMMANDS = ["models", "text", "changes", "violations", "inferred", "db-diff", "apply", "confirm", "reject", "undo", "claim", "release"];
const WRITES = new Set(["apply", "confirm", "reject", "undo"]);
const STATUSES = new Set(["NEW", "TYPE", "DOMAIN", "MISS"]);

/** argv → 옵션. 손으로 짠 고리다(node 18 의 내장 인자 해석기는 안정판이 아니다. scripts/mdm-meta/register-columns.mjs 선례). */
export function readArgs(argv) {
  const opt = { cmd: null, pos: [], apply: false, json: false, includeFolded: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (Object.hasOwn(VALUE_OPTS, a)) {
      if (i + 1 >= argv.length) throw new UsageError(`${a} 에 값이 없습니다`);
      opt[VALUE_OPTS[a]] = argv[++i];
    } else if (a === "--apply") opt.apply = true;
    else if (a === "--json") opt.json = true;
    else if (a === "--include-folded") opt.includeFolded = true;
    else if (a === "-h" || a === "--help") opt.help = true;
    else if (a.startsWith("--")) throw new UsageError(`알 수 없는 인자: ${a}`);
    else if (opt.cmd === null) opt.cmd = a;
    else opt.pos.push(a);
  }
  return opt;
}

function count(v, name, min = 0) {
  if (!/^\d+$/.test(String(v)) || Number(v) < min) throw new UsageError(`${name} 는 ${min} 이상의 정수입니다: ${v}`);
  return Number(v);
}

/** 서버를 부르기 전에 볼 수 있는 사용 오류. */
export function checkArgs(opt, env) {
  if (opt.help) return;
  if (opt.cmd === null) throw new UsageError("명령을 주세요");
  if (!COMMANDS.includes(opt.cmd)) throw new UsageError(`모르는 명령: ${opt.cmd}`);
  const c = opt.cmd;
  if (c !== "models" && c !== "apply" && !opt.model) throw new UsageError("--model 이 필요합니다");
  if (opt.apply && !WRITES.has(c)) {
    throw new UsageError(`--apply 는 apply·confirm·reject·undo 에만 씁니다(${c === "claim" || c === "release" ? "작업 중 표시는 모델을 바꾸지 않아 --apply 없이 보낸다" : `${c} 는 읽기다`})`);
  }
  if (opt.apply && !(opt.user || env.ERD_USER)) throw new UsageError("--apply 에는 --user 나 ERD_USER(명령 기록에 남고 권한을 판정할 사용자)가 필요합니다");
  const positional = c === "confirm" || c === "reject" ? 1 : c === "claim" || c === "release" ? -1 : 0;
  if (positional === 1 && opt.pos.length !== 1) throw new UsageError(`${c} 에는 관계 하나가 필요합니다(r- id 또는 "자식표.컬럼 > 부모표.컬럼")`);
  if (positional === -1 && opt.pos.length === 0) throw new UsageError(`${c} 에는 표가 하나 이상 필요합니다(물리명 또는 t- id)`);
  if (positional === 0 && opt.pos.length) throw new UsageError(`알 수 없는 인자: ${opt.pos[0]}`);
  if (c === "apply" && !opt.file) throw new UsageError("apply 에는 --file 이 필요합니다(표준 입력은 --file -)");
  if (c === "changes") count(opt.since ?? "", "--since");
  if ((c === "confirm" || c === "reject") && opt.baseRev === undefined) throw new UsageError(`${c} 에는 --base-rev 가 필요합니다`);
  if (opt.baseRev !== undefined) count(opt.baseRev, "--base-rev");
  if (opt.rev !== undefined) count(opt.rev, "--rev", 1);
  if (opt.status !== undefined && !STATUSES.has(opt.status)) throw new UsageError(`--status 는 NEW·TYPE·DOMAIN·MISS 중 하나입니다: ${opt.status}`);
}

/** 묶음 파일 → { modelId, baseRev, commands }. 객체({modelId, baseRev, commands}) 또는 명령 배열(--base-rev 필수). */
export function readBatch(opt, readStdin) {
  let text;
  try {
    text = opt.file === "-" ? readStdin() : readFileSync(opt.file, "utf8");
  } catch (e) {
    throw new UsageError(`묶음 파일을 읽을 수 없습니다(${opt.file}): ${e.code ?? e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new UsageError(`묶음 파일이 JSON 이 아닙니다(${opt.file}): ${e.message}`);
  }
  const bare = Array.isArray(data);
  const commands = bare ? data : data?.commands;
  if (!Array.isArray(commands)) throw new UsageError('묶음은 {"modelId","baseRev","commands":[...]} 또는 명령 배열이어야 합니다');
  const fileModel = bare ? undefined : data.modelId;
  if (opt.model && fileModel && opt.model !== fileModel) throw new UsageError(`--model(${opt.model})과 묶음의 modelId(${fileModel})가 다릅니다`);
  const modelId = opt.model ?? fileModel;
  if (!modelId) throw new UsageError("--model 이나 묶음의 modelId 가 필요합니다");
  let baseRev = opt.baseRev !== undefined ? Number(opt.baseRev) : bare ? undefined : data.baseRev;
  if (baseRev === undefined || baseRev === null) {
    throw new UsageError(bare ? "명령 배열만 준 묶음은 --base-rev 가 필요합니다" : "묶음에 baseRev 가 없습니다. --base-rev 로 주세요");
  }
  baseRev = count(baseRev, "baseRev");
  return { modelId, baseRev, commands };
}

const needStatus = (st) => {
  if (!st || typeof st.statuses !== "object" || st.statuses === null) {
    throw new Error("view kind=STATUS 응답 모양이 다릅니다. MDM 서버가 단계 1 백엔드를 포함해 떠 있는지 확인하세요.");
  }
  return st;
};

/** 명령마다: (client, opt, io) → { text, json, isError }. */
const RUN = {
  async models(client) {
    const rows = await client.rows("search");
    const lines = rows.map((r) => `${r.modelId} ${r.moduleId ?? "-"} ${r.schemaName ?? "-"} ${r.modelName ?? "-"} · rev ${r.rev ?? "-"} · DRAFT ${r.draftVer ?? "-"} · 소유자 ${r.ownerId ?? "-"}`);
    return { text: [`# 모델 ${rows.length}개`, ...lines].join("\n"), json: rows, isError: false };
  },
  async text(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    const status = needStatus(await client.call("view", { modelId: opt.model, kind: "STATUS", ver: view.ver }));
    return { text: getModelText(view, status, { tables: opt.tables, diagram: opt.diagram }), json: { view, status }, isError: false };
  },
  async changes(client, opt) {
    const r = await changesFlow(client, { modelId: opt.model, rev: Number(opt.since), session: opt.session });
    return { text: r.text, json: r.result, isError: false };
  },
  async violations(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    const status = needStatus(await client.call("view", { modelId: opt.model, kind: "STATUS", ver: view.ver }));
    return { text: formatViolations(view, status, { only: opt.status }), json: status, isError: false };
  },
  async inferred(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    return { text: formatInferred(view, { includeFolded: opt.includeFolded }), json: view, isError: false };
  },
  async "db-diff"(client, opt) {
    const diff = await client.call("compare", { modelId: opt.model, kind: "DB_DIFF" });
    if (!diff || !Array.isArray(diff.items)) throw new Error("compare kind=DB_DIFF 응답 모양이 다릅니다.");
    return { text: formatDbDiff(diff), json: diff, isError: false };
  },
  async apply(client, opt, io) {
    const b = readBatch(opt, io.readStdin);
    return write(await applyFlow(client, newState(), { ...b, dryRun: !opt.apply }));
  },
  async confirm(client, opt) {
    return write(await applyFlow(client, newState(), { modelId: opt.model, baseRev: Number(opt.baseRev), commands: [{ op: "confirmRelation", id: opt.pos[0] }], dryRun: !opt.apply }));
  },
  async reject(client, opt) {
    return write(await applyFlow(client, newState(), { modelId: opt.model, baseRev: Number(opt.baseRev), commands: [{ op: "rejectRelation", id: opt.pos[0] }], dryRun: !opt.apply }));
  },
  async undo(client, opt) {
    return write(await undoFlow(client, newState(), { modelId: opt.model, rev: opt.rev === undefined ? undefined : Number(opt.rev), dryRun: !opt.apply }));
  },
  async claim(client, opt) {
    return write(await claimFlow(client, newState(), { modelId: opt.model, tables: opt.pos }));
  },
  async release(client, opt) {
    return write(await releaseFlow(client, newState(), { modelId: opt.model, tables: opt.pos }));
  },
};

/** 흐름 결과 → 출력. 이름 풀기 실패처럼 서버 결과가 없으면 --json 도 글을 error 로 싣는다. */
function write(r) {
  return { text: r.text, json: r.result ?? { error: r.text }, isError: r.isError };
}

function modeOf(opt) {
  if (WRITES.has(opt.cmd)) return opt.apply ? "반영(--apply)" : "시험 실행(저장 안 함, 저장하려면 --apply)";
  if (opt.cmd === "claim" || opt.cmd === "release") return "작업 중 표시(모델을 바꾸지 않아 --apply 없이 보낸다)";
  return "읽기";
}

/** 옵션이 환경변수를 덮는다. */
function envOf(opt, env) {
  const out = { ...env };
  if (opt.base) out.ERD_BASE = opt.base;
  if (opt.user) out.ERD_USER = opt.user;
  if (opt.role) out.ERD_ROLE = opt.role;
  if (opt.clientKey) out.BACKEND_CLIENT_KEY = opt.clientKey;
  return out;
}

/** CLI 본체. 종료 코드를 돌려준다. 시험은 프로세스로 띄운다(tests/erd-cli.test.mjs). */
export async function run(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, readStdin = () => readFileSync(0, "utf8") } = {}) {
  const fail = (message) => {
    stderr.write(`오류: ${message}\n\n${USAGE}\n`);
    return 2;
  };
  let opt;
  let config;
  try {
    opt = readArgs(argv);
    checkArgs(opt, env);
    if (opt.help) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    // changes 의 --session 은 거르기다. 내 세션 이름은 ERD_SESSION 이나 cli-<사용자>.
    config = configFromEnv(envOf(opt, env), { kind: "cli", session: opt.cmd === "changes" ? undefined : opt.session });
  } catch (e) {
    if (e instanceof UsageError || /세션 이름은/.test(e.message)) return fail(e.message);
    throw e;
  }
  const client = createOasisClient(config);
  stderr.write(`erd-cli ${opt.cmd}: ${modeOf(opt)} · ${config.base} · 사용자 ${config.user} · 세션 ${config.session}\n`);
  try {
    const out = await RUN[opt.cmd](client, opt, { readStdin });
    stdout.write(`${opt.json ? JSON.stringify(out.json, null, 2) : out.text}\n`);
    return out.isError ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof InputError) return fail(e.message);
    stderr.write(`${describeError(e, config)}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`erd-cli 실패: ${e?.stack ?? e}`);
      process.exitCode = 1;
    },
  );
}
```

- [ ] **Step 4: 통과 확인, node 18 API, 의존성 없이 실행**

```bash
node --test scripts/erd/tests/ 2>&1 | grep -E "^ℹ (tests|pass|fail)"
grep -nE "import\.meta\.dirname|\.(toSorted|toReversed|toSpliced)\(|(Object|Map)\.groupBy|\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(|parseArgs|globalThis\.crypto|[^.]crypto\.randomUUID|recursive: *true|@modelcontextprotocol|from \"zod\"" \
  scripts/erd/erd-cli.mjs scripts/erd/lib/oasis.mjs scripts/erd/lib/commands.mjs scripts/erd/lib/results.mjs scripts/erd/lib/flows.mjs; echo grep=$?
T=$(mktemp -d); mkdir -p "$T/scripts" && cp -R scripts/erd "$T/scripts/"
(cd "$T" && node scripts/erd/erd-cli.mjs --help | head -1; ERD_BASE=http://127.0.0.1:9 node scripts/erd/erd-cli.mjs models; echo exit=$?); rm -rf "$T"
```
Expected:
- `tests`·`pass` 가 Step 0 기준선 + 이 문서에서 더한 시험 수(Task 7 이 먼저 머지됐으면 69, Task 8 만이면 66)이고 `fail 0`.
- `grep=1`.
- `node_modules` 가 없는 복사본에서 `--help` 첫 줄 `사용: node scripts/erd/erd-cli.mjs <명령> --model mcm [옵션]` 이 나온다. `models` 는 stderr 에 `erd-cli models: 읽기 · http://127.0.0.1:9 · 사용자 erd-mcp · 세션 cli-erd-mcp` 와 `… 에 닿지 못했습니다(erdEdit/search)` 를 쓰고 `exit=1` 이다(모듈을 못 찾는 오류가 아니다).

- [ ] **Step 5: 커밋**

```bash
/usr/bin/git add scripts/erd/erd-cli.mjs scripts/erd/tests/erd-cli.test.mjs
/usr/bin/git status --short
/usr/bin/git commit -F - <<'EOF'
feat(erd): ERD CLI — 기본 서버 시험 실행, --apply 저장, JSON 명령 묶음

node scripts/erd/erd-cli.mjs 로 모델 읽기·변경·위반·추정 관계·DB 차이를 보고, 명령 묶음·관계 확정·기각·되돌리기를
보낸다. 쓰기의 기본은 서버 dryRun 이고 --apply 는 --user 나 ERD_USER 를 요구한다(S2-23). MCP SDK 없이 돈다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```
Expected: 커밋 1개.

---

## 계획 작성자 메모

- README 파일 구조에 없는 파일을 더했다: `scripts/erd/lib/flows.mjs`(쓰기 흐름, SDK 없음), `scripts/erd/tests/flows.test.mjs`. 흐름을 `erd-mcp.mjs` 에 두면 CLI 가 SDK 를 import 하거나 흐름을 따로 짜야 한다. 그래서 Task 6 에 두어 README 의 6 → 7, 6 → 8 을 지켰다.
- Task 6 이 700줄을 넘는다(실제 코드가 대부분). 나누면 경계는 Step 8 이다: t6a = Step 0~8(oasis·commands, 끝에 바뀐 파일만 커밋), t6b = Step 9~15(results·flows).
- S2-28(코드마다 50건)과 README "결과 글" 줄(`STD_*` 는 처음 20건, `CLAIMED` 는 모두)이 다르다. 정합 검토의 판정(코드 묶음마다 50건)을 따라 모든 코드에 50건을 썼다. `CLAIMED` 가 50건을 넘는 일은 묶음 하나가 다른 세션이 잡은 표 50개를 건드려야 생긴다. MCP·CLI 에는 확정 검사 결과를 내는 도구가 없다.
- `CLAIMED` 경고에는 사용자 칸이 없다(`ErdWarning.claimedBy` 는 세션). 07 Step 6-3 의 `claude-a (erd-mcp-a)` 는 보내기 전에 읽은 `view.presence` 로 세션 → 사용자를 찾아 만든다. 그 세션의 접속자 항목이 없으면(서버 BE2 Task 4 의 시한 항목이 아직 없거나 만료) 세션만 적는다. 마감에서 사용자가 빠지면 이 때문이다.
- CLI `changes --session S` 는 README 표대로 "그 세션의 변경만" 거르기로 읽는다. 공통 옵션 `--session`(내 세션 이름)과 이름이 겹친다. `changes` 는 쓰지 않으므로 내 세션 이름이 필요 없다. 도움말에 적었다.
- 시험 실행을 요청했는데 서버가 `applied:true`·`dryRun` 없음을 돌려주면(서버 레인 머지 전의 옛 서버) 실제로 저장된 것이다. 오류로 올리고 `undo(rev=N)` 을 안내한다. README 에 없는 안전판이다. 07 Step 6-8 은 BE2 머지 뒤라 생기지 않는다.
- `describeError` 에 MDM002(DRAFT 아님)·MDM003(DRAFT 소유자 아님) 안내를 더했다. README 착수 전 사실(27 수정 뒤 경쟁은 MDM003·MDM002 오류)에 맞췄다. 같은 코드가 늘 나는 경우(소유자 없는 DRAFT, RELEASED)에도 오므로, 상태를 확인하고 한 번만 다시 보내라고 적는다(되풀이 재시도를 막는다).
- rev 없는 `undo` 가 재시작 뒤 서버에서 찾을 때, 되돌리기로 생긴 내 세션 델타와 보통 변경을 가르지 못한다(델타에 표시가 없다). 이 프로세스가 만든 되돌리기 rev 는 건너뛰지만, 다른 프로세스가 같은 세션 이름으로 만든 되돌리기 rev 는 다시 되돌릴 수 있다(다시 하기가 된다). rev 를 주면 생기지 않는다.
- `getChangesSince` 의 `raw:true` 는 요약 글을 상한의 40%(10,000자)까지로 줄이고 나머지를 JSON 에 준다. JSON 이 넘치면 뒤 델타부터 빼고 `truncated` 에 뺀 수를 적는다. README 는 "raw:true 일 때만 JSON" 만 정했다.
- `formatDbDiff` 머리줄과 `getDbDiff` 설명의 "반영은 단계 2 에서" 를 "m-mdm ERD 화면의 DB 차이 탭에서" 로 바꿨다(Task 7). MCP `applyDbDiff` 는 README 의 deferred 새 행이다.
- 각 Task 의 코드는 작성 중에 리포 사본(SDK 1.30.1·zod 4.6.5 설치)에서 `node --test` 로 돌려 보았다(Task 6 끝 62건, Task 7 끝 65건, Task 8 끝 69건 통과). node 18.17 로는 돌리지 않았다. 금지 API grep 으로 대신한다.
