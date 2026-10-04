/** @vitest-environment happy-dom */

// GridLimitNotice(첫 조회 상한 안내) — 잘렸을 때만 문구·[전체 보기] 를 그리고, 누르면 onShowAll, disabled·testId, 공통 토큰 스타일.
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridLimitNotice, gridLimitNoticeText, type GridLimitNoticeProps } from "../../src/components/grid";
import { GRID_LIMIT_NOTICE_CSS } from "../../src/components/grid/GridLimitNotice";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

function render(props: GridLimitNoticeProps) {
  r = renderWithMantine(createElement(GridLimitNotice, props));
  const host = r.host;
  return {
    notice: (testId = "grid-limit-notice") => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`),
    button: (testId = "grid-limit-notice-show-all") => host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`),
    host,
  };
}

describe("GridLimitNotice", () => {
  it("잘렸으면 「전체 N건 중 M건」 문구(천 단위 쉼표)와 [전체 보기] 단추를 그린다", () => {
    const { notice, button } = render({ shownCount: 1000, totalCount: 7858, onShowAll: vi.fn() });
    expect(notice()!.textContent).toContain("전체 7,858건 중 1,000건을 표시합니다. 조건을 좁히거나 [전체 보기]를 누르세요.");
    expect(notice()!.getAttribute("role")).toBe("status");
    expect(button()!.textContent).toBe("전체 보기");
    expect(button()!.classList.contains("form-button-mini")).toBe(true);
  });

  it("잘리지 않았거나 전체 건수가 없으면 아무것도 그리지 않는다", () => {
    expect(render({ shownCount: 3, totalCount: 3, onShowAll: vi.fn() }).notice()).toBeNull();
    r?.unmount();
    expect(render({ shownCount: 3, totalCount: null, onShowAll: vi.fn() }).notice()).toBeNull();
    r?.unmount();
    expect(render({ shownCount: 3, onShowAll: vi.fn() }).notice()).toBeNull();
  });

  it("[전체 보기] 를 누르면 onShowAll, disabled 면 누를 수 없다", () => {
    const onShowAll = vi.fn();
    const { button } = render({ shownCount: 2, totalCount: 5, onShowAll });
    act(() => button()!.click());
    expect(onShowAll).toHaveBeenCalledTimes(1);
    r?.unmount();
    const off = render({ shownCount: 2, totalCount: 5, onShowAll, disabled: true });
    expect(off.button()!.disabled).toBe(true);
  });

  it("testId 를 바꾸면 안내 줄과 단추 id 가 함께 바뀐다", () => {
    const { notice, button } = render({ shownCount: 1, totalCount: 2, onShowAll: vi.fn(), testId: "term-limit" });
    expect(notice("term-limit")).not.toBeNull();
    expect(button("term-limit-show-all")).not.toBeNull();
  });

  it("문구 함수와 스타일 — 공통 토큰만 쓴다", () => {
    expect(gridLimitNoticeText(1000, 8155)).toBe("전체 8,155건 중 1,000건을 표시합니다. 조건을 좁히거나 [전체 보기]를 누르세요.");
    expect(GRID_LIMIT_NOTICE_CSS).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(GRID_LIMIT_NOTICE_CSS).toContain("var(--color-warning)");
  });
});
