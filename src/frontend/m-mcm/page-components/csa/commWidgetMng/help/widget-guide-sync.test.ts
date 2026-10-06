import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { WIDGET_GUIDE_MARKDOWN } from "./widget-guide-content";

const SOURCE = fileURLToPath(new URL("../../../../../../../docs/guide/FrontEnd/Widget-Authoring-Guide.md", import.meta.url));
const LINK_SOURCE = fileURLToPath(new URL("../../../../../../../docs/guide/FrontEnd/Widget-Screen-Link-Guide.md", import.meta.url));

/** 코드 블록(``` 울타리)과 백틱 구간을 지운 글 — 경로·정규식의 물결표는 검사하지 않는다. */
function stripCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

describe("위젯 도움말 문서 번들", () => {
  it("저장소 원문(Widget-Authoring-Guide.md)과 화면 번들 사본이 같다", () => {
    // 어긋나면: pnpm --filter @dk-oasis/mcm gen:widget-guide
    expect(WIDGET_GUIDE_MARKDOWN).toBe(readFileSync(SOURCE, "utf8"));
  });

  it("목차가 될 장(##)이 충분하다", () => {
    // 표(GFM)는 MarkdownView 가 그리므로 문서에 써도 된다 — 표 문법 금지 단언은 두지 않는다.
    const chapters = WIDGET_GUIDE_MARKDOWN.split("\n").filter((l) => /^## /.test(l));
    expect(chapters.length).toBeGreaterThanOrEqual(8);
  });

  it.each([
    ["Widget-Authoring-Guide.md", SOURCE],
    ["Widget-Screen-Link-Guide.md", LINK_SOURCE],
  ])("%s 에 이스케이프 안 된 물결표 하나(~)가 없다 — 범위는 하이픈, 인용 문구는 \\~(GFM 이 취소선으로 그린다)", (_name, path) => {
    const text = stripCode(readFileSync(path, "utf8")).replace(/~~/g, "").replace(/\\~/g, "");
    expect(text.split("\n").filter((l) => l.includes("~"))).toEqual([]);
  });
});
