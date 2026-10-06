import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { WIDGET_SCREEN_LINK_GUIDE_MARKDOWN } from "./help-content";
import * as typeMeta from "./type.meta";

const SOURCE = fileURLToPath(new URL("../../../../../docs/guide/FrontEnd/Widget-Screen-Link-Guide.md", import.meta.url));

describe("룰 계산기 도움말 문서 번들", () => {
  it("저장소 원문(Widget-Screen-Link-Guide.md)과 화면 번들 사본이 같다", () => {
    // 어긋나면: pnpm --filter @dk-oasis/mcm gen:widget-guide
    expect(WIDGET_SCREEN_LINK_GUIDE_MARKDOWN).toBe(readFileSync(SOURCE, "utf8"));
  });

  it("사용자·관리자·개발자 절이 있다", () => {
    const chapters = WIDGET_SCREEN_LINK_GUIDE_MARKDOWN.split("\n").filter((l) => /^## /.test(l));
    expect(chapters).toEqual(
      expect.arrayContaining(["## 1. 사용자 편", "## 2. 관리자 편", "## 3. 개발자 편"])
    );
  });

  it("유형 meta 의 help 가 이 문서를 불러온다", async () => {
    expect(typeMeta.meta.help?.title).toBe("업무 화면과 위젯 값 연결 안내");
    await expect(typeMeta.meta.help?.loadMarkdown()).resolves.toBe(WIDGET_SCREEN_LINK_GUIDE_MARKDOWN);
  });
});
