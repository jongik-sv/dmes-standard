/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageModal } from "../../src/components/modal";
import { ErrorModal } from "../../src/layout/ErrorModal";
import { renderWithMantine } from "./mantine-test-utils";

// 오류 메시지를 문의·보고용으로 복사할 수 있어야 한다(2026-09-28 요청). 확인 버튼의 첫 초점·e2e 셀렉터는 그대로다.
function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).filter((b) => b.textContent?.trim());
}

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  return writeText;
}

describe("오류 메시지 복사", () => {
  it("MessageModal error 는 복사 버튼을 [확인] 뒤에 두고, 누르면 제목·메시지를 복사한다", async () => {
    const writeText = stubClipboard();
    const r = renderWithMantine(
      createElement(MessageModal, { open: true, alertType: "error", title: "오류", message: "담당자 역할이 있어야 할 수 있습니다", onClose: () => {} }),
    );
    const names = buttons().map((b) => b.textContent?.trim());
    expect(names).toEqual(["확인", "복사"]);
    await act(async () => buttons()[1].click());
    expect(writeText).toHaveBeenCalledWith("오류\n담당자 역할이 있어야 할 수 있습니다");
    expect(buttons()[1].textContent?.trim()).toBe("복사됨");
    r.unmount();
  });

  it("MessageModal info·confirm 에는 복사 버튼이 없다", () => {
    const r = renderWithMantine(createElement(MessageModal, { open: true, alertType: "info", message: "저장했습니다", onClose: () => {} }));
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(["확인"]);
    r.unmount();
  });

  it("ErrorModal 도 복사 버튼을 둔다", async () => {
    const writeText = stubClipboard();
    const r = renderWithMantine(createElement(ErrorModal, { message: "HTTP 500", onClose: () => {} }));
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(["확인", "복사"]);
    await act(async () => buttons()[1].click());
    expect(writeText).toHaveBeenCalledWith("오류\nHTTP 500");
    r.unmount();
  });
});
