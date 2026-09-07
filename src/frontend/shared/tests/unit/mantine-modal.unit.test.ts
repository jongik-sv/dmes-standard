/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageModal, Modal } from "../../src/components/modal";
import { ErrorModal } from "../../src/layout/ErrorModal";
import { renderWithMantine } from "./mantine-test-utils";

describe("Modal (Mantine 구현) 계약", () => {
  it("open 시 role=dialog 와 e2e 클래스(cm-modal, cm-modal-overlay) 를 렌더한다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", onClose: () => {} }, "본문"));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.querySelector(".cm-modal")).not.toBeNull();
    expect(document.querySelector(".cm-modal-overlay")).not.toBeNull();
    expect(document.body.textContent).toContain("본문");
    r.unmount();
  });

  it("open=false 면 dialog 가 없다", () => {
    const r = renderWithMantine(createElement(Modal, { open: false, title: "T" }, "본문"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    r.unmount();
  });

  it("MessageModal confirm 은 확인/취소 버튼과 cm-message-modal-overlay 를 렌더하고 onConfirm 을 호출한다", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const r = renderWithMantine(createElement(MessageModal, { open: true, alertType: "confirm", message: "계속?", onConfirm, onClose }));
    expect(document.querySelector(".cm-message-modal-overlay")).not.toBeNull();
    const buttons = Array.from(document.querySelectorAll('[role="dialog"] button')).filter((b) => b.textContent?.trim());
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(expect.arrayContaining(["확인", "취소"]));
    act(() => (buttons.find((b) => b.textContent?.trim() === "확인") as HTMLButtonElement).click());
    expect(onConfirm).toHaveBeenCalled();
    r.unmount();
  });

  it("ErrorModal 은 message 가 있을 때만 '오류' 제목으로 열린다", () => {
    const r = renderWithMantine(createElement(ErrorModal, { message: "실패", onClose: () => {} }));
    expect(document.body.textContent).toContain("오류");
    expect(document.body.textContent).toContain("실패");
    r.unmount();
    const r2 = renderWithMantine(createElement(ErrorModal, { message: null, onClose: () => {} }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    r2.unmount();
  });
});
