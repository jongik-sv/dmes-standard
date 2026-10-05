/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetBoard, WidgetWorkspace } from "../../src/widget";
import type { WidgetBoardPreview, WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";

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

const entry = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  meta: { id, title, defaultSize: { w: 6, h: 6 }, ...extra },
  load: async () => ({ default: () => h("p", null, title) }),
});
const REG: WidgetRegistry = {
  "t.a": entry("t.a", "가"),
  "t.b": entry("t.b", "나", { category: "PROD" }),
  "t.once": entry("t.once", "하나만", { multiple: false, category: "COMMON" }),
};
const it_ = (instId: string, widgetId: string, x: number, y: number, w = 6, h = 6): WidgetItem => ({
  instId, widgetId, x, y, w, h, locked: false, config: null,
});

const previewEl = () => host.querySelector('[data-preview="true"]') as HTMLElement | null;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

describe("WidgetBoard preview", () => {
  const PREVIEW: WidgetBoardPreview = { meta: REG["t.b"].meta, x: 6, y: 0, w: 6, h: 6 };
  function render(props: Partial<Parameters<typeof WidgetBoard>[0]> = {}) {
    const onChange = vi.fn();
    act(() =>
      root.render(
        h(WidgetBoard, { items: [it_("a", "t.a", 0, 0)], registry: REG, editing: true, tabLocked: false, onChange, width: 1440, preview: PREVIEW, ...props })
      )
    );
    return { onChange };
  }

  it("편집 중이면 제목·크기·스켈레톤이 든 자리 표시를 그린다(aria-hidden, 손잡이 없음)", () => {
    render();
    const el = previewEl()!;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain("나");
    expect(el.textContent).toContain("6 × 6");
    expect(el.querySelectorAll(".cm-widget__skeleton i").length).toBeGreaterThan(0);
    expect(el.querySelector(".cm-widget__preview")!.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector(".react-resizable-handle")).toBeNull();
    expect(el.classList.contains("react-grid-item")).toBe(true);
    expect(el.classList.contains("static")).toBe(true);
  });

  it("preview 가 없으면 DOM 이 그대로다", () => {
    render({ preview: null });
    expect(previewEl()).toBeNull();
    expect(host.querySelectorAll(".react-grid-item")).toHaveLength(1);
  });

  it("보기 모드·잠긴 탭·좁은 화면에서는 그리지 않는다", () => {
    render({ editing: false });
    expect(previewEl()).toBeNull();
    render({ tabLocked: true });
    expect(previewEl()).toBeNull();
    render({ width: 900 });
    expect(previewEl()).toBeNull();
  });

  it("미리 보기는 위젯 이동 단추가 올리는 배치(onChange)에 섞이지 않는다", () => {
    const { onChange } = render({ items: [it_("a", "t.a", 0, 0), it_("b", "t.b", 12, 0)] });
    act(() => (host.querySelector('[data-inst-id="b"] [data-action="remove"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as WidgetItem[];
    expect(next.map((i) => i.instId)).toEqual(["a"]);
    expect(JSON.stringify(next)).not.toContain("__preview__");
  });
});

describe("WidgetWorkspace 미리 배치", () => {
  const HOME = (items: WidgetItem[]): WidgetTab[] => [{ tabId: "home", name: "홈", seq: 0, locked: false, items }];
  function makeStore(tabs: WidgetTab[]) {
    const saved: WidgetTab[] = [];
    const store: WidgetStore = {
      load: vi.fn(async () => tabs),
      saveTab: vi.fn(async (t: WidgetTab) => {
        saved.push(t);
      }),
      deleteTab: vi.fn(async () => {}),
      reorderTabs: vi.fn(async () => {}),
      resetHome: vi.fn(async () => {}),
    };
    return { store, saved };
  }
  async function mount(items: WidgetItem[], extra: Record<string, unknown> = {}) {
    const { store, saved } = makeStore(HOME(items));
    const props = { registry: REG, homeDefault: [], store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440, ...extra };
    act(() => root.render(h(WidgetWorkspace, props)));
    await flush();
    act(() => (host.querySelector('[data-action="start-edit"]') as HTMLButtonElement).click());
    const rerender = async (more: Record<string, unknown>) => {
      act(() => root.render(h(WidgetWorkspace, { ...props, ...more })));
      await flush();
    };
    return { saved, rerender };
  }
  const pickerItem = (id: string) => host.querySelector(`.cm-widget-picker__item[data-widget-id="${id}"]`) as HTMLElement;
  const enter = (id: string) => act(() => pickerItem(id).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  const leave = (id: string) => act(() => pickerItem(id).dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));

  it("서랍 항목에 마우스를 올리면 첫 빈 자리에 미리 보이고, 벗어나면 사라진다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    expect(previewEl()).toBeNull();
    enter("t.b");
    const el = previewEl()!;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain("나");
    expect(el.textContent).toContain("6 × 6");
    // 실제 위젯은 그대로 한 개.
    expect(host.querySelectorAll(".cm-widget")).toHaveLength(1);
    leave("t.b");
    expect(previewEl()).toBeNull();
  });

  it("클릭하면 미리 본 자리에 실제로 놓이고 미리 보기는 사라진다", async () => {
    // 1행 왼쪽(0,0)과 오른쪽 끝(12,0)이 차 있고 가운데 6~11 이 비어 있다.
    const { saved } = await mount([it_("a", "t.a", 0, 0), it_("c", "t.a", 12, 0, 12, 6)]);
    enter("t.b");
    const before = previewEl()!;
    const where = before.style.transform;
    expect(where).not.toBe("");
    act(() => pickerItem("t.b").click());
    expect(previewEl()).toBeNull();
    const placed = host.querySelector('.cm-widget[data-widget-id="t.b"]')!.closest(".react-grid-item") as HTMLElement;
    expect(placed.style.transform).toBe(where);
    // 저장되는 배치에서도 같은 자리.
    act(() => (host.querySelector('[data-action="done-edit"]') as HTMLButtonElement).click());
    await flush();
    const items = saved[0].items;
    expect(items).toHaveLength(3);
    const added = items.find((i) => i.widgetId === "t.b")!;
    expect({ x: added.x, y: added.y }).toEqual({ x: 6, y: 0 });
    expect(JSON.stringify(items)).not.toContain("__preview__");
  });

  it("보드가 꽉 차 있으면 맨 아래 왼쪽에 미리 보이고 그 자리에 놓인다", async () => {
    const { saved } = await mount([it_("a", "t.a", 0, 0, 24, 6)]);
    enter("t.b");
    const where = previewEl()!.style.transform;
    act(() => pickerItem("t.b").click());
    const placed = host.querySelector('.cm-widget[data-widget-id="t.b"]')!.closest(".react-grid-item") as HTMLElement;
    expect(placed.style.transform).toBe(where);
    act(() => (host.querySelector('[data-action="done-edit"]') as HTMLButtonElement).click());
    await flush();
    const added = saved[0].items.find((i) => i.widgetId === "t.b")!;
    expect({ x: added.x, y: added.y }).toEqual({ x: 0, y: 6 });
  });

  it("추가할 수 없는 위젯(이미 놓인 한 번만 위젯)은 서랍이 막아 미리 보이지 않는다", async () => {
    await mount([it_("o", "t.once", 0, 0)]);
    enter("t.once");
    expect(previewEl()).toBeNull();
  });

  it("올려 둔 사이 등록부가 바뀌어 이미 놓인 한 번만 위젯이 되면 미리 보기가 사라진다", async () => {
    // t.b 가 이미 놓여 있지만 처음엔 여러 개 허용이라 서랍에서 올릴 수 있다.
    const { rerender } = await mount([it_("b1", "t.b", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    await rerender({ registry: { ...REG, "t.b": entry("t.b", "나", { multiple: false }) } });
    expect(previewEl()).toBeNull();
  });

  it("올려 둔 위젯이 등록부에서 사용 중지로 바뀌어 다시 그려지면 미리 보기가 사라진다", async () => {
    const { rerender } = await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    await rerender({ registry: { ...REG, "t.b": entry("t.b", "나", { disabled: true }) } });
    expect(previewEl()).toBeNull();
  });

  it("올려 둔 위젯이 등록부에서 없어져도 미리 보기가 사라진다", async () => {
    const { rerender } = await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    const { "t.b": _gone, ...rest } = REG;
    await rerender({ registry: rest });
    expect(previewEl()).toBeNull();
  });

  it("검색어로 올려 둔 항목이 목록에서 빠지면 미리 보기가 사라진다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    const input = host.querySelector(".cm-widget-picker__search") as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "하나만");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(pickerItem("t.b")).toBeNull();
    expect(previewEl()).toBeNull();
  });

  it("서랍 항목 밖으로 마우스가 움직이면(mouseout 이 없어도) 미리 보기가 사라진다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    act(() => host.querySelector(".cm-widget-picker__title")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(previewEl()).toBeNull();
  });

  it("미리 보기가 있어도 다른 위젯의 자리(transform)는 그대로다", async () => {
    await mount([it_("a", "t.a", 0, 0), it_("c", "t.a", 12, 0, 12, 6)]);
    const transforms = () =>
      [...host.querySelectorAll(".cm-widget")].map((w) => (w.closest(".react-grid-item") as HTMLElement).style.transform);
    const before = transforms();
    expect(before).toHaveLength(2);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    expect(transforms()).toEqual(before);
    leave("t.b");
    expect(transforms()).toEqual(before);
  });

  it("미리 보기는 편집 종료·취소·서랍 사라짐과 함께 정리된다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    act(() => (host.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement).click());
    await flush();
    expect(previewEl()).toBeNull();
    // 다시 편집에 들어가도 남아 있지 않다.
    act(() => (host.querySelector('[data-action="start-edit"]') as HTMLButtonElement).click());
    expect(previewEl()).toBeNull();
  });

  it("서랍에서 끌기를 시작하면 미리 보기가 사라진다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    act(() => pickerItem("t.b").dispatchEvent(new Event("dragstart", { bubbles: true })));
    expect(previewEl()).toBeNull();
  });

  it("탭을 바꾸면 미리 보기가 사라진다", async () => {
    const { store } = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a", "t.a", 0, 0)] },
      { tabId: "tab-1", name: "둘째", seq: 1, locked: false, items: [] },
    ]);
    act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: [], store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440 })));
    await flush();
    act(() => (host.querySelector('[data-action="start-edit"]') as HTMLButtonElement).click());
    enter("t.b");
    expect(previewEl()).not.toBeNull();
    const second = [...host.querySelectorAll('[role="tab"]')].find((e) => e.textContent?.includes("둘째")) as HTMLElement;
    act(() => second.click());
    await flush();
    expect(previewEl()).toBeNull();
  });

  it("categoryTitles 를 넘기면 서랍이 분류별로 묶이고, 안 넘기면 기존처럼 분류 없이 보인다", async () => {
    await mount([it_("a", "t.a", 0, 0)], { categoryTitles: { COMMON: "공통", PROD: "생산" } });
    const groups = [...host.querySelectorAll(".cm-widget-picker__group")].map((e) => e.textContent);
    expect(groups).toEqual(["공통", "생산", "기타"]);
  });

  it("categoryTitles 가 없으면 분류 묶음 헤더가 없다", async () => {
    await mount([it_("a", "t.a", 0, 0)]);
    expect(host.querySelectorAll(".cm-widget-picker__group")).toHaveLength(0);
  });
});
