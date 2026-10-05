#!/usr/bin/env node
/**
 * 위젯 도움말 문서 번들 생성 — 저장소 문서(docs/guide/FrontEnd/Widget-Authoring-Guide.md)를 화면 번들용 TS 모듈로 옮긴다.
 * 포털이 모듈 패키지의 정적 파일을 서빙하지 않고 Next 설정에 .md 로더도 없으므로, 원문(.md)이 정본이고
 * page-components/csa/commWidgetMng/help/widget-guide-content.ts 는 이 스크립트가 만든 사본이다.
 * 문서를 고치면 `pnpm --filter @dk-oasis/mcm gen:widget-guide` 로 다시 만든다(어긋나면 widget-guide-sync.test.ts 가 실패한다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const GUIDE_SOURCE = resolve(here, "../../../../docs/guide/FrontEnd/Widget-Authoring-Guide.md");
export const GUIDE_TARGET = resolve(here, "../page-components/csa/commWidgetMng/help/widget-guide-content.ts");

export function renderModule(markdown) {
  return [
    "/**",
    " * 자동 생성 파일 — 직접 고치지 않는다. 원문: docs/guide/FrontEnd/Widget-Authoring-Guide.md",
    " * 다시 만들기: pnpm --filter @dk-oasis/mcm gen:widget-guide (scripts/gen-widget-guide.mjs)",
    " */",
    `export const WIDGET_GUIDE_MARKDOWN: string = ${JSON.stringify(markdown)};`,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = readFileSync(GUIDE_SOURCE, "utf8");
  writeFileSync(GUIDE_TARGET, renderModule(md));
  console.log(`생성: ${GUIDE_TARGET} (${md.length}자)`);
}
