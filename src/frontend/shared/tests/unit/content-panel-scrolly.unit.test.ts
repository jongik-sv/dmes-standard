/** @vitest-environment happy-dom */
import { createElement as h } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ContentPanel } from "../../src/layout/ContentPanel";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

describe("ContentPanel scrollY", () => {
  let rendered: Rendered | undefined;
  afterEach(() => rendered?.unmount());

  it("기본은 스크롤 스타일을 주지 않고, scrollY 면 세로만 스크롤한다", () => {
    rendered = renderWithMantine(h("div", null, h(ContentPanel, { key: "a" }, "기본"), h(ContentPanel, { key: "b", scrollY: true }, "긴 내용")));
    const [plain, scroll] = Array.from(rendered.host.querySelectorAll<HTMLElement>(".content-panel"));
    expect(plain.style.overflowY).toBe("");
    expect(scroll.style.overflowY).toBe("auto");
    expect(scroll.style.overflowX).toBe("hidden");
  });
});
