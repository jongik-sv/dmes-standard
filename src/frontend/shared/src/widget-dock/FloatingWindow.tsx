"use client";

/**
 * 떠 있는 창 — 업무 도메인과 무관한 범용 부품(Part B §18). 위에 얇은 창 막대(끌기 손잡이·제목·접기·닫기), 아래에 본문.
 * - 막대를 끌어 옮기고 오른쪽 아래 손잡이로 크기를 바꾼다(포인터 이벤트·포인터 캡처). 끄는 동안은 창 안에서만 그리고, 놓을 때 onMove·onResize 를 한 번 부른다.
 * - 접으면 같은 자리에 둥근 아이콘 버튼(기본: 제목 첫 글자)만 남는다. 아이콘은 누르면 펼치고, 4px 넘게 끌면 옮기기만 한다.
 * - 접혀도 본문은 마운트한 채 숨긴다 — 계산기 값·편집 중인 글이 사라지지 않게.
 * - 창 안을 누르거나 포커스가 들어오면 onFocus(맨 앞으로 가져오기)를 부른다.
 * - 접기·펼치기를 이 창의 버튼으로 하면 키보드 포커스를 따라 옮긴다(접으면 아이콘, 펼치면 막대의 접기 버튼). 숨겨지는 버튼에 있던 포커스가 body 로 떨어지지 않게 한다.
 *   바깥에서 접힘이 바뀌는 경우(「도구」 메뉴로 펼치기·저장값 복원)는 포커스를 건드리지 않는다.
 * 위치는 부모(position 이 있는 층) 기준 px 이고, 끌기·크기 조절은 bounds 안으로 자른다.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { IconGripVertical, IconMinus, IconX } from "@tabler/icons-react";

import { FloatingWindowStyle } from "./styles";

/** 접기·펼치기 버튼을 누른 뒤 이 시간 안에 접힘이 바뀌어야 포커스를 옮긴다(상위가 거절한 요청이 나중 변경에 포커스를 뺏지 않게). */
const FOCUS_HANDOFF_MS = 1000;

/** 접힌 아이콘의 클릭과 끌기를 가르는 거리(px). 창 막대·크기 손잡이도 이만큼 움직여야 끌기로 본다. */
export const FLOATING_DRAG_THRESHOLD = 4;

export interface FloatingWindowProps {
  /** 막대 제목·aria-label·접힌 아이콘 기본 글자. */
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  zIndex?: number;
  /** 끌기·크기 조절을 자를 영역 크기(px). */
  bounds: { width: number; height: number };
  /** 기본 220. */
  minWidth?: number;
  /** 기본 160. */
  minHeight?: number;
  /** 접힌 아이콘 한 변(px, 기본 44). */
  iconSize?: number;
  /** 접힌 아이콘 내용(기본: 제목 첫 글자). */
  icon?: ReactNode;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  /** 창을 누르거나 포커스가 들어올 때(맨 앞으로 가져오기). */
  onFocus?: () => void;
  children: ReactNode;
  testId?: string;
  className?: string;
}

interface Gesture {
  kind: "move" | "resize" | "icon";
  pointerId: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  moved: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

export function FloatingWindow({
  title,
  x,
  y,
  width,
  height,
  collapsed,
  zIndex,
  bounds,
  minWidth = 220,
  minHeight = 160,
  iconSize = 44,
  icon,
  onMove,
  onResize,
  onToggleCollapse,
  onClose,
  onFocus,
  children,
  testId,
  className,
}: FloatingWindowProps) {
  const [live, setLive] = useState<Rect | null>(null);
  const liveRef = useRef<Rect | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  /** 아이콘을 끌고 놓은 뒤 따라오는 click 은 펼치기가 아니다. 다음 pointerdown 에서 풀린다(click 이 안 와도 남지 않게). */
  const suppressClickRef = useRef(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  /** 이 창의 접기·펼치기 버튼이 막 눌렸다 — 접힘이 바뀌면 그 버튼이 사라지므로 반대편 버튼으로 포커스를 옮긴다. */
  const focusHandoffRef = useRef<{ to: "icon" | "collapse"; at: number } | null>(null);

  useEffect(() => {
    const handoff = focusHandoffRef.current;
    focusHandoffRef.current = null;
    if (!handoff || Date.now() - handoff.at > FOCUS_HANDOFF_MS) return;
    (handoff.to === "icon" ? iconRef.current : collapseButtonRef.current)?.focus();
  }, [collapsed]);

  const setLiveRect = (rect: Rect | null) => {
    liveRef.current = rect;
    setLive(rect);
  };

  const begin = (kind: Gesture["kind"], e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (kind === "move" && (e.target as Element).closest("button")) return;
    suppressClickRef.current = false;
    if (kind === "icon") onFocus?.(); // 펼친 창은 section 의 onPointerDownCapture 가 이미 불렀다
    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: x,
      origY: y,
      origW: width,
      origH: height,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // 아이콘은 버튼 포커스·click 을 살린다. 막대·손잡이는 글자 선택을 막는다.
    if (kind !== "icon") e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (
      !g.moved &&
      Math.abs(dx) < FLOATING_DRAG_THRESHOLD &&
      Math.abs(dy) < FLOATING_DRAG_THRESHOLD
    )
      return;
    g.moved = true;
    if (g.kind === "resize") {
      const minW = Math.min(minWidth, bounds.width);
      const minH = Math.min(minHeight, bounds.height);
      setLiveRect({
        x: g.origX,
        y: g.origY,
        w: Math.round(clamp(g.origW + dx, minW, bounds.width - g.origX)),
        h: Math.round(clamp(g.origH + dy, minH, bounds.height - g.origY)),
      });
      return;
    }
    const shownW = g.kind === "icon" ? iconSize : g.origW;
    const shownH = g.kind === "icon" ? iconSize : g.origH;
    setLiveRect({
      x: Math.round(clamp(g.origX + dx, 0, bounds.width - shownW)),
      y: Math.round(clamp(g.origY + dy, 0, bounds.height - shownH)),
      w: g.origW,
      h: g.origH,
    });
  };

  const finish = (e: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    const rect = liveRef.current;
    setLiveRect(null);
    if (!g.moved) return;
    if (g.kind === "icon") suppressClickRef.current = true;
    if (!commit || !rect) return;
    if (g.kind === "resize") onResize(rect.w, rect.h);
    else onMove(rect.x, rect.y);
  };

  const gestureHandlers = (kind: Gesture["kind"]) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => begin(kind, e),
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
  });

  const toggleWithFocus = useCallback(() => {
    focusHandoffRef.current = { to: collapsed ? "collapse" : "icon", at: Date.now() };
    onToggleCollapse();
  }, [collapsed, onToggleCollapse]);

  const onIconClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleWithFocus();
  }, [toggleWithFocus]);

  const rect = live ?? { x, y, w: width, h: height };
  const dragging = live !== null;
  const iconText = icon ?? Array.from(title.trim())[0] ?? "?";

  return (
    <>
      <FloatingWindowStyle />
      {collapsed && (
        <button
          ref={iconRef}
          type="button"
          className="cm-float-win__icon"
          data-testid={testId ? `${testId}-icon` : undefined}
          data-dragging={dragging ? "true" : undefined}
          style={{ left: rect.x, top: rect.y, width: iconSize, height: iconSize, zIndex }}
          title={title}
          aria-label={`${title} 펼치기`}
          onClick={onIconClick}
          onFocus={onFocus}
          {...gestureHandlers("icon")}
        >
          {iconText}
        </button>
      )}
      <section
        className={className ? `cm-float-win ${className}` : "cm-float-win"}
        data-testid={testId}
        data-collapsed={collapsed ? "true" : undefined}
        data-dragging={dragging ? "true" : undefined}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          zIndex,
          display: collapsed ? "none" : undefined,
        }}
        onPointerDownCapture={onFocus}
        onFocusCapture={onFocus}
      >
        <div className="cm-float-win__bar" data-drag-handle="true" {...gestureHandlers("move")}>
          <span className="cm-float-win__grip" aria-hidden="true">
            <IconGripVertical size={14} stroke={2} />
          </span>
          <span className="cm-float-win__title" title={title}>
            {title}
          </span>
          <button
            ref={collapseButtonRef}
            type="button"
            className="cm-float-win__btn"
            data-action="collapse"
            title="접기"
            aria-label="접기"
            onClick={toggleWithFocus}
          >
            <IconMinus size={14} stroke={2} />
          </button>
          <button
            type="button"
            className="cm-float-win__btn"
            data-action="close"
            title="닫기"
            aria-label="닫기"
            onClick={onClose}
          >
            <IconX size={14} stroke={2} />
          </button>
        </div>
        <div className="cm-float-win__body">{children}</div>
        <div
          className="cm-float-win__resize"
          aria-hidden="true"
          data-resize-handle="true"
          {...gestureHandlers("resize")}
        />
      </section>
    </>
  );
}
