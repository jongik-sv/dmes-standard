"use client";

import { useId, type TextareaHTMLAttributes } from "react";
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
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);

  return (
    <MantineTextarea
      id={textareaId}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={rows}
      readOnly={readOnly}
      autosize={false}
      style={style}
      error={
        error ? (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        ) : undefined
      }
      // Mantine InputBase 는 자신의 error prop 으로만 aria-invalid/aria-describedby 를
      // 계산해 부모(FormGroup 등)가 주입한 값을 덮어써 버린다(Input.tsx 절 참고). 여기서도
      // attributes.input 으로 SSR/CSR 첫 페인트부터 최종값을 강제한다.
      attributes={{
        input: {
          "aria-invalid": resolvedAriaInvalid ? "true" : "false",
          ...(resolvedAriaDescribedBy ? { "aria-describedby": resolvedAriaDescribedBy } : {}),
        },
      }}
      classNames={{ input: clsx("form-textarea", error && "form-error", className) }}
      {...rest}
    />
  );
}
