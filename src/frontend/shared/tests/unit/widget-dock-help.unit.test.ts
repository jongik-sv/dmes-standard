/** @vitest-environment happy-dom */
/**
 * 「?」 도움말 단추가 업무 화면 도구 창(WidgetDockLayer → FloatingWindow 안 WidgetFrame)에서도 보이고 문서를 여는지 확인한다.
 * 도구 창 틀은 제목을 숨기지만(hideTitle) 머리의 단추는 그대로 그려진다.
 */
import { act, createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame } from "../../src/widget";
import type { WidgetRegistry, WidgetRegistryEntry } from "../../src/widget";
import { WidgetDockLayer, type DockWindow } from "../../src/widget-dock";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let rendered: Rendered | null = null;
afterEach(() => {
  rendered?.unmount();
  rendered = null;
  document.body.innerHTML = "";
});

const load = vi.fn(async () => "# 제목\n\n## 1. 첫 절\n\n도구 창 도움말 본문");
const withHelp: WidgetRegistryEntry = {
  meta: { id: "def.calc", title: "계산기", defaultSize: { w: 6, h: 8 }, floatable: true, help: { title: "도구 창 도움말", loadMarkdown: load } },
  load: async () => ({ default: () => h("p", { "data-testid": "body" }, "본문") }),
};
const noHelp: WidgetRegistryEntry = {
  meta: { id: "def.memo", title: "메모", defaultSize: { w: 6, h: 8 }, floatable: true },
  load: async () => ({ default: () => h("p", null, "메모") }),
};
const registry: WidgetRegistry = { "def.calc": withHelp, "def.memo": noHelp };
const windows: DockWindow[] = [
  { id: "a", widgetId: "def.calc", x: 10, y: 20, w: 300, h: 240, collapsed: false, z: 1 },
  { id: "b", widgetId: "def.memo", x: 40, y: 60, w: 300, h: 240, collapsed: false, z: 2 },
];
const handlers = { onMove: vi.fn(), onResize: vi.fn(), onToggleCollapse: vi.fn(), onClose: vi.fn(), onFocus: vi.fn() };

async function until(cond: () => boolean) {
  for (let i = 0; i < 250 && !cond(); i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const win = (id: string) => document.querySelector(`[data-testid="widget-dock-window-${id}"]`)!;

describe("도구 창(도크)의 「?」 도움말", () => {
  it("help 가 있는 위젯의 창에만 단추가 있고, 누르면 문서 모달이 열린다", async () => {
    rendered = renderWithMantine(h(WidgetDockLayer, { windows, registry, frame: WidgetFrame, viewport: { width: 1200, height: 800 }, ...handlers }));
    await until(() => win("a").querySelector('[data-testid="body"]') !== null && win("b").textContent!.includes("메모"));
    // 창 막대 제목은 보이고 틀 제목은 숨겨져 있어도 단추는 머리에 있다.
    expect(win("a").querySelector('[data-action="help"]')).not.toBeNull();
    expect(win("b").querySelector('[data-action="help"]')).toBeNull();
    expect(load).not.toHaveBeenCalled();

    act(() => (win("a").querySelector('[data-action="help"]') as HTMLButtonElement).click());
    await until(() => document.querySelector('[data-testid="widget-help-doc"]') !== null);
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="widget-help-doc"]')?.textContent).toContain("도구 창 도움말 본문");
    // 모달 제목은 meta.help.title.
    expect(document.body.textContent).toContain("도구 창 도움말");
    // 도구 창은 모달을 연 일로 닫히지 않는다.
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("접어 둔 창도 틀을 그대로 그리므로 펼치면 단추가 있다", async () => {
    const collapsed: DockWindow[] = [{ ...windows[0], collapsed: true }];
    rendered = renderWithMantine(h(WidgetDockLayer, { windows: collapsed, registry, frame: WidgetFrame, viewport: { width: 1200, height: 800 }, ...handlers }));
    await until(() => win("a") !== null && win("a").querySelector('[data-action="help"]') !== null);
    expect(win("a").querySelector('[data-action="help"]')).not.toBeNull();
  });
});
