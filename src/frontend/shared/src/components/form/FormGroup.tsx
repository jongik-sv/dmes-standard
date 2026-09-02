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
  const labelRef = useRef<HTMLLabelElement>(null);
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
  // 툴팁을 document.body 로 portal + position:fixed 로 렌더 → 스크롤/overflow 컨테이너에 잘리거나
  // 다른 패널에 가려지지 않고 항상 최상단에 표시된다.
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);

  const showTip = useCallback(() => {
    const el = labelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTipPos({ left: rect.left, top: rect.bottom + 4 });
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
        onMouseEnter={tip ? showTip : undefined}
        onMouseLeave={tip ? hideTip : undefined}
      >
        {required && <span className="form-required">*</span>}
        {label}
      </label>
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
            style={{ position: "fixed", left: tipPos.left, top: tipPos.top, display: "block" }}
          >
            {tip}
          </span>,
          document.body
        )}
    </div>
  );
}
