/** @vitest-environment happy-dom */
/** MultiSelectComboBox: 뿌리에는 상자(.form-combobox)가 없고 안쪽 input 에만 상자 클래스가 하나 붙는다. */
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiSelectComboBox } from "../../src/components/form/MultiSelectComboBox";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

function show(error?: string) {
  r = renderWithMantine(createElement(MultiSelectComboBox, { data: ["A", "B"], value: [], error }));
  return r.host;
}

describe("MultiSelectComboBox 상자", () => {
  it("뿌리에 form-combobox 가 없고 form-multiselect 만 있다", () => {
    const h = show();
    expect(h.querySelectorAll(".form-combobox")).toHaveLength(0);
    expect(h.querySelectorAll(".form-multiselect")).toHaveLength(1);
  });

  it("안쪽 상자(.form-multiselect-box)가 하나이고 오류 클래스는 뿌리에 붙는다", () => {
    const h = show("필수");
    expect(h.querySelectorAll(".form-multiselect-box")).toHaveLength(1);
    expect(h.querySelector(".form-multiselect")!.classList.contains("form-error")).toBe(true);
  });
});
