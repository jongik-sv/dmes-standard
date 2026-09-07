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
    // fix round 1 §3(team-lead 실측): `.cm-modal` 은 `.mantine-Modal-content` 에만 붙어야 한다.
    // `.mantine-Modal-inner`(flex 부모)에도 붙으면 그 요소의 flex-direction 이 column 이 돼
    // Modal 폭이 붕괴한다(LookupModal md 실측 325px, 정상 600px).
    expect(document.querySelector(".mantine-Modal-content")?.classList.contains("cm-modal")).toBe(
      true
    );
    expect(document.querySelector(".mantine-Modal-inner")?.classList.contains("cm-modal")).toBe(
      false
    );
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

  // 계획 Global Constraints: e2e 가 쓰는 shared 클래스는 "같은 역할의 요소" 에 남아야 한다.
  // 클래스 문자열의 존재만 보면 통과하지만, overlay 가 dialog 를 감싸지 않으면
  // `overlay.locator(...)` 처럼 overlay 를 컨테이너로 삼는 e2e 셀렉터가 전부 0건이 된다.
  it("overlay 계열 클래스 요소는 role=dialog 와 확인 버튼을 자손으로 가진다", () => {
    const r = renderWithMantine(
      createElement(MessageModal, { open: true, alertType: "confirm", message: "계속?", onConfirm: () => {}, onClose: () => {} }),
    );
    const overlay = document.querySelector(".cm-modal-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector('[role="dialog"]')).not.toBeNull();
    // fix wave 2 §B1(실측): 부착 지점은 `inner` 여야 한다. `classNames.root` 는 dialog 를 자손으로
    // 갖지만 `position: static; height: 0` 이라 Playwright `toBeVisible()` 이 실패하고,
    // `M.Overlay` 는 보이지만 자손이 없다. `.first()` 가 집는 첫 매칭이 inner 여야 e2e 의
    // `expect(overlay).toBeVisible()` 과 `overlay.locator(...)` 가 함께 성립한다.
    expect(overlay!.classList.contains("mantine-Modal-inner")).toBe(true);
    const msgOverlay = document.querySelector(".cm-message-modal-overlay");
    expect(msgOverlay).not.toBeNull();
    const ok = Array.from(msgOverlay!.querySelectorAll("button")).find((b) => b.textContent?.trim() === "확인");
    expect(ok).toBeDefined();
    r.unmount();
  });

  // `.mantine-Modal-root` 는 닫힌 상태에서도 DOM 에 남는다(ModalBase 가 root Box 를 항상 렌더).
  // e2e 는 `.cm-message-modal-overlay` 의 count === 0 으로 닫힘을 판정하므로 클래스가 남으면 안 된다.
  it("open=false 면 overlay 계열 클래스가 DOM 에 남지 않는다", () => {
    const r = renderWithMantine(createElement(MessageModal, { open: false, alertType: "confirm", message: "계속?" }));
    expect(document.querySelector(".cm-modal-overlay")).toBeNull();
    expect(document.querySelector(".cm-message-modal-overlay")).toBeNull();
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
