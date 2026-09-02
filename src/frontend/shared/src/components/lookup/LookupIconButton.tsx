"use client";

import React, { type CSSProperties } from "react";

export interface LookupIconButtonProps {
  /** 클릭 시 호출 (상세/선택 팝업 열기). */
  onClick: () => void;
  /** 비활성화. */
  disabled?: boolean;
  /** 접근성 라벨. default: "상세 검색". */
  ariaLabel?: string;
  /** 툴팁. 미지정 시 ariaLabel 사용. */
  title?: string;
  /** 아이콘 픽셀 크기. default 14. */
  size?: number;
  /** wrapper className (테마/hover 등). */
  className?: string;
  /** 기본 스타일에 병합/오버라이드. (예: LookupTextField 내부 절대배치) */
  style?: CSSProperties;
}

/**
 * 팝업을 여는 아이콘 버튼 (Lucide "square-arrow-out-up-right" SVG).
 *
 * IOR(품목×공정×자원 오버라이드) 의 LookupTextField 우측 버튼과 동일한 아이콘을
 * 독립 버튼으로 재사용하기 위한 컴포넌트. 기본은 인라인(28×28) 무테두리 아이콘 버튼이며,
 * style prop 으로 입력칸 내부 절대배치 등 변형해 사용한다.
 *
 * portal-shell sidebar/tabs-bar 의 SVG 컨벤션
 * (viewBox="0 0 24 24", stroke="currentColor", fill="none", strokeWidth="2") 과 일치.
 */
export function LookupIconButton({
  onClick,
  disabled = false,
  ariaLabel = "상세 검색",
  title,
  size = 14,
  className = "",
  style,
}: LookupIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={`cm-lookup-icon-button ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        color: "var(--color-text, #555)",
        lineHeight: 1,
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide lucide-square-arrow-out-up-right-icon lucide-square-arrow-out-up-right"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
        <path d="m21 3-9 9" />
        <path d="M15 3h6v6" />
      </svg>
    </button>
  );
}

export default LookupIconButton;
