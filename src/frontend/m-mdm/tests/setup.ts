// TSK-01-03 U10 — shared tests/setup.ts 와 같은 폴리필. happy-dom 에 없는 브라우저 API 를 Mantine 이 요구한다.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!("ResizeObserver" in window)) {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
  if (!window.scrollTo) window.scrollTo = () => {};

  // React Flow(@xyflow/react) — transform 배율(m22)을 DOMMatrixReadOnly 로 읽는다. happy-dom 에 없으면 최소 구현을 둔다.
  // (offsetWidth/Height 스텁·ResizeObserver 즉시 콜백은 넣지 않는다 — 다른 화면 테스트 33건이 깨진다. 스모크는 노드에 width/height 를 직접 준다.)
  if (!("DOMMatrixReadOnly" in globalThis)) {
    class DMR {
      m22 = 1;
      constructor(transform?: string) {
        const m = /scale\(([-\d.]+)/.exec(transform ?? "") ?? /matrix\([^,]+,[^,]+,[^,]+,\s*([-\d.]+)/.exec(transform ?? "");
        if (m) this.m22 = Number(m[1]);
      }
    }
    (globalThis as unknown as { DOMMatrixReadOnly: typeof DMR }).DOMMatrixReadOnly = DMR;
  }
}

// Mantine `Popover`(DateTimePicker 등)는 열릴 때 `useFocusTrap` 이 포커스 가능한 칸을 찾는데, 그 시점에
// 드롭다운이 `display:none` 이라 happy-dom 에서는 "focusable element 를 못 찾았다" 는 경고와 함께 DOM
// 전체를 덤프한다(실제 브라우저에서는 나지 않는다). 경고 하나가 시험 로그를 수천 줄로 덮어 실패를 가리므로,
// 이 메시지 하나만 걸러낸다. 다른 console 출력은 그대로 둔다.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("[@mantine/hooks/use-focus-trap]")) return;
  originalWarn(...args);
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
