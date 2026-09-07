"use client";

import { useId, type CSSProperties } from "react";
import { Checkbox as MantineCheckbox } from "@mantine/core";
import clsx from "clsx";

export interface CheckboxProps {
  id?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Checkbox({
  id,
  checked = false,
  onChange,
  label = "",
  disabled = false,
  className = "",
  style,
  ...ariaProps
}: CheckboxProps) {
  const autoId = useId();
  const checkId = id ?? autoId;

  return (
    <MantineCheckbox
      id={checkId}
      checked={checked}
      onChange={(e) => onChange?.(e.currentTarget.checked)}
      disabled={disabled}
      label={label || undefined}
      style={style}
      aria-checked={checked}
      aria-label={ariaProps["aria-label"]}
      aria-labelledby={ariaProps["aria-labelledby"]}
      aria-describedby={ariaProps["aria-describedby"]}
      aria-invalid={ariaProps["aria-invalid"]}
      classNames={{
        root: clsx(className),
        body: "form-checkbox-label",
        input: "form-checkbox",
      }}
    />
  );
}
