/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "../../src/components/tabs";
import { Tree } from "../../src/components/tree";
import { ContentPanel, PageLayout } from "../../src/layout";
import { renderWithMantine } from "./mantine-test-utils";

describe("tabs/tree/layout (Mantine 구현) 계약", () => {
  it("Tabs 는 activeKey 탭에 aria-selected 를 주고 onChange(key) 를 호출한다", () => {
    const onChange = vi.fn();
    const r = renderWithMantine(createElement(Tabs, { items: [{ key: "a", label: "A" }, { key: "b", label: "B" }], activeKey: "a", onChange }));
    const tabs = r.host.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    act(() => (tabs[1] as HTMLElement).click());
    expect(onChange).toHaveBeenCalledWith("b");
    r.unmount();
  });

  it("Tree 는 cm-tree/tree-item 클래스를 유지하고 선택 시 onSelectedItemsChange(null, id) 를 호출한다", () => {
    const onSel = vi.fn();
    const items = [{ id: 1, label: "루트", children: [{ id: 2, label: "자식" }] }];
    const r = renderWithMantine(createElement(Tree, { items, expandedItems: [1], onSelectedItemsChange: onSel }));
    expect(r.host.querySelector(".cm-tree")).not.toBeNull();
    const nodes = r.host.querySelectorAll(".tree-item");
    expect(nodes.length).toBe(2);
    act(() => (nodes[1] as HTMLElement).click());
    expect(onSel).toHaveBeenCalledWith(null, "2");
    r.unmount();
  });

  // base 의 Tree 는 ArrowUp/Down/Left/Right·Enter 를 직접 구현했다. Mantine 이전 후에도
  // 키보드 확장(ArrowRight)·선택(Enter) 이 실제로 동작해야 접근성 회귀가 아니다.
  it("Tree 는 ArrowRight 로 확장하고 Enter 로 선택하며 aria-expanded 를 노출한다", () => {
    const onExp = vi.fn();
    const onSel = vi.fn();
    const items = [{ id: 1, label: "루트", children: [{ id: 2, label: "자식" }] }];
    const r = renderWithMantine(
      createElement(Tree, { items, expandedItems: [], onExpandedItemsChange: onExp, onSelectedItemsChange: onSel }),
    );
    // 초기화 통지(Tree 가 마운트 시 controller.initialize 로 전체 상태를 되돌려 준다)는
    // 집합이 같으므로 상위로 흘러나가지 않아야 한다.
    expect(onExp).not.toHaveBeenCalled();

    const rootItem = r.host.querySelector('li[role="treeitem"][data-value="1"]') as HTMLElement;
    expect(rootItem).not.toBeNull();

    const press = (key: string, code: string) =>
      act(() => {
        rootItem.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      });

    press("ArrowRight", "ArrowRight");
    expect(onExp).toHaveBeenCalledWith(null, ["1"]);

    press("Enter", "Enter");
    expect(onSel).toHaveBeenCalledWith(null, "1");
    r.unmount();
  });

  // fix wave 2 §B2: aria 는 role 이 있는 `li[role=treeitem]` 에 있어야 보조기술이 읽는다.
  // Mantine 은 중첩 트리의 li 에 aria-expanded/aria-level 을 붙이지 않으므로 직접 반영한다.
  it("Tree 는 li[role=treeitem] 에 aria-expanded 와 aria-level 을 반영한다", () => {
    const items = [{ id: 1, label: "루트", children: [{ id: 2, label: "자식" }] }];
    const r = renderWithMantine(createElement(Tree, { items, expandedItems: [1] }));
    const root = r.host.querySelector('li[role="treeitem"][data-value="1"]') as HTMLElement;
    const child = r.host.querySelector('li[role="treeitem"][data-value="2"]') as HTMLElement;
    expect(root.getAttribute("aria-expanded")).toBe("true");
    expect(root.getAttribute("aria-level")).toBe("1");
    // 자식이 없는 노드에는 aria-expanded 를 붙이지 않는다.
    expect(child.getAttribute("aria-expanded")).toBeNull();
    expect(child.getAttribute("aria-level")).toBe("2");
    // role 이 없는 `div.tree-item` 에는 aria 를 남기지 않는다(보조기술이 무시하는 자리).
    expect(root.querySelector(".tree-item")?.hasAttribute("aria-expanded")).toBe(false);
    r.unmount();
  });

  it("PageLayout 은 page-layout__header-buttons 안에 page-button 을 렌더한다", () => {
    const onClick = vi.fn();
    const r = renderWithMantine(
      createElement(PageLayout, { title: "화면", buttons: [{ id: "s", label: "조회", onClick, action: "search" }] }, createElement("div", null, "본문")),
    );
    const btn = r.host.querySelector(".page-layout__header-buttons .page-button") as HTMLButtonElement;
    expect(btn?.textContent).toContain("조회");
    act(() => btn.click());
    expect(onClick).toHaveBeenCalled();
    r.unmount();
  });

  it("ContentPanel 은 content-panel 클래스를 유지한다", () => {
    const r = renderWithMantine(createElement(ContentPanel, { flex: 1 }, "x"));
    expect(r.host.querySelector(".content-panel")).not.toBeNull();
    r.unmount();
  });
});
