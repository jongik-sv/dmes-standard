"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes } from "react";
import { TextInput } from "@mantine/core";
import clsx from "clsx";

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
  size: _htmlSize, // HTML input 의 size(문자폭) 속성 — Mantine size(MantineSize)와 타입이 달라 분리한다.
  "aria-invalid": externalAriaInvalid,
  "aria-describedby": externalAriaDescribedBy,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  // Mantine TextInput 은 자신의 error prop 으로만 aria-invalid/aria-describedby 를 계산해
  // 부모(FormGroup 등)가 주입한 값을 그대로 덮어써 버린다. DOM 커밋 이후 직접 반영한다.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (externalAriaInvalid != null) el.setAttribute("aria-invalid", String(externalAriaInvalid));
    if (externalAriaDescribedBy) el.setAttribute("aria-describedby", externalAriaDescribedBy);
  }, [externalAriaInvalid, externalAriaDescribedBy, error]);

  return (
    <TextInput
      ref={inputRef}
      id={inputId}
      type={type}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      readOnly={readOnly}
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
      classNames={{ input: clsx("form-input", error && "form-error", className) }}
      {...rest}
    />
  );
}
