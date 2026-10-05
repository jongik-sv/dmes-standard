"use client";

/**
 * 창 층이 그릴 때 쓰는 화면(뷰포트) 크기. 창이 있을 때만 resize 를 구독하고, 한 프레임에 한 번만(rAF) 상태를 바꾼다.
 * 상태가 창 층 안에 있어 화면 크기가 바뀌어도 상위 셸(Header·Sidebar·TabsBar)이 다시 그려지지 않는다.
 */
import { useEffect, useState } from "react";

import type { DockViewport } from "./types";

/** 지금 화면 크기(서버 렌더면 0×0). 도크 조작(열기·접기·옮기기)은 호출 순간의 값을 쓴다. */
export function readDockViewport(): DockViewport {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * @param active false 면 구독하지 않는다(창이 하나도 없을 때). 다시 켜지면 그 사이 바뀐 크기를 바로 맞춘다.
 */
export function useDockViewport(active: boolean): DockViewport {
  const [viewport, setViewport] = useState<DockViewport>(readDockViewport);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      setViewport((prev) => {
        const next = readDockViewport();
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    const onResize = () => {
      if (frame === null) frame = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active]);

  return viewport;
}
