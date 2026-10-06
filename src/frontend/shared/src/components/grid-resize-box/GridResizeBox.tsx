"use client";

/**
 * GridResizeBox — 24열 격자 단위로 크기를 마우스로 끌어 바꾸는 틀. 안쪽 children 을 틀 크기로 그린다.
 * - 오른쪽 가장자리(가로)·아래 가장자리(세로)·오른쪽 아래 모서리(가로+세로)에 손잡이가 있다.
 * - 끄는 동안 격자 단위로 맞춘 크기가 「12×8」 꼴로 보이고(onResize 로도 알림), 놓으면 onResizeEnd 로 확정 크기를 준다.
 * - 화살표 키로도 손잡이에서 한 칸씩 바꿀 수 있다.
 * - 색·간격은 공통 토큰만 쓰고, 스타일은 컴포넌트가 자기 `<style>` 을 넣는다(Part B §18-3).
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import {
  DEFAULT_GRID_METRICS,
  gridBoxPx,
  snapGridSize,
  type GridMetrics,
  type GridSize,
  type GridSizeLimits,
} from "./grid-size";

const STYLE_HREF = "dk-grid-resize-box";

const CSS = `
.dk-grb { position: relative; max-width: 100%; }
.dk-grb__body { width: 100%; height: 100%; }
.dk-grb[data-resizing="true"] { user-select: none; }
.dk-grb[data-resizing="true"] .dk-grb__body { pointer-events: none; }
.dk-grb__handle { position: absolute; z-index: 5; touch-action: none; background: transparent; }
.dk-grb__handle:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 0; }
.dk-grb__handle--e { top: 0; right: -4px; bottom: 12px; width: 8px; cursor: ew-resize; }
.dk-grb__handle--s { left: 0; right: 12px; bottom: -4px; height: 8px; cursor: ns-resize; }
.dk-grb__handle--se { right: -4px; bottom: -4px; width: 14px; height: 14px; cursor: nwse-resize; }
.dk-grb__handle:hover, .dk-grb[data-resizing="true"] .dk-grb__handle { background: var(--color-primary-soft); }
.dk-grb__handle--se::after { content: ""; position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px; border-right: 2px solid var(--color-primary); border-bottom: 2px solid var(--color-primary); }
.dk-grb__badge { position: absolute; right: 6px; bottom: 6px; z-index: 6; padding: 1px 6px; font-size: var(--font-size-xs); font-weight: 700; color: var(--color-on-primary); background: var(--color-primary); border-radius: var(--radius-sm); pointer-events: none; }
.dk-grb[data-disabled="true"] .dk-grb__handle { display: none; }
`;

type Handle = "e" | "s" | "se";

const HANDLE_LABEL: Record<Handle, string> = {
  e: "가로 크기 조절",
  s: "세로 크기 조절",
  se: "가로·세로 크기 조절",
};

export interface GridResizeBoxProps {
  /** 현재 확정 크기(칸 단위). */
  size: GridSize;
  /** 24열 전체의 폭(px) — 가로 한 칸의 폭 = areaWidth / cols. */
  areaWidth: number;
  /** 끄는 중 크기가 바뀔 때마다. 놓거나 취소하면 null. */
  onResize?: (size: GridSize | null) => void;
  /** 놓았을 때 — 확정 크기. 크기가 그대로이면 부르지 않는다. */
  onResizeEnd: (size: GridSize) => void;
  /** 크기 한도(칸). 가로는 늘 1~cols 안이다. */
  limits?: GridSizeLimits;
  /** 격자 규격. 기본은 위젯 보드(24열·행 높이 20·간격 8). */
  metrics?: GridMetrics;
  /** true 이면 손잡이를 숨기고 끌 수 없다. */
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  children?: ReactNode;
}

interface DragState {
  handle: Handle;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export function GridResizeBox({
  size,
  areaWidth,
  onResize,
  onResizeEnd,
  limits,
  metrics = DEFAULT_GRID_METRICS,
  disabled = false,
  className,
  style,
  testId = "grid-resize-box",
  children,
}: GridResizeBoxProps) {
  const [live, setLive] = useState<GridSize | null>(null);
  const drag = useRef<DragState | null>(null);
  const liveRef = useRef<GridSize | null>(null);

  const shown = live ?? size;
  const box = gridBoxPx(areaWidth, shown, metrics);

  const update = (next: GridSize | null) => {
    liveRef.current = next;
    setLive(next);
    onResize?.(next);
  };

  const finish = (commit: boolean) => {
    const done = liveRef.current;
    drag.current = null;
    update(null);
    if (commit && done && (done.w !== size.w || done.h !== size.h)) onResizeEnd(done);
  };

  const onPointerDown = (handle: Handle) => (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || areaWidth <= 0 || e.button !== 0) return;
    const start = gridBoxPx(areaWidth, size, metrics);
    drag.current = {
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: start.width,
      startHeight: start.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    update(size);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const width = d.handle === "s" ? d.startWidth : d.startWidth + (e.clientX - d.startX);
    const height = d.handle === "e" ? d.startHeight : d.startHeight + (e.clientY - d.startY);
    const next = snapGridSize(areaWidth, { width, height }, limits, metrics);
    const prev = liveRef.current;
    if (!prev || prev.w !== next.w || prev.h !== next.h) update(next);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    finish(true);
  };

  const onKeyDown = (handle: Handle) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || areaWidth <= 0) return;
    const dw = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const dh = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if ((dw === 0 && dh === 0) || (handle === "e" && dh !== 0) || (handle === "s" && dw !== 0)) return;
    e.preventDefault();
    const start = gridBoxPx(areaWidth, size, metrics);
    const colPx = areaWidth / metrics.cols;
    const rowPx = metrics.rowHeight + metrics.gap;
    const next = snapGridSize(
      areaWidth,
      { width: start.width + dw * colPx, height: start.height + dh * rowPx },
      limits,
      metrics
    );
    if (next.w !== size.w || next.h !== size.h) onResizeEnd(next);
  };

  const handles: Handle[] = ["e", "s", "se"];

  return (
    <>
      <style href={STYLE_HREF} precedence="default">
        {CSS}
      </style>
      <div
        className={className ? `dk-grb ${className}` : "dk-grb"}
        style={{ ...style, width: box.width, height: box.height }}
        data-testid={testId}
        data-resizing={live ? "true" : "false"}
        data-disabled={disabled ? "true" : "false"}
      >
        <div className="dk-grb__body">{children}</div>
        {handles.map((h) => (
          <div
            key={h}
            className={`dk-grb__handle dk-grb__handle--${h}`}
            role="separator"
            tabIndex={disabled ? -1 : 0}
            aria-label={HANDLE_LABEL[h]}
            data-testid={`${testId}-handle-${h}`}
            onPointerDown={onPointerDown(h)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => finish(false)}
            onKeyDown={onKeyDown(h)}
          />
        ))}
        {live && (
          <span className="dk-grb__badge" data-testid={`${testId}-badge`}>
            {live.w}×{live.h}
          </span>
        )}
      </div>
    </>
  );
}
