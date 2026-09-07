"use client";

import { useEffect, useId, useRef, type TextareaHTMLAttributes } from "react";
import { Textarea as MantineTextarea } from "@mantine/core";
import clsx from "clsx";

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
  "aria-invalid": externalAriaInvalid,
  "aria-describedby": externalAriaDescribedBy,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const textareaId = id || autoId;
  const errorId = `${textareaId}-error`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mantine Textarea(InputBase 계열)는 자신의 error prop 으로만 aria-invalid/
  // aria-describedby 를 계산해 부모(FormGroup 등)가 주입한 값을 덮어써 버린다.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (externalAriaInvalid != null) el.setAttribute("aria-invalid", String(externalAriaInvalid));
    if (externalAriaDescribedBy) el.setAttribute("aria-describedby", externalAriaDescribedBy);
  }, [externalAriaInvalid, externalAriaDescribedBy, error]);

  return (
    <MantineTextarea
      ref={textareaRef}
      id={textareaId}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={rows}
      readOnly={readOnly}
      autosize={false}
      style={style}
      aria-invalid={externalAriaInvalid ?? !!error}
      aria-describedby={externalAriaDescribedBy ?? (error ? errorId : undefined)}
      error={
        error ? (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        ) : undefined
      }
      classNames={{ input: clsx("form-textarea", error && "form-error", className) }}
      {...rest}
    />
  );
}
