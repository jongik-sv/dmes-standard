"use client";

/**
 * 대시보드 카드 — 머리(제목·부제·표지·동작·접기) + 선택적 도구 줄 + 본문, 선택적 크기 조절 손잡이.
 * - height 를 주면 카드 높이를 고정하고 본문만 스크롤한다. 본문 내용 길이가 바뀌어도 격자 배치가 움직이지 않는다.
 * - bodyLayout="fill" 은 본문을 세로 flex 로 두고 스크롤하지 않는다. 안에 ContentBody(분할)처럼 높이를 채우는
 *   레이아웃을 둘 때 쓴다(그 레이아웃이 자기 스크롤을 맡는다).
 * - 접기는 행 단위만 있다: DashboardRow 안 카드에 collapsible 을 주면 머리 오른쪽에 "이 줄 접기" 버튼이 생기고,
 *   어느 카드의 버튼을 눌러도 그 행의 카드가 모두(버튼이 없는 카드 포함) 머리만 남는다. 행 밖 카드는 접지 않는다.
 *   본문은 숨길 뿐 언마운트하지 않아 안쪽 상태가 유지된다.
 * - resizable: 오른쪽 가장자리를 끌면 넓은 화면 칸 수(12열 격자 칸 단위, 최소 minSpan), 아래 가장자리를 끌면
 *   높이(최소 minHeight)를 바꾼다. 방향키로도 조절하고(폭 ±1칸, 높이 ±20px), 손잡이를 두 번 누르면 그 치수만 기본값으로 돌아간다.
 *   1100px 이하(세로 쌓기)에서는 폭 손잡이를 숨긴다.
 * - 접힘·칸 수·높이는 cardId 로 DashboardGrid 의 배치 상태에 저장된다(layoutKey 가 있으면 사용자별로 브라우저에 남는다).
 *   그리드 밖에서 단독으로 쓰면 카드 안 상태로만 동작한다.
 * - children 에 함수를 주면 본문 크기 { width, height } 를 받는다. height 는 카드 높이가 정해져 있을 때(height prop·사용자 조절)만
 *   숫자이고, 내용 높이를 따르는 카드에서는 null 이다(본문 높이를 내용에 되먹이면 순환한다). 차트를 본문 크기에 맞춰 다시 그릴 때 쓴다.
 * - 보드(DashboardBoard) 위젯 칸 안이면 위젯 정의(DashboardWidget)가 ID·칸 수·높이·최소값을 정하고(카드 props 는 정의에 없는 값만 쓴다),
 *   접기 버튼은 늘 있으며, 크기 손잡이·끌기 손잡이·숨기기 버튼은 편집 모드에서만 그린다. 편집 모드에서는 점선 테두리로 표시하고
 *   머리(버튼·입력 제외)나 끌기 손잡이를 끌어 옮긴다. 손잡이에 초점을 두면 방향키로 옮긴다(←→ 같은 행, ↑↓ 위·아래 행, Shift+↑↓ 새 행).
 * 머리 모양은 패널 머리 표준(32px, --color-bg-header, 제목 13px 700)을 따른다. 손잡이는 짧은 grip 과 커서만 보인다(한 변 컬러 바 금지).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { spanAttributes, type DashboardSpan, type DashboardSpanProps } from "./DashboardGrid";
import {
  clampHeight,
  clampSpan,
  useDashboardLayout,
  widthToSpan,
  type DashboardCardLayout,
} from "./layout";
import { useDashboardRow } from "./DashboardRow";
import { useDashboardBoardItem } from "./board-context";
import type { DashboardMoveKey } from "./board-state";
import { DashboardStyle } from "./styles";

export interface DashboardBodySize {
  /** 본문 안쪽 폭(px, 여백 제외). 재기 전·접힌 동안은 0. */
  width: number;
  /** 본문 안쪽 높이(px). 카드 높이가 정해져 있지 않으면 null. */
  height: number | null;
}

export interface DashboardCardProps extends DashboardSpanProps {
  /** 카드 제목. */
  title: ReactNode;
  /** 제목 옆 흐린 부제(단위·기간·건수 등). */
  subtitle?: ReactNode;
  /** 부제 뒤에 붙는 표지(배지 등). */
  titleExtra?: ReactNode;
  /** 머리 오른쪽 동작(링크 버튼·배지 등). */
  actions?: ReactNode;
  /** 머리 아래 도구 줄(필터 등). 본문과 함께 스크롤하지 않는다. */
  toolbar?: ReactNode;
  /** 카드 높이(px). 주면 본문만 스크롤한다. 사용자가 높이를 조절하면 그 값이 우선한다. */
  height?: number;
  /** 본문 배치 — flow(기본, 일반 흐름) · fill(세로 flex, 스크롤 없음). */
  bodyLayout?: "flow" | "fill";
  /** 본문 안쪽 여백. 기본 flow=true(10px) · fill=false. fill 에서 true 면 위쪽 8px 만 준다. */
  bodyPadding?: boolean;
  /** 배치 저장용 카드 ID(같은 DashboardGrid 안에서 고유). 크기 조절 값을 저장하려면 준다. */
  cardId?: string;
  /** 행 접기 버튼을 이 카드 머리에 둔다(기본 false). DashboardRow(collapsible) 안에서만 그린다. */
  collapsible?: boolean;
  /** 크기 조절 — true(폭·높이) · "width" · "height" (기본 false). */
  resizable?: boolean | "width" | "height";
  /** 폭 조절 최소 칸 수(기본 3). */
  minSpan?: number;
  /** 높이 조절 최소값(px, 기본 120). */
  minHeight?: number;
  /** 본문. 함수면 본문 크기를 받는다. */
  children?: ReactNode | ((size: DashboardBodySize) => ReactNode);
  /** 뿌리 aria-label(기본: title 이 문자열이면 그 값). */
  ariaLabel?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

/**
 * 접기 버튼 화살표. 아이콘 패키지(@tabler/icons-react) 대신 인라인 SVG 를 쓴다 — 아이콘 패키지 선언 파일이 커서
 * dashboard entry 의 .d.ts 빌드가 기본 힙(4GB)을 넘었다(2026-10-02).
 */
function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

/** 끌기 손잡이(점 6개). */
function GripIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="3" r="1.3" />
      <circle cx="8.5" cy="3" r="1.3" />
      <circle cx="3.5" cy="7" r="1.3" />
      <circle cx="8.5" cy="7" r="1.3" />
      <circle cx="3.5" cy="11" r="1.3" />
      <circle cx="8.5" cy="11" r="1.3" />
    </svg>
  );
}

/** 숨기기 버튼(눈 감김). */
function HideIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.3 9.5 7a13 13 0 0 1-2.6 3.8M6.6 6.6C4.5 8 3.1 10.1 2.5 12c1 2.7 4.5 7 9.5 7a9.6 9.6 0 0 0 4.2-.9" />
    </svg>
  );
}

/** 편집 모드 머리 끌기에서 빼는 요소 — 머리 안 버튼·입력·링크·크기 손잡이. 끌기 손잡이는 끌기를 시작한다. */
const NO_DRAG_SELECTOR =
  'button:not(.cm-dash-card__drag), a, input, select, textarea, label, [role="separator"], [contenteditable="true"]';

const MOVE_KEYS: Record<string, { plain: DashboardMoveKey; shift?: DashboardMoveKey }> = {
  ArrowLeft: { plain: "left" },
  ArrowRight: { plain: "right" },
  ArrowUp: { plain: "up", shift: "newRowAbove" },
  ArrowDown: { plain: "down", shift: "newRowBelow" },
};

const KEY_SPAN_STEP = 1;
const KEY_HEIGHT_STEP = 20;

/** 본문 크기를 잰다(함수 children 일 때만). rAF 로 묶고 값이 바뀔 때만 갱신한다. */
function useBodySize(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const cs = getComputedStyle(el);
      const w =
        el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
      const h =
        el.clientHeight - parseFloat(cs.paddingTop || "0") - parseFloat(cs.paddingBottom || "0");
      const next = { width: Math.max(0, Math.round(w)), height: Math.max(0, Math.round(h)) };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [enabled]);
  return { ref, size };
}

export function DashboardCard({
  title,
  subtitle,
  titleExtra,
  actions,
  toolbar,
  height: heightProp,
  bodyLayout = "flow",
  bodyPadding,
  cardId: cardIdProp,
  collapsible: collapsibleProp = false,
  resizable: resizableProp = false,
  minSpan: minSpanProp = 3,
  minHeight: minHeightProp = 120,
  children,
  ariaLabel,
  className,
  testId,
  ...spanPropsIn
}: DashboardCardProps) {
  // 보드 위젯 칸 안이면 위젯 정의가 ID·크기를 정하고(카드 props 는 정의에 없는 값만), 크기 조절은 편집 모드에서만 된다.
  const item = useDashboardBoardItem();
  const widget = item?.widget;
  const editing = item?.editing === true;
  const cardId = widget ? widget.id : cardIdProp;
  const collapsible = widget ? true : collapsibleProp;
  // sizable: 저장된 사용자 크기를 적용하는지. 손잡이(resizable)는 보드 안이면 편집 모드에서만 보인다.
  const sizable = widget ? (widget.resizable ?? true) : resizableProp;
  const resizable = widget && !editing ? false : sizable;
  const minSpan = widget?.minSpan ?? minSpanProp;
  const minHeight = widget?.minHeight ?? minHeightProp;
  const height = widget?.height ?? heightProp;
  const spanProps: DashboardSpanProps = widget
    ? {
        span: widget.span ?? spanPropsIn.span,
        spanMd: widget.spanMd ?? spanPropsIn.spanMd,
        spanSm: widget.spanSm ?? spanPropsIn.spanSm,
      }
    : spanPropsIn;
  const ctx = useDashboardLayout();
  const [localLayout, setLocalLayout] = useState<DashboardCardLayout>({});
  const shared = ctx != null && cardId != null;
  // 끄는 동안의 크기는 카드 안 상태로만 둔다 — 배치 상태(보드면 화면 상태)를 매 프레임 바꾸면 모든 위젯이 다시 그려진다.
  // 놓을 때 한 번 저장한다.
  const [dragPatch, setDragPatch] = useState<DashboardCardLayout | null>(null);
  const savedLayout: DashboardCardLayout = shared ? ctx.get(cardId) : localLayout;
  const layout: DashboardCardLayout = dragPatch ? { ...savedLayout, ...dragPatch } : savedLayout;
  const update = (patch: DashboardCardLayout, persist = true) => {
    if (shared) ctx.update(cardId, patch, persist);
    else
      setLocalLayout((prev) => {
        const next: DashboardCardLayout = { ...prev };
        for (const k of Object.keys(patch) as Array<keyof DashboardCardLayout>) {
          const v = patch[k];
          if (v === undefined || v === false) delete next[k];
          else (next as Record<string, unknown>)[k] = v;
        }
        return next;
      });
  };
  const commit = () => {
    if (shared) ctx.commit();
  };

  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<"x" | "y" | null>(null);

  const row = useDashboardRow();
  // 접기는 행 단위만 — 카드는 자기 행의 접힘을 따르고, 버튼은 행 전체를 토글한다.
  const rowCollapsible = row != null && row.collapsible;
  const collapsed = rowCollapsible && row.collapsed;
  const showToggle = collapsible && rowCollapsible;
  const toggleLabel = collapsed ? "이 줄 펼치기" : "이 줄 접기";
  const canWidth = resizable === true || resizable === "width";
  const canHeight = resizable === true || resizable === "height";
  const keepWidth = sizable === true || sizable === "width";
  const keepHeight = sizable === true || sizable === "height";
  const declaredSpan = spanProps.span ?? 12;
  const effectiveSpan = (keepWidth && layout.span ? layout.span : declaredSpan) as DashboardSpan;
  const fixedHeight = collapsed ? undefined : keepHeight && layout.height ? layout.height : height;

  const renderProp = typeof children === "function";
  const { ref: bodyRef, size } = useBodySize(renderProp);

  const padded = bodyPadding ?? bodyLayout === "flow";
  const classes = ["cm-dash-card"];
  if (fixedHeight != null) classes.push("cm-dash-card--fixed");
  if (collapsed) classes.push("cm-dash-card--collapsed");
  if (className) classes.push(className);
  const bodyClasses = ["cm-dash-card__body"];
  if (bodyLayout === "fill") bodyClasses.push("cm-dash-card__body--fill");
  if (padded) bodyClasses.push("cm-dash-card__body--padded");

  // 좁은 화면 규칙은 코드에 선언한 span 으로 계산하고, 넓은 화면 칸 수만 사용자 값으로 바꾼다.
  const spanAttrs = spanAttributes(spanProps);
  spanAttrs["data-span"] = String(effectiveSpan);

  /* ── 끌기 ── */
  const startDrag = (e: PointerEvent<HTMLDivElement>, axis: "x" | "y") => {
    if (e.button !== 0) return;
    const card = sectionRef.current;
    if (!card) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const grid = card.parentElement;
    const gridWidth = grid ? grid.clientWidth : rect.width;
    const gap = grid ? parseFloat(getComputedStyle(grid).columnGap || "0") || 0 : 0;
    const start = axis === "x" ? e.clientX : e.clientY;
    let raf = 0;
    let latest: DashboardCardLayout | null = null;
    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = (axis === "x" ? ev.clientX : ev.clientY) - start;
      latest =
        axis === "x"
          ? { span: widthToSpan(rect.width + delta, gridWidth, gap, minSpan) }
          : { height: clampHeight(rect.height + delta, minHeight) };
      if (raf === 0)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (latest) setDragPatch(latest);
        });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (raf !== 0) cancelAnimationFrame(raf);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragging(null);
      setDragPatch(null);
      if (latest) update(latest, true);
      else commit();
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    setDragging(axis);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>, axis: "x" | "y") => {
    const dec = axis === "x" ? "ArrowLeft" : "ArrowUp";
    const inc = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const sign = e.key === inc ? 1 : -1;
    if (axis === "x") {
      update({ span: clampSpan(effectiveSpan + sign * KEY_SPAN_STEP, minSpan) });
    } else {
      const cur =
        fixedHeight ?? Math.round(sectionRef.current?.getBoundingClientRect().height ?? minHeight);
      update({ height: clampHeight(cur + sign * KEY_HEIGHT_STEP, minHeight) });
    }
  };

  /* ── 보드 편집 ── */
  const widgetName = widget?.title ?? (typeof title === "string" ? title : "카드");
  const showHide = editing && widget?.hideable !== false;
  const onDragKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const m = MOVE_KEYS[e.key];
    if (!m || !item) return;
    e.preventDefault();
    item.moveByKey(e.shiftKey && m.shift ? m.shift : m.plain);
  };

  const body =
    typeof children === "function"
      ? children({
          width: size.width,
          height: fixedHeight != null && size.height > 0 ? size.height : null,
        })
      : children;

  return (
    <section
      ref={sectionRef}
      className={classes.join(" ")}
      style={fixedHeight != null ? { height: fixedHeight } : undefined}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      data-testid={testId}
      data-collapsed={collapsed ? "true" : undefined}
      data-widget-id={widget?.id}
      data-editing={editing ? "true" : undefined}
      {...spanAttrs}
    >
      <DashboardStyle />
      <header
        className="cm-dash-card__head"
        onPointerDown={
          editing
            ? (e) => {
                if ((e.target as Element).closest?.(NO_DRAG_SELECTOR)) return;
                item?.startDrag(e);
              }
            : undefined
        }
      >
        {editing && item && (
          <button
            type="button"
            className="cm-dash-card__drag"
            aria-label={`${widgetName} 옮기기`}
            aria-describedby={item.hintId}
            title="끌어서 옮기기 · 방향키로도 옮깁니다"
            onKeyDown={onDragKey}
          >
            <GripIcon />
          </button>
        )}
        <h3 className="cm-dash-card__title">{title}</h3>
        {subtitle != null && <span className="cm-dash-card__sub">{subtitle}</span>}
        {titleExtra != null && <span className="cm-dash-card__extra">{titleExtra}</span>}
        {(actions != null || showToggle || showHide) && (
          <div className="cm-dash-card__actions">
            {actions}
            {showHide && (
              <button
                type="button"
                className="cm-dash-card__toggle cm-dash-card__hide"
                aria-label={`${widgetName} 숨기기`}
                title="숨기기 — [위젯 추가]에서 다시 놓을 수 있습니다"
                onClick={() => item?.hide()}
              >
                <HideIcon />
              </button>
            )}
            {showToggle && (
              <button
                type="button"
                className="cm-dash-card__toggle"
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                aria-label={toggleLabel}
                title={toggleLabel}
                onClick={() => row?.toggle()}
              >
                <Chevron up={!collapsed} />
              </button>
            )}
          </div>
        )}
      </header>
      {toolbar != null && (
        <div className="cm-dash-card__toolbar" hidden={collapsed}>
          {toolbar}
        </div>
      )}
      <div id={bodyId} ref={bodyRef} className={bodyClasses.join(" ")} hidden={collapsed}>
        {body}
      </div>
      {!collapsed && canWidth && (
        <div
          className="cm-dash-card__resize cm-dash-card__resize--x"
          role="separator"
          aria-orientation="vertical"
          aria-label="카드 폭 조절"
          aria-valuemin={minSpan}
          aria-valuemax={12}
          aria-valuenow={effectiveSpan}
          tabIndex={0}
          title="끌어서 폭 조절(격자 칸 단위) · 두 번 누르면 기본 폭"
          data-dragging={dragging === "x" ? "true" : undefined}
          onPointerDown={(e) => startDrag(e, "x")}
          onKeyDown={(e) => onHandleKey(e, "x")}
          onDoubleClick={() => update({ span: undefined })}
        >
          <span className="cm-dash-card__grip" />
        </div>
      )}
      {!collapsed && canHeight && (
        <div
          className="cm-dash-card__resize cm-dash-card__resize--y"
          role="separator"
          aria-orientation="horizontal"
          aria-label="카드 높이 조절"
          tabIndex={0}
          title="끌어서 높이 조절 · 두 번 누르면 기본 높이"
          data-dragging={dragging === "y" ? "true" : undefined}
          onPointerDown={(e) => startDrag(e, "y")}
          onKeyDown={(e) => onHandleKey(e, "y")}
          onDoubleClick={() => update({ height: undefined })}
        >
          <span className="cm-dash-card__grip" />
        </div>
      )}
    </section>
  );
}
