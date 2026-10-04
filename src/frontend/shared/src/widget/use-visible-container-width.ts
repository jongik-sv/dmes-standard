"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 컨테이너 폭을 잰다 — react-grid-layout `useContainerWidth` 와 같은 모양이지만 **폭 0 통지는 무시**한다.
 *
 * <p>포털 탭을 떠나 보드가 숨겨지면(display:none) ResizeObserver 가 폭 0 을 알린다. 그 값을 그대로 넣으면 보이지
 * 않는 보드가 1칸 배치로 다시 그려지고, 돌아올 때 또 원래 폭으로 다시 그려진다(Screen-Performance-Guide K6).
 * 마지막으로 잰 0보다 큰 폭을 그대로 둔다. 패키지 공개 export 가 아니다(WidgetWorkspace·WidgetBoard 만 쓴다).
 */
export function useVisibleContainerWidth({ initialWidth = 1280 }: { initialWidth?: number } = {}) {
  const [width, setWidth] = useState(initialWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (raw: number) => {
      const next = Math.round(raw);
      if (next <= 0) return;
      setWidth((prev) => (prev === next ? prev : next));
    };
    // 첫 측정은 라이브러리처럼 content 폭(padding 제외) — ResizeObserver contentRect 와 같은 기준.
    const computed = Number.parseFloat(globalThis.getComputedStyle?.(node).width ?? "");
    apply(Number.isFinite(computed) ? computed : node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = entry.contentRect.width;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        apply(w);
      });
    });
    ro.observe(node);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return { width, containerRef };
}
