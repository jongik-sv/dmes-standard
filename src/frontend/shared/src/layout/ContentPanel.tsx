"use client";

import React from "react";
import { Paper } from "@mantine/core";
import { useContentMaximize } from "./ContentBody";

export interface ContentPanelProps {
  /** 최대화 대상 id. 설정 시 ContentBody 의 maximize 컨텍스트와 연동되어 자신이 최대화되거나(풀영역) 다른 패널 최대화 시 숨겨진다. */
  panelId?: string;
  flex?: string | number;
  width?: string | number;
  height?: string | number;
  children: React.ReactNode;
}

export function ContentPanel({ panelId, flex, width, height, children }: ContentPanelProps) {
  const { maximizedId } = useContentMaximize();

  const hasMaximize = !!panelId;
  const isMaximized = hasMaximize && maximizedId === panelId;
  const isHidden = hasMaximize && maximizedId !== null && maximizedId !== panelId;

  const style: React.CSSProperties = { position: "relative" };

  if (isHidden) {
    style.display = "none";
  } else if (isMaximized) {
    style.flex = "1 1 100%";
  } else if (width) {
    style.width = typeof width === "number" ? `${width}px` : width;
    style.flexShrink = 0;
  } else if (flex) {
    style.flex = flex;
  } else {
    style.flex = "1 1 0";
  }

  if (height) {
    style.height = typeof height === "number" ? `${height}px` : height;
  }

  return (
    <Paper withBorder className="content-panel" style={style}>
      {children}
    </Paper>
  );
}
