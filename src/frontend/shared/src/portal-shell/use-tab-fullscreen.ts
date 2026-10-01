"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Esc 를 각자 처리하는 영역 — 입력 편집 취소·드롭다운·그리드 셀 편집 취소가 먼저다. */
const ESCAPE_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='listbox']",
  ".ag-root-wrapper",
].join(",");

/**
 * 브라우저 전체 화면이 아닌(요청 거부·미지원) 포커스 모드에서 Esc 로 빠져나가도 되는지.
 * 입력칸·그리드 안에서 눌렀거나 대화상자가 열려 있으면 그쪽 Esc 동작을 빼앗지 않는다.
 */
export function shouldExitTabFullscreenOnEscape(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target;
  if (target instanceof Element && target.closest(ESCAPE_OWNER_SELECTOR)) return false;
  if (document.querySelector("[role='dialog'], [aria-modal='true']")) return false;
  return true;
}

export interface TabFullscreenControls {
  isTabFullscreen: boolean;
  enter: () => void;
  exit: () => void;
}

/**
 * 활성 탭 페이지만 크게 보는 포커스 모드.
 *
 * <p>헤더·사이드바·탭바 숨김은 호출부가 isTabFullscreen 으로 처리하고, 이 훅은 문서 전체
 * (`document.documentElement`)를 브라우저 전체 화면으로 올린다. 탭 페이지 요소만 올리면 body 에
 * 붙는 모달·토스트·드롭다운이 전체 화면 밖에 그려져 보이지 않기 때문이다.
 *
 * <p>requestFullscreen 은 클릭의 사용자 활성화가 필요하므로 enter 는 클릭 핸들러에서 바로 부른다.
 * 요청이 거부되거나 API 가 없으면 포커스 모드만 유지한다. 저장소에 남기지 않는다(새로고침 뒤에는
 * 사용자 동작 없이 전체 화면을 다시 켤 수 없다).
 */
export function useTabFullscreen(): TabFullscreenControls {
  const [isTabFullscreen, setIsTabFullscreen] = useState(false);
  /** 이 훅이 연 전체 화면인지 — 다른 곳이 연 전체 화면은 닫지 않는다. */
  const ownsNativeFullscreenRef = useRef(false);

  const enter = useCallback(() => {
    setIsTabFullscreen(true);
    const root = document.documentElement;
    if (
      !document.fullscreenEnabled ||
      document.fullscreenElement ||
      typeof root.requestFullscreen !== "function"
    ) {
      return;
    }
    ownsNativeFullscreenRef.current = true;
    root.requestFullscreen().catch(() => {
      ownsNativeFullscreenRef.current = false;
    });
  }, []);

  const exit = useCallback(() => {
    setIsTabFullscreen(false);
    if (ownsNativeFullscreenRef.current && document.fullscreenElement) {
      ownsNativeFullscreenRef.current = false;
      document.exitFullscreen().catch(() => {});
      return;
    }
    ownsNativeFullscreenRef.current = false;
    // 창 크기가 그대로면 resize 가 안 나서, 숨어 있던 탭바가 스크롤 버튼 상태를 다시 재게 한다.
    window.dispatchEvent(new Event("resize"));
  }, []);

  useEffect(() => {
    if (!isTabFullscreen) return;

    // 브라우저 전체 화면에서는 Esc 를 브라우저가 가져가므로 fullscreenchange 로 해제를 따라간다.
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || !ownsNativeFullscreenRef.current) return;
      ownsNativeFullscreenRef.current = false;
      setIsTabFullscreen(false);
    };
    // 브라우저 전체 화면이 아닐 때만 Esc 를 직접 받는다.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.fullscreenElement) return;
      if (shouldExitTabFullscreenOnEscape(event)) exit();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTabFullscreen, exit]);

  return { isTabFullscreen, enter, exit };
}
