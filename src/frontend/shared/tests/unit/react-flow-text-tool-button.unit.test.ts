/** @vitest-environment happy-dom */
// 툴바 글자 단추 — 켜짐 title, 꺼짐 이유(span title + aria-describedby + 보이지 않는 글), 토글·메뉴 ARIA, 누르기.
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TextToolButton, type TextToolButtonProps } from "../../src/components/react-flow/TextToolButton";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
});
function mount(props: Partial<TextToolButtonProps> = {}) {
  r = renderWithMantine(createElement(TextToolButton, { label: "표 추가", testId: "t", ...props }));
  const btn = document.querySelector('[data-testid="t"]') as HTMLButtonElement;
  const reason = document.querySelector('[data-testid="t-reason"]') as HTMLElement | null;
  return { btn, reason, wrap: btn.parentElement as HTMLElement };
}

describe("TextToolButton", () => {
  it("켜진 단추는 단추 title 에 tip 을 달고 이유 글이 없다", () => {
    const { btn, reason, wrap } = mount({ tip: "표 추가 (2)" });
    expect(btn.textContent).toBe("표 추가");
    expect(btn.getAttribute("title")).toBe("표 추가 (2)");
    expect(btn.hasAttribute("aria-describedby")).toBe(false);
    expect(wrap.hasAttribute("title")).toBe(false);
    expect(reason).toBeNull();
  });

  it("tip 이 없으면 label 이 title 이다", () => {
    expect(mount().btn.getAttribute("title")).toBe("표 추가");
  });

  it("꺼진 단추는 감싼 span title + aria-describedby 가 가리키는 이유 글을 둔다", () => {
    const { btn, reason, wrap } = mount({ tip: "표 추가 — 권한 없음", disabled: true, className: "wrap-x" });
    expect(btn.disabled).toBe(true);
    expect(btn.hasAttribute("title")).toBe(false);
    expect(wrap.getAttribute("title")).toBe("표 추가 — 권한 없음");
    expect(wrap.className).toBe("wrap-x");
    expect(reason?.textContent).toBe("표 추가 — 권한 없음");
    expect(btn.getAttribute("aria-describedby")).toBe(reason?.id);
    expect(reason?.id).toBeTruthy();
  });

  it("토글 도구는 aria-pressed 를 단다", () => {
    expect(mount({ pressed: true }).btn.getAttribute("aria-pressed")).toBe("true");
    r?.unmount();
    expect(mount({ pressed: false }).btn.getAttribute("aria-pressed")).toBe("false");
    r?.unmount();
    expect(mount().btn.hasAttribute("aria-pressed")).toBe(false);
  });

  it("메뉴 단추는 aria-haspopup·aria-expanded 를 달고 aria-pressed 는 달지 않는다", () => {
    const closed = mount({ menu: true, open: false, pressed: true });
    expect(closed.btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(closed.btn.getAttribute("aria-expanded")).toBe("false");
    expect(closed.btn.hasAttribute("aria-pressed")).toBe(false);
    r?.unmount();
    expect(mount({ menu: true, open: true }).btn.getAttribute("aria-expanded")).toBe("true");
    r?.unmount();
    expect(mount().btn.hasAttribute("aria-haspopup")).toBe(false);
  });

  it("누르면 onClick 을 부르고, 꺼지면 부르지 않는다", () => {
    const onClick = vi.fn();
    const on = mount({ onClick });
    act(() => on.btn.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    r?.unmount();
    const off = mount({ onClick, disabled: true });
    act(() => off.btn.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
