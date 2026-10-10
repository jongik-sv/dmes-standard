/** @vitest-environment happy-dom */
// 캔버스 우클릭 메뉴 — 룰 세트 편집기 context-menu.test.ts 의 ContextMenu 시험 + 견본 격자·testId·클래스 접두.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ContextMenu, type ContextMenuProps } from "../../src/components/react-flow/ContextMenu";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function mount(items: ContextMenuProps["items"], extra: Partial<ContextMenuProps> = {}, onClose = vi.fn(), onParentKey = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement("div", { onKeyDown: onParentKey }, createElement(ContextMenu, { items, at: { x: 10, y: 20 }, onClose, ...extra })));
  });
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, onClose, onParentKey, done };
}
const q = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("ContextMenu", () => {
  it("항목이 0개면 열지 않는다", async () => {
    const m = await mount([]);
    expect(q(m.host, "flow-menu")).toBeNull();
    m.done();
  });

  it("항목을 누르면 run 뒤 닫고, 꺼진 항목은 disabled + title, children 은 들여 쓴 버튼", async () => {
    const run = vi.fn();
    const child = vi.fn();
    const m = await mount([
      { id: "a", label: "가", run },
      { id: "b", label: "나", disabled: true, title: "안 되는 이유" },
      { id: "c", label: "묶음", children: [{ id: "c-1", label: "하위", run: child }] },
    ]);
    expect(q(m.host, "flow-menu")!.style.left).toBe("10px");
    const b = q(m.host, "flow-menu-item-b") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("안 되는 이유");
    expect(q(m.host, "flow-menu-item-c")!.tagName).toBe("DIV");
    expect(q(m.host, "flow-menu-item-c-1")!.className).toContain("rfx-menu-item-nested");
    await act(async () => {
      q(m.host, "flow-menu-item-a")!.click();
    });
    expect(run).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("메뉴 단추에서 Delete 는 위 onKeyDown 으로 올라가지 않고, Esc 는 스스로 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    const btn = q(m.host, "flow-menu-item-a")!;
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).not.toHaveBeenCalled();
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });

  it("바깥을 누르면 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });

  it("견본 항목 — 누르면 닫지 않고 격자를 펼치고, 견본 색은 CSS 값 그대로, 견본을 누르면 run 뒤 닫는다", async () => {
    const pick = vi.fn();
    const m = await mount([{
      id: "color", label: "색상", icon: createElement("i", { "data-testid": "ico" }),
      swatches: [{ id: "blue", label: "파랑", color: "var(--color-primary-soft)", borderColor: "var(--color-primary)", active: true, run: pick }],
    }]);
    expect(q(m.host, "ico")).not.toBeNull();
    await act(async () => {
      q(m.host, "flow-menu-item-color")!.click();
    });
    expect(m.onClose).not.toHaveBeenCalled();
    const sw = q(m.host, "flow-menu-swatch-blue")!;
    expect(sw.style.backgroundColor).toBe("var(--color-primary-soft)");
    expect(sw.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      sw.click();
    });
    expect(pick).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("testId·클래스 접두를 바꾸면 그 이름으로 그리고 규칙도 그 접두로 넣는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }], { testId: "erd-menu", classPrefix: "erdx" });
    expect(q(m.host, "erd-menu")!.className).toBe("erdx-menu");
    expect(q(m.host, "erd-menu-item-a")!.className).toBe("erdx-menu-item");
    expect(document.head.textContent).toContain(".erdx-menu-item");
    m.done();
  });
});
