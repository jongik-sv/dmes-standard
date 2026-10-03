/** @vitest-environment happy-dom */
/**
 * WidgetWorkspace [PDF] 단추(pdfTarget) — 누르면 printElementAsPage 가 대상 요소와 「{탭 이름}_{yyyyMMdd}」로 불린다.
 * 인쇄 유틸은 대역이다(유틸 자체는 print-element-as-page.unit.test.ts). 날짜만 가짜 시계로 고정한다.
 * 찍히면 안 되는 부품(탭 메뉴·⋯·(+)·불러오기 실패 띠 [다시 시도])의 data-print-hide, 인쇄 예외 알림, 좁은 화면·잠금·불러오기 실패 상태의 [PDF] 도 본다.
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
  it("pdfTarget 이 없으면 단추를 그리지 않고 [배치 편집] 에도 data-print-hide 를 달지 않는다(기존 DOM 그대로)", async () => {
    await mount();
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
    expect(btn('[data-action="print-pdf"]')).toBeNull();
    expect(btn('[data-action="start-edit"]')!.hasAttribute("data-print-hide")).toBe(false);
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
    expect(pdf.title).toBe("편집 중에는 사용할 수 없습니다");
    click(pdf);
    expect(printMock).not.toHaveBeenCalled();
    // 편집을 끝내면 다시 켜진다.
    click(btn('[data-action="cancel-edit"]'));
    await flush();
    expect(btn('[data-action="print-pdf"]')!.disabled).toBe(false);
    expect(btn('[data-action="print-pdf"]')!.title).toBe("위젯 화면을 PDF 로 저장(인쇄 창에서 'PDF로 저장' 선택)");
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
  describe("좁은 화면·잠금·불러오기 실패에서도 [PDF] 는 켜진다(보기 기능이라 편집 가능 여부와 무관)", () => {
    it("960px 미만(편집 불가 폭)에서 [배치 편집] 은 막히지만 [PDF] 는 켜져 있고 인쇄한다", async () => {
      const target = createRef<HTMLDivElement>();
      await mount({ pdfTarget: target, wrapperRef: target, boardWidth: 800 });
      const edit = btn('[data-action="start-edit"]')!;
      expect(edit.disabled).toBe(true);
      expect(edit.title).toBe("넓은 화면에서 편집할 수 있습니다");
      const pdf = btn('[data-action="print-pdf"]')!;
      expect(pdf.disabled).toBe(false);
      click(pdf);
      expect(printMock).toHaveBeenCalledTimes(1);
      expect(printMock.mock.calls[0][0]).toBe(target.current);
    });

    it("잠긴 탭에서 [배치 편집] 은 막히지만 [PDF] 는 켜져 있고 인쇄한다", async () => {
      const target = createRef<HTMLDivElement>();
      const tabs: WidgetTab[] = [{ tabId: "home", name: "홈", seq: 0, locked: true, items: [item("a")] }];
      await mount({ pdfTarget: target, wrapperRef: target }, tabs);
      expect(btn('[data-action="start-edit"]')!.title).toContain("잠긴 탭입니다");
      expect(btn('[data-action="start-edit"]')!.disabled).toBe(true);
      const pdf = btn('[data-action="print-pdf"]')!;
      expect(pdf.disabled).toBe(false);
      click(pdf);
      expect(printMock.mock.calls[0][1]).toEqual({ title: "홈_20261003" });
    });

    it("저장한 화면을 불러오지 못한 상태(error)에서도 [PDF] 는 켜져 있고 기본 홈을 인쇄한다", async () => {
      const target = createRef<HTMLDivElement>();
      const store = makeStore();
      store.load = vi.fn(async () => {
        throw new Error("서버 오류");
      });
      await mount({ pdfTarget: target, wrapperRef: target, store });
      expect(host.querySelector(".cm-widget-ws__banner")).not.toBeNull();
      expect(btn('[data-action="start-edit"]')!.disabled).toBe(true);
      const pdf = btn('[data-action="print-pdf"]')!;
      expect(pdf.disabled).toBe(false);
      click(pdf);
      expect(printMock).toHaveBeenCalledTimes(1);
      expect(printMock.mock.calls[0][1]).toEqual({ title: "홈_20261003" });
    });
  });

  describe("인쇄 창을 열지 못하면(print() 예외)", () => {
    it("예외를 삼키고 「인쇄 창을 열지 못했습니다.」 알림(error)을 보인다", async () => {
      const target = createRef<HTMLDivElement>();
      const notify = vi.fn();
      await mount({ pdfTarget: target, wrapperRef: target, notify });
      printMock.mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => click(btn('[data-action="print-pdf"]'))).not.toThrow();
      expect(printMock).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith("인쇄 창을 열지 못했습니다.", "error");
    });

    it("인쇄가 잘 되면 알림은 없다", async () => {
      const target = createRef<HTMLDivElement>();
      const notify = vi.fn();
      await mount({ pdfTarget: target, wrapperRef: target, notify });
      click(btn('[data-action="print-pdf"]'));
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe("찍히면 안 되는 부품에는 data-print-hide 가 달린다", () => {
    const tabs: WidgetTab[] = [
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [item("a")] },
      { tabId: "t1", name: "주간", seq: 1, locked: false, items: [item("b")] },
    ];

    it("모든 탭의 ⋯ 단추와 (+) 새 탭 단추", async () => {
      const target = createRef<HTMLDivElement>();
      await mount({ pdfTarget: target, wrapperRef: target }, tabs);
      const more = host.querySelectorAll("[data-tab-menu]");
      expect(more).toHaveLength(2);
      more.forEach((m) => expect(m.hasAttribute("data-print-hide")).toBe(true));
      expect(btn('[data-action="add-tab"]')!.hasAttribute("data-print-hide")).toBe(true);
    });

    it("탭 메뉴(.cm-widget-menu, fixed) — 메뉴를 연 채 [PDF] 를 눌러도 인쇄하는 순간 메뉴는 숨김 표시가 달려 있다", async () => {
      const target = createRef<HTMLDivElement>();
      await mount({ pdfTarget: target, wrapperRef: target }, tabs);
      click(host.querySelector('[data-tab-menu="t1"]'));
      expect(host.querySelector(".cm-widget-menu")).not.toBeNull();
      let menuHiddenAtPrint: boolean | null = null;
      printMock.mockImplementation(() => {
        const menu = document.querySelector(".cm-widget-menu");
        menuHiddenAtPrint = menu ? menu.hasAttribute("data-print-hide") : null;
      });
      click(btn('[data-action="print-pdf"]'));
      expect(printMock).toHaveBeenCalledTimes(1);
      // 메뉴가 아직 떠 있는 채로 인쇄가 시작되므로(바깥 누름으로 닫히는 건 그 뒤) 숨김 표시가 있어야 한다.
      expect(menuHiddenAtPrint).toBe(true);
    });

    it("불러오기 실패 띠의 [다시 시도]", async () => {
      const target = createRef<HTMLDivElement>();
      const store = makeStore();
      store.load = vi.fn(async () => {
        throw new Error("서버 오류");
      });
      await mount({ pdfTarget: target, wrapperRef: target, store });
      const retry = host.querySelector(".cm-widget-ws__banner button") as HTMLButtonElement;
      expect(retry.textContent).toBe("다시 시도");
      expect(retry.hasAttribute("data-print-hide")).toBe(true);
    });

    it("위젯 정의 실패 띠의 [다시 시도]", async () => {
      const target = createRef<HTMLDivElement>();
      await mount({ pdfTarget: target, wrapperRef: target, registryStatus: "error", onRetryRegistry: vi.fn() });
      expect(btn('[data-action="retry-registry"]')!.hasAttribute("data-print-hide")).toBe(true);
    });
  });

  describe("파일 이름(탭 이름 다듬기)", () => {
    /** 서버에서 불러온 긴 이름을 쓴다(이름 바꾸기 입력은 20자로 막혀 있어 서버·옛 데이터 경로로만 긴 이름이 들어온다). */
    async function titleFor(name: string): Promise<string> {
      const target = createRef<HTMLDivElement>();
      const tabs: WidgetTab[] = [
        { tabId: "home", name: "홈", seq: 0, locked: false, items: [item("a")] },
        { tabId: "t1", name, seq: 1, locked: false, items: [item("b")] },
      ];
      await mount({ pdfTarget: target, wrapperRef: target }, tabs);
      click(host.querySelector('[role="tab"][data-tab-id="t1"]'));
      click(btn('[data-action="print-pdf"]'));
      return (printMock.mock.calls.at(-1)![1] as { title: string }).title;
    }

    it("80글자에서 자른다 — 서로게이트 쌍(이모지)은 한 글자로 세어 반쪽이 남지 않는다", async () => {
      const name = "가".repeat(79) + "😀" + "나나";
      const title = await titleFor(name);
      expect(title).toBe("가".repeat(79) + "😀_20261003");
      // 반쪽 서로게이트가 없다.
      expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    });

    it("자른 뒤 끝에 남은 공백과 마침표를 지운다", async () => {
      expect(await titleFor("가".repeat(78) + " . 나")).toBe("가".repeat(78) + "_20261003");
      expect(await titleFor("생산 현황...")).toBe("생산 현황_20261003");
      expect(await titleFor("  앞뒤 공백  ")).toBe("앞뒤 공백_20261003");
    });

    it("마침표·공백뿐이거나 비면 「홈위젯」으로 둔다", async () => {
      expect(await titleFor("...")).toBe("홈위젯_20261003");
      expect(await titleFor(" . ")).toBe("홈위젯_20261003");
    });
  });
});
