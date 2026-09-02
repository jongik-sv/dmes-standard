/** @vitest-environment happy-dom */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageModal, Modal } from "../../src/components/modal";

interface ModalContractCase {
  name: string;
  render: (open: boolean, onClose: () => void) => ReactElement;
}

const modalContractCases: ModalContractCase[] = [
  {
    name: "Modal",
    render: (open, onClose) =>
      createElement(
        Modal,
        { open, onClose, title: "테스트", showCloseButton: false },
        createElement("button", { type: "button" }, "첫 번째"),
        createElement("button", { type: "button" }, "마지막")
      ),
  },
  {
    name: "MessageModal",
    render: (open, onClose) =>
      createElement(MessageModal, {
        open,
        onClose,
        onConfirm: vi.fn(),
        alertType: "confirm",
        message: "계속하시겠습니까?",
      }),
  },
];

let host: HTMLDivElement;
let root: Root;

function render(element: ReactElement) {
  act(() => {
    root.render(element);
  });
}

function getDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  if (!dialog) throw new Error("dialog가 렌더링되지 않았습니다.");
  return dialog;
}

function dispatchKey(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe.each(modalContractCases)("$name 공통 접근성 계약", ({ render: renderModal }) => {
  it("열리면 첫 focusable child로 초기 초점을 이동한다", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();

    render(renderModal(true, vi.fn()));

    expect(document.activeElement).toBe(getDialog().querySelectorAll("button")[0]);
  });

  it("마지막 요소에서 Tab을 누르면 첫 요소로 순환한다", () => {
    render(renderModal(true, vi.fn()));
    const buttons = getDialog().querySelectorAll("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();

    const event = dispatchKey("Tab");

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("첫 요소에서 Shift+Tab을 누르면 마지막 요소로 순환한다", () => {
    render(renderModal(true, vi.fn()));
    const buttons = getDialog().querySelectorAll("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    first.focus();

    const event = dispatchKey("Tab", true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("초점이 dialog 밖으로 이탈해도 Tab 방향에 맞춰 다시 포획한다", () => {
    const outside = document.createElement("button");
    document.body.prepend(outside);
    render(renderModal(true, vi.fn()));
    const buttons = getDialog().querySelectorAll("button");

    outside.focus();
    expect(dispatchKey("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);

    outside.focus();
    expect(dispatchKey("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("Escape를 누르면 onClose를 호출한다", () => {
    const onClose = vi.fn();
    render(renderModal(true, onClose));

    const event = dispatchKey("Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("닫히면 열리기 전 요소로 초점을 복귀시킨다", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();
    const onClose = vi.fn();
    render(renderModal(true, onClose));

    render(renderModal(false, onClose));

    expect(document.activeElement).toBe(opener);
  });
});

describe("Modal focusable child 없음 계약", () => {
  const renderModal = (open: boolean) =>
    createElement(
      Modal,
      { open, showCloseButton: false, title: "안내" },
      createElement("p", null, "초점을 받을 자식이 없습니다.")
    );

  it("열리면 dialog 자체에 초기 초점을 둔다", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();

    render(renderModal(true));

    expect(document.activeElement).toBe(getDialog());
  });

  it("Tab과 Shift+Tab 모두 dialog 자체에 초점을 유지한다", () => {
    render(renderModal(true));
    const dialog = getDialog();

    const tabEvent = dispatchKey("Tab");
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);

    const shiftTabEvent = dispatchKey("Tab", true);
    expect(shiftTabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });
});

describe("Modal accessible description contract", () => {
  it("connects the dialog to consumer-owned visible impact text", () => {
    render(
      createElement(
        Modal,
        {
          open: true,
          title: "Freeze 해제",
          descriptionId: "freeze-release-impact",
          showCloseButton: false,
        },
        createElement(
          "p",
          { id: "freeze-release-impact" },
          "해제 대상은 다음 재계산에서 일정이 바뀔 수 있습니다."
        )
      )
    );

    const dialog = getDialog();
    expect(dialog.getAttribute("aria-describedby")).toBe("freeze-release-impact");
    expect(document.getElementById("freeze-release-impact")?.textContent).toContain("일정이 바뀔");
  });
});
