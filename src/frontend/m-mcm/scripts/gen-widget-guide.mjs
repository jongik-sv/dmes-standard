#!/usr/bin/env node
/**
 * 위젯 도움말 문서 번들 생성 — 저장소 문서(docs/guide/FrontEnd/*.md)를 화면 번들용 TS 모듈로 옮긴다.
 * 포털이 모듈 패키지의 정적 파일을 서빙하지 않고 Next 설정에 .md 로더도 없으므로, 원문(.md)이 정본이고
 * 아래 두 .ts 는 이 스크립트가 만든 사본이다.
 *   - Widget-Authoring-Guide.md → page-components/csa/commWidgetMng/help/widget-guide-content.ts (위젯 관리 「도움말」)
 *   - Widget-Screen-Link-Guide.md → widget-types/rule-calc/help-content.ts (위젯 틀 「?」 도움말, 위젯 관리 도움말의 값 연결 안내)
 * 문서를 고치면 `pnpm --filter @dk-oasis/mcm gen:widget-guide` 로 다시 만든다(어긋나면 시험이 실패한다:
 * widget-guide-sync.test.ts, widget-types/rule-calc/help-content.test.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "../../../../docs/guide/FrontEnd");

export const GUIDE_SOURCE = resolve(docs, "Widget-Authoring-Guide.md");
export const GUIDE_TARGET = resolve(here, "../page-components/csa/commWidgetMng/help/widget-guide-content.ts");
export const LINK_GUIDE_SOURCE = resolve(docs, "Widget-Screen-Link-Guide.md");
export const LINK_GUIDE_TARGET = resolve(here, "../widget-types/rule-calc/help-content.ts");

/** 사본 모듈 글 — 머리 주석 + `export const {exportName}: string = "…"`. */
export function renderCopy(markdown, sourceFile, exportName) {
  return [
    "/**",
    ` * 자동 생성 파일 — 직접 고치지 않는다. 원문: docs/guide/FrontEnd/${sourceFile}`,
    " * 다시 만들기: pnpm --filter @dk-oasis/mcm gen:widget-guide (scripts/gen-widget-guide.mjs)",
    " */",
    `export const ${exportName}: string = ${JSON.stringify(markdown)};`,
    "",
  ].join("\n");
}

export function renderModule(markdown) {
  return renderCopy(markdown, "Widget-Authoring-Guide.md", "WIDGET_GUIDE_MARKDOWN");
}

export function renderLinkModule(markdown) {
  return renderCopy(markdown, "Widget-Screen-Link-Guide.md", "WIDGET_SCREEN_LINK_GUIDE_MARKDOWN");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = readFileSync(GUIDE_SOURCE, "utf8");
  writeFileSync(GUIDE_TARGET, renderModule(md));
  console.log(`생성: ${GUIDE_TARGET} (${md.length}자)`);
  const link = readFileSync(LINK_GUIDE_SOURCE, "utf8");
  writeFileSync(LINK_GUIDE_TARGET, renderLinkModule(link));
  console.log(`생성: ${LINK_GUIDE_TARGET} (${link.length}자)`);
}
