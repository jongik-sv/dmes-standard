"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { Radio as MantineRadio } from "@mantine/core";

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
  const groupName = `${uniqueId}-${name ?? "radio"}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const ariaLabel = ariaProps["aria-label"] ?? (ariaProps["aria-labelledby"] ? undefined : name);
  const ariaLabelledBy = ariaProps["aria-labelledby"];
  const ariaDescribedBy = ariaProps["aria-describedby"];
  const ariaInvalid = ariaProps["aria-invalid"];

  // Mantine Radio.Group 은 role="radiogroup" 요소의 aria-labelledby/aria-describedby 를
  // Input.Wrapper 컨텍스트(자신의 label/description/error)로만 계산해, 부모(FormGroup 등)가
  // 주입한 값을 반영하지 않는다. DOM 커밋 이후 실제 radiogroup 요소에 직접 반영한다.
  useEffect(() => {
    const radioGroupEl = containerRef.current?.querySelector('[role="radiogroup"]');
    if (!radioGroupEl) return;
    if (ariaLabelledBy) radioGroupEl.setAttribute("aria-labelledby", ariaLabelledBy);
    if (ariaDescribedBy) radioGroupEl.setAttribute("aria-describedby", ariaDescribedBy);
    if (ariaLabel) radioGroupEl.setAttribute("aria-label", ariaLabel);
    if (ariaInvalid != null) radioGroupEl.setAttribute("aria-invalid", String(ariaInvalid));
  }, [ariaLabel, ariaLabelledBy, ariaDescribedBy, ariaInvalid]);

  return (
    <MantineRadio.Group
      ref={containerRef}
      id={id}
      name={groupName}
      value={String(value ?? "")}
      onChange={(v) => onChange?.(v)}
      className={`form-radio-group ${className}`.trim()}
      style={style}
    >
      {options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        const radioId = `${uniqueId}-${optionValue}`;
        return (
          <MantineRadio
            key={optionValue}
            id={radioId}
            value={optionValue}
            label={optionLabel}
            disabled={disabled}
            classNames={{ label: "form-radio-label" }}
          />
        );
      })}
    </MantineRadio.Group>
  );
}
