import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIST = fileURLToPath(new URL("../../dist/widget.js", import.meta.url));

// 빌드한 dist 가 있을 때만 확인한다(소스 시험은 tsup 번들 모양을 보지 못한다). 없으면 건너뛴다.
describe.skipIf(!existsSync(DIST))("dist/widget.js 번들", () => {
  it("문서 보기(tiptap·marked)를 widget.js 에 넣지 않는다 — 포털 모든 화면이 도움말을 열기 전에 받게 된다", () => {
    const code = readFileSync(DIST, "utf8");
    expect(code).not.toMatch(/from "@tiptap\//);
    expect(code).not.toMatch(/from "marked"/);
    expect(code).toContain('import("@dk-oasis/shared/markdown-editor")');
  });
});
