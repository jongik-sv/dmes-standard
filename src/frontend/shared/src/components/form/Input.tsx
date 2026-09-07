"use client";

import { useId, type InputHTMLAttributes } from "react";
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
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);

  return (
    <TextInput
      id={inputId}
      type={type}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      readOnly={readOnly}
      style={style}
      error={
        error ? (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        ) : undefined
      }
      // Mantine InputBase 는 자신의 error prop 으로만 aria-invalid/aria-describedby 를
      // 계산해 부모(FormGroup 등)가 주입한 값을 덮어써 버린다(packages/@mantine/core/src/
      // components/Input/Input.tsx 의 ariaAttributes). `attributes.input` 은 그 계산 뒤
      // getStyles("input") 결과로 마지막에 spread 되므로, 여기서 최종값을 강제해 SSR/CSR
      // 첫 페인트부터 정확한 값을 렌더한다(런타임 useEffect 불필요).
      attributes={{
        input: {
          "aria-invalid": resolvedAriaInvalid ? "true" : "false",
          ...(resolvedAriaDescribedBy ? { "aria-describedby": resolvedAriaDescribedBy } : {}),
        },
      }}
      classNames={{ input: clsx("form-input", error && "form-error", className) }}
      {...rest}
    />
  );
}
