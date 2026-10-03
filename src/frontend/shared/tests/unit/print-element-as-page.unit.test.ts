/** @vitest-environment happy-dom */
/**
 * printElementAsPage — 요소 하나를 그 크기의 한 장짜리 페이지로 인쇄(위젯 화면 PDF).
 * window.print 는 대역이다. 인쇄 창이 떠 있는 동안(대역 안)의 상태를 잡아 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRINT_PAGE_MAX_PX, printElementAsPage } from "../../src/utils/libPrint";

const STYLE_SEL = "style[data-print-page]";

/** happy-dom 은 배치를 계산하지 않으므로 크기·스크롤 값을 직접 단다. */
function makeTarget(width: number, height: number, scrollTop = 0): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "target";
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => width });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height });
  let top = scrollTop;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
  document.body.appendChild(el);
  return el;
}

interface Seen {
  css: string;
  styleCount: number;
  title: string;
  marked: boolean;
  scrollTop: number;
}

let printMock: ReturnType<typeof vi.fn>;
const originalPrint = window.print;

beforeEach(() => {
  document.title = "포털";
  printMock = vi.fn();
  window.print = printMock as unknown as typeof window.print;
});
afterEach(() => {
  window.print = originalPrint;
  document.body.innerHTML = "";
  document.head.querySelectorAll(STYLE_SEL).forEach((n) => n.remove());
});

/** 인쇄 창이 떠 있는 동안의 상태를 잡는다(after 가 있으면 잡은 뒤 부른다). */
function captureDuring(el: HTMLElement, after?: () => void): Seen[] {
  const seen: Seen[] = [];
  printMock.mockImplementation(() => {
    const styles = document.head.querySelectorAll(STYLE_SEL);
    seen.push({
      css: styles[0]?.textContent ?? "",
      styleCount: styles.length,
      title: document.title,
      marked: el.hasAttribute("data-print-target"),
      scrollTop: el.scrollTop,
    });
    after?.();
  });
  return seen;
}

describe("printElementAsPage", () => {
  it("용지를 대상 크기(W×H)의 한 장으로 잡는 스타일을 넣고 대상에 표시를 단 채 print 를 부른다", () => {
    const el = makeTarget(1280, 2400);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(printMock).toHaveBeenCalledTimes(1);
    const { css, styleCount, marked } = seen[0];
    expect(styleCount).toBe(1);
    expect(marked).toBe(true);
    expect(css).toContain("@page { size: 1280px 2400px; margin: 0; }");
    expect(css).toContain("@media print");
    expect(css).toContain("width: 1280px !important; height: 2400px !important;");
    expect(css).toContain("html, body { height: 2400px !important;");
    expect(css).toContain("body * { visibility: hidden !important; }");
    expect(css).toContain("position: fixed !important;");
    // 크기가 한도 안이면 줄이지 않는다.
    expect(css).not.toContain("zoom");
  });

  it("대상과 그 후손에 print-color-adjust: exact 를 건다(배경·그라데이션 유지)", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el);
    const css = seen[0].css;
    expect(css).toMatch(/\[data-print-target\], \[data-print-target\] \* \{[^}]*print-color-adjust: exact !important;/);
    expect(css).toContain("-webkit-print-color-adjust: exact !important;");
  });

  it("data-print-hide 를 단 후손은 찍지 않는다", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(seen[0].css).toContain("[data-print-target] [data-print-hide], [data-print-target] [data-print-hide] * { visibility: hidden !important; }");
  });

  it("인쇄 동안 제목을 title 로 바꾸고 정리 뒤 되돌린다", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el, { title: "홈_20261003" });
    expect(seen[0].title).toBe("홈_20261003");
    expect(document.title).toBe("포털");
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(el.hasAttribute("data-print-target")).toBe(false);
  });

  it("title 이 없으면 제목을 건드리지 않는다", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(seen[0].title).toBe("포털");
    expect(document.title).toBe("포털");
  });

  it("afterprint 와 print 반환 뒤 정리가 두 번 일어나도 안전하다", () => {
    const el = makeTarget(800, 600, 0);
    const other = document.createElement("style");
    other.textContent = "p{}";
    document.head.appendChild(other);
    // Chrome 처럼 인쇄 창이 닫히면 afterprint 가 오고 그 뒤 print 가 돌아온다.
    const seen = captureDuring(el, () => window.dispatchEvent(new Event("afterprint")));
    expect(() => printElementAsPage(el, { title: "PDF" })).not.toThrow();
    expect(seen[0].marked).toBe(true);
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(el.hasAttribute("data-print-target")).toBe(false);
    expect(document.title).toBe("포털");
    // 남의 style 은 건드리지 않는다.
    expect(other.isConnected).toBe(true);
    // 정리가 끝난 뒤의 afterprint(다른 인쇄)는 아무 일도 하지 않는다.
    document.title = "다른 제목";
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("다른 제목");
    other.remove();
  });

  it("afterprint 가 오지 않아도 print 가 돌아오면 정리한다", () => {
    const el = makeTarget(800, 600);
    captureDuring(el);
    printElementAsPage(el, { title: "PDF" });
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(el.hasAttribute("data-print-target")).toBe(false);
    expect(document.title).toBe("포털");
  });

  it("print 가 던져도 정리한다", () => {
    const el = makeTarget(800, 600);
    printMock.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => printElementAsPage(el, { title: "PDF" })).toThrow("blocked");
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(el.hasAttribute("data-print-target")).toBe(false);
    expect(document.title).toBe("포털");
  });

  it("스크롤한 대상도 처음부터 찍고 정리 뒤 스크롤을 되돌린다", () => {
    const el = makeTarget(800, 3000, 420);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(seen[0].scrollTop).toBe(0);
    expect(el.scrollTop).toBe(420);
  });

  it("한 장 한도(19,200px)를 넘으면 zoom 으로 줄이고 용지도 줄인 크기로 잡는다", () => {
    expect(PRINT_PAGE_MAX_PX).toBe(19200);
    const el = makeTarget(1280, 40000);
    const seen = captureDuring(el);
    printElementAsPage(el);
    const css = seen[0].css;
    // 19200 / 40000 = 0.48 → 1280 × 0.48 = 614.4 → 615
    expect(css).toContain("zoom: 0.48 !important;");
    expect(css).toContain("@page { size: 615px 19200px; margin: 0; }");
    expect(css).toContain("html, body { height: 19200px !important;");
    // 대상 자체의 크기는 원래 값이고 zoom 이 줄인다.
    expect(css).toContain("width: 1280px !important; height: 40000px !important;");
  });

  it("넓이가 한도를 넘어도 같은 방식으로 줄인다", () => {
    const el = makeTarget(30000, 1000);
    const seen = captureDuring(el);
    printElementAsPage(el);
    // 19200 / 30000 = 0.64 → 1000 × 0.64 = 640
    expect(seen[0].css).toContain("zoom: 0.64 !important;");
    expect(seen[0].css).toContain("@page { size: 19200px 640px; margin: 0; }");
  });

  it("크기를 잴 수 없는 요소(0)도 0px 용지를 만들지 않는다", () => {
    const el = makeTarget(0, 0);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(seen[0].css).toContain("@page { size: 1px 1px; margin: 0; }");
  });

  it("정리 전에 다시 부르면 앞의 것을 먼저 정리하고, 끝나면 원래 제목·스크롤로 돌아온다", () => {
    const a = makeTarget(800, 600, 30);
    const b = makeTarget(900, 700, 50);
    const seenB: Seen[] = [];
    let calls = 0;
    // 첫 인쇄 창이 떠 있는 동안 다시 부르는 경우를 흉내 낸다(재진입).
    printMock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        printElementAsPage(b, { title: "B" });
        return;
      }
      const styles = document.head.querySelectorAll(STYLE_SEL);
      seenB.push({ css: styles[0]?.textContent ?? "", styleCount: styles.length, title: document.title, marked: b.hasAttribute("data-print-target"), scrollTop: b.scrollTop });
      // 앞의 것(a)은 이미 정리돼 있다.
      expect(a.hasAttribute("data-print-target")).toBe(false);
      expect(a.scrollTop).toBe(30);
    });
    printElementAsPage(a, { title: "A" });
    expect(printMock).toHaveBeenCalledTimes(2);
    expect(seenB[0].styleCount).toBe(1);
    expect(seenB[0].css).toContain("@page { size: 900px 700px; margin: 0; }");
    expect(seenB[0].title).toBe("B");
    expect(seenB[0].marked).toBe(true);
    expect(seenB[0].scrollTop).toBe(0);
    // 모두 끝난 뒤
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(document.querySelectorAll("[data-print-target]")).toHaveLength(0);
    expect(document.title).toBe("포털");
    expect(a.scrollTop).toBe(30);
    expect(b.scrollTop).toBe(50);
  });
});
