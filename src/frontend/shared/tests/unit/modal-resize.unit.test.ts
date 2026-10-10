/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/modal";
import { renderWithMantine } from "./mantine-test-utils";

/** 창 크기 조절(resizable) — opt-in, 최소·최대 고정, 끌기로 크기 변경, 저장한 크기 복원. */
function pointer(type: string, x: number, y: number) {
  return new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true });
}

function drag(handle: Element, dx: number, dy: number) {
  act(() => {
    handle.dispatchEvent(pointer("pointerdown", 500, 400));
  });
  act(() => {
    handle.dispatchEvent(pointer("pointermove", 500 + dx, 400 + dy));
  });
  act(() => {
    handle.dispatchEvent(pointer("pointerup", 500 + dx, 400 + dy));
  });
}

const content = () => document.querySelector<HTMLElement>(".mantine-Modal-content")!;

beforeEach(() => {
  // happy-dom 은 레이아웃이 없다 — 시작 크기를 600×400 으로 돌려준다.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 400, x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 400, toJSON: () => ({}) });
  // 시험 환경에는 쓸 수 있는 localStorage 가 없다 — 메모리 대역을 건다.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Modal resizable", () => {
  it("기본(false)은 손잡이·인라인 크기·resized 클래스가 없다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", onClose: () => {} }, "본문"));
    expect(document.querySelector('[data-testid="modal-resize-handle"]')).toBeNull();
    expect(content().style.width).toBe("");
    expect(content().classList.contains("cm-modal--resized")).toBe(false);
    r.unmount();
  });

  it("켜면 손잡이가 보이고, 끌면 모서리가 포인터를 따르도록 가로·세로가 두 배로 바뀐다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, onClose: () => {} }, "본문"));
    const handle = document.querySelector('[data-testid="modal-resize-handle"]')!;
    expect(handle).not.toBeNull();
    expect(content().classList.contains("cm-modal--resizable")).toBe(true);
    drag(handle, 50, 30);
    expect(content().style.width).toBe("700px");
    expect(content().style.height).toBe("460px");
    expect(content().classList.contains("cm-modal--resized")).toBe(true);
    // inner(고정 위치 flex 부모)에는 크기가 걸리지 않아야 창이 가운데에 머문다.
    const inner = document.querySelector<HTMLElement>(".mantine-Modal-inner")!;
    expect(inner.style.width).toBe("");
    expect(inner.style.height).toBe("");
    r.unmount();
  });

  it("줄여도 최소 480×320 아래로, 키워도 화면 안(여백 16px)을 넘지 않는다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, onClose: () => {} }, "본문"));
    const handle = document.querySelector('[data-testid="modal-resize-handle"]')!;
    drag(handle, -2000, -2000);
    expect(content().style.width).toBe("480px");
    expect(content().style.height).toBe("320px");
    drag(handle, 5000, 5000);
    expect(content().style.width).toBe(`${window.innerWidth - 32}px`);
    expect(content().style.height).toBe(`${window.innerHeight - 32}px`);
    r.unmount();
  });

  it("끌기는 바깥 누름 닫힘을 일으키지 않는다", () => {
    const onClose = vi.fn();
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, onClose }, "본문"));
    drag(document.querySelector('[data-testid="modal-resize-handle"]')!, 80, 60);
    expect(onClose).not.toHaveBeenCalled();
    r.unmount();
  });

  it("resizeStorageKey 가 있으면 크기를 남기고 다음에 열 때 복원한다", () => {
    const props = { open: true, title: "T", resizable: true, resizeStorageKey: "t.size", onClose: () => {} };
    const first = renderWithMantine(createElement(Modal, props, "본문"));
    drag(document.querySelector('[data-testid="modal-resize-handle"]')!, 50, 30);
    first.unmount();
    expect(JSON.parse(window.localStorage.getItem("t.size")!)).toEqual({ w: 700, h: 460 });
    const second = renderWithMantine(createElement(Modal, props, "본문"));
    expect(content().style.width).toBe("700px");
    second.unmount();
  });

  it("저장소를 못 써도(깨진 값) 기본 크기로 연다", () => {
    window.localStorage.setItem("t.size", "{not json");
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, resizeStorageKey: "t.size", onClose: () => {} }, "본문"));
    expect(content().style.width).toBe("");
    r.unmount();
  });
});
