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

  it("목차가 될 장(##)이 충분하다", () => {
    // 표(GFM)는 MarkdownView 가 그리므로 문서에 써도 된다 — 표 문법 금지 단언은 두지 않는다.
    const chapters = WIDGET_GUIDE_MARKDOWN.split("\n").filter((l) => /^## /.test(l));
    expect(chapters.length).toBeGreaterThanOrEqual(8);
  });
});
