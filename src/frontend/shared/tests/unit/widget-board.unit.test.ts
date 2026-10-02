/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetBoard } from "../../src/widget";
import type { WidgetItem, WidgetRegistry } from "../../src/widget";

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

const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "가 본문") }) },
  "t.b": { meta: { id: "t.b", title: "나", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "나 본문") }) },
};
const it_ = (instId: string, widgetId: string, x: number, y: number, extra: Partial<WidgetItem> = {}): WidgetItem => ({
  instId, widgetId, x, y, w: 6, h: 6, locked: false, config: null, ...extra,
});
const ITEMS = [it_("a", "t.a", 0, 0), it_("b", "t.b", 6, 0), it_("g", "gone.x", 12, 0)];

function render(props: Partial<Parameters<typeof WidgetBoard>[0]> = {}) {
  const onChange = vi.fn();
  const onWideChange = vi.fn();
  act(() =>
    root.render(
      h(WidgetBoard, { items: ITEMS, registry: REG, editing: false, tabLocked: false, onChange, onWideChange, width: 1440, ...props })
    )
  );
  return { onChange, onWideChange };
}
const titles = () => [...host.querySelectorAll(".cm-widget__title")].map((e) => e.textContent);

describe("WidgetBoard", () => {
  it("보기 모드에서는 등록부에 없는 위젯을 그리지 않고 손잡이가 없다", () => {
    render();
    expect(titles()).toEqual(["가", "나"]);
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("편집 모드에서는 없는 위젯 칸과 8방향 손잡이가 보인다", () => {
    render({ editing: true });
    expect(titles()).toContain("없는 위젯");
    const first = host.querySelector(".react-grid-item")!;
    expect(first.querySelectorAll(".react-resizable-handle")).toHaveLength(8);
  });

  it("잠긴 위젯은 편집 모드에서도 손잡이가 없다", () => {
    render({ editing: true, items: [it_("a", "t.a", 0, 0, { locked: true })] });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("잠긴 탭이면 편집 모드여도 손잡이가 없다", () => {
    render({ editing: true, tabLocked: true });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
  });

  it("좁은 폭이면 편집 모드여도 손잡이가 없고 onWideChange(false) 를 알린다", () => {
    const { onWideChange } = render({ editing: true, width: 900 });
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
    expect(onWideChange).toHaveBeenLastCalledWith(false);
  });

  it("cols 를 넘기면 보드 자기 폭이 작아도 그 칸 수를 쓴다", () => {
    render({ editing: true, width: 820, cols: 24 });
    expect(host.querySelector(".cm-widget-board")!.getAttribute("data-cols")).toBe("24");
    expect(host.querySelector(".react-resizable-handle")).not.toBeNull();
  });

  it("✕ 로 빼면 onChange 로 뺀 배치를 알린다", async () => {
    const { onChange } = render({ editing: true });
    const remove = host.querySelector('.cm-widget[data-inst-id="a"] [data-action="remove"]') as HTMLButtonElement;
    act(() => remove.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((i: WidgetItem) => i.instId)).toEqual(["b", "g"]);
  });

  it("잠금 버튼은 onChange 로 잠금을 뒤집어 알린다", () => {
    const { onChange } = render({ editing: true });
    act(() => (host.querySelector('.cm-widget[data-inst-id="b"] [data-action="lock"]') as HTMLButtonElement).click());
    expect(onChange.mock.calls[0][0].find((i: WidgetItem) => i.instId === "b").locked).toBe(true);
  });

  it("제목 줄 → 키는 한 칸 옮긴 배치를 알린다", () => {
    const { onChange } = render({ editing: true });
    const head = host.querySelector('.cm-widget[data-inst-id="a"] .cm-widget__head') as HTMLElement;
    act(() => head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(onChange.mock.calls[0][0].find((i: WidgetItem) => i.instId === "a").x).toBe(1);
  });
});
