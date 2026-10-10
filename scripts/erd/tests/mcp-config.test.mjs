import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test(".mcp.json: erd 서버가 저장소의 erd-mcp.mjs 를 띄우고, 환경변수마다 기본값이 있다", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  const erd = cfg.mcpServers.erd;
  assert.equal(erd.command, "node");
  assert.deepEqual(erd.args, ["scripts/erd/erd-mcp.mjs"]);
  assert.ok(existsSync(join(ROOT, erd.args[0])));
  assert.deepEqual(Object.keys(erd.env).sort(), ["BACKEND_CLIENT_KEY", "ERD_BASE", "ERD_ROLE", "ERD_SESSION", "ERD_USER"]);
  for (const [k, v] of Object.entries(erd.env)) assert.match(v, new RegExp(`^\\$\\{${k}:-[^}]+\\}$`), `${k} 에 기본값이 없다`);
});
