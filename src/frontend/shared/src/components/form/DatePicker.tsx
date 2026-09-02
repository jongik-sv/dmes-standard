"use client";

import React, { useMemo, type InputHTMLAttributes } from "react";
import { generateId } from "../../utils/libUtil";

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}

export function DatePicker({
  id,
  value = "",
  onChange,
  disabled = false,
  className = "",
  style,
  min,
  max,
  error,
  ...rest
}: DatePickerProps) {
  const pickerId = useMemo(() => id || generateId("date"), [id]);
  const errorId = `${pickerId}-error`;

  return (
    <>
      <input
        id={pickerId}
        type="date"
        className={`form-datepicker ${error ? "form-error" : ""} ${className}`.trim()}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        min={min}
        max={max}
        style={style}
        title="YYYY-MM-DD"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <span id={errorId} className="form-error-message" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
