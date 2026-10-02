"use client";

/**
 * 클릭으로 여는 큰 상세 팝오버 — 트리거(정보 아이콘 또는 감싼 글자)를 누르면 팝업에 가까운 큰 패널(제목·닫기·내부 스크롤)이 열린다.
 * 툴팁에 담기 어려운 긴 설명(HTML 본문·표 등)을 그 자리에서 보여 줄 때 쓴다.
 *
 * - 패널은 document.body 로 portal + position:fixed 로 그린다 → 그리드 셀·모달 본문의 overflow 에 잘리지 않는다.
 *   Mantine Popover 를 쓰지 않는다: Transition 이 추가 커밋 뒤에 마운트돼 테스트에서 동기 조회가 안 된다(FormGroup.tsx 툴팁과 같은 판단).
 * - 닫힘: 닫기 단추, Esc, 패널·트리거 밖을 누를 때. 포커스가 패널 안에 있으면 Esc 는 바깥 모달을 닫지 않는다(markStopPropagation).
 * - 이벤트 전파: 트리거의 click·dblclick·mousedown·Enter/Space 키는 **네이티브 단계에서** 전파를 끊는다. ag-grid 는 행 컨테이너에
 *   네이티브 리스너를 달아 React 합성 이벤트의 stopPropagation 이 너무 늦다(행 선택·더블클릭·셀 편집 시작과 충돌).
 *   패널은 portal 이라 React 트리로는 트리거의 조상(예: 머리 onClick)까지 거슬러 오르므로 패널의 React 이벤트도 끊는다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { IconInfoCircle, IconX } from "@tabler/icons-react";

export interface DetailPopoverProps {
  /** 패널 제목. */
  title?: ReactNode;
  /** 제목 줄 오른쪽(닫기 단추 앞)에 둘 요소 — 예: 복사 단추. */
  headerExtra?: ReactNode;
  /** 패널 본문. 패널이 열려 있는 동안만 마운트된다(열 때 조회하는 컴포넌트를 그대로 넣어도 된다). */
  content: ReactNode;
  /** 트리거 안에 보일 내용. 비우면 정보 아이콘. 단추 안에 들어가므로 단추·링크 같은 대화형 요소를 넣지 않는다. */
  children?: ReactNode;
  /** 트리거 aria-label·title(기본 "상세 보기"). */
  triggerLabel?: string;
  /** 패널 폭(px, 기본 520). 화면이 좁으면 화면 폭에 맞춰 줄어든다. */
  width?: number;
  /** 패널 최대 높이(px, 기본 560). 넘치면 본문이 안에서 스크롤한다. 화면 공간이 모자라면 더 줄어든다. */
  maxHeight?: number;
  /** 제어 모드 열림 상태. 주면 onOpenChange 로 바꾼다. */
  opened?: boolean;
  /** 열림 상태가 바뀔 때(제어·비제어 모두 호출). */
  onOpenChange?: (opened: boolean) => void;
  /** 트리거를 끈다. */
  disabled?: boolean;
  /** 트리거 단추에 더할 클래스. */
  className?: string;
  /** data-testid 접두(기본 "detail-popover") — 트리거 `<testId>-trigger`, 패널 `<testId>-panel`. */
  testId?: string;
}

const STYLE_HREF = "cm-detail-popover";
const GAP = 4;
const GUTTER = 8;
const MIN_HEIGHT = 160;

export const DETAIL_POPOVER_CSS = `
.cm-dpop-trigger { display: inline-flex; align-items: center; gap: 2px; min-width: 0; max-width: 100%; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; line-height: inherit; text-align: inherit; cursor: pointer; vertical-align: middle; }
.cm-dpop-trigger:disabled { cursor: default; opacity: 0.5; }
.cm-dpop-trigger:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
.cm-dpop-trigger--icon { flex-shrink: 0; color: var(--color-text-muted); }
.cm-dpop-trigger--icon:hover:not(:disabled), .cm-dpop-trigger--icon[aria-expanded="true"] { color: var(--color-primary); }
.cm-dpop-trigger--text { color: var(--color-primary); text-decoration: underline dotted; text-underline-offset: 2px; }
.cm-dpop-trigger--text > * { min-width: 0; }
.cm-dpop { position: fixed; z-index: 9000; box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-modal); font-size: var(--font-size-sm); line-height: 1.5; text-align: left; white-space: normal; cursor: auto; }
.cm-dpop:focus { outline: none; }
.cm-dpop-head { display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0; padding: var(--spacing-sm) var(--spacing-md); background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); border-radius: var(--radius-md) var(--radius-md) 0 0; }
.cm-dpop-title { flex: 1 1 auto; min-width: 0; font-size: var(--font-size-lg); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-dpop-extra { display: inline-flex; align-items: center; gap: var(--spacing-xs); flex-shrink: 0; }
.cm-dpop-close { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.cm-dpop-close:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-dpop-close:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.cm-dpop-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: var(--spacing-md); overscroll-behavior: contain; }
`;

interface PanelPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

/** 트리거 아래(공간이 모자라고 위가 더 넓으면 위)에 놓고, 좌우는 화면 안으로 당긴다. */
export function computeDetailPopoverPosition(
  rect: Pick<DOMRect, "left" | "top" | "bottom">,
  viewport: { width: number; height: number },
  size: { width: number; maxHeight: number }
): PanelPosition {
  const width = Math.max(0, Math.min(size.width, viewport.width - GUTTER * 2));
  const left = Math.min(Math.max(rect.left, GUTTER), Math.max(GUTTER, viewport.width - width - GUTTER));
  const below = viewport.height - rect.bottom - GAP - GUTTER;
  const above = rect.top - GAP - GUTTER;
  const placeAbove = below < Math.min(size.maxHeight, MIN_HEIGHT * 2) && above > below;
  const room = Math.max(MIN_HEIGHT, placeAbove ? above : below);
  const maxHeight = Math.min(size.maxHeight, room);
  return placeAbove
    ? { left, bottom: viewport.height - rect.top + GAP, width, maxHeight }
    : { left, top: rect.bottom + GAP, width, maxHeight };
}

function DetailPopoverStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {DETAIL_POPOVER_CSS}
    </style>
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * 바깥 Mantine 모달은 window 캡처 단계에서 Esc 를 받아 닫는데(use-modal), 대상 요소에 `data-mantine-stop-propagation="true"` 가 있으면
 * 닫지 않는다(Mantine Select 드롭다운이 쓰는 약속). 패널 안에서 포커스를 받는 요소마다 이 표시를 달아 Esc 가 팝오버만 닫게 한다.
 */
const markStopPropagation = (e: FocusEvent<HTMLElement>) => {
  if (e.target instanceof HTMLElement) e.target.setAttribute("data-mantine-stop-propagation", "true");
};

export function DetailPopover({
  title,
  headerExtra,
  content,
  children,
  triggerLabel = "상세 보기",
  width = 520,
  maxHeight = 560,
  opened,
  onOpenChange,
  disabled = false,
  className,
  testId = "detail-popover",
}: DetailPopoverProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = opened ?? innerOpen;
  const [pos, setPos] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `${useId()}-title`;

  const setOpen = useCallback(
    (next: boolean) => {
      if (opened === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [opened, onOpenChange]
  );
  // 네이티브 리스너가 늘 최신 상태를 보게 한다(리스너를 상태마다 다시 달지 않는다).
  const latest = useRef({ open, setOpen, disabled });
  latest.current = { open, setOpen, disabled };

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    setPos(
      computeDetailPopoverPosition(
        el.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        { width, maxHeight }
      )
    );
  }, [width, maxHeight]);

  // 트리거: 네이티브 단계에서 전파를 끊고 여닫는다(위 머리 주석).
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const s = latest.current;
      if (s.disabled) return;
      s.setOpen(!s.open);
    };
    const swallow = (e: Event) => e.stopPropagation();
    const onKeyDown = (e: KeyboardEvent) => {
      // Enter·Space 는 단추의 click 으로 이어진다. 그리드(편집 시작·행 선택)로는 보내지 않는다.
      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    };
    el.addEventListener("click", onClick);
    el.addEventListener("dblclick", swallow);
    el.addEventListener("mousedown", swallow);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("dblclick", swallow);
      el.removeEventListener("mousedown", swallow);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  // 열린 동안: 바깥 누름·Esc 로 닫고, 창 크기·바깥 스크롤에 따라 자리를 다시 잡는다.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (!!panelRef.current?.contains(target) || !!triggerRef.current?.contains(target));
    const onPointerDown = (e: Event) => {
      if (!inside(e.target)) latest.current.setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      // 안쪽 요소(트리거를 둔 그리드·모달 본문)의 Esc 처리로 번지지 않게 끊는다. 바깥 Mantine 모달은 markStopPropagation 이 막는다.
      e.stopPropagation();
      e.preventDefault();
      latest.current.setOpen(false);
      triggerRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      // 패널 본문 스크롤은 무시한다(긴 설명을 내려 읽을 때 패널이 움직이지 않게).
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  // 열리면 패널에 포커스를 옮겨 키보드·화면 낭독기가 바로 읽게 한다. 자리가 처음 잡힐 때 한 번만 — 자리 재계산 때마다 포커스를 뺏지 않는다.
  const placed = pos != null;
  useEffect(() => {
    if (open && placed) panelRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const hasChildren = children !== undefined && children !== null && children !== false;
  const triggerClass = [
    "cm-dpop-trigger",
    hasChildren ? "cm-dpop-trigger--text" : "cm-dpop-trigger--icon",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const panelStyle: CSSProperties | undefined = pos
    ? {
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }
    : undefined;

  return (
    <>
      <DetailPopoverStyle />
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        data-testid={`${testId}-trigger`}
      >
        {hasChildren ? children : <IconInfoCircle size={14} stroke={1.8} aria-hidden="true" focusable="false" />}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="cm-dpop"
            role="dialog"
            aria-modal="false"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : triggerLabel}
            tabIndex={-1}
            style={panelStyle}
            data-testid={`${testId}-panel`}
            onClick={stop}
            onDoubleClick={stop}
            onMouseDown={stop}
            onPointerDown={stop}
            onKeyDown={stop}
            onContextMenu={stop}
            onFocus={markStopPropagation}
            data-mantine-stop-propagation="true"
          >
            <div className="cm-dpop-head">
              <div className="cm-dpop-title" id={titleId}>
                {title}
              </div>
              {headerExtra ? <div className="cm-dpop-extra">{headerExtra}</div> : null}
              <button
                type="button"
                className="cm-dpop-close"
                aria-label="닫기"
                title="닫기"
                onClick={close}
                data-testid={`${testId}-close`}
              >
                <IconX size={16} stroke={1.8} aria-hidden="true" focusable="false" />
              </button>
            </div>
            <div className="cm-dpop-body" data-testid={`${testId}-body`}>
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
