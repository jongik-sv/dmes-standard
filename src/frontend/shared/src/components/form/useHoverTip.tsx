"use client";

/**
 * 포털 툴팁 공용 부품(내부용) — `FormGroup` 라벨 툴팁, `MdmFieldLabel`(th 안 라벨의 MDM 카드 툴팁), 그리드 머리글 라벨
 * `MdmHeaderLabel`(HTML 설명 머리글 카드)이 함께 쓴다. `@dk-oasis/shared/form` 으로 내보내지 않는다. 화면은 세 부품을 쓰고 이 훅을 직접 쓰지 않는다.
 *
 * 툴팁을 document.body 로 portal + position:fixed 로 렌더 → 스크롤/overflow 컨테이너에 잘리거나 다른 패널에 가려지지 않고
 * 항상 최상단에 표시된다. 모양은 form.css 의 `.form-tip-text`·`.form-tip-text--portal` 이 정한다(호스트 앱이 form.css 를 싣는다).
 *
 * Mantine `Tooltip` 으로 교체를 시도했으나 채택하지 않았다: Mantine `Tooltip`/`Transition` 은
 * `opened` 를 true 로 바꿔도 실제 DOM 마운트가 추가 React 커밋(내부 `useTransition` 상태
 * 갱신, `@mantine/core/Transition` 관련 "not wrapped in act" 경고로 확인됨)을 거친 뒤에야
 * 일어난다 — `renderWithMantine`(mantine-test-utils.ts) 이 `MantineProvider` 에 `env="test"`
 * 를 주지 않는 한(그러면 Transition 이 동기 렌더로 바뀐다 — Transition.tsx 의
 * `if (env === "test") return mounted ? ... : ...` 분기) `act(() => input.focus())` 직후
 * 동기 `document.querySelector` 로는 툴팁 노드를 찾을 수 없다. env="test" 적용은
 * mantine-test-utils.ts(공유 테스트 인프라, 담당 파일 아님) 변경이 필요해 이번 라운드에서는
 * 보류하고(리드에게 후속 제안), 검증된 기존 커스텀 포지셔닝을 유지한다.
 *
 * 상호작용 모드(`interactive`, 2026-10-03) — MDM HTML 설명 카드처럼 링크·스크롤이 있는 툴팁을 띄울 때만 켠다. 켜면 hover 로 연
 * 상자가 pointer-events:auto 이고(키보드 focus 로만 열면 none — 이웃 입력을 가리지 않게, 마우스가 트리거에 들어오면 auto),
 * 트리거를 떠나도 `HOVER_TIP_GRACE_MS` 동안 열어 두며 그 사이 상자에 들어가면 유지, 상자를 나가면(유예 뒤) 닫힌다. Escape 로 닫힌다.
 * focus 로만 연 상자는 blur 하면 바로 닫힌다. 끄면(기본) 예전과 같다 — 떠나는 즉시 닫히고, 문서 이벤트를 듣지 않으며, 상자 DOM 도 그대로다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** 툴팁 상자의 화면 위치. `above` 면 상자 높이만큼 위로 올려(translateY(-100%)) 앵커 위쪽에 붙인다. */
export interface HoverTipPos {
  left: number;
  top: number;
  above: boolean;
  /** 상호작용 모드에서만 — 상자가 화면 안에 들도록 줄인 최대 높이(px). 넘치면 상자 안에서 스크롤한다. */
  maxHeight?: number;
}

/** Mantine Modal 이 Escape 로 닫지 않는 대상 표지(ModalBase/use-modal). */
const STOP_PROPAGATION_ATTR = "data-mantine-stop-propagation";

/** 열린 상호작용 카드 수와 Escape 표지 리스너 — 페이지에 하나(globalThis). */
interface HoverTipEscapeGuard {
  open: number;
}
/** globalThis 키 — 원격 모듈이 shared 를 따로 묶어 같은 페이지에 여러 벌 실려도 리스너·카드 수는 하나다(mdm-meta store 와 같은 관례). */
const ESCAPE_GUARD_KEY = "__dkOasisHoverTipEscapeGuard";

/**
 * 모달 안 상호작용 카드의 Escape 보호 — 카드가 열려 있을 때 누른 Escape 는 카드만 닫고 모달은 닫지 않는다.
 *
 * Mantine Modal 은 window **캡처** 단계 keydown 에서 Escape 로 닫되, 대상 요소에 `data-mantine-stop-propagation="true"` 가 있으면 건너뛴다
 * (ModalBase/use-modal — Mantine 드롭다운이 쓰는 표지). 이 리스너는 같은 window 캡처 단계에 **모듈을 읽을 때** 등록되므로 모달 효과
 * (useWindowEvent, 모달이 마운트될 때 등록)보다 먼저 돈다 — 같은 대상·단계의 리스너는 등록 순서대로 돈다.
 * 열린 카드가 있을 때 누른 Escape 의 그 순간 대상(focus 가 body 로 빠졌어도 body)에, 표지가 없을 때만 표지를 달고 이 이벤트가 끝나면
 * 자기가 단 것만 걷는다(bubble 단계 window 리스너, 누가 전파를 멈추면 setTimeout 0). 미리 달아 두지 않으므로 React 가 관리하는 Combobox 표지와
 * 부딪치지 않고(지우지도, 지워지지도 않는다), 카드가 여럿이어도 카드 수로 맞다. 한글 조합 중 Escape(isComposing)는 건드리지 않는다.
 */
function hoverTipEscapeGuard(): HoverTipEscapeGuard | null {
  if (typeof window === "undefined") return null;
  const g = globalThis as Record<string, unknown>;
  const existing = g[ESCAPE_GUARD_KEY] as HoverTipEscapeGuard | undefined;
  if (existing) return existing;
  const guard: HoverTipEscapeGuard = { open: 0 };
  g[ESCAPE_GUARD_KEY] = guard;
  window.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (guard.open <= 0 || event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof Element) || target.hasAttribute(STOP_PROPAGATION_ATTR)) return;
      target.setAttribute(STOP_PROPAGATION_ATTR, "true");
      let done = false;
      const unmark = () => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", unmark);
        if (target.getAttribute(STOP_PROPAGATION_ATTR) === "true") target.removeAttribute(STOP_PROPAGATION_ATTR);
      };
      window.addEventListener("keydown", unmark, { once: true });
      setTimeout(unmark, 0);
    },
    true
  );
  return guard;
}
hoverTipEscapeGuard();

/** 상호작용 툴팁 유예(ms) — 트리거나 상자를 떠난 뒤 이만큼 기다렸다 닫는다. 그 사이 상자·트리거로 들어가면 유지한다. */
export const HOVER_TIP_GRACE_MS = 150;

export interface HoverTipOptions {
  /** 마우스가 들어갈 수 있는 툴팁(유예·상자 안 유지·Escape). 끄면 예전 툴팁. */
  interactive?: boolean;
  /** 상자 최대 폭(px) — 오른쪽 가장자리 보정과(상호작용 모드면) 상자 maxWidth 에 쓴다. 비우면 form.css 의 320. */
  maxWidth?: number;
  /** 상자 예상 높이(px) — 위쪽 공간 판정에만 쓴다. 함수면 열 때 부른다. 비우면 글자 72 / 노드 200. */
  estHeight?: number | (() => number);
  /**
   * hover 로 열 때의 표시 지연(ms). 기본 0(바로 연다 — FormGroup·MdmFieldLabel). 그 사이 트리거를 떠나면(hideTip)·closeTip 이면 열지 않는다.
   * focus 로 여는 것은 지연하지 않는다. 그리드 머리글 라벨이 ag-grid 머리글 툴팁과 같은 지연을 주려고 쓴다.
   */
  showDelayMs?: number;
}

/** 상호작용 툴팁 상자에 붙이는 값(`HoverTipPortal` 의 `box`). */
export interface HoverTipBox {
  maxWidth?: number;
  /**
   * 상자가 마우스를 받는가 — hover 로 열었으면 true. 키보드 focus 로만 열었으면 false(예전 툴팁처럼 가려진 칸을 그대로 누를 수 있게)이고,
   * 이어 마우스가 트리거에 들어오면 true 가 된다.
   */
  pointer: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** showTip·hideTip 이 받는 이벤트(React 합성 이벤트 그대로) — 종류(type)로 hover 와 focus 를 가린다. */
type TipEvent = { type?: string } | undefined;
const isFocusEvent = (e: TipEvent) => e?.type === "focus" || e?.type === "focusin";
const isBlurEvent = (e: TipEvent) => e?.type === "blur" || e?.type === "focusout";

export interface HoverTip<T extends HTMLElement> {
  /** 툴팁이 붙을 앵커(라벨 박스·트리거 글자)에 건다. */
  anchorRef: RefObject<T | null>;
  /** 열려 있으면 위치, 닫혀 있으면 null. `HoverTipPortal` 에 그대로 준다. */
  tipPos: HoverTipPos | null;
  /** 연다. 핸들러에 그대로 걸면(onMouseEnter·onFocus) 이벤트 종류로 hover·focus 를 가린다(상호작용 모드의 pointer). */
  showTip: (e?: TipEvent) => void;
  /**
   * 닫는다. 상호작용 모드면 유예 뒤에 닫고, 마우스가 상자 안에 있으면 닫지 않는다. focus 로만 연 카드의 blur 는 바로 닫는다.
   */
  hideTip: (e?: TipEvent) => void;
  /** 표시 대기를 취소하고 열린 툴팁을 바로 닫는다(유예 없음) — 그리드 머리글 라벨의 누름(정렬·끌기 시작)에 쓴다. */
  closeTip: () => void;
  /** 상호작용 모드면 상자에 붙일 값(`HoverTipPortal` 에 그대로 준다), 아니면 null. */
  box: HoverTipBox | null;
}

/**
 * 툴팁은 앵커 좌측 기준으로 앵커 위쪽에 띄운다. 위쪽 공간이 모자랄 때만 아래로 뒤집는다.
 * 실제 높이는 above 일 때 translateY(-100%) 로 보정하므로, 아래 상수는 뒤집기 판정에만 쓰인다.
 *
 * @param tipIsText 글자 툴팁(두세 줄)이면 true, MDM 카드 같은 노드 툴팁(더 크다)이면 false — 위쪽 공간 판정에만 쓴다.
 * @param options 상호작용 모드·폭·예상 높이. 비우면 예전 툴팁과 같다.
 */
export function useHoverTip<T extends HTMLElement>(tipIsText: boolean, options?: HoverTipOptions): HoverTip<T> {
  const interactive = !!options?.interactive;
  const maxWidth = options?.maxWidth;
  const estHeight = options?.estHeight;
  const showDelayMs = options?.showDelayMs ?? 0;
  const anchorRef = useRef<T>(null);
  const [tipPos, setTipPos] = useState<HoverTipPos | null>(null);
  const tipPosRef = useRef<HoverTipPos | null>(null);
  tipPosRef.current = tipPos;
  /** 상호작용 모드의 닫기 유예 타이머. */
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 마우스가 상자 안에 있는가 — 그동안은 트리거를 떠나거나 focus 가 빠져도 닫지 않는다. */
  const insideBoxRef = useRef(false);
  /** 상호작용 상자가 마우스를 받는가(hover 로 열었는가). 렌더용 상태와 콜백용 ref 를 함께 둔다. */
  const [pointer, setPointer] = useState(false);
  const pointerRef = useRef(false);
  const setPointerBoth = useCallback((v: boolean) => {
    pointerRef.current = v;
    setPointer(v);
  }, []);

  const clearGrace = useCallback(() => {
    if (graceRef.current != null) {
      clearTimeout(graceRef.current);
      graceRef.current = null;
    }
  }, []);
  /** 표시 지연 타이머(showDelayMs). */
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearShow = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback((e?: TipEvent) => {
    clearGrace();
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    // focus 로 열 때는 이미 hover 로 열려 마우스를 받던 상자만 그대로 받는다.
    if (interactive) setPointerBoth(isFocusEvent(e) ? pointerRef.current && tipPosRef.current != null : true);
    const rect = el.getBoundingClientRect();
    const TIP_MAX_WIDTH = maxWidth ?? 320;
    // 글자 툴팁은 두세 줄, MDM 카드 같은 노드 툴팁은 더 크다 — 위쪽 공간 판정에만 쓴다.
    const TIP_EST_HEIGHT = estHeight == null ? (tipIsText ? 72 : 200) : typeof estHeight === "function" ? estHeight() : estHeight;
    const GAP = 6;
    const GUTTER = 8;
    const maxLeft = Math.max(GUTTER, window.innerWidth - TIP_MAX_WIDTH - GUTTER);
    const above = rect.top - GAP >= TIP_EST_HEIGHT + GUTTER;
    const top = above ? rect.top - GAP : rect.bottom + GAP;
    setTipPos({
      left: Math.min(Math.max(rect.left, GUTTER), maxLeft),
      top,
      above,
      // 상호작용 상자는 마우스로 안을 읽으므로 화면 밖으로 넘기지 않는다 — 넘치면 상자 안에서 스크롤한다.
      ...(interactive ? { maxHeight: Math.max(0, (above ? top : window.innerHeight - top) - GUTTER) } : {}),
    });
  }, [tipIsText, maxWidth, estHeight, interactive, clearGrace, setPointerBoth]);

  const showTip = useCallback(
    (e?: TipEvent) => {
      clearGrace();
      clearShow();
      // hover 표시 지연 — 이미 열려 있거나 focus 로 열면 바로 연다.
      if (showDelayMs > 0 && !isFocusEvent(e) && tipPosRef.current == null) {
        const type = e?.type;
        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null;
          openNow({ type });
        }, showDelayMs);
        return;
      }
      openNow(e);
    },
    [showDelayMs, clearGrace, clearShow, openNow]
  );

  const close = useCallback(() => {
    clearGrace();
    insideBoxRef.current = false;
    pointerRef.current = false;
    setTipPos(null);
  }, [clearGrace]);

  const hideTip = useCallback(
    (e?: TipEvent) => {
      clearShow();
      if (!interactive) {
        setTipPos(null);
        return;
      }
      if (insideBoxRef.current) return;
      // focus 로만 연(마우스를 받지 않는) 카드는 예전 툴팁처럼 blur 즉시 닫는다.
      if (isBlurEvent(e) && !pointerRef.current) {
        close();
        return;
      }
      clearGrace();
      graceRef.current = setTimeout(close, HOVER_TIP_GRACE_MS);
    },
    [interactive, clearGrace, clearShow, close]
  );

  const closeTip = useCallback(() => {
    clearShow();
    close();
  }, [clearShow, close]);

  const onBoxEnter = useCallback(() => {
    insideBoxRef.current = true;
    clearGrace();
  }, [clearGrace]);
  const onBoxLeave = useCallback(() => {
    insideBoxRef.current = false;
    hideTip();
  }, [hideTip]);

  // Escape 로 닫기 — 상호작용 툴팁이 열려 있을 때만 문서 keydown 을 듣는다. 열려 있는 동안 페이지의 열린 카드 수를 1 올려
  // 모달 안 Escape 보호(hoverTipEscapeGuard)를 켠다 — 효과 정리가 짝을 맞추므로 닫히거나 언마운트되면 정확히 1 내린다.
  const open = tipPos !== null;
  useEffect(() => {
    if (!interactive || !open) return;
    const guard = hoverTipEscapeGuard();
    if (guard) guard.open += 1;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (guard) guard.open = Math.max(0, guard.open - 1);
    };
  }, [interactive, open, close]);

  // 언마운트 때 유예·표시 타이머를 지운다.
  useEffect(() => clearGrace, [clearGrace]);
  useEffect(() => clearShow, [clearShow]);

  const box = useMemo<HoverTipBox | null>(
    () => (interactive ? { maxWidth, pointer, onMouseEnter: onBoxEnter, onMouseLeave: onBoxLeave } : null),
    [interactive, maxWidth, pointer, onBoxEnter, onBoxLeave]
  );

  return { anchorRef, tipPos, showTip, hideTip, closeTip, box };
}

/**
 * 열려 있을 때(tipPos 가 있을 때) 툴팁 상자를 document.body 에 그린다. 닫혀 있거나 서버 렌더면 아무것도 그리지 않는다.
 * `box`(상호작용 모드)를 주면 `data-tip-interactive` 와 최대 폭·높이를 두고, hover 로 열었으면 마우스를 받는다(pointer-events:auto —
 * focus 로만 열었으면 none). 없으면 예전 DOM 그대로다.
 */
export function HoverTipPortal({
  tipPos,
  box,
  children,
}: {
  tipPos: HoverTipPos | null;
  box?: HoverTipBox | null;
  children: ReactNode;
}) {
  if (!tipPos || typeof document === "undefined") return null;
  return createPortal(
    <span
      className="form-tip-text form-tip-text--portal"
      style={{
        position: "fixed",
        left: tipPos.left,
        top: tipPos.top,
        display: "block",
        ...(tipPos.above ? { transform: "translateY(-100%)" } : {}),
        ...(box
          ? {
              pointerEvents: box.pointer ? "auto" : "none",
              ...(box.maxWidth != null ? { maxWidth: box.maxWidth } : {}),
              ...(tipPos.maxHeight != null ? { maxHeight: tipPos.maxHeight, overflowY: "auto" as const } : {}),
            }
          : {}),
      }}
      data-tip-interactive={box ? "true" : undefined}
      onMouseEnter={box?.onMouseEnter}
      onMouseLeave={box?.onMouseLeave}
    >
      {children}
    </span>,
    document.body
  );
}
