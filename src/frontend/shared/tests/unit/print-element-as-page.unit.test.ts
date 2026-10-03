/** @vitest-environment happy-dom */
/**
 * printElementAsPage — 요소 하나를 그 크기의 한 장짜리 페이지로 인쇄(위젯 화면 PDF).
 * window.print 는 대역이다. 인쇄 창이 떠 있는 동안(대역 안)의 상태를 잡아 확인한다. 정리 시점(afterprint·안전망 타이머)은 가짜 시계로 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRINT_PAGE_MAX_PX, printElementAsPage } from "../../src/utils/libPrint";

const STYLE_SEL = "style[data-print-page]";

/** happy-dom 은 배치를 계산하지 않으므로 크기·스크롤 값을 직접 단다. */
function makeTarget(width: number, height: number, scrollTop = 0, client?: { width: number; height: number }): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "target";
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => width });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height });
  if (client) {
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => client.width });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => client.height });
  }
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
  vi.useFakeTimers();
  document.title = "포털";
  printMock = vi.fn();
  window.print = printMock as unknown as typeof window.print;
});
afterEach(() => {
  // 남은 안전망 타이머가 다음 시험에서 불리지 않게 먼저 비운다(정리는 모듈 상태 pendingCleanup 를 쓴다).
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
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

/** afterprint 리스너의 add/remove 호출을 잡는다. 더한 것이 모두 같은 참조로 떼어졌는지 본다. */
function spyAfterprintListeners() {
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  const handlers = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.filter((c) => c[0] === "afterprint").map((c) => c[1]);
  return {
    added: () => handlers(add),
    removed: () => handlers(remove),
    /** 더했는데 떼지 않은 리스너. */
    leaked: () => handlers(add).filter((h) => !handlers(remove).includes(h)),
  };
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
    expect(css).toContain("position: fixed !important;");
    // 크기가 한도 안이면 줄이지 않는다.
    expect(css).not.toContain("zoom");
  });

  it("대상 밖만 숨기고 대상 후손의 visibility 는 상속에 맡긴다(후손의 hidden 을 visible 로 덮지 않는다)", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el);
    const css = seen[0].css;
    expect(css).toContain("body *:not([data-print-target], [data-print-target] *) { visibility: hidden !important; }");
    expect(css).toContain("[data-print-target] { visibility: visible !important; }");
    // visible 을 거는 규칙은 대상 자신뿐이다 — 후손(`[data-print-target] *`)에 visible 을 걸면 ag-grid .ag-invisible 같은 의도된 hidden 이 풀린다.
    expect(css.match(/visibility: visible/g)).toHaveLength(1);
    expect(css).not.toMatch(/\[data-print-target\] \*[^{}]*\{[^}]*visibility: visible/);
    // 옛 규칙(body * 전체 숨김 + 대상·후손 전부 visible)은 없다.
    expect(css).not.toContain("body * { visibility: hidden !important; }");
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

  it("인쇄 동안 제목을 title 로 바꾸고, 정리(afterprint) 뒤 되돌린다", () => {
    const el = makeTarget(800, 600);
    const seen = captureDuring(el);
    printElementAsPage(el, { title: "홈_20261003" });
    expect(seen[0].title).toBe("홈_20261003");
    // print() 가 돌아왔어도 afterprint 전에는 아직 인쇄 중이다.
    expect(document.title).toBe("홈_20261003");
    window.dispatchEvent(new Event("afterprint"));
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
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("포털");
  });

  it("인쇄 동안 화면이 제목을 바꿨으면 정리 때 그 값을 둔다(제목 보호)", () => {
    const el = makeTarget(800, 600);
    captureDuring(el, () => {
      document.title = "화면이 바꾼 제목";
    });
    printElementAsPage(el, { title: "PDF" });
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("화면이 바꾼 제목");
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
  });

  describe("정리 시점 — afterprint, 안전망 타이머, 예외", () => {
    it("afterprint 가 오면 그때 정리한다(print() 가 돌아온 뒤에도 그때까지는 인쇄 상태를 유지한다)", () => {
      const el = makeTarget(800, 3000, 420);
      captureDuring(el);
      printElementAsPage(el, { title: "PDF" });
      // print() 는 이미 돌아왔지만 afterprint 전 — 미리보기를 그리는 동안 스타일이 살아 있어야 한다.
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(1);
      expect(el.hasAttribute("data-print-target")).toBe(true);
      expect(document.title).toBe("PDF");
      expect(el.scrollTop).toBe(0);
      window.dispatchEvent(new Event("afterprint"));
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
      expect(el.hasAttribute("data-print-target")).toBe(false);
      expect(document.title).toBe("포털");
      expect(el.scrollTop).toBe(420);
    });

    it("print() 안에서 afterprint 가 오면(Chrome) 곧바로 정리하고 안전망 타이머도 만들지 않는다", () => {
      const el = makeTarget(800, 600);
      const seen = captureDuring(el, () => window.dispatchEvent(new Event("afterprint")));
      printElementAsPage(el, { title: "PDF" });
      expect(seen[0].marked).toBe(true);
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
      expect(el.hasAttribute("data-print-target")).toBe(false);
      expect(document.title).toBe("포털");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("afterprint 가 오지 않으면 print() 가 돌아온 뒤 1000ms 에 안전망 타이머가 정리한다", () => {
      const el = makeTarget(800, 3000, 420);
      captureDuring(el);
      printElementAsPage(el, { title: "PDF" });
      vi.advanceTimersByTime(999);
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(1);
      expect(el.hasAttribute("data-print-target")).toBe(true);
      expect(document.title).toBe("PDF");
      vi.advanceTimersByTime(1);
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
      expect(el.hasAttribute("data-print-target")).toBe(false);
      expect(document.title).toBe("포털");
      expect(el.scrollTop).toBe(420);
    });

    it("print() 가 던지면 즉시 정리하고 예외를 다시 던진다", () => {
      const el = makeTarget(800, 600);
      printMock.mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => printElementAsPage(el, { title: "PDF" })).toThrow("blocked");
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
      expect(el.hasAttribute("data-print-target")).toBe(false);
      expect(document.title).toBe("포털");
      // 타이머를 기다리지 않는다.
      expect(vi.getTimerCount()).toBe(0);
    });

    it("정리는 한 번만 한다(done 가드) — afterprint 로 끝난 뒤 안전망 타이머가 와도 그 사이 바뀐 스크롤·제목을 되돌리지 않는다", () => {
      const el = makeTarget(800, 3000, 420);
      captureDuring(el);
      printElementAsPage(el, { title: "PDF" });
      window.dispatchEvent(new Event("afterprint"));
      expect(el.scrollTop).toBe(420);
      // 정리 뒤 사용자가 스크롤하고 화면이 제목을 바꿨다 — 인쇄 때 넣은 제목과 우연히 같은 값이어도 되돌리면 안 된다.
      el.scrollTop = 77;
      document.title = "PDF";
      vi.advanceTimersByTime(1000);
      expect(el.scrollTop).toBe(77);
      expect(document.title).toBe("PDF");
    });

    it("정리가 끝나면 afterprint 리스너를 뗀다 — afterprint·타이머·예외·다음 호출의 선행 정리 어느 쪽으로 끝나도 남지 않는다", () => {
      const spy = spyAfterprintListeners();
      const a = makeTarget(800, 600);
      const b = makeTarget(800, 600);
      captureDuring(a);
      // 1) afterprint 로 끝남
      printElementAsPage(a);
      window.dispatchEvent(new Event("afterprint"));
      // 2) 안전망 타이머로 끝남
      printElementAsPage(a);
      vi.advanceTimersByTime(1000);
      // 3) 예외로 끝남
      printMock.mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(() => printElementAsPage(a)).toThrow("blocked");
      // 4) 다음 호출이 앞의 것을 먼저 정리함
      printMock.mockImplementation(() => {});
      printElementAsPage(a);
      printElementAsPage(b);
      window.dispatchEvent(new Event("afterprint"));
      expect(spy.added()).toHaveLength(5);
      expect(spy.leaked()).toEqual([]);
    });

    it("늦게 온 afterprint 는 이미 정리된 호출의 상태를 건드리지 않는다", () => {
      const el = makeTarget(800, 3000, 420);
      captureDuring(el);
      printElementAsPage(el, { title: "PDF" });
      vi.advanceTimersByTime(1000); // 안전망 타이머로 정리됨
      el.scrollTop = 55;
      document.title = "그 뒤 화면 제목";
      window.dispatchEvent(new Event("afterprint")); // 미리보기가 한참 뒤 닫혀서 늦게 옴
      expect(el.scrollTop).toBe(55);
      expect(document.title).toBe("그 뒤 화면 제목");
    });

    it("앞의 호출이 정리되기 전에 다시 부르면, 앞의 안전망 타이머가 뒤의 호출을 일찍 정리하지 않는다", () => {
      const a = makeTarget(800, 600);
      const b = makeTarget(900, 700);
      captureDuring(a);
      printElementAsPage(a, { title: "A" }); // t=0 → 앞의 타이머는 t=1000
      vi.advanceTimersByTime(600);
      printElementAsPage(b, { title: "B" }); // 앞의 것(a)을 먼저 정리하고 자기 타이머는 t=1600
      expect(a.hasAttribute("data-print-target")).toBe(false);
      vi.advanceTimersByTime(500); // t=1100 — 앞의 타이머가 지나갔다
      expect(b.hasAttribute("data-print-target")).toBe(true);
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(1);
      expect(document.title).toBe("B");
      vi.advanceTimersByTime(500); // t=1600
      expect(b.hasAttribute("data-print-target")).toBe(false);
      expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
      expect(document.title).toBe("포털");
    });
  });

  it("스크롤한 대상도 처음부터 찍고 정리 뒤 스크롤을 되돌린다", () => {
    const el = makeTarget(800, 3000, 420);
    const seen = captureDuring(el);
    printElementAsPage(el);
    expect(seen[0].scrollTop).toBe(0);
    window.dispatchEvent(new Event("afterprint"));
    expect(el.scrollTop).toBe(420);
  });

  describe("용지 크기·zoom", () => {
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

    it("가로·세로가 둘 다 한도를 넘으면 더 많이 넘은 쪽에 맞춰 줄인다", () => {
      const el = makeTarget(40000, 30000);
      const seen = captureDuring(el);
      printElementAsPage(el);
      // 가로 19200/40000 = 0.48, 세로 19200/30000 = 0.64 → 0.48 → 용지 19200 × 14400
      expect(seen[0].css).toContain("zoom: 0.48 !important;");
      expect(seen[0].css).toContain("@page { size: 19200px 14400px; margin: 0; }");
    });

    it("zoom 은 반올림이 아니라 내림이다 — 줄인 크기가 한도를 넘지 않는다", () => {
      // 19200 / 30001 = 0.639978… → 내림 0.6399(반올림이면 0.64). 0.64 면 30001 × 0.64 = 19200.64 로 용지가 한도 밖이다.
      const el = makeTarget(1000, 30001);
      const seen = captureDuring(el);
      printElementAsPage(el);
      expect(seen[0].css).toContain("zoom: 0.6399 !important;");
      expect(seen[0].css).not.toContain("zoom: 0.64 !important;");
      // 30001 × 0.6399 = 19197.64 → 19198, 1000 × 0.6399 = 639.9 → 640
      expect(seen[0].css).toContain("@page { size: 640px 19198px; margin: 0; }");
    });

    it("zoom 하한은 0.0001 이다 — 극단적으로 큰 대상도 zoom: 0 (아무것도 안 찍힘)이 되지 않는다", () => {
      const el = makeTarget(1000, 1_000_000_000);
      const seen = captureDuring(el);
      printElementAsPage(el);
      expect(seen[0].css).toContain("zoom: 0.0001 !important;");
      expect(seen[0].css).not.toMatch(/zoom: 0 /);
      // 1000 × 0.0001 = 0.1 → 1, 세로는 한도로 막는다
      expect(seen[0].css).toContain("@page { size: 1px 19200px; margin: 0; }");
    });

    it("scrollWidth 가 0 이면 clientWidth, scrollHeight 가 0 이면 clientHeight 를 쓴다(큰 쪽을 고른다)", () => {
      const el = makeTarget(0, 0, 0, { width: 500, height: 300 });
      const seen = captureDuring(el);
      printElementAsPage(el);
      expect(seen[0].css).toContain("@page { size: 500px 300px; margin: 0; }");
      window.dispatchEvent(new Event("afterprint"));
      // 두 값이 다 있으면 큰 쪽 — 가로는 client 가, 세로는 scroll 이 크다.
      const el2 = makeTarget(300, 900, 0, { width: 500, height: 600 });
      const seen2 = captureDuring(el2);
      printElementAsPage(el2);
      expect(seen2[0].css).toContain("@page { size: 500px 900px; margin: 0; }");
    });

    it("크기를 잴 수 없는 요소(0)도 0px 용지를 만들지 않는다", () => {
      const el = makeTarget(0, 0);
      const seen = captureDuring(el);
      printElementAsPage(el);
      expect(seen[0].css).toContain("@page { size: 1px 1px; margin: 0; }");
    });
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
    // 뒤의 것(b)은 아직 인쇄 중이다 — 앞의 것이 바깥에서 돌아와도 건드리지 않는다.
    expect(b.hasAttribute("data-print-target")).toBe(true);
    expect(document.title).toBe("B");
    // 모두 끝난 뒤
    window.dispatchEvent(new Event("afterprint"));
    expect(document.head.querySelectorAll(STYLE_SEL)).toHaveLength(0);
    expect(document.querySelectorAll("[data-print-target]")).toHaveLength(0);
    expect(document.title).toBe("포털");
    expect(a.scrollTop).toBe(30);
    expect(b.scrollTop).toBe(50);
  });
});
