"use client";

import React, { useMemo, type CSSProperties } from "react";
import { generateId } from "../../utils/libUtil";

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
  const generatedId = useMemo(() => generateId("checkbox"), []);
  const checkId = id ?? generatedId;

  return (
    <label className={`form-checkbox-label ${className}`.trim()} style={style} htmlFor={checkId}>
      <input
        id={checkId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="form-checkbox"
        aria-checked={checked}
        aria-label={ariaProps["aria-label"]}
        aria-labelledby={ariaProps["aria-labelledby"]}
        aria-describedby={ariaProps["aria-describedby"]}
        aria-invalid={ariaProps["aria-invalid"]}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
