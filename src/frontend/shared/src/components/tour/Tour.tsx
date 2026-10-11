"use client";

/**
 * 처음 둘러보기(말풍선 안내) — 업무 도메인과 무관한 범용 부품(Part B §18).
 * 단계마다 화면의 한 요소(CSS 선택자)를 밝게 강조하고 그 옆에 말풍선을 띄운다. 대상이 없으면 화면 가운데에 띄운다.
 *
 * - `open` 이 false 면 아무것도 그리지 않는다. true 면 `document.body` 로 포털한다.
 * - 비모달이다. 강조 층은 `pointer-events: none` 이라 뒤 화면을 그대로 조작할 수 있다(Esc = 건너뛰기).
 * - 「다시 보지 않기」 칸의 값은 `onClose` 의 `neverShow` 로 넘긴다. 어디에 저장할지는 화면이 정한다.
 * - 대상 요소가 늦게 나타나거나 사라져도 단계가 바뀔 때·창 크기·스크롤이 바뀔 때·0.5초마다 다시 찾는다.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button, Checkbox } from "../form";
import {
  clampTourIndex,
  highlightRect,
  placeBubble,
  type TourBubblePosition,
  type TourPlacement,
  type TourRect,
  type TourSize,
} from "./tour-model";

/** 말풍선 층 높이. 화면 머리·사이드바 위, 공용 Modal(9999) 아래. */
export const TOUR_Z_INDEX = 9100;

export interface TourStep {
  id: string;
  title: string;
  body: ReactNode;
  /** 강조할 요소의 CSS 선택자(`[data-testid="…"]` 등). 없거나 못 찾으면 화면 가운데에 띄운다. */
  target?: string;
  placement?: TourPlacement;
}

export type TourCloseReason = "finish" | "skip";

export interface TourCloseResult {
  reason: TourCloseReason;
  /** 「다시 보지 않기」 칸이 켜진 채 닫았는가. */
  neverShow: boolean;
  /** 닫을 때 보던 단계(0 부터). */
  index: number;
}

export interface TourLabels {
  prev?: string;
  next?: string;
  finish?: string;
  skip?: string;
  neverShow?: string;
}

export interface TourProps {
  open: boolean;
  steps: readonly TourStep[];
  onClose: (result: TourCloseResult) => void;
  /** 처음 단계(기본 0). 열 때마다 이 단계에서 시작한다. */
  initialIndex?: number;
  /** false 면 「다시 보지 않기」 칸을 감춘다(기본 true). */
  showNeverShow?: boolean;
  labels?: TourLabels;
  zIndex?: number;
  testId?: string;
}

const DEFAULT_LABELS: Required<TourLabels> = {
  prev: "이전",
  next: "다음",
  finish: "완료",
  skip: "건너뛰기",
  neverShow: "다시 보지 않기",
};

const BUBBLE_FALLBACK: TourSize = { width: 320, height: 160 };
const REFIND_MS = 500;

const STYLE = `
.cm-tour-layer{position:fixed;inset:0;pointer-events:none}
.cm-tour-hole{position:fixed;border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,.4);outline:2px solid var(--color-primary,#228be6);pointer-events:none;transition:left .15s,top .15s,width .15s,height .15s}
.cm-tour-dim{position:fixed;inset:0;background:rgba(0,0,0,.4);pointer-events:none}
.cm-tour-bubble{position:fixed;width:320px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:var(--spacing-md,12px);background:var(--color-bg,#fff);color:var(--color-text,#212529);border:1px solid var(--color-border,#ced4da);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto;display:flex;flex-direction:column;gap:var(--spacing-sm,8px)}
.cm-tour-step{font-size:12px;color:var(--color-text-muted,#868e96)}
.cm-tour-title{margin:0;font-size:15px;font-weight:700}
.cm-tour-body{font-size:13px;line-height:1.5}
.cm-tour-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-sm,8px)}
.cm-tour-actions{display:flex;gap:var(--spacing-xs,4px)}
`;

function readTarget(selector: string | undefined): TourRect | null {
  if (!selector || typeof document === "undefined") return null;
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return null; // 잘못된 선택자 — 가운데에 띄운다.
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const sameRect = (a: TourRect | null, b: TourRect | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/** 열려 있는 동안만 마운트된다 — 닫으면 단계·칸 상태가 사라지고, 다시 열면 처음부터 시작한다. */
function TourBody({
  steps, onClose, initialIndex = 0, showNeverShow = true, labels, zIndex = TOUR_Z_INDEX, testId = "tour",
}: Omit<TourProps, "open">) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const titleId = useId();
  const [index, setIndex] = useState(() => clampTourIndex(initialIndex, steps.length));
  const [neverShow, setNeverShow] = useState(false);
  const [target, setTarget] = useState<TourRect | null>(null);
  const [viewport, setViewport] = useState<TourSize>(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  const [bubbleSize, setBubbleSize] = useState<TourSize>(BUBBLE_FALLBACK);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index >= steps.length - 1;

  const refresh = useCallback(() => {
    setTarget((prev) => {
      const next = readTarget(step?.target);
      return sameRect(prev, next) ? prev : next;
    });
    setViewport((prev) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return prev.width === w && prev.height === h ? prev : { width: w, height: h };
    });
  }, [step?.target]);

  useLayoutEffect(() => {
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    const timer = window.setInterval(refresh, REFIND_MS);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 0 && h > 0) setBubbleSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, [index, target]);

  useEffect(() => {
    bubbleRef.current?.querySelector<HTMLButtonElement>(`[data-testid="${testId}-next"]`)?.focus({ preventScroll: true });
  }, [index, testId]);

  const close = useCallback(
    (reason: TourCloseReason) => onClose({ reason, neverShow, index }),
    [onClose, neverShow, index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!step) return null;
  const pos: TourBubblePosition = placeBubble(target, bubbleSize, viewport, step.placement ?? "bottom");
  const hole = target ? highlightRect(target) : null;

  return (
    <div className="cm-tour-layer" style={{ zIndex }} data-testid={testId}>
      <style>{STYLE}</style>
      {hole ? (
        <div className="cm-tour-hole" data-testid={`${testId}-hole`} style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} />
      ) : (
        <div className="cm-tour-dim" />
      )}
      <div
        ref={bubbleRef}
        className="cm-tour-bubble"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-placement={pos.placement}
        data-testid={`${testId}-bubble`}
        style={{ left: pos.left, top: pos.top }}
      >
        <span className="cm-tour-step" data-testid={`${testId}-step`}>{index + 1} / {steps.length}</span>
        <h3 id={titleId} className="cm-tour-title">{step.title}</h3>
        <div className="cm-tour-body">{step.body}</div>
        <div className="cm-tour-foot">
          {showNeverShow ? (
            <span data-testid={`${testId}-never`}>
              <Checkbox label={L.neverShow} checked={neverShow} onChange={setNeverShow} />
            </span>
          ) : <span />}
          <div className="cm-tour-actions">
            <Button size="sm" data-testid={`${testId}-skip`} onClick={() => close("skip")}>{L.skip}</Button>
            <Button size="sm" data-testid={`${testId}-prev`} disabled={index === 0} onClick={() => setIndex((i) => clampTourIndex(i - 1, steps.length))}>
              {L.prev}
            </Button>
            <Button
              size="sm"
              variant="primary"
              data-testid={`${testId}-next`}
              onClick={() => (last ? close("finish") : setIndex((i) => clampTourIndex(i + 1, steps.length)))}
            >
              {last ? L.finish : L.next}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Tour({ open, ...rest }: TourProps) {
  if (!open || typeof document === "undefined" || rest.steps.length === 0) return null;
  return createPortal(<TourBody {...rest} />, document.body);
}
