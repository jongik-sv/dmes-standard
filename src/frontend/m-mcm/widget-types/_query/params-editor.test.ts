/** @vitest-environment happy-dom */
/**
 * 「조회 조건」 편집 줄 — [SQL 에서 가져오기]·[조건 추가] 가 편집기 값(params)을 고치는 모양.
 * 진짜 shared(dist) 의 그리드·공급자를 쓴다(editors-mdm-meta.test.ts 와 같은 설정). JSX 없이 createElement 로 쓴다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ParamsEditorRow } from "./ParamsEditor";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!("ResizeObserver" in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function show(value: unknown, patch: (p: Record<string, unknown>) => void) {
  const row = createElement(ParamsEditorRow, { value, patch });
  const el = createElement(
    DmesUiProvider,
    null,
    createElement(MdmMetaProvider, { disabled: true } as never, createElement("table", null, createElement("tbody", null, row)))
  );
  await act(async () => root.render(el));
}

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

describe("ParamsEditorRow", () => {
  it("[SQL 에서 가져오기] — SQL 의 선언 안 된 :이름을 글자 형 조건으로 추가한다", async () => {
    const patch = vi.fn();
    await show({ sql: "SELECT :dept, :from, :userId", params: [{ name: "dept", type: "select", options: [{ value: "A" }] }] }, patch);
    const btn = button("SQL 에서 가져오기");
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(false);
    await act(async () => btn!.click());
    expect(patch).toHaveBeenCalledWith({
      params: [
        { name: "dept", type: "select", options: [{ value: "A" }] },
        { name: "from", type: "text" },
      ],
    });
    expect(host.querySelector('[data-testid="wq-params-undeclared"]')?.textContent).toContain("from");
  });

  it("가져올 것이 없으면 단추가 꺼져 있다", async () => {
    await show({ sql: "SELECT :dept", params: [{ name: "dept", type: "text" }] }, vi.fn());
    expect(button("SQL 에서 가져오기")!.disabled).toBe(true);
    expect(host.querySelector('[data-testid="wq-params-undeclared"]')).toBeNull();
  });

  it("[조건 추가] — 빈 글자 형 조건을 끝에 붙인다", async () => {
    const patch = vi.fn();
    await show({ sql: "SELECT 1" }, patch);
    await act(async () => button("조건 추가")!.click());
    expect(patch).toHaveBeenCalledWith({ params: [{ name: "", type: "text" }] });
  });

  it("선언했지만 SQL 에 없는 조건은 안내한다", async () => {
    await show({ sql: "SELECT 1", params: [{ name: "zz", type: "text" }] }, vi.fn());
    expect(host.querySelector('[data-testid="wq-params-unused"]')?.textContent).toContain("zz");
  });
});
