/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ErrorModal } from "../../src/layout/ErrorModal";
import { renderWithMantine } from "./mantine-test-utils";

// ErrorModal 본문이 메시지의 줄바꿈(\n)을 한 줄로 합쳐 보이던 문제(MessageModal 은 .cm-message-text 로 이미 나눈다).
describe("ErrorModal 줄바꿈", () => {
  it("page-layout.css 가 .error-modal__body p 에 white-space: pre-line 을 둔다", () => {
    const css = readFileSync(resolve(__dirname, "../../src/layout/page-layout.css"), "utf8");
    expect(css).toMatch(/\.error-modal__body p\s*\{[^}]*white-space:\s*pre-line;[^}]*\}/);
  });

  it("메시지의 \\n 을 <p> 텍스트에 그대로 담는다", () => {
    const r = renderWithMantine(createElement(ErrorModal, { message: "기본\n- 항목: 메시지", onClose: () => {} }));
    const p = document.querySelector(".error-modal__body p");
    expect(p?.textContent).toBe("기본\n- 항목: 메시지");
    r.unmount();
  });
});
