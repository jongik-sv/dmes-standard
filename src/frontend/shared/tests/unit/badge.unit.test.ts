/** @vitest-environment happy-dom */

// 그리드 밖 배지(shared form Badge) — 의미 색·외곽선·고정폭 클래스, 속성 전달.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Badge, type BadgeProps } from "../../src/components/form";
import { BADGE_CSS } from "../../src/components/form/Badge";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: BadgeProps) {
  act(() => root.render(createElement(Badge, { testId: "b", ...props })));
  return host.querySelector<HTMLElement>('[data-testid="b"]')!;
}

describe("Badge", () => {
  it("기본은 회색(neutral) 옅은 배지다", () => {
    const el = render({ label: "일반" });
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("cm-badge cm-badge--neutral");
    expect(el.textContent).toBe("일반");
    expect(el.dataset.tone).toBe("neutral");
  });

  it.each(["primary", "success", "warning", "danger"] as const)(
    "tone=%s 는 같은 이름의 클래스를 단다",
    (tone) => {
      const el = render({ label: "가", tone });
      expect(el.classList.contains(`cm-badge--${tone}`)).toBe(true);
    }
  );

  it("outline·mono·title·className 을 반영한다", () => {
    const el = render({
      label: "HTML",
      variant: "outline",
      mono: true,
      title: "본문 형식",
      className: "x",
    });
    expect(el.className).toBe("cm-badge cm-badge--neutral cm-badge--outline cm-badge--mono x");
    expect(el.getAttribute("title")).toBe("본문 형식");
  });

  it("스타일은 의미 토큰만 쓴다(16진수·rgb 없음)", () => {
    expect(BADGE_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(BADGE_CSS).not.toMatch(/rgba?\(/);
    expect(BADGE_CSS).toContain("var(--color-danger-soft)");
  });
});
