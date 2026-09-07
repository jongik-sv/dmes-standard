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
