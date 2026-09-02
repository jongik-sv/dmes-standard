"use client";

import React, { useId, type CSSProperties } from "react";

export type RadioOption = string | { value: string; label: string };

export interface RadioProps {
  id?: string;
  name?: string;
  value?: string | number;
  onChange?: (value: string) => void;
  options?: RadioOption[];
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Radio({
  id,
  name,
  value = "",
  onChange,
  options = [],
  disabled = false,
  className = "",
  style,
  ...ariaProps
}: RadioProps) {
  const uniqueId = useId();

  return (
    <div
      id={id}
      className={`form-radio-group ${className}`.trim()}
      style={style}
      role="radiogroup"
      aria-label={ariaProps["aria-label"] ?? (ariaProps["aria-labelledby"] ? undefined : name)}
      aria-labelledby={ariaProps["aria-labelledby"]}
      aria-describedby={ariaProps["aria-describedby"]}
      aria-invalid={ariaProps["aria-invalid"]}
    >
      {options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        const radioId = `${uniqueId}-${optionValue}`;
        return (
          <label key={optionValue} className="form-radio-label" htmlFor={radioId}>
            <input
              id={radioId}
              type="radio"
              name={`${uniqueId}-${name ?? "radio"}`}
              value={optionValue}
              checked={String(value) === String(optionValue)}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={disabled}
            />
            <span>{optionLabel}</span>
          </label>
        );
      })}
    </div>
  );
}
