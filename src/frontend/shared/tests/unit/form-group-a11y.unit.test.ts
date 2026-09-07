/** @vitest-environment happy-dom */

/*
 * 작성자: @codex
 * 작성일: 2026-07-16
 * 내용: FormGroup 라벨·도움말·오류의 키보드·스크린리더 접근성 계약
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FormGroup } from "../../src/components/form/FormGroup";
import { Input } from "../../src/components/form/Input";
import { Radio } from "../../src/components/form/Radio";
import { dmesTheme } from "../../src/ui-provider/theme";

let host: HTMLDivElement;
let root: Root;

// FormGroup 의 자식(Input/Radio)이 Mantine 컴포넌트로 재구현되어 MantineProvider 컨텍스트가
// 필요하다(P1, 2026-09-07). 렌더 하네스만 감싸며 assertion 은 그대로 둔다.
function render(element: ReactElement) {
  act(() => root.render(createElement(MantineProvider, { theme: dmesTheme }, element)));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

describe("FormGroup accessibility contract", () => {
  it("associates its label, tip, and error with a single form control", () => {
    render(
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

    const label = host.querySelector("label");
    const input = host.querySelector("input");
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
  });

  it("shows the same tip visually when a keyboard user focuses the control", () => {
    render(
      createElement(
        FormGroup,
        { label: "실제 종료 시점", tip: "후속 작업에 영향을 줍니다." },
        createElement(Input, { value: "", onChange: () => undefined })
      )
    );

    const input = host.querySelector("input");
    act(() => input?.focus());

    expect(document.querySelector(".form-tip-text--portal")?.textContent).toBe(
      "후속 작업에 영향을 줍니다."
    );
  });

  it("names a composite radio group from the FormGroup label", () => {
    render(
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

    const label = host.querySelector("label");
    const radioGroup = host.querySelector('[role="radiogroup"]');
    expect(radioGroup?.getAttribute("aria-labelledby")).toBe(label?.id);
    expect(radioGroup?.getAttribute("aria-describedby")).toBeTruthy();
  });
});
