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
