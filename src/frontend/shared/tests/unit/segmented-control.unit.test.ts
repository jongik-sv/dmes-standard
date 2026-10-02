/** @vitest-environment happy-dom */

// 세그먼트 선택(shared form SegmentedControl) — 선택지 렌더, 선택 값 표시, 다른 칸 선택 시 onChange, 묶음 이름.
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "../../src/components/form";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

describe("SegmentedControl", () => {
  it("문자열·객체 선택지를 라디오로 그리고 선택한 값을 표시한다", () => {
    r = renderWithMantine(
      createElement(SegmentedControl, {
        value: "냉연",
        options: ["전체", { value: "냉연", label: "냉연" }, "도금"],
        ariaLabel: "제품군",
        testId: "seg",
      })
    );
    const root = r.host.querySelector<HTMLElement>('[data-testid="seg"]')!;
    expect(root.getAttribute("role")).toBe("radiogroup");
    expect(root.getAttribute("aria-label")).toBe("제품군");
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((x) => x.value)).toEqual(["전체", "냉연", "도금"]);
    expect(radios.find((x) => x.checked)?.value).toBe("냉연");
    expect(root.classList.contains("form-segmented")).toBe(true);
  });

  it("다른 칸을 고르면 onChange 로 값을 넘긴다", () => {
    const onChange = vi.fn();
    const props = {
      value: "all",
      options: [
        { value: "all", label: "전체" },
        { value: "unread", label: "안읽음" },
      ],
      onChange,
      testId: "seg",
    };
    r = renderWithMantine(createElement(SegmentedControl, props));
    const unread = r.host.querySelector<HTMLInputElement>('input[value="unread"]')!;
    act(() => {
      unread.click();
    });
    expect(onChange).toHaveBeenCalledWith("unread");
    rerender(r, createElement(SegmentedControl, { ...props, value: "unread" }));
    expect(r.host.querySelector<HTMLInputElement>('input[value="unread"]')!.checked).toBe(true);
  });

  it("disabled 면 모든 칸이 비활성이다", () => {
    r = renderWithMantine(
      createElement(SegmentedControl, { value: "a", options: ["a", "b"], disabled: true })
    );
    const radios = Array.from(r.host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.every((x) => x.disabled)).toBe(true);
  });
});
