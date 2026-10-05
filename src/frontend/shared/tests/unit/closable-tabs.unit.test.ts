/** @vitest-environment happy-dom */

// 닫을 수 있는 탭(shared closable-tabs) — 패널 마운트 유지, 고르기·닫기 콜백, keepLast, testIdPrefix, dirty 점, ←/→ 이동.
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClosableTabs,
  type ClosableTabItem,
  type ClosableTabsProps,
} from "../../src/components/closable-tabs";
import { CLOSABLE_TABS_CSS } from "../../src/components/closable-tabs/ClosableTabs";

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

const ITEMS: ClosableTabItem[] = [
  { key: "a", label: "가 세트" },
  { key: "b", label: "나 세트", dirty: true },
  { key: "c", label: "다 세트", title: "다 세트 설명" },
];

/** 패널 안 부품의 마운트·언마운트 기록 — 숨긴 패널의 효과가 내려가지 않는지 본다. */
const log: string[] = [];
function Probe({ id }: { id: string }) {
  useEffect(() => {
    log.push(`mount:${id}`);
    return () => {
      log.push(`unmount:${id}`);
    };
  }, [id]);
  return createElement("span", { "data-probe": id }, id);
}

function render(props: Partial<ClosableTabsProps> = {}) {
  const all: ClosableTabsProps = {
    items: ITEMS,
    activeKey: "a",
    onSelect: () => {},
    renderPanel: (it) => createElement(Probe, { id: it.key }),
    ...props,
  };
  act(() => root.render(createElement(ClosableTabs, all)));
}

const q = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

function keydown(el: HTMLElement, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("ClosableTabs", () => {
  beforeEach(() => {
    log.length = 0;
  });

  it("모든 패널을 그리고 고르지 않은 패널은 hidden + display:none 으로 숨긴다", () => {
    render();
    const pa = q("closable-tab-panel-a")!;
    const pb = q("closable-tab-panel-b")!;
    expect(pa.hidden).toBe(false);
    expect(pa.style.display).toBe("");
    expect(pb.hidden).toBe(true);
    expect(pb.style.display).toBe("none");
    expect(pb.querySelector('[data-probe="b"]')).not.toBeNull();
    expect(log.sort()).toEqual(["mount:a", "mount:b", "mount:c"]);
  });

  it("탭을 바꿔도 패널은 다시 마운트되지 않는다(효과 유지)", () => {
    render();
    const probeB = host.querySelector('[data-probe="b"]');
    log.length = 0;
    render({ activeKey: "b" });
    expect(log).toEqual([]);
    expect(host.querySelector('[data-probe="b"]')).toBe(probeB);
    expect(q("closable-tab-panel-a")!.hidden).toBe(true);
    expect(q("closable-tab-panel-a")!.style.display).toBe("none");
    expect(q("closable-tab-panel-b")!.hidden).toBe(false);
  });

  it("ARIA: tablist·tab·tabpanel 이 서로 id 로 이어지고 지금 탭만 tabIndex 0 이다", () => {
    render({ ariaLabel: "열린 세트" });
    const list = q("closable-tabs")!;
    expect(list.getAttribute("role")).toBe("tablist");
    expect(list.getAttribute("aria-label")).toBe("열린 세트");
    const tabA = q("closable-tab-a")!;
    const tabB = q("closable-tab-b")!;
    expect(tabA.getAttribute("role")).toBe("tab");
    expect(tabA.getAttribute("aria-selected")).toBe("true");
    expect(tabB.getAttribute("aria-selected")).toBe("false");
    expect(tabA.tabIndex).toBe(0);
    expect(tabB.tabIndex).toBe(-1);
    const panelA = q("closable-tab-panel-a")!;
    expect(panelA.getAttribute("role")).toBe("tabpanel");
    expect(tabA.getAttribute("aria-controls")).toBe(panelA.id);
    expect(panelA.getAttribute("aria-labelledby")).toBe(tabA.id);
    expect(q("closable-tab-c")!.getAttribute("title")).toBe("다 세트 설명");
  });

  it("탭을 누르면 onSelect, 닫기 단추를 누르면 onClose 를 그 key 로 부른다", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render({ onSelect, onClose });
    act(() => q("closable-tab-b")!.click());
    expect(onSelect).toHaveBeenCalledWith("b");
    act(() => q("closable-tab-a")!.click());
    expect(onSelect).toHaveBeenCalledTimes(1); // 이미 고른 탭은 다시 알리지 않는다
    const close = q("closable-tab-close-c")!;
    expect(close.tagName).toBe("BUTTON");
    expect(close.closest('[role="tab"]')).toBeNull(); // button 안 button 금지
    expect(close.getAttribute("aria-label")).toBe("다 세트 탭 닫기");
    act(() => close.click());
    expect(onClose).toHaveBeenCalledWith("c");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("onClose 가 없으면 닫기 단추를 그리지 않고, closable:false 인 탭만 숨길 수 있다", () => {
    render();
    expect(host.querySelector('[data-testid^="closable-tab-close-"]')).toBeNull();
    render({
      onClose: () => {},
      items: [ITEMS[0], { ...ITEMS[1], closable: false }],
    });
    expect(q("closable-tab-close-a")).not.toBeNull();
    expect(q("closable-tab-close-b")).toBeNull();
  });

  it("keepLast(기본 true): 탭이 하나면 닫기 단추가 없고, false 면 있다", () => {
    render({ onClose: () => {}, items: [ITEMS[0]] });
    expect(q("closable-tab-close-a")).toBeNull();
    render({ onClose: () => {}, items: [ITEMS[0]], keepLast: false });
    expect(q("closable-tab-close-a")).not.toBeNull();
  });

  it("dirty 점과 aria-label, closeLabel·dirtyLabel 을 바꿀 수 있다", () => {
    render({ onClose: () => {} });
    expect(q("closable-tab-dirty-a")).toBeNull();
    const dot = q("closable-tab-dirty-b")!;
    expect(dot.getAttribute("aria-label")).toBe("저장하지 않은 변경");
    expect(dot.textContent).toBe("●");
    render({
      onClose: () => {},
      dirtyLabel: "변경됨",
      closeLabel: (it) => `${it.key} 닫기`,
      items: [{ key: "x", label: createElement("b", null, "굵게"), dirty: true }, ITEMS[0]],
    });
    expect(q("closable-tab-dirty-x")!.getAttribute("aria-label")).toBe("변경됨");
    expect(q("closable-tab-close-x")!.getAttribute("aria-label")).toBe("x 닫기");
  });

  it("label 이 문자열이 아니면 기본 닫기 문구는 key 를 쓴다", () => {
    render({
      onClose: () => {},
      items: [{ key: "x", label: createElement("b", null, "굵게") }, ITEMS[0]],
    });
    expect(q("closable-tab-close-x")!.getAttribute("aria-label")).toBe("x 탭 닫기");
  });

  it("testIdPrefix 로 모든 testid 접두어를 바꾸고 message 는 status 로 그린다", () => {
    render({ testIdPrefix: "rule-set-tab", message: "저장했습니다", onClose: () => {} });
    expect(q("rule-set-tabs")!.getAttribute("role")).toBe("tablist");
    expect(q("rule-set-tab-a")).not.toBeNull();
    expect(q("rule-set-tab-dirty-b")).not.toBeNull();
    expect(q("rule-set-tab-close-a")).not.toBeNull();
    expect(q("rule-set-tab-panel-c")).not.toBeNull();
    const msg = q("rule-set-tabs-message")!;
    expect(msg.getAttribute("role")).toBe("status");
    expect(msg.textContent).toBe("저장했습니다");
    expect(q("closable-tab-a")).toBeNull();
  });

  it("←/→ 로 이웃 탭을 고르고 초점을 옮기며 끝에서는 반대 끝으로 돈다", () => {
    const onSelect = vi.fn();
    render({ onSelect });
    keydown(q("closable-tab-a")!, "ArrowRight");
    expect(onSelect).toHaveBeenLastCalledWith("b");
    expect(document.activeElement).toBe(q("closable-tab-b"));
    keydown(q("closable-tab-a")!, "ArrowLeft");
    expect(onSelect).toHaveBeenLastCalledWith("c");
    expect(document.activeElement).toBe(q("closable-tab-c"));
    render({ onSelect, activeKey: "c" });
    keydown(q("closable-tab-c")!, "ArrowRight");
    expect(onSelect).toHaveBeenLastCalledWith("a");
  });

  it("Delete 키는 닫을 수 있는 탭에서만 onClose 를 부른다", () => {
    const onClose = vi.fn();
    render({ onClose, items: [ITEMS[0], { ...ITEMS[1], closable: false }] });
    keydown(q("closable-tab-b")!, "Delete");
    expect(onClose).not.toHaveBeenCalled();
    keydown(q("closable-tab-a")!, "Delete");
    expect(onClose).toHaveBeenCalledWith("a");
  });

  it("activeKey 가 목록에 없으면 첫 탭이 Tab 초점을 받는다", () => {
    render({ activeKey: "zzz" });
    expect(q("closable-tab-a")!.tabIndex).toBe(0);
    expect(q("closable-tab-b")!.tabIndex).toBe(-1);
    expect(q("closable-tab-panel-a")!.hidden).toBe(true);
  });

  it("스타일은 공통 토큰만 쓴다(16진수·rgb 없음, 한 변 색 바 없음)", () => {
    expect(CLOSABLE_TABS_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CLOSABLE_TABS_CSS).not.toMatch(/rgba?\(/);
    expect(CLOSABLE_TABS_CSS).not.toMatch(/border-(left|top):\s*[2-9]px/);
    expect(CLOSABLE_TABS_CSS).toContain("var(--color-border)");
  });
});
