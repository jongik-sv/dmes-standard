/** @vitest-environment happy-dom */
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FULLSCREEN_SIDEBAR_HOVER_DELAY_MS,
  useFullscreenSidebarHover,
} from "../../src/portal-shell/use-fullscreen-sidebar-hover";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let open = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Probe({ enabled, initialOpen }: { enabled: boolean; initialOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  open = isOpen;
  useFullscreenSidebarHover(enabled, isOpen, setIsOpen);
  return createElement(
    "div",
    null,
    createElement(
      "div",
      { className: "sidebar-container" },
      createElement("div", { className: "sidebar" }, createElement("span", { id: "menu-item" })),
      createElement("button", { className: "sidebar-toggle-button", id: "handle" })
    ),
    createElement("div", { id: "content" })
  );
}

function mount(enabled = true, initialOpen = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Probe, { enabled, initialOpen })));
}

function pointerOver(id: string) {
  act(() => {
    document.getElementById(id)!.dispatchEvent(new Event("pointerover", { bubbles: true }));
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useFullscreenSidebarHover", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
  });

  it("손잡이에 2초 머물면 연다", () => {
    mount();
    pointerOver("handle");
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS - 1);
    expect(open).toBe(false);
    wait(1);
    expect(open).toBe(true);
  });

  it("2초가 되기 전에 손잡이를 벗어나면 열지 않는다", () => {
    mount();
    pointerOver("handle");
    wait(1000);
    pointerOver("content");
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS);
    expect(open).toBe(false);
  });

  it("열린 메뉴 바깥으로 나가면 2초 뒤 닫고, 그 전에 돌아오면 닫지 않는다", () => {
    mount(true, true);
    pointerOver("content");
    wait(1500);
    pointerOver("menu-item");
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS);
    expect(open).toBe(true);

    pointerOver("content");
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS - 1);
    expect(open).toBe(true);
    wait(1);
    expect(open).toBe(false);
  });

  it("창 밖으로 나가도 2초 뒤 닫는다", () => {
    mount(true, true);
    act(() => {
      document.documentElement.dispatchEvent(new Event("mouseleave"));
    });
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS);
    expect(open).toBe(false);
  });

  it("전체 화면이 아니면 아무것도 하지 않는다", () => {
    mount(false);
    pointerOver("handle");
    wait(FULLSCREEN_SIDEBAR_HOVER_DELAY_MS * 2);
    expect(open).toBe(false);
  });
});
