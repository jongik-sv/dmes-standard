"use client";

import React, { useMemo, type SelectHTMLAttributes } from "react";
import { generateId } from "../../utils/libUtil";

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
  placeholder = "",
  className = "",
  style,
  error,
  ...rest
}: SelectProps) {
  const selectId = useMemo(() => id || generateId("select"), [id]);
  const errorId = `${selectId}-error`;

  return (
    <>
      <select
        id={selectId}
        className={`form-select ${error ? "form-error" : ""} ${className}`.trim()}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={style}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
      {error && (
        <span id={errorId} className="form-error-message" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
