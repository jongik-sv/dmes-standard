/** @vitest-environment happy-dom */
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DateTimePicker, Input } from "../../src/components/form";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

describe("DateTimePicker 칸 크기 — 화면 표준 xs(26px)", () => {
  let rendered: Rendered | undefined;
  afterEach(() => rendered?.unmount());

  it("칸(input)·래퍼가 옆 칸 Input 과 같은 xs 로 그려진다", () => {
    rendered = renderWithMantine(
      createElement("div", null, [
        createElement(DateTimePicker, { key: "d", value: "", id: "dt" }),
        createElement(Input, { key: "i", id: "tx" }),
      ]),
    );
    const dt = rendered.host.querySelector<HTMLInputElement>("#dt")!;
    const tx = rendered.host.querySelector<HTMLInputElement>("#tx")!;
    const wrapper = (el: Element) => el.closest(".mantine-InputWrapper-root")!.getAttribute("data-size");
    expect(wrapper(dt)).toBe("xs");
    expect(wrapper(dt)).toBe(wrapper(tx));
  });
});
