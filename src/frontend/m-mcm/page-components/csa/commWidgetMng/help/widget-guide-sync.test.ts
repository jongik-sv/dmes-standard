import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { WIDGET_GUIDE_MARKDOWN } from "./widget-guide-content";

const SOURCE = fileURLToPath(new URL("../../../../../../../docs/guide/FrontEnd/Widget-Authoring-Guide.md", import.meta.url));

describe("위젯 도움말 문서 번들", () => {
  it("저장소 원문(Widget-Authoring-Guide.md)과 화면 번들 사본이 같다", () => {
    // 어긋나면: pnpm --filter @dk-oasis/mcm gen:widget-guide
    expect(WIDGET_GUIDE_MARKDOWN).toBe(readFileSync(SOURCE, "utf8"));
  });

  it("목차가 될 장(##)이 충분하고 표(table) 문법을 쓰지 않는다", () => {
    const chapters = WIDGET_GUIDE_MARKDOWN.split("\n").filter((l) => /^## /.test(l));
    expect(chapters.length).toBeGreaterThanOrEqual(8);
    // MarkdownView 는 표를 그리지 않는다 — 구분 줄(|---|)이 있으면 글자로 샌다.
    expect(WIDGET_GUIDE_MARKDOWN).not.toMatch(/^\|?\s*:?-{3,}:?\s*\|/m);
  });
});
