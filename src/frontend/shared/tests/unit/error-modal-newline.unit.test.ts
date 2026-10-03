/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ErrorModal } from "../../src/layout/ErrorModal";
import { renderWithMantine } from "./mantine-test-utils";

// ErrorModal 본문이 메시지의 줄바꿈(\n)을 한 줄로 합쳐 보이던 문제(MessageModal 은 .cm-message-text 로 이미 나눈다).
describe("ErrorModal 줄바꿈", () => {
  // 포털은 shared 의 page-layout.css 를 싣지 않고 m-mcm/app/globals.css 가 @import 하는 사본을 렌더한다.
  // 두 파일을 함께 검사해 사본 동기화가 빠지면 실패하게 한다.
  it.each([
    ["shared/src/layout/page-layout.css", "../../src/layout/page-layout.css"],
    ["m-mcm/app/page-layout.css (포털에서 실제 렌더되는 사본)", "../../../m-mcm/app/page-layout.css"],
  ])("%s 가 .error-modal__body p 에 white-space: pre-line 을 둔다", (_name, rel) => {
    const css = readFileSync(resolve(__dirname, rel), "utf8");
    expect(css).toMatch(/\.error-modal__body p\s*\{[^}]*white-space:\s*pre-line;[^}]*\}/);
  });

  // DOM 이 바뀌지 않았음을 보이는 확인일 뿐, 줄바꿈 표시는 위 CSS 규칙이 맡는다.
  it("메시지의 \\n 을 <p> 텍스트에 그대로 담는다(DOM 불변 확인)", () => {
    const r = renderWithMantine(createElement(ErrorModal, { message: "기본\n- 항목: 메시지", onClose: () => {} }));
    const p = document.querySelector(".error-modal__body p");
    expect(p?.textContent).toBe("기본\n- 항목: 메시지");
    r.unmount();
  });
});
