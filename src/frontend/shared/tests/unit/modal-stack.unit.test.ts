/** @vitest-environment happy-dom */

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/modal";
import { isTopModal, pushModal, removeModal, resetModalStack } from "../../src/components/modal-stack";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => act(() => callback(0)));
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  rendered?.unmount();
  rendered = null;
  document.body.replaceChildren();
  resetModalStack();
  vi.unstubAllGlobals();
});

function pressEscape() {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
}

/** Mantine ModalBaseOverlay 는 click 에서 closeOnClickOutside 일 때 onClose 를 부른다. */
function clickOutside() {
  const overlay = document.querySelector<HTMLElement>(".mantine-Modal-overlay")!;
  act(() => {
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function stackOf(onCloseLower: () => void, onCloseUpper: () => void, closeOnClickOutside?: boolean) {
  return createElement(
    "div",
    null,
    createElement(Modal, { open: true, onClose: onCloseLower, title: "아래" }, createElement("button", { type: "button" }, "아래 버튼")),
    createElement(
      Modal,
      { open: true, onClose: onCloseUpper, title: "위", closeOnClickOutside },
      createElement("button", { type: "button" }, "위 버튼"),
    ),
  );
}

describe("modal-stack 순서표", () => {
  it("맨 뒤 id 만 맨 위이고 빼면 앞 id 가 맨 위가 된다", () => {
    pushModal("a");
    pushModal("b");
    expect(isTopModal("a")).toBe(false);
    expect(isTopModal("b")).toBe(true);
    removeModal("b");
    expect(isTopModal("a")).toBe(true);
  });
});

describe("겹친 Modal", () => {
  it("Esc 한 번에 맨 위 모달만 onClose 를 부른다", () => {
    const lower = vi.fn();
    const upper = vi.fn();
    rendered = renderWithMantine(stackOf(lower, upper));
    pressEscape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it("위 모달이 먼저 닫혀 React 가 갱신돼도 같은 Esc 로 아래 모달은 닫히지 않는다", () => {
    const lower = vi.fn();
    const tree = (upperOpen: boolean, upperClose: () => void) =>
      createElement(
        "div",
        null,
        // 위 모달을 트리에서 앞에 둔다: 마운트가 먼저라 Esc 리스너 순서가 위 → 아래가 된다. 열림 순서는 아래 → 위.
        createElement(Modal, { open: upperOpen, onClose: upperClose, title: "위" }, createElement("button", { type: "button" }, "위 버튼")),
        createElement(Modal, { open: true, onClose: lower, title: "아래" }, createElement("button", { type: "button" }, "아래 버튼")),
      );
    // 브라우저는 리스너 사이에 React 갱신을 처리한다: 위 모달이 닫혀 순서표에서 빠진 상태를 아래 리스너가 보게 만든다.
    const upper = vi.fn(() => {
      (globalThis as unknown as { __dkOasisModalStack: { ids: string[] } }).__dkOasisModalStack.ids.pop();
    });
    rendered = renderWithMantine(tree(false, upper));
    rerender(rendered, tree(true, upper));
    pressEscape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it("모달이 하나뿐이면 Esc 가 onClose 를 부른다", () => {
    const only = vi.fn();
    rendered = renderWithMantine(
      createElement(Modal, { open: true, onClose: only, title: "하나" }, createElement("button", { type: "button" }, "버튼")),
    );
    pressEscape();
    expect(only).toHaveBeenCalledTimes(1);
  });

  it("closeOnClickOutside=false 면 오버레이를 눌러도 닫히지 않고, 기본값은 닫는다", () => {
    const keep = vi.fn();
    rendered = renderWithMantine(
      createElement(Modal, { open: true, onClose: keep, title: "유지", closeOnClickOutside: false }, createElement("span", null, "본문")),
    );
    clickOutside();
    expect(keep).not.toHaveBeenCalled();
    rendered.unmount();
    document.body.replaceChildren();

    const close = vi.fn();
    rendered = renderWithMantine(
      createElement(Modal, { open: true, onClose: close, title: "닫힘" }, createElement("span", null, "본문")),
    );
    clickOutside();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
