"use client";

import React, { useMemo, type InputHTMLAttributes } from "react";
import { generateId } from "../../utils/libUtil";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;
  error?: string;
}

export function Input({
  id,
  value = "",
  onChange,
  disabled = false,
  placeholder = "",
  type = "text",
  className = "",
  style,
  readOnly = false,
  error,
  ...rest
}: InputProps) {
  const inputId = useMemo(() => id || generateId("input"), [id]);
  const errorId = `${inputId}-error`;

  return (
    <>
      <input
        id={inputId}
        type={type}
        className={`form-input ${error ? "form-error" : ""} ${className}`.trim()}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        readOnly={readOnly}
        style={style}
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
