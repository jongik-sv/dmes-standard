"use client";

import "./form.css";
import React, {
  Children,
  cloneElement,
  isValidElement,
  useState,
  useRef,
  useCallback,
  useId,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export interface FormGroupProps {
  label?: string;
  required?: boolean;
  children?: ReactNode;
  className?: string;
  labelWidth?: number;
  style?: CSSProperties;
  error?: string;
  /** 라벨 hover 시 표시되는 툴팁 텍스트 */
  tip?: string;
}

function mergeIds(...values: Array<unknown>): string | undefined {
  const ids = values
    .flatMap((value) => (typeof value === "string" ? value.split(/\s+/) : []))
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

export function FormGroup({
  label,
  required = false,
  children,
  className = "",
  labelWidth = 120,
  style,
  error,
  tip,
}: FormGroupProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const controlId = `${generatedId}-control`;
  const tipId = `${generatedId}-tip`;
  const errorId = `${generatedId}-error`;
  const singleChild =
    Children.count(children) === 1 && isValidElement(children)
      ? (children as ReactElement<Record<string, unknown>>)
      : null;
  const resolvedControlId =
    singleChild && typeof singleChild.props.id === "string" ? singleChild.props.id : controlId;
  const labelRef = useRef<HTMLLabelElement>(null);
  // 툴팁을 document.body 로 portal + position:fixed 로 렌더 → 스크롤/overflow 컨테이너에 잘리거나
  // 다른 패널에 가려지지 않고 항상 최상단에 표시된다.
  const [tipPos, setTipPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  // 툴팁은 라벨 좌측 기준으로 라벨 위쪽에 띄운다. 위쪽 공간이 모자랄 때만 아래로 뒤집는다.
  // 실제 높이는 above 일 때 translateY(-100%) 로 보정하므로, 아래 상수는 뒤집기 판정에만 쓰인다.
  const showTip = useCallback(() => {
    const el = labelRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const TIP_MAX_WIDTH = 320;
    const TIP_EST_HEIGHT = 72;
    const GAP = 6;
    const GUTTER = 8;
    const maxLeft = Math.max(GUTTER, window.innerWidth - TIP_MAX_WIDTH - GUTTER);
    const above = rect.top - GAP >= TIP_EST_HEIGHT + GUTTER;
    setTipPos({
      left: Math.min(Math.max(rect.left, GUTTER), maxLeft),
      top: above ? rect.top - GAP : rect.bottom + GAP,
      above,
    });
  }, []);
  const hideTip = useCallback(() => setTipPos(null), []);

  const enhancedChildren = (() => {
    if (!singleChild) {
      return children;
    }

    const child = singleChild;
    if (child.type === React.Fragment) return children;

    const childProps = child.props;
    const hasExplicitName =
      typeof childProps["aria-label"] === "string" ||
      typeof childProps["aria-labelledby"] === "string";

    return cloneElement(child, {
      id: resolvedControlId,
      ...(hasExplicitName ? {} : { "aria-labelledby": labelId }),
      "aria-describedby": mergeIds(
        childProps["aria-describedby"],
        tip ? tipId : undefined,
        error ? errorId : undefined
      ),
      ...(error && childProps["aria-invalid"] == null ? { "aria-invalid": true } : {}),
    });
  })();

  return (
    <div className={`form-group ${className}`.trim()} style={style}>
      <label
        ref={labelRef}
        id={labelId}
        htmlFor={resolvedControlId}
        className={`form-group-label${tip ? " has-tip" : ""}`}
        style={{ width: labelWidth, minWidth: labelWidth }}
      >
        {/* 라벨 박스는 labelWidth 고정폭이라 텍스트 밖 여백까지 hover 로 잡힌다.
            트리거를 텍스트 span 으로 좁혀 "라벨 위에 정확히 올렸을 때" 만 뜨게 한다. */}
        {tip ? (
          <span className="form-tip-trigger" onMouseEnter={showTip} onMouseLeave={hideTip}>
            {required && <span className="form-required">*</span>}
            {label}
          </span>
        ) : (
          <>
            {required && <span className="form-required">*</span>}
            {label}
          </>
        )}
      </label>
      {/* 키보드 사용자는 라벨에 마우스를 올릴 수 없으므로, 필드가 focus 를 받으면(캡처 단계 —
          자식이 Input 이든 Radio.Group 이든 별도 onFocus prop 계약 없이 동작) 마우스 hover 와
          동일한 툴팁을 띄운다. 스크린리더는 focus 여부와 무관하게 aria-describedby 로 계속 읽는다. */}
      <div
        className="form-group-field"
        onFocusCapture={tip ? showTip : undefined}
        onBlurCapture={tip ? hideTip : undefined}
      >
        {enhancedChildren}
        {tip && (
          <span id={tipId} className="form-sr-only">
            {tip}
          </span>
        )}
        {error && (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        )}
      </div>
      {tip &&
        tipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="form-tip-text form-tip-text--portal"
            style={{
              position: "fixed",
              left: tipPos.left,
              top: tipPos.top,
              display: "block",
              ...(tipPos.above ? { transform: "translateY(-100%)" } : {}),
            }}
          >
            {tip}
          </span>,
          document.body
        )}
    </div>
  );
}
