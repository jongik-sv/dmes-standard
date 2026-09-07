"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { NativeSelect } from "@mantine/core";
import clsx from "clsx";

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  error?: string;
}

export function Select({
  id,
  value = "",
  onChange,
  options = [],
  disabled = false,
  placeholder,
  className = "",
  style,
  error,
  size: _htmlSize, // HTML select 의 size(표시 행수) 속성 — Mantine size(MantineSize)와 타입이 달라 분리한다.
  "aria-invalid": externalAriaInvalid,
  "aria-describedby": externalAriaDescribedBy,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id || autoId;
  const errorId = `${selectId}-error`;
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);
  const data = [
    ...(placeholder ? [{ value: "", label: placeholder }] : []),
    ...options.map((option) => (typeof option === "string" ? { value: option, label: option } : option)),
  ];

  return (
    <NativeSelect
      id={selectId}
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      data={data}
      disabled={disabled}
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
      classNames={{ input: clsx("form-select", error && "form-error", className) }}
      {...rest}
    />
  );
}
