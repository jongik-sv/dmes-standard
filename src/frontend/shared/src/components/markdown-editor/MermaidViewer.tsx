"use client";

/**
 * mermaid 도식 크게 보기 — 화면 거의 전체(96vw × 92dvh) 오버레이 창에 같은 도식을 연다. MermaidDiagram 이 [크게 보기] 단추·더블클릭으로 연다.
 * 기본은 가로·세로가 모두 창 안에 들어오는 맞춤(작은 도식은 100% 를 넘겨 키우지 않는다). [−][배율][+][맞춤]·닫기가 있고, 넘치면 창 안에서 스크롤한다.
 * 끌어서 이동(pan)·Ctrl/⌘+휠 확대 축소를 지원한다. Esc·닫기·바깥(어두운 배경) 누름으로 닫고, 열린 동안 Tab 초점이 창 안에서만 돈다.
 * document.body 로 포털하고 z-index 가 Mantine 모달(200)보다 높아 모달 안 도식에서도 위에 뜬다. Esc·클릭·휠 이벤트는 바깥(위젯 도움말 모달 등)으로 새지 않게 막는다.
 * 같은 svg 를 본문과 창에 함께 넣으므로 창 쪽 svg 의 id·marker 이름은 retargetSvgIds 로 바꿔 겹치지 않게 한다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { IconMinus, IconPlus, IconX, IconZoomReset } from "@tabler/icons-react";
import { installHoverTipEscapeGuard } from "../hover-tip-escape-guard";
import { fitBoxScaleOf, MERMAID_VIEWER_ZOOM_STEPS, naturalSizeOf, nextZoom, retargetSvgIds, ZOOM_EPS } from "./mermaid-zoom";

export interface MermaidViewerProps {
  /** 그려진 mermaid SVG 문자열(MermaidDiagram 이 쓰는 것과 같은 값). */
  svg: string;
  /** 닫기 요청(Esc·닫기 단추·바깥 누름). */
  onClose: () => void;
  /** data-testid 접두(기본 "md-mermaid-viewer"). */
  testId?: string;
}

/** Mantine 모달(200)·팝오버(300)·위젯 도구 창(160) 위, 알림(10000) 아래. */
export const MERMAID_VIEWER_Z_INDEX = 9000;
/** 창 안쪽 여백(px). 맞춤 계산에서 뺀다. */
const PAD = 16;

const VIEWER_CSS = `
.md-mermaid-viewer-overlay{position:fixed;inset:0;z-index:${MERMAID_VIEWER_Z_INDEX};display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.6)}
.md-mermaid-viewer{box-sizing:border-box;display:flex;flex-direction:column;width:96vw;height:92dvh;max-width:96vw;max-height:92dvh;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.md-mermaid-viewer:focus{outline:none}
.md-mermaid-viewer-head{display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--color-border)}
.md-mermaid-viewer-title{flex:1;min-width:0;font-size:var(--font-size-sm);color:var(--color-text-secondary)}
.md-mermaid-viewer-scroll{flex:1;min-height:0;display:flex;overflow:auto;cursor:grab;overscroll-behavior:contain}
.md-mermaid-viewer-scroll[data-dragging="true"]{cursor:grabbing;user-select:none}
.md-mermaid-viewer-scroll:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
.md-mermaid-viewer-inner{flex:none;margin:auto;padding:${PAD}px}
@media print{.md-mermaid-viewer-overlay{display:none!important}}
`;

/** Mantine Modal 은 window 캡처 keydown 에서 Esc 로 닫되 대상에 이 표지가 있으면 건너뛴다 — 창 안 초점 요소마다 달아 Esc 가 아래 모달을 닫지 않게 한다. */
const NO_MODAL_ESC = { "data-mantine-stop-propagation": "true" } as const;

/** 창 안에서 초점을 받을 수 있는 요소(Tab 순환용). */
const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MermaidViewer({ svg, onClose, testId = "md-mermaid-viewer" }: MermaidViewerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null); // null = 맞춤
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);

  const nat = naturalSizeOf(svg);
  const natW = nat?.w;
  const natH = nat?.h;
  const html = useMemo(() => ({ __html: retargetSvgIds(svg, "-zoom") }), [svg]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const w = Math.max(0, el.clientWidth - PAD * 2);
    const h = Math.max(0, el.clientHeight - PAD * 2);
    setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    let ro: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const fit = natW && natH ? fitBoxScaleOf({ w: natW, h: natH }, box.w, box.h) : 1;
  const scale = zoom ?? fit;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // svg 크기를 자연 크기 × 배율 픽셀로 둔다.
  useLayoutEffect(() => {
    const el = innerRef.current?.querySelector("svg");
    if (!el || !natW || !natH) return;
    el.style.maxWidth = "none";
    el.style.display = "block";
    el.style.width = `${natW * scale}px`;
    el.style.height = `${natH * scale}px`;
    el.setAttribute("width", String(natW * scale));
    el.setAttribute("height", String(natH * scale));
  });

  // 초점이 body 로 빠진 채 누른 Esc 도 아래 모달이 닫지 않게, 열려 있는 동안 상호작용 카드 가드에 한 자리를 더한다(가드는 Esc 대상에 표지를 달아 준다).
  useEffect(() => {
    const guard = installHoverTipEscapeGuard();
    if (guard) guard.open += 1;
    return () => {
      if (guard) guard.open -= 1;
    };
  }, []);

  // 열릴 때 창으로 초점을 옮긴다(닫은 뒤 복귀는 연 쪽이 맡는다).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // 휠·터치 이동 이벤트가 위쪽(Mantine 모달의 스크롤 잠금 등 document 리스너)으로 새지 않게 막고, Ctrl/⌘+휠은 확대 축소로 쓴다.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      // 스크롤 영역 밖(배경·머리줄)의 휠은 뒤 화면이 스크롤되지 않게 막는다.
      if (!scrollRef.current?.contains(e.target as Node)) e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY !== 0) setZoom(nextZoom(scaleRef.current, e.deltaY < 0 ? 1 : -1, MERMAID_VIEWER_ZOOM_STEPS));
      }
    };
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", stop);
    el.addEventListener("touchstart", stop);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 창 안의 키는 바깥(모달의 Esc 닫기 등)으로 보내지 않는다.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const dlg = dialogRef.current;
    if (!dlg) return;
    const items = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.getAttribute("aria-disabled") !== "true");
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dlg)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!active || !dlg.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    // 스크롤바를 누른 것은 이동으로 다루지 않는다(스크롤바는 clientWidth·clientHeight 바깥).
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left >= el.clientWidth || e.clientY - r.top >= el.clientHeight) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setDragging(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 포인터 캡처를 못 해도 이동은 창 안에서 동작한다. */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    if (e.buttons === 0) {
      endDrag(); // 포인터 캡처를 못 한 채 창 밖에서 놓은 경우
      return;
    }
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };

  const pct = Math.round(scale * 100);
  const canOut = scale > MERMAID_VIEWER_ZOOM_STEPS[0] + ZOOM_EPS;
  const canIn = scale < MERMAID_VIEWER_ZOOM_STEPS[MERMAID_VIEWER_ZOOM_STEPS.length - 1] - ZOOM_EPS;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="md-mermaid-viewer-overlay"
      data-testid={`${testId}-overlay`}
      {...NO_MODAL_ESC}
      onMouseDown={(e) => {
        e.stopPropagation();
        downOnBackdrop.current = e.button === 0 && e.target === e.currentTarget;
      }}
      onClick={(e) => {
        e.stopPropagation();
        // 어두운 배경에서 누르고 뗀 경우만 닫는다(창 안에서 끌다 배경에서 놓은 것은 제외).
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
      onKeyDown={onKeyDown}
    >
      <style>{VIEWER_CSS}</style>
      <div ref={dialogRef} className="md-mermaid-viewer" role="dialog" aria-modal="true" aria-label="도식 크게 보기" tabIndex={-1} data-testid={testId} {...NO_MODAL_ESC} data-scale={pct}>
        <div className="md-mermaid-viewer-head" role="toolbar" aria-label="도식 크기">
          <span className="md-mermaid-viewer-title">도식 크게 보기</span>
          <button
            type="button"
            {...NO_MODAL_ESC}
            className="md-mermaid-btn"
            aria-label="도식 축소"
            title="도식 축소"
            aria-disabled={!canOut}
            onClick={() => canOut && setZoom(nextZoom(scale, -1, MERMAID_VIEWER_ZOOM_STEPS))}
          >
            <IconMinus size={14} aria-hidden="true" focusable="false" />
          </button>
          <span className="md-mermaid-scale" aria-live="polite" data-testid={`${testId}-scale`}>
            {pct}%
          </span>
          <button
            type="button"
            {...NO_MODAL_ESC}
            className="md-mermaid-btn"
            aria-label="도식 확대"
            title="도식 확대"
            aria-disabled={!canIn}
            onClick={() => canIn && setZoom(nextZoom(scale, 1, MERMAID_VIEWER_ZOOM_STEPS))}
          >
            <IconPlus size={14} aria-hidden="true" focusable="false" />
          </button>
          <button type="button" {...NO_MODAL_ESC} className="md-mermaid-btn" aria-label="도식 크기 맞춤" title="도식 크기 맞춤" onClick={() => setZoom(null)}>
            <IconZoomReset size={14} aria-hidden="true" focusable="false" />
          </button>
          <button type="button" {...NO_MODAL_ESC} className="md-mermaid-btn" aria-label="도식 크게 보기 닫기" title="닫기 (Esc)" data-testid={`${testId}-close`} onClick={onClose}>
            <IconX size={14} aria-hidden="true" focusable="false" />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="md-mermaid-viewer-scroll"
          role="img"
          aria-label="mermaid 도식 크게 보기"
          tabIndex={0}
          {...NO_MODAL_ESC}
          data-dragging={dragging}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div ref={innerRef} className="md-mermaid-viewer-inner" dangerouslySetInnerHTML={html} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
