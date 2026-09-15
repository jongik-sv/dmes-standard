"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useContentMaximize } from "./ContentBody";
import { ContentPanel } from "./ContentPanel";

export interface ResizableFormPanelProps {
  /** 최대화 연동용 패널 식별자 (ContentPanel 과 동일 규칙). */
  panelId?: string;
  /** 초기 너비(px). 기본 400. */
  defaultWidth?: number;
  /** 최소 너비(px). 기본 280. */
  minWidth?: number;
  /** 최대 너비(px). 기본 720. */
  maxWidth?: number;
  /** ContentPanel 에 그대로 전달되는 높이(선택). */
  height?: string | number;
  children: React.ReactNode;
}

/**
 * 좌측 패널 옆에 두는 "오른쪽 상세" 패널.
 * 좌측 가장자리에 세로 리사이즈 핸들을 달아 사용자가 너비를 드래그로 조절할 수 있다.
 * 패널 최대화(MaxHandle) 중에는 핸들을 숨긴다.
 *
 * fragment 로 [핸들][ContentPanel] 두 요소를 렌더하므로 ContentBody 의 flex 자식으로 평탄화된다:
 *
 *   <ContentBody root>
 *     <ContentPanel panelId="x-list"> … </ContentPanel>
 *     <ResizableFormPanel panelId="x-form" defaultWidth={400}> … </ResizableFormPanel>
 *   </ContentBody>
 *
 * 기존 `<ContentPanel panelId="x-form" width={400}>` 를 본 컴포넌트로 바꾸면 너비 조절이 추가된다.
 */
export function ResizableFormPanel({
  panelId,
  defaultWidth = 400,
  minWidth = 280,
  maxWidth = 720,
  height,
  children,
}: ResizableFormPanelProps) {
  const { maximizedId } = useContentMaximize();
  const [width, setWidth] = useState(defaultWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      drag.current = { startX: e.clientX, startWidth: width };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      e.preventDefault();
    },
    [width],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      // 핸들을 왼쪽으로 끌면(deltaX<0) 우측 상세가 넓어진다.
      const next = d.startWidth - (e.clientX - d.startX);
      setWidth(Math.max(minWidth, Math.min(maxWidth, next)));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minWidth, maxWidth]);

  return (
    <>
      {/* 최대화 중이면 한쪽 패널이 숨겨지므로 핸들도 숨긴다. */}
      {maximizedId === null && (
        <div
          onMouseDown={startDrag}
          title="드래그하여 상세 너비 조절"
          style={{
            // ContentBody 의 gap(6px) 안에 핸들을 겹쳐 넣는다 — 폭 10 에 margin -8 씩이면
            // 레이아웃 기여 폭이 -6 이 되어 [패널][gap][핸들][gap][패널] 총 간격이 원래 6px 로 유지된다.
            // 히트 영역 10px 은 양쪽 패널 위로 2px 씩 걸치므로 zIndex 로 위에 올린다.
            width: 10,
            margin: "0 -8px",
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
            alignSelf: "stretch",
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 3, height: 44, borderRadius: 2, background: "#cbd5e1" }} />
        </div>
      )}
      <ContentPanel panelId={panelId} width={width} height={height}>
        {children}
      </ContentPanel>
    </>
  );
}
