/** @vitest-environment happy-dom */

// GridExcelFoot(표 아래 줄) — 왼쪽 안내 글·오른쪽 [엑셀] 단추 모습, 누르면 onExcel, disabled 면 누를 수 없다, testId 기본값·바꾸기, 공통 토큰 스타일.
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridExcelFoot, type GridExcelFootProps } from "../../src/components/grid";
import { GRID_FOOT_CSS } from "../../src/components/grid/GridExcelFoot";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let r: Rendered | null = null;

afterEach(() => {
  r?.unmount();
  r = null;
});

function render(props: GridExcelFootProps) {
  r = renderWithMantine(createElement(GridExcelFoot, props));
  const host = r.host;
  return {
    foot: host.querySelector<HTMLElement>('[data-testid="grid-foot"]')!,
    note: host.querySelector<HTMLElement>('[data-testid="grid-foot-note"]')!,
    button: (testId = "wq-excel") => host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`),
    host,
  };
}

describe("GridExcelFoot — 모습", () => {
  it("왼쪽에 안내 글(.cm-grid-foot__note), 오른쪽에 아이콘과 「엑셀」 단추를 .cm-grid-foot 안에 그린다", () => {
    const { foot, note, button } = render({ note: "1,234건", onExcel: vi.fn() });
    expect(foot.className).toBe("cm-grid-foot");
    expect(note.className).toBe("cm-grid-foot__note");
    expect(note.textContent).toBe("1,234건");

    const btn = button()!;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toBe("엑셀");
    expect(btn.title).toBe("보이는 행을 엑셀로 내려받기");
    expect(btn.classList.contains("form-button-mini")).toBe(true);
    expect(btn.querySelector("svg")).not.toBeNull();

    // 안내 글이 단추보다 앞(왼쪽)이고, 둘이 줄의 전부다
    expect(foot.children).toHaveLength(2);
    expect(foot.firstElementChild).toBe(note);
    expect(foot.lastElementChild).toBe(btn);
  });

  it("스타일은 컴포넌트가 직접 넣는다 — cm-grid-foot href 의 <style> 하나, 아래 줄이 높이를 키우지 않는다(flex: none)", () => {
    const { host } = render({ note: "3행", onExcel: vi.fn() });
    const styles = [...document.querySelectorAll("style")].filter((s) => s.textContent?.includes(".cm-grid-foot"));
    expect(styles.length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector(".cm-grid-foot")).not.toBeNull();
    expect(GRID_FOOT_CSS).toMatch(/\.cm-grid-foot \{[^}]*flex: none;/);
    expect(GRID_FOOT_CSS).toMatch(/\.cm-grid-foot \{[^}]*border-top: 1px solid var\(--color-border-light\)/);
    expect(GRID_FOOT_CSS).toMatch(/\.cm-grid-foot__note \{[^}]*text-overflow: ellipsis/);
  });

  it("색·간격은 공통 토큰만 쓴다(16진수 색 없음)", () => {
    expect(GRID_FOOT_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(GRID_FOOT_CSS).toContain("var(--spacing-sm)");
    expect(GRID_FOOT_CSS).toContain("var(--font-size-xs)");
    expect(GRID_FOOT_CSS).toContain("var(--color-text-muted)");
  });
});

describe("GridExcelFoot — 동작", () => {
  it("[엑셀]을 누르면 onExcel 이 한 번 불린다", () => {
    const onExcel = vi.fn();
    const { button } = render({ note: "3행", onExcel });
    expect(button()!.disabled).toBe(false);
    act(() => button()!.click());
    expect(onExcel).toHaveBeenCalledTimes(1);
  });

  it("disabled 면 단추가 비활성이고 눌러도 onExcel 이 불리지 않는다", () => {
    const onExcel = vi.fn();
    const { button } = render({ note: "0건", onExcel, disabled: true });
    expect(button()!.disabled).toBe(true);
    act(() => button()!.click());
    expect(onExcel).not.toHaveBeenCalled();
  });
});

describe("GridExcelFoot — testId", () => {
  it("단추의 data-testid 기본값은 wq-excel", () => {
    const { button } = render({ note: "1건", onExcel: vi.fn() });
    expect(button()).not.toBeNull();
  });

  it("testId 로 바꾸면 그 값이 단추에 붙고 기본값은 사라진다", () => {
    const { button } = render({ note: "1건", onExcel: vi.fn(), testId: "my-excel" });
    expect(button("my-excel")).not.toBeNull();
    expect(button()).toBeNull();
  });
});
