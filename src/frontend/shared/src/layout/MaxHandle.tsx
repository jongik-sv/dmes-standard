"use client";

import React from "react";
import { useContentMaximize } from "./ContentBody";

export interface MaxHandleProps {
  /** ContentPanel 의 panelId 와 동일해야 하는 패널 식별자. */
  panelId: string;
  /** 추가 스타일 오버라이드 (선택) */
  style?: React.CSSProperties;
  className?: string;
}

/**
 * 패널 최대화/복원 토글 버튼.
 * GridPanel 의 `headerExtra` 슬롯 등에 삽입해 기본 버튼 오른쪽 끝에 렌더한다.
 * ContentBody 컨텍스트 하위에서만 사용 가능.
 */
export function MaxHandle({ panelId, style, className }: MaxHandleProps) {
  const { maximizedId, toggle } = useContentMaximize();
  const active = maximizedId === panelId;
  const title = active ? "그리드 좁히기" : "그리드 넓히기";
  const mergedClassName = `grid-max-handle${active ? " grid-max-handle--active" : ""}${className ? ` ${className}` : ""}`;

  return (
    <button
      type="button"
      onClick={() => toggle(panelId)}
      title={title}
      aria-label={title}
      className={mergedClassName}
      style={style}
    >
      {active ? <ShrinkIcon /> : <ExpandIcon />}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m15 15 6 6" />
      <path d="m15 9 6-6" />
      <path d="M21 16v5h-5" />
      <path d="M21 8V3h-5" />
      <path d="M3 16v5h5" />
      <path d="m3 21 6-6" />
      <path d="M3 8V3h5" />
      <path d="M9 9 3 3" />
    </svg>
  );
}

function ShrinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-shrink-icon lucide-shrink"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8" />
      <path d="M9 19.8V15m0 0H4.2M9 15l-6 6" />
      <path d="M15 4.2V9m0 0h4.8M15 9l6-6" />
      <path d="M9 4.2V9m0 0H4.2M9 9 3 3" />
    </svg>
  );
}
