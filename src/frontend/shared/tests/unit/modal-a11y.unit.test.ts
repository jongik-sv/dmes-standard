/** @vitest-environment happy-dom */

import { act, createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageModal, Modal } from "../../src/components/modal";
import { rerender as rerenderMantine, renderWithMantine, type Rendered } from "./mantine-test-utils";

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

// 렌더 하네스: Mantine 9 의 `Modal.Root` 는 `MantineProvider` 없이 렌더하면 예외를 던지므로
// (team-lead 공통 판정) 이 파일의 렌더 하네스만 공용 `mantine-test-utils` 의
// `renderWithMantine`/`rerender` 로 교체한다. 단언은 한 줄도 바꾸지 않는다. 같은 테스트 안에서
// `render()`를 두 번째 호출하는 경우(예: open→close 전환)는 새로 마운트하지 않고 기존 root 를
// 재렌더해야 하므로, 최초 호출인지 여부를 `rendered` 로 추적해 자동으로 분기한다.
let rendered: Rendered | null = null;

function render(element: ReactElement) {
  if (!rendered) {
    rendered = renderWithMantine(element);
  } else {
    rerenderMantine(rendered, element);
  }
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
  // 실제 keydown 은 항상 포커스를 가진 Element 를 target 으로 한다 — Mantine 의 Escape 핸들러가
  // `event.target?.getAttribute("data-mantine-stop-propagation")` 를 호출하므로(document 는
  // getAttribute 가 없어 TypeError), document 자체가 아니라 실제 포커스된 요소에 dispatch 한다
  // (team-lead 지시: modal.tsx 쪽 합성-경로 분기를 없애고 하네스에서 dispatch 대상을 고친다).
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  // Mantine `Transition`(모달 열림/닫힘 애니메이션)은 `requestAnimationFrame` 콜백 안에서
  // `ReactDOM.flushSync`를 호출한다(use-transition.mjs). 예전엔 이 콜백을 동기로 즉시 실행하는
  // 스텁을 썼는데, 그러면 그 rAF 호출이 React 자신의 effect-flush 호출 스택 "안"에서 재진입하며
  // flushSync 를 부르게 되어 "flushSync was called from inside a lifecycle method" 경고가 났다.
  // (이 하네스의 어떤 assertion 도 이 Transition 완료 시점에 의존하지 않는다 — 초점 이동/복귀는
  // modal.tsx 의 자체 layout effect·ref 콜백이 React 커밋과 동기로 처리한다.) 그래서 콜백을
  // `queueMicrotask`로 미뤄, 현재 동기 호출 스택(= React 커밋/effect 플러시)이 완전히 빠져나간
  // 뒤에 실행되게 한다 — 이러면 더 이상 "lifecycle method 안"이 아니므로 경고가 사라진다.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    // 미뤄진 콜백이 React 상태를 바꾸므로(Transition 의 setStatus) act() 배치 밖에서 실행되면
    // "not wrapped in act(...)" 경고가 새로 생긴다 — 여기서 한 번 더 act() 로 감싸 방지한다.
    queueMicrotask(() => act(() => callback(0)));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
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
