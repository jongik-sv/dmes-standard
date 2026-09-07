"use client";

import React from "react";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";
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
      {active ? (
        <IconArrowsMinimize size={15} aria-hidden="true" focusable="false" />
      ) : (
        <IconArrowsMaximize size={15} aria-hidden="true" focusable="false" />
      )}
    </button>
  );
}
