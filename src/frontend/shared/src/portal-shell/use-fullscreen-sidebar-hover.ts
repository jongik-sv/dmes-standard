"use client";

import { useEffect } from "react";

/** 손잡이에 머물러 열기·메뉴 밖으로 나가 닫기까지 기다리는 시간. */
export const FULLSCREEN_SIDEBAR_HOVER_DELAY_MS = 2000;

/** 메뉴 안으로 치는 영역 — 사이드바와 사이드바가 띄운 모달·드롭다운(Mantine Portal). */
const SIDEBAR_AREA_SELECTOR = ".sidebar-container, [data-portal]";
const SIDEBAR_HANDLE_SELECTOR = ".sidebar-toggle-button";

/**
 * 탭 전체 화면의 슬라이딩 메뉴를 마우스 머묾으로 여닫는다.
 *
 * <p>닫혀 있으면 펼침 손잡이에 2초 머물 때 열고, 열려 있으면 메뉴 밖으로 나간 지 2초 뒤 닫는다.
 * 그 사이 돌아오면 타이머를 취소한다. 손잡이 클릭·바깥 클릭으로 바로 여닫는 동작은 호출부가 따로 둔다.
 */
export function useFullscreenSidebarHover(
  enabled: boolean,
  isOpen: boolean,
  setOpen: (open: boolean) => void
): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        setOpen(!isOpen);
      }, FULLSCREEN_SIDEBAR_HOVER_DELAY_MS);
    };

    const handlePointerOver = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const selector = isOpen ? SIDEBAR_AREA_SELECTOR : SIDEBAR_HANDLE_SELECTOR;
      const inside = target !== null && target.closest(selector) !== null;
      // 닫힘: 손잡이 위면 열 준비. 열림: 메뉴 밖이면 닫을 준비.
      if (inside !== isOpen) schedule();
      else cancel();
    };
    // 창 밖으로 나가면 pointerover 가 오지 않으므로 따로 받는다.
    const handleMouseLeave = () => {
      if (isOpen) schedule();
      else cancel();
    };

    const root = document.documentElement;
    document.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      cancel();
      document.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [enabled, isOpen, setOpen]);
}
