/** @vitest-environment happy-dom */

/*
 * 작성자: @codex
 * 작성일: 2026-07-16
 * 내용: FormGroup 라벨·도움말·오류의 키보드·스크린리더 접근성 계약
 *
 * 2026-09-07 (P1): FormGroup 의 자식(Input/Radio)이 Mantine 컴포넌트로 재구현되어
 * MantineProvider 컨텍스트 없이는 렌더 자체가 실패한다. 렌더 하네스만 T0 의
 * mantine-test-utils(renderWithMantine)로 교체했다 — 아래 단언은 한 줄도 바꾸지 않았다.
 */

import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { Radio } from "../../src/components/form/Radio";
import { renderWithMantine } from "./mantine-test-utils";

describe("FormGroup accessibility contract", () => {
  it("associates its label, tip, and error with a single form control", () => {
    const r = renderWithMantine(
      createElement(
        FormGroup,
        {
          label: "해제 사유",
          tip: "감사 로그에 남는 해제 사유입니다.",
          error: "해제 사유를 입력하세요.",
        },
        createElement(Input, { value: "", onChange: () => undefined })
      )
    );

    const label = r.host.querySelector("label");
    const input = r.host.querySelector("input");
    const describedBy = input?.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(label?.classList.contains("form-group-label")).toBe(true);
    expect(label?.classList.contains("has-tip")).toBe(true);
    expect(label?.htmlFor).toBe(input?.id);
    expect(input?.getAttribute("aria-labelledby")).toBe(label?.id);
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toHaveLength(2);
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "감사 로그에 남는 해제 사유입니다.",
      "해제 사유를 입력하세요.",
    ]);
    expect(document.getElementById(describedBy[1])?.getAttribute("role")).toBe("alert");
    r.unmount();
  });

  it("shows the same tip visually when a keyboard user focuses the control", () => {
    const r = renderWithMantine(
      createElement(
        FormGroup,
        { label: "실제 종료 시점", tip: "후속 작업에 영향을 줍니다." },
        createElement(Input, { value: "", onChange: () => undefined })
      )
    );

    const input = r.host.querySelector("input");
    act(() => input?.focus());

    expect(document.querySelector(".form-tip-text--portal")?.textContent).toBe(
      "후속 작업에 영향을 줍니다."
    );
    r.unmount();
  });

  it("names a composite radio group from the FormGroup label", () => {
    const r = renderWithMantine(
      createElement(
        FormGroup,
        { label: "해제 후 처리", tip: "재계산 여부를 선택합니다." },
        createElement(Radio, {
          value: "none",
          options: ["none", "recalc"],
          onChange: () => undefined,
        })
      )
    );

    const label = r.host.querySelector("label");
    const radioGroup = r.host.querySelector('[role="radiogroup"]');
    expect(radioGroup?.getAttribute("aria-labelledby")).toBe(label?.id);
    expect(radioGroup?.getAttribute("aria-describedby")).toBeTruthy();
    r.unmount();
  });
});
