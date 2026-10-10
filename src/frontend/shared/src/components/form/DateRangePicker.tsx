"use client";

import { useId } from "react";
import { DatePicker } from "./DatePicker";

export interface DateRangePickerProps {
  /** 시작일(yyyy-MM-dd). 빈 문자열이면 비어 있음. */
  from: string;
  /** 종료일(yyyy-MM-dd). */
  to: string;
  onChange: (from: string, to: string) => void;
  id?: string;
  /** 시작 칸 aria-label (기본 "시작일"). */
  fromAriaLabel?: string;
  /** 종료 칸 aria-label (기본 "종료일"). */
  toAriaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  testId?: string;
}

const RANGE_ERROR = "시작일이 종료일보다 늦습니다.";

/** 기간(시작 ~ 종료) 입력. 시작이 종료보다 늦으면 두 칸이 error 모양이 된다. 값은 yyyy-MM-dd 문자열이라 사전순 비교가 날짜순이다. */
export function DateRangePicker({
  from,
  to,
  onChange,
  id,
  fromAriaLabel = "시작일",
  toAriaLabel = "종료일",
  required = false,
  disabled = false,
  readOnly = false,
  testId,
}: DateRangePickerProps) {
  const autoId = useId();
  const baseId = id || autoId;
  const reversed = !!from && !!to && from > to;
  const error = reversed ? RANGE_ERROR : undefined;

  return (
    <div
      id={baseId}
      role="group"
      data-testid={testId}
      style={{ display: "inline-flex", alignItems: "flex-start", gap: 6 }}
    >
      <DatePicker
        id={`${baseId}-from`}
        value={from}
        onChange={(v) => onChange(v, to)}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={fromAriaLabel}
        required={required}
        error={error}
        aria-describedby={error ? `${baseId}-from-error` : undefined}
      />
      <span aria-hidden="true" style={{ lineHeight: "var(--input-height, 30px)" }}>
        ~
      </span>
      <DatePicker
        id={`${baseId}-to`}
        value={to}
        onChange={(v) => onChange(from, v)}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={toAriaLabel}
        required={required}
        className={reversed ? "form-error" : undefined}
        aria-invalid={reversed || undefined}
        aria-describedby={reversed ? `${baseId}-from-error` : undefined}
      />
    </div>
  );
}
