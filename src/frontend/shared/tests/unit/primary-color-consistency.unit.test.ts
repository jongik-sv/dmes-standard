import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared primary color consistency", () => {
  it("uses the canonical primary tokens for shared primary buttons", () => {
    const variablesCss = read("../../src/styles/variables.css");
    const formCss = read("../../src/components/form/form.css");

    expect(variablesCss).toContain("--color-primary: var(--mantine-color-dmes-6");
    expect(formCss).not.toContain("var(--color-primary, #4a90d9)");
    expect(formCss).not.toContain("var(--color-primary-hover, #3a7bc8)");
  });

  it("derives generic active tabs and retry actions from the primary token", () => {
    const tabsSource = read("../../src/components/tabs/Tabs.tsx");
    const errorBoundarySource = read("../../src/components/error-boundary.tsx");

    expect(tabsSource).toContain("var(--color-primary, #337ab7)");
    expect(tabsSource).not.toContain("#1a73e8");
    expect(errorBoundarySource).toContain("var(--color-primary, #337ab7)");
    expect(errorBoundarySource).not.toContain("#1976d2");
  });

  it("does not hardcode legacy blue on portal and module primary actions", () => {
    const sources = [
      read("../../src/portal-shell/FavoriteFolderPickerModal.tsx"),
      read("../../src/portal-shell/sidebar/FavoritesTree.tsx"),
      read("../../../m-analog/src/anl/log-viewer/log-viewer.css"),
      read("../../../m-mcm/page-components/mpf/executionMonitor/page.tsx"),
      read("../../../m-mcm/page-components/caravanConsole/topic/components/SendTestModal.tsx"),
    ];

    for (const source of sources) {
      expect(source).toContain("var(--color-primary");
      expect(source).not.toMatch(/#(?:1976d2|1890ff|4a90d9)/i);
    }
  });
});
