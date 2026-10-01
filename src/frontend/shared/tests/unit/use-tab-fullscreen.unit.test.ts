/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldExitTabFullscreenOnEscape,
  useTabFullscreen,
  type TabFullscreenControls,
} from "../../src/portal-shell/use-tab-fullscreen";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let controls: TabFullscreenControls;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Probe() {
  controls = useTabFullscreen();
  return null;
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Probe)));
}

/** happy-dom 에는 Fullscreen API 가 없어 문서 상태를 직접 흉내 낸다. */
function installFullscreenApi(options: { reject?: boolean } = {}) {
  let element: Element | null = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  });
  const request = vi.fn(() => {
    if (options.reject) return Promise.reject(new Error("denied"));
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  return {
    request,
    exit,
    /** 사용자가 브라우저 Esc 로 전체 화면을 빠져나간 상황. */
    browserExit: () => {
      element = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    },
  };
}

function removeFullscreenApi() {
  for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"]) {
    delete (document as unknown as Record<string, unknown>)[key];
  }
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
}

beforeEach(() => removeFullscreenApi());

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  removeFullscreenApi();
  document.body.innerHTML = "";
});

describe("useTabFullscreen", () => {
  it("Fullscreen API 가 없어도 포커스 모드로 들어가고 나온다", () => {
    mount();
    expect(controls.isTabFullscreen).toBe(false);
    act(() => controls.enter());
    expect(controls.isTabFullscreen).toBe(true);
    act(() => controls.exit());
    expect(controls.isTabFullscreen).toBe(false);
  });

  it("들어갈 때 문서 전체를 브라우저 전체 화면으로 요청하고, 나올 때 해제한다", async () => {
    const api = installFullscreenApi();
    mount();
    await act(async () => controls.enter());
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(controls.isTabFullscreen).toBe(true);

    await act(async () => controls.exit());
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(controls.isTabFullscreen).toBe(false);
  });

  it("브라우저 Esc 로 전체 화면이 풀리면 포커스 모드도 끝난다", async () => {
    const api = installFullscreenApi();
    mount();
    await act(async () => controls.enter());
    expect(controls.isTabFullscreen).toBe(true);

    act(() => api.browserExit());
    expect(controls.isTabFullscreen).toBe(false);
  });

  it("전체 화면 요청이 거부되어도 포커스 모드는 유지한다", async () => {
    const api = installFullscreenApi({ reject: true });
    mount();
    await act(async () => controls.enter());
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(controls.isTabFullscreen).toBe(true);

    await act(async () => controls.exit());
    expect(api.exit).not.toHaveBeenCalled();
    expect(controls.isTabFullscreen).toBe(false);
  });
});

describe("shouldExitTabFullscreenOnEscape", () => {
  function escapeOn(target: Element, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init });
    Object.defineProperty(event, "target", { value: target });
    return event;
  }

  it("화면 빈 곳에서 누른 Esc 는 포커스 모드를 끝낸다", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(shouldExitTabFullscreenOnEscape(escapeOn(div))).toBe(true);
  });

  it("Esc 가 아닌 키는 무시한다", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const event = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(event, "target", { value: div });
    expect(shouldExitTabFullscreenOnEscape(event)).toBe(false);
  });

  it("입력칸·그리드 안에서 누른 Esc 는 편집 취소 몫이라 무시한다", () => {
    const input = document.createElement("input");
    const grid = document.createElement("div");
    grid.className = "ag-root-wrapper";
    const cell = document.createElement("div");
    grid.appendChild(cell);
    document.body.append(input, grid);
    expect(shouldExitTabFullscreenOnEscape(escapeOn(input))).toBe(false);
    expect(shouldExitTabFullscreenOnEscape(escapeOn(cell))).toBe(false);
  });

  it("열린 대화상자가 있으면 그 창 닫기 몫이라 무시한다", () => {
    const div = document.createElement("div");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(div, dialog);
    expect(shouldExitTabFullscreenOnEscape(escapeOn(div))).toBe(false);
  });
});
