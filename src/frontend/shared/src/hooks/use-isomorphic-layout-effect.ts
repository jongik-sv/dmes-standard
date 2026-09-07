"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * SSR 에서는 `useLayoutEffect` 가 경고를 내므로 서버에서는 `useEffect`(no-op) 로 대체한다.
 *
 * 내부 전용 헬퍼다. `@dk-oasis/shared/*` 의 공개 서브패스로 내보내지 않으며,
 * shared 내부에서만 상대 경로로 import 한다.
 */
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
