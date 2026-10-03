/** @vitest-environment happy-dom */
/**
 * ComboBox 검색어 동기화: 사용자가 친 글자는 data(options) 만 바뀌어도 지키고, value 가 바뀌거나
 * 손대지 않은 상태에서 라벨이 새로 생기면 라벨로 맞춘다.
 */
import { act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ComboBox, type ComboBoxProps } from "../../src/components/form/ComboBox";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

const A = [{ value: "a", label: "에이" }];
const AB = [
  { value: "a", label: "에이" },
  { value: "b", label: "비이" },
];

function box(props: Partial<ComboBoxProps>) {
  return createElement(ComboBox, { data: [], ...props } as ComboBoxProps);
}

function input(): HTMLInputElement {
  return r!.host.querySelector("input") as HTMLInputElement;
}

function create(): Element | null {
  return r!.host.querySelector(".form-combobox-create");
}

function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => input().focus());
  act(() => {
    setter.call(input(), text);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ComboBox 검색어 동기화", () => {
  it("(1) 글자를 친 뒤 data 만 바뀌어도 친 글자가 남는다", () => {
    r = renderWithMantine(box({ data: [], value: "" }));
    type("새 차원");
    expect(input().value).toBe("새 차원");
    rerender(r, box({ data: A, value: "" }));
    expect(input().value).toBe("새 차원");
  });

  it("(1b) 선택값이 있어도 친 글자가 data 변경에 지워지지 않는다", () => {
    r = renderWithMantine(box({ data: A, value: "a" }));
    expect(input().value).toBe("에이");
    type("비");
    rerender(r, box({ data: [...AB], value: "a" }));
    expect(input().value).toBe("비");
  });

  it("(2) 손대지 않은 상태에서 data 가 와 라벨이 생기면 라벨로 바뀐다", () => {
    r = renderWithMantine(box({ data: [], value: "a" }));
    expect(input().value).toBe("a");
    rerender(r, box({ data: A, value: "a" }));
    expect(input().value).toBe("에이");
  });

  it("(3) value 가 바뀌면 친 글자가 있어도 새 라벨로 바뀐다", () => {
    r = renderWithMantine(box({ data: AB, value: "a" }));
    type("직접");
    rerender(r, box({ data: AB, value: "b" }));
    expect(input().value).toBe("비이");
  });

  it("(4) onCreateNew 노출 판정이 그대로다", () => {
    r = renderWithMantine(box({ data: A, value: "", onCreateNew: () => {} }));
    type("없는 값");
    expect(create()?.textContent).toBe('+ "없는 값" 신규 생성');
    type("에이");
    expect(create()).toBeNull();
  });
});
