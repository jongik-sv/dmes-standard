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
    // 칸 높이는 입력을 감싼 .mantine-Input-wrapper 의 --input-height 로 정해진다. 안쪽 Input 이 size 를 따로 받는다.
    const height = (el: Element) => (el.closest(".mantine-Input-wrapper") as HTMLElement).style.getPropertyValue("--input-height");
    expect(height(tx)).toBeTruthy();
    expect(height(dt)).toBe(height(tx));
  });
});
