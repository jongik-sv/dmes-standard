"use client";

import { useId, type InputHTMLAttributes } from "react";
import { DateInput } from "@mantine/dates";
import clsx from "clsx";

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function DatePicker({
  id,
  value = "",
  onChange,
  disabled = false,
  className = "",
  style,
  min,
  max,
  readOnly = false,
  placeholder,
  name,
  error,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": externalAriaInvalid,
  "aria-describedby": externalAriaDescribedBy,
}: DatePickerProps) {
  const autoId = useId();
  const pickerId = id || autoId;
  const errorId = `${pickerId}-error`;
  const resolvedAriaInvalid = externalAriaInvalid ?? !!error;
  const resolvedAriaDescribedBy = externalAriaDescribedBy ?? (error ? errorId : undefined);

  return (
    <DateInput
      id={pickerId}
      name={name}
      value={ISO_DATE.test(value ?? "") ? (value as string) : null}
      onChange={(v) => onChange?.(v ?? "")}
      valueFormat="YYYY-MM-DD"
      placeholder={placeholder ?? "YYYY-MM-DD"}
      title="YYYY-MM-DD"
      clearable
      disabled={disabled}
      readOnly={readOnly}
      minDate={min ? String(min) : undefined}
      maxDate={max ? String(max) : undefined}
      style={style}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
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
      classNames={{ input: clsx("form-datepicker", error && "form-error", className) }}
    />
  );
}
