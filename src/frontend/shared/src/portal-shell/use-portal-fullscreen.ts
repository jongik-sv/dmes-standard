"use client";

import { useEffect, useState } from "react";
import { useFullscreenSidebarHover } from "./use-fullscreen-sidebar-hover";
import { useTabFullscreen } from "./use-tab-fullscreen";

/**
 * PortalShell 내부 훅 — 탭 전체 화면과 전체 화면 중 슬라이딩 메뉴 열림 상태.
 * 헤더를 접고 사이드바는 화면 위에 겹쳐 여닫는 슬라이딩 메뉴로 바꾼다. 탭바는 남겨
 * 전체 화면 중에도 탭을 옮기고 메뉴로 다른 화면을 열 수 있다. isHeaderVisible 은 건드리지 않는다.
 * 패키지 공개 export 가 아니다(portal-shell.tsx 만 쓴다).
 *
 * `activeTab` 은 탭 훅(usePortalTabs)이 돌려준 활성 탭 객체를 그대로 받는다 — 탭이 모두 닫히면
 * 전체 화면을 끝내는 effect 의 의존성 배열이 원래([isTabFullscreen, activeTab, exitTabFullscreen])와 같게 하려는 것이다.
 */
export function usePortalFullscreen({ activeTab }: { activeTab: object | null }) {
  const tabFullscreen = useTabFullscreen();
  const { isTabFullscreen, exit: exitTabFullscreen } = tabFullscreen;
  // 슬라이딩 메뉴의 열림 상태는 평소 사이드바 펼침(isSideNavigationExpanded)과 따로 둔다.
  const [isFullscreenSidebarOpen, setIsFullscreenSidebarOpen] = useState<boolean>(false);
  useEffect(() => {
    setIsFullscreenSidebarOpen(false);
  }, [isTabFullscreen]);
  useEffect(() => {
    // 탭이 모두 닫혀 대시보드만 남으면 전체 화면을 끝낸다.
    if (isTabFullscreen && !activeTab) exitTabFullscreen();
  }, [isTabFullscreen, activeTab, exitTabFullscreen]);
  // 손잡이에 1초 머물면 열고, 메뉴 밖으로 나간 지 2초 뒤 닫는다.
  useFullscreenSidebarHover(isTabFullscreen, isFullscreenSidebarOpen, setIsFullscreenSidebarOpen);
  useEffect(() => {
    if (!isTabFullscreen || !isFullscreenSidebarOpen) return;
    // 메뉴 바깥을 누르면 닫는다. 막(backdrop)을 깔지 않아 그 누름은 탭바·화면에도 그대로 간다.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      // 사이드바가 띄운 모달·드롭다운(Mantine Portal)을 누른 것도 바깥으로 치지 않는다.
      if (target instanceof Element && target.closest(".sidebar-container, [data-portal]")) return;
      setIsFullscreenSidebarOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isTabFullscreen, isFullscreenSidebarOpen]);

  return {
    isTabFullscreen,
    enterTabFullscreen: tabFullscreen.enter,
    exitTabFullscreen,
    isFullscreenSidebarOpen,
    setIsFullscreenSidebarOpen,
  };
}
