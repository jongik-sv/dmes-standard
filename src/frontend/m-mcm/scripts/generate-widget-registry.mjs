/**
 * 위젯 등록부 생성 — m-mcm widgets/ 를 훑어 lib/generated/widget-registry.ts 를 쓴다.
 * 모듈 패키지 위젯(m-mls/widgets 등)은 그 패키지가 package.json exports "./widgets/*"·tsup entry 를 열었을 때
 * MODULE_WIDGET_PACKAGES 에 추가한다(A 단계에서는 m-mcm 위젯만 있다).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { collectWidgets, renderRegistry } from "./widget-registry-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "lib", "generated", "widget-registry.ts");

/** [{ pkg, dir }] — 예: { pkg: "@dk-oasis/m-mls", dir: path.resolve(ROOT, "..", "m-mls", "widgets") } */
const MODULE_WIDGET_PACKAGES = [];

async function main() {
  const entries = [];
  for (const w of await collectWidgets(path.join(ROOT, "widgets"))) {
    entries.push({ id: w.id, metaImport: `@/widgets/${w.key}/widget.meta`, bodyImport: `@/widgets/${w.key}/widget` });
  }
  for (const mod of MODULE_WIDGET_PACKAGES) {
    for (const w of await collectWidgets(mod.dir)) {
      entries.push({ id: w.id, metaImport: `${mod.pkg}/widgets/${w.key}/widget.meta`, bodyImport: `${mod.pkg}/widgets/${w.key}/widget` });
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const content = renderRegistry(entries);
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  const prev = await fs.readFile(OUT_FILE, "utf8").catch(() => "");
  if (prev !== content) await fs.writeFile(OUT_FILE, content, "utf8");
  console.log(`[generate-widget-registry] ${prev === content ? "unchanged" : "wrote"} ${OUT_FILE} (${entries.length} widgets)`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
