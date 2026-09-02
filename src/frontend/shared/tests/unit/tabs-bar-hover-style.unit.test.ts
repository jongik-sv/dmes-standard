import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tabsBarCss = readFileSync(
  new URL("../../src/portal-shell/tabs-bar/TabsBar.css", import.meta.url),
  "utf8"
);
const tabsBarSource = readFileSync(
  new URL("../../src/portal-shell/tabs-bar/TabsBar.tsx", import.meta.url),
  "utf8"
);

describe("portal tabs close affordance", () => {
  it("shrinks regular portal tabs from 130px down to 100px as space decreases", () => {
    expect(tabsBarCss).toMatch(
      /\.tabs-scroll-area > \.tab-item\s*\{[^}]*flex: 0 1 130px;[^}]*width: 130px;[^}]*min-width: 100px;[^}]*max-width: 130px;[^}]*box-sizing: border-box;/s
    );
    expect(tabsBarCss).toMatch(/\.tab-title\s*\{[^}]*flex: 1;[^}]*min-width: 0;/s);
  });

  it("renders an immediate custom tooltip when a clipped label is hovered", () => {
    expect(tabsBarSource).toContain("onMouseEnter={(event) => showTabTitleTooltip(event, tab)}");
    expect(tabsBarSource).toContain('className="tab-title-tooltip"');
    expect(tabsBarSource).toContain('role="tooltip"');
    expect(tabsBarSource).not.toContain("title={tab.title}");
    expect(tabsBarCss).toMatch(
      /\.tab-title-tooltip\s*\{[^}]*position: fixed;[^}]*pointer-events: none;/s
    );
  });

  it("keeps the close button hidden without changing the tab layout", () => {
    expect(tabsBarCss).toMatch(
      /\.tab-close\s*\{[^}]*position: absolute;[^}]*opacity: 0;[^}]*pointer-events: none;/s
    );
  });

  it("uses a subtle translucent square button", () => {
    expect(tabsBarCss).toMatch(
      /\.tab-close\s*\{[^}]*background-color: rgba\(255, 255, 255, 0\.08\);[^}]*border-radius: 4px;/s
    );
  });

  it("reveals the close button for pointer hover and keyboard focus", () => {
    expect(tabsBarCss).toContain(".tab-item:hover .tab-close,");
    expect(tabsBarCss).toContain(".tab-item:focus-within .tab-close");
    expect(tabsBarCss).toMatch(
      /\.tab-item:hover \.tab-close,[^{]*\{[^}]*opacity: 1;[^}]*pointer-events: auto;/s
    );
  });

  it("fades tab content behind the revealed close button", () => {
    expect(tabsBarCss).toMatch(
      /\.tab-item::after\s*\{[^}]*linear-gradient\([^}]*opacity: 0;[^}]*pointer-events: none;/s
    );
    expect(tabsBarCss).toContain(".tab-item:focus-within::after");
  });
});
