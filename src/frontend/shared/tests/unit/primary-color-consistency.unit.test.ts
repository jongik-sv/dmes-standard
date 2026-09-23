import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared primary color consistency", () => {
  it("shared CSS 는 primary 색을 토큰으로만 쓰고 레거시 파랑을 하드코딩하지 않는다", () => {
    const variablesCss = read("../../src/styles/variables.css");
    const modalCss = read("../../src/components/modal.css");
    const formCss = read("../../src/components/form/form.css");

    expect(variablesCss).toContain("--color-primary: var(--mantine-color-dmes-6");

    // modal.css 레거시 파랑 검사는 P2 토스트 제거 후 확장
    expect(formCss).not.toMatch(/#(1976d2|1a73e8|4a90d9|3a7bc8)/i);

    for (const css of [modalCss, formCss]) {
      expect(css.replace(/var\([^)]*\)/g, "")).not.toMatch(/#(337ab7|2a6499)/i);
    }
  });

  it("derives generic active tabs and retry actions from the primary token", () => {
    const tabsSource = read("../../src/components/tabs/Tabs.tsx");
    const errorBoundarySource = read("../../src/components/error-boundary.tsx");

    expect(tabsSource).toContain("var(--color-primary, #0b62d6)");
    expect(tabsSource).not.toContain("#1a73e8");
    expect(errorBoundarySource).toContain("var(--color-primary, #0b62d6)");
    expect(errorBoundarySource).not.toContain("#1976d2");
  });

  it("does not hardcode legacy blue on portal and module primary actions", () => {
    // 템플릿 저장소에 없는 dmes-ksm 전용 파일 2개 제거(2026-09-07):
    // m-mcm/page-components/mpf/executionMonitor/page.tsx,
    // m-mcm/page-components/caravanConsole/topic/components/SendTestModal.tsx
    const sources = [
      read("../../src/portal-shell/FavoriteFolderPickerModal.tsx"),
      read("../../src/portal-shell/sidebar/FavoritesTree.tsx"),
      read("../../../m-analog/src/anl/log-viewer/log-viewer.css"),
    ];

    for (const source of sources) {
      expect(source).toContain("var(--color-primary");
      expect(source).not.toMatch(/#(?:1976d2|1890ff|4a90d9)/i);
    }
  });
});
