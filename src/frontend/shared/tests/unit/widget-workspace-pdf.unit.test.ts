/** @vitest-environment happy-dom */
/**
 * WidgetWorkspace [PDF] 단추(pdfTarget) — 누르면 printElementAsPage 가 대상 요소와 「{탭 이름}_{yyyyMMdd}」로 불린다.
 * 인쇄 유틸은 대역이다(유틸 자체는 print-element-as-page.unit.test.ts). 날짜만 가짜 시계로 고정한다.
 */
import { act, createElement as h, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetWorkspace } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";

const printMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/utils/libPrint", () => ({ printElementAsPage: printMock }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 3, 10, 0, 0));
  printMock.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "가") }) },
};
const item = (instId: string): WidgetItem => ({ instId, widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null });

function makeStore(tabs: WidgetTab[] = []): WidgetStore {
  return {
    load: vi.fn(async () => tabs),
    saveTab: vi.fn(async () => {}),
    deleteTab: vi.fn(async () => {}),
    reorderTabs: vi.fn(async () => {}),
    resetHome: vi.fn(async () => {}),
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}
const btn = (sel: string) => host.querySelector(sel) as HTMLButtonElement | null;
const click = (el: Element | null) => act(() => (el as HTMLElement).click());

/** 홈 화면 뿌리(.mcm-home)를 흉내 낸 감싸개 안에 작업 공간을 그린다. */
async function mount({ wrapperRef, ...extra }: Record<string, unknown> & { wrapperRef?: RefObject<HTMLDivElement | null> } = {}, tabs: WidgetTab[] = []) {
  const props = { registry: REG, homeDefault: [item("d1")], store: makeStore(tabs), confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440, ...extra };
  act(() => root.render(h("div", { className: "home-root", ref: wrapperRef }, h(WidgetWorkspace, props))));
  await flush();
}

describe("WidgetWorkspace [PDF] 단추(pdfTarget)", () => {
  it("pdfTarget 이 없으면 단추를 그리지 않는다(기존 동작 그대로)", async () => {
    await mount();
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
    expect(btn('[data-action="print-pdf"]')).toBeNull();
  });

  it("[배치 편집] 앞에 같은 모양의 [PDF] 단추를 그린다", async () => {
    const target = createRef<HTMLDivElement>();
    await mount({ pdfTarget: target, wrapperRef: target });
    const pdf = btn('[data-action="print-pdf"]')!;
    expect(pdf).not.toBeNull();
    expect(pdf.textContent).toBe("PDF");
    expect(pdf.querySelector("svg")).not.toBeNull();
    expect(pdf.classList.contains("cm-widget-ws__btn")).toBe(true);
    expect(pdf.title).toBe("위젯 화면을 PDF 로 저장(인쇄 창에서 'PDF로 저장' 선택)");
    expect(pdf.disabled).toBe(false);
    // 같은 도구 줄에서 [배치 편집] 바로 앞
    expect(pdf.nextElementSibling).toBe(btn('[data-action="start-edit"]'));
    // 찍힌 PDF 에는 도구 줄 단추가 나오지 않는다.
    expect(pdf.hasAttribute("data-print-hide")).toBe(true);
    expect(btn('[data-action="start-edit"]')!.hasAttribute("data-print-hide")).toBe(true);
  });

  it("누르면 대상 요소와 「{지금 탭 이름}_{yyyyMMdd}」로 인쇄 유틸을 부른다", async () => {
    const target = createRef<HTMLDivElement>();
    await mount({ pdfTarget: target, wrapperRef: target });
    click(btn('[data-action="print-pdf"]'));
    expect(printMock).toHaveBeenCalledTimes(1);
    const [el, opts] = printMock.mock.calls[0];
    expect(el).toBe(target.current);
    expect((el as HTMLElement).className).toBe("home-root");
    expect(opts).toEqual({ title: "홈_20261003" });
  });

  it("파일 이름은 지금 고른 탭 이름을 쓰고, 파일 이름에 못 쓰는 글자는 _ 로 바꾼다", async () => {
    const target = createRef<HTMLDivElement>();
    const tabs: WidgetTab[] = [
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [item("a")] },
      { tabId: "t1", name: "생산/품질:주간", seq: 1, locked: false, items: [item("b")] },
    ];
    await mount({ pdfTarget: target, wrapperRef: target }, tabs);
    click(host.querySelector('[role="tab"][data-tab-id="t1"]'));
    click(btn('[data-action="print-pdf"]'));
    expect(printMock.mock.calls[0][1]).toEqual({ title: "생산_품질_주간_20261003" });
  });

  it("편집 중에는 [PDF] 가 자리를 지킨 채 비활성이고 눌러도 인쇄하지 않는다", async () => {
    const target = createRef<HTMLDivElement>();
    await mount({ pdfTarget: target, wrapperRef: target });
    click(btn('[data-action="start-edit"]'));
    const pdf = btn('[data-action="print-pdf"]')!;
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    expect(pdf).not.toBeNull();
    expect(pdf.disabled).toBe(true);
    click(pdf);
    expect(printMock).not.toHaveBeenCalled();
    // 편집을 끝내면 다시 켜진다.
    click(btn('[data-action="cancel-edit"]'));
    await flush();
    expect(btn('[data-action="print-pdf"]')!.disabled).toBe(false);
  });

  it("ref 가 비어 있으면 작업 공간 자체를 찍는다", async () => {
    const empty = createRef<HTMLDivElement>();
    await mount({ pdfTarget: empty });
    click(btn('[data-action="print-pdf"]'));
    expect((printMock.mock.calls[0][0] as HTMLElement).classList.contains("cm-widget-ws")).toBe(true);
  });

  it("관리자 단일 탭(singleTab)에서도 pdfTarget 을 주면 제목 줄에 단추가 나온다", async () => {
    const target = createRef<HTMLDivElement>();
    await mount({ pdfTarget: target, wrapperRef: target, singleTab: { title: "전사 기본 배치" } });
    expect(host.querySelector(".cm-widget-ws__head-trailing [data-action='print-pdf']")).not.toBeNull();
    click(btn('[data-action="print-pdf"]'));
    expect(printMock.mock.calls[0][1]).toEqual({ title: "홈_20261003" });
  });
});
