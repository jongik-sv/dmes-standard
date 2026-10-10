/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../../src/components/modal";
import { renderWithMantine as baseRender, type Rendered } from "./mantine-test-utils";

/** 단언이 실패해도 창이 남아 다음 시험을 오염시키지 않게, 만든 것을 모두 기억해 afterEach 에서 정리한다(unmount 는 여러 번 불러도 안전). */
const mounted: Rendered[] = [];
function renderWithMantine(...args: Parameters<typeof baseRender>): Rendered {
  const r = baseRender(...args);
  let done = false;
  const wrapped: Rendered = {
    ...r,
    unmount: () => {
      if (done) return;
      done = true;
      r.unmount();
    },
  };
  mounted.push(wrapped);
  return wrapped;
}

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

const translate = () => (content().style.translate || "").split(" ").map((v) => parseFloat(v) || 0) as [number, number];
const content = () => document.querySelector<HTMLElement>(".mantine-Modal-content")!;

beforeEach(() => {
  // happy-dom 은 레이아웃이 없다 — 창이 가운데(기본 600×400)에 놓이고 인라인 크기·translate 를 그대로 따른다고 흉내 낸다.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const w = parseFloat(this.style.width) || 600;
    const h = parseFloat(this.style.height) || 400;
    const [tx, ty] = (this.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
    const left = (window.innerWidth - w) / 2 + tx;
    const top = (window.innerHeight - h) / 2 + ty;
    return { width: w, height: h, x: left, y: top, left, top, right: left + w, bottom: top + h, toJSON: () => ({}) } as DOMRect;
  });
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
  mounted.splice(0).forEach((r) => r.unmount());
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

  it("켜면 손잡이가 보이고, 끌면 왼쪽 위를 고정한 채 모서리가 포인터를 1:1 로 따른다(가운데 옮김은 절반)", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, onClose: () => {} }, "본문"));
    const handle = document.querySelector('[data-testid="modal-resize-handle"]')!;
    expect(handle).not.toBeNull();
    expect(content().classList.contains("cm-modal--resizable")).toBe(true);
    drag(handle, 50, 30);
    expect(content().style.width).toBe("650px");
    expect(content().style.height).toBe("430px");
    expect(content().style.translate).toBe("25px 15px");
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
    // 오른쪽 아래 모서리가 화면 안(여백 16px)에 머문다.
    const rect = content().getBoundingClientRect();
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth - 16 + 0.5);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight - 16 + 0.5);
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
    expect(JSON.parse(window.localStorage.getItem("t.size")!)).toEqual({ w: 650, h: 430, tx: 25, ty: 15 });
    const second = renderWithMantine(createElement(Modal, props, "본문"));
    expect(content().style.width).toBe("650px");
    expect(content().style.translate).toBe("25px 15px");
    second.unmount();
  });

  it("저장소를 못 써도(깨진 값) 기본 크기로 연다", () => {
    window.localStorage.setItem("t.size", "{not json");
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", resizable: true, resizeStorageKey: "t.size", onClose: () => {} }, "본문"));
    expect(content().style.width).toBe("");
    r.unmount();
  });

  it("draggable: 기본(false)은 머리줄 끌기가 없고, 켜면 머리줄을 끌어 옮기되 머리줄이 화면 안에 남는다", () => {
    const off = renderWithMantine(createElement(Modal, { open: true, title: "T", onClose: () => {} }, "본문"));
    expect(content().classList.contains("cm-modal--draggable")).toBe(false);
    off.unmount();

    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", draggable: true, onClose: () => {} }, "본문"));
    expect(content().classList.contains("cm-modal--draggable")).toBe(true);
    const header = document.querySelector(".cm-modal-header")!;
    drag(header, 40, 20);
    expect(content().style.translate).toBe("40px 20px");
    // 화면 밖으로 크게 끌어도 머리줄 일부(가로 80px·세로 36px)는 남는다.
    drag(header, 9000, 9000);
    const rect = content().getBoundingClientRect();
    expect(rect.left).toBeLessThanOrEqual(window.innerWidth - 80);
    expect(rect.top).toBeLessThanOrEqual(window.innerHeight - 36);
    drag(header, -20000, -20000);
    const back = content().getBoundingClientRect();
    expect(back.right).toBeGreaterThanOrEqual(80);
    expect(back.top).toBeGreaterThanOrEqual(0);
    r.unmount();
  });

  it("draggable: 머리줄 단추에서 시작한 누름은 끌기가 아니고, 두 번 누르면 가운데·기본 크기로 돌아간다", () => {
    const r = renderWithMantine(createElement(Modal, { open: true, title: "T", draggable: true, onClose: () => {} }, "본문"));
    const close = document.querySelector<HTMLElement>(".cm-modal-header button")!;
    drag(close, 60, 60);
    expect(content().style.translate || "").toBe("");
    const header = document.querySelector(".cm-modal-header")!;
    drag(header, 30, 10);
    expect(content().style.translate).toBe("30px 10px");
    act(() => {
      header.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    expect(content().style.translate || "").toBe("");
    expect(content().style.width).toBe("");
    r.unmount();
  });
});
