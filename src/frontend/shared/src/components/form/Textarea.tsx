"use client";

import React, { useMemo, type TextareaHTMLAttributes } from "react";
import { generateId } from "../../utils/libUtil";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;
  error?: string;
}

export function Textarea({
  id,
  value = "",
  onChange,
  disabled = false,
  placeholder = "",
  rows = 3,
  className = "",
  style,
  readOnly = false,
  error,
  ...rest
}: TextareaProps) {
  const textareaId = useMemo(() => id || generateId("textarea"), [id]);
  const errorId = `${textareaId}-error`;

  return (
    <>
      <textarea
        id={textareaId}
        className={`form-textarea ${error ? "form-error" : ""} ${className}`.trim()}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
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
