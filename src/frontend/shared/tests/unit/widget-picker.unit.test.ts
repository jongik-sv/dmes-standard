/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canAddWidget, WidgetPicker } from "../../src/widget";
import type { WidgetItem, WidgetMeta, WidgetRegistry } from "../../src/widget";

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

const entry = (meta: Partial<WidgetMeta> & { id: string; title: string }) => ({
  meta: { defaultSize: { w: 6, h: 6 }, ...meta },
  load: async () => ({ default: () => null }),
});

const REG: WidgetRegistry = {
  "home.notice": entry({ id: "home.notice", title: "공지사항", description: "최근 공지" }),
  "home.old": entry({ id: "home.old", title: "옛 위젯", disabled: true }),
  "def.k3x9q2ab": entry({ id: "def.k3x9q2ab", title: "생산 실적표", kind: "def", typeId: "query-table", description: "어제 생산" }),
  "def.m2p8x0cd": entry({ id: "def.m2p8x0cd", title: "알 수 없는 유형 위젯", kind: "def", typeId: "unknown-type" }),
  "def.zz00off1": entry({ id: "def.zz00off1", title: "꺼진 정의", kind: "def", typeId: "query-table", disabled: true }),
};
const TYPE_TITLES = { "query-table": "쿼리 표", markdown: "글(md)" };

function render(props: { registry?: WidgetRegistry; items?: WidgetItem[]; typeTitles?: Readonly<Record<string, string>> } = {}) {
  const onAdd = vi.fn();
  act(() => root.render(h(WidgetPicker, { registry: REG, items: [], onAdd, ...props })));
  return { onAdd };
}
const ids = () => [...host.querySelectorAll(".cm-widget-picker__item")].map((e) => e.getAttribute("data-widget-id"));
const itemEl = (id: string) => host.querySelector(`.cm-widget-picker__item[data-widget-id="${id}"]`) as HTMLButtonElement | null;

describe("WidgetPicker", () => {
  it("사용 중지 항목은 목록에 없다", () => {
    render({ typeTitles: TYPE_TITLES });
    expect(ids()).not.toContain("home.old");
    expect(ids()).not.toContain("def.zz00off1");
    expect(ids()).toEqual(expect.arrayContaining(["home.notice", "def.k3x9q2ab", "def.m2p8x0cd"]));
    expect(ids()).toHaveLength(3);
  });

  it("정의 위젯 아래에 typeTitles 의 유형 이름을 작은 글씨로 보인다", () => {
    render({ typeTitles: TYPE_TITLES });
    const typeLine = itemEl("def.k3x9q2ab")!.querySelector(".cm-widget-picker__type");
    expect(typeLine).not.toBeNull();
    expect(typeLine!.textContent).toBe("쿼리 표");
    // 제목 줄 뒤(제목 아래)에 온다.
    const name = itemEl("def.k3x9q2ab")!.querySelector(".cm-widget-picker__name")!;
    expect(name.compareDocumentPosition(typeLine!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("코드 위젯·이름을 모르는 유형·typeTitles 가 없으면 유형 줄이 없다", () => {
    render({ typeTitles: TYPE_TITLES });
    expect(itemEl("home.notice")!.querySelector(".cm-widget-picker__type")).toBeNull();
    expect(itemEl("def.m2p8x0cd")!.querySelector(".cm-widget-picker__type")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect(host.querySelector(".cm-widget-picker__type")).toBeNull();
  });

  it("검색은 유형 이름으로도 찾는다", () => {
    render({ typeTitles: TYPE_TITLES });
    const input = host.querySelector(".cm-widget-picker__search") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "쿼리");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(ids()).toEqual(["def.k3x9q2ab"]);
  });

  it("multiple:false 위젯은 이미 놓였으면 비활성이고 눌러도 onAdd 를 부르지 않는다", () => {
    const reg: WidgetRegistry = { ...REG, "home.notice": entry({ id: "home.notice", title: "공지사항", multiple: false }) };
    const placed: WidgetItem = { instId: "a", widgetId: "home.notice", x: 0, y: 0, w: 6, h: 6, locked: false, config: null };
    const { onAdd } = render({ registry: reg, items: [placed] });
    expect(itemEl("home.notice")!.disabled).toBe(true);
    act(() => itemEl("home.notice")!.click());
    expect(onAdd).not.toHaveBeenCalled();
    act(() => itemEl("def.k3x9q2ab")!.click());
    expect(onAdd).toHaveBeenCalledWith("def.k3x9q2ab");
  });

  it("canAddWidget 은 사용 중지 위젯을 거절한다(서랍 밖 끌어 놓기·추가 경로 방어)", () => {
    expect(canAddWidget([], REG["home.old"].meta)).toBe(false);
    expect(canAddWidget([], REG["home.notice"].meta)).toBe(true);
  });
});
