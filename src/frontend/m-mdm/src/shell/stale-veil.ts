/**
 * 이전 상세를 새 상세가 올 때까지 잠근 채 두는 흐림 덮개 스타일(dmc codeMng·codeConfirm, dmd dataMng 공용).
 *
 * 흐림은 늦게 걸어(300ms) 짧은 조회(대부분)에서는 보이지 않게 하고, 풀릴 때는 바로 돌아온다. `transition` 단축 속성과
 * `transitionDelay` 를 섞으면 잠금이 풀릴 때(transitionDelay 제거) React 가 "Removing a style property during rerender"
 * 경고를 낸다(2026-10-03, e2e Watcher 가 이 console.error 로 시험을 떨어뜨렸다) — 그래서 낱 속성으로 나누고 두 상태 모두
 * transitionDelay 를 둔다.
 */
import type { CSSProperties } from "react";

const FADE = {
  transitionProperty: "opacity",
  transitionDuration: "120ms",
  transitionTimingFunction: "ease",
} as const satisfies CSSProperties;

export const VEIL_FRESH = { ...FADE, transitionDelay: "0ms" } as const satisfies CSSProperties;
export const VEIL_STALE = { ...FADE, transitionDelay: "300ms", opacity: 0.5, pointerEvents: "none" } as const satisfies CSSProperties;
