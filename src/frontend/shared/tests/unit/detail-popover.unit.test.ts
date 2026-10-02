/** @vitest-environment happy-dom */

// 큰 상세 팝오버(shared detail-popover) — 여닫기(트리거·닫기·Esc·바깥 누름), 지연 마운트, 이벤트 전파 차단(그리드 행 선택·머리 onClick),
// 모달 안에서 Esc 가 팝오버만 닫는지, 자리 계산.
import { act, createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "../../src/components/modal";
import {
  DetailPopover,
  computeDetailPopoverPosition,
  type DetailPopoverProps,
} from "../../src/components/detail-popover";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
  document.body.innerHTML = "";
});

function popover(props: Partial<DetailPopoverProps> = {}): ReactElement {
  return createElement(DetailPopover, {
    title: "컬럼 정보",
    content: createElement("p", { "data-testid": "dp-content" }, "본문"),
    ...props,
  });
}

const trigger = () => document.querySelector<HTMLButtonElement>('[data-testid="detail-popover-trigger"]')!;
const panel = () => document.querySelector<HTMLElement>('[data-testid="detail-popover-panel"]');

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function key(target: EventTarget, k: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}

describe("DetailPopover — 여닫기", () => {
  it("본문은 열기 전에는 마운트되지 않고, 트리거를 누르면 body 로 portal 된 패널이 열린다", () => {
    r = renderWithMantine(popover());
    expect(document.querySelector('[data-testid="dp-content"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    click(trigger());

    const p = panel();
    expect(p).not.toBeNull();
    expect(p!.parentElement).toBe(document.body);
    expect(p!.getAttribute("role")).toBe("dialog");
    expect(p!.textContent).toContain("컬럼 정보");
    expect(document.querySelector('[data-testid="dp-content"]')?.textContent).toBe("본문");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(p!.style.width).toBe("520px");
    expect(p!.style.maxHeight).not.toBe("");
  });

  it("트리거를 다시 누르면 닫힌다", () => {
    r = renderWithMantine(popover());
    click(trigger());
    click(trigger());
    expect(panel()).toBeNull();
  });

  it("닫기 단추로 닫힌다", () => {
    r = renderWithMantine(popover());
    click(trigger());
    click(document.querySelector('[data-testid="detail-popover-close"]')!);
    expect(panel()).toBeNull();
  });

  it("Esc 로 닫히고 포커스가 트리거로 돌아온다", () => {
    r = renderWithMantine(popover());
    click(trigger());
    key(panel()!, "Escape");
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("바깥을 누르면 닫히고, 패널 안을 누르면 열려 있다", () => {
    r = renderWithMantine(popover());
    click(trigger());
    click(document.querySelector('[data-testid="dp-content"]')!);
    expect(panel()).not.toBeNull();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    click(outside);
    expect(panel()).toBeNull();
  });

  it("children 이 있으면 그 글자가 트리거가 되고, 없으면 정보 아이콘이다", () => {
    r = renderWithMantine(popover({ children: "RMTL_COIL_THK", triggerLabel: "컬럼 정보 보기" }));
    expect(trigger().textContent).toBe("RMTL_COIL_THK");
    expect(trigger().className).toContain("cm-dpop-trigger--text");
    expect(trigger().getAttribute("aria-label")).toBe("컬럼 정보 보기");
    rerender(r, popover());
    expect(trigger().querySelector("svg")).not.toBeNull();
    expect(trigger().className).toContain("cm-dpop-trigger--icon");
  });

  it("제어 모드는 opened 를 따르고 onOpenChange 로 알린다", () => {
    const onOpenChange = vi.fn();
    r = renderWithMantine(popover({ opened: false, onOpenChange }));
    click(trigger());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(panel()).toBeNull();
    rerender(r, popover({ opened: true, onOpenChange }));
    expect(panel()).not.toBeNull();
  });

  it("disabled 면 열리지 않는다", () => {
    r = renderWithMantine(popover({ disabled: true }));
    click(trigger());
    expect(panel()).toBeNull();
  });
});

describe("DetailPopover — 이벤트 전파", () => {
  it("트리거·패널의 click·dblclick 은 네이티브 조상(그리드 행)에도 React 조상(머리 onClick)에도 가지 않는다", () => {
    const nativeClick = vi.fn();
    const nativeDbl = vi.fn();
    const reactClick = vi.fn();
    const reactDbl = vi.fn();
    r = renderWithMantine(
      createElement(
        "div",
        { "data-testid": "row", onClick: reactClick, onDoubleClick: reactDbl },
        popover()
      )
    );
    const row = document.querySelector('[data-testid="row"]')!;
    row.addEventListener("click", nativeClick);
    row.addEventListener("dblclick", nativeDbl);

    click(trigger());
    act(() => {
      trigger().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(panel()).not.toBeNull();

    const body = document.querySelector('[data-testid="dp-content"]')!;
    click(body);
    act(() => {
      body.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(nativeClick).not.toHaveBeenCalled();
    expect(nativeDbl).not.toHaveBeenCalled();
    expect(reactClick).not.toHaveBeenCalled();
    expect(reactDbl).not.toHaveBeenCalled();
  });

  it("트리거의 Enter 키는 조상(그리드 편집 시작)으로 가지 않는다", () => {
    const nativeKey = vi.fn();
    r = renderWithMantine(createElement("div", { "data-testid": "row" }, popover()));
    document.querySelector('[data-testid="row"]')!.addEventListener("keydown", nativeKey);
    key(trigger(), "Enter");
    expect(nativeKey).not.toHaveBeenCalled();
  });
});

describe("DetailPopover — 모달 안", () => {
  it("Esc 는 팝오버만 닫고 모달은 닫지 않는다", () => {
    const onClose = vi.fn();
    r = renderWithMantine(createElement(Modal, { open: true, title: "모달", onClose }, popover()));
    click(trigger());
    expect(panel()).not.toBeNull();
    key(panel()!, "Escape");
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("패널 안 단추에 포커스가 있어도 Esc 는 모달을 닫지 않고, 팝오버가 닫힌 뒤의 Esc 는 모달을 닫는다", () => {
    const onClose = vi.fn();
    r = renderWithMantine(createElement(Modal, { open: true, title: "모달", onClose }, popover()));
    click(trigger());
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-testid="detail-popover-close"]')!;
    act(() => closeBtn.focus());
    key(closeBtn, "Escape");
    expect(panel()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    key(trigger(), "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("computeDetailPopoverPosition", () => {
  const viewport = { width: 1200, height: 800 };
  const size = { width: 520, maxHeight: 560 };

  it("공간이 있으면 트리거 아래에 놓는다", () => {
    const p = computeDetailPopoverPosition({ left: 100, top: 100, bottom: 120 }, viewport, size);
    expect(p.top).toBe(124);
    expect(p.bottom).toBeUndefined();
    expect(p.left).toBe(100);
    expect(p.width).toBe(520);
    expect(p.maxHeight).toBe(560);
  });

  it("아래가 좁고 위가 넓으면 위에 놓는다", () => {
    const p = computeDetailPopoverPosition({ left: 100, top: 700, bottom: 720 }, viewport, size);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(800 - 700 + 4);
    expect(p.maxHeight).toBe(560);
  });

  it("오른쪽 끝에서는 화면 안으로 당기고, 좁은 화면에서는 폭을 줄인다", () => {
    expect(computeDetailPopoverPosition({ left: 1100, top: 10, bottom: 30 }, viewport, size).left).toBe(1200 - 520 - 8);
    const narrow = computeDetailPopoverPosition({ left: 50, top: 10, bottom: 30 }, { width: 400, height: 800 }, size);
    expect(narrow.width).toBe(384);
    expect(narrow.left).toBe(8);
  });
});
