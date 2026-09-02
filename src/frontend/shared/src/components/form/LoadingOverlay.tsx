"use client";

import React from "react";
import { Spinner } from "./Spinner";

export interface LoadingOverlayProps {
  /** true 일 때 화면 전체를 덮는 반투명 배경 + 중앙 스피너 표시. */
  visible: boolean;
  /** 스피너 하단 라벨. 기본값 "조회 중..." */
  label?: string;
  /** 스피너 크기 (px). 기본값 48 */
  size?: number;
  /** 배경 투명도. 기본값 0.6 (rgba 흰색) */
  backgroundOpacity?: number;
  /** z-index. 기본값 9999 — 다른 모달/팝업 위 표시 */
  zIndex?: number;
}

/**
 * 컨테이너 영역 한정 로딩 오버레이.
 *
 * <p>대용량 데이터 fetch (예: 32만 자재) 동안 사용자가 응답 없는 화면으로 오해하지
 * 않도록 페이지 컨텐츠 영역에 반투명 배경 + 중앙 스피너 + 라벨 표시.
 *
 * <p>**부모 컨테이너에 `position: relative` 필수** — `position: absolute; inset: 0`
 * 으로 가장 가까운 positioned 부모만 덮어 사이드바/탭바/탑바 등 글로벌 UI 는 차단하지 않음.
 *
 * <p>화면 전체를 덮으려면 `scope="fullscreen"` 사용 (e.g. 전역 모달 동안).
 *
 * <pre>
 * &lt;div style={{ position: "relative" }}&gt;
 *   &lt;LoadingOverlay visible={isSearching} /&gt;
 *   ...
 * &lt;/div&gt;
 * </pre>
 */
export interface LoadingOverlayPropsExt extends LoadingOverlayProps {
  /** "container" (default) — absolute, 부모 영역만. "fullscreen" — fixed, viewport 전체. */
  scope?: "container" | "fullscreen";
}

export function LoadingOverlay({
  visible,
  label = "조회 중...",
  size = 48,
  backgroundOpacity = 0.6,
  zIndex = 9999,
  scope = "container",
}: LoadingOverlayPropsExt) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: scope === "fullscreen" ? "fixed" : "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `rgba(255, 255, 255, ${backgroundOpacity})`,
        zIndex,
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size={size} label={label} />
    </div>
  );
}
