"use client";

import { useId, useRef, type CSSProperties } from "react";
import { Group, Radio as MantineRadio } from "@mantine/core";
import { useIsomorphicLayoutEffect } from "../../hooks/use-isomorphic-layout-effect";

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

  // Mantine RadioGroup(packages/@mantine/core/src/components/Radio/RadioGroup/RadioGroup.tsx)
  // 은 실제 role="radiogroup" 요소(InputsGroupFieldset.tsx)를 label/aria-label 없이
  // {children, role} 만 받는 함수로 렌더하고, aria-labelledby/aria-describedby 는 그 안에서
  // ctx.labelId/ctx.describedBy(Input.Wrapper 컨텍스트 — RadioGroup 자신의 label/error/
  // description 으로만 채워짐)로 하드코딩한다. attributes 같은 override 경로가 없어(Input.tsx
  // 의 attributes.input 우회가 불가능) 부모(FormGroup 등)가 주입한 값을 반영할 방법이 없다.
  // DOM 커밋 이후 실제 radiogroup 요소에 직접 반영한다. useLayoutEffect 를 쓰되 SSR 에서는
  // useEffect 로 대체해 경고를 피한다 — 다만 SSR HTML 자체에는 이 보정이 반영되지 않는다
  // (첫 하이드레이션 직후에만 반영, 리드 보고 예정 — round 2 잔여 사항).
  useIsomorphicLayoutEffect(() => {
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
      <Group gap="sm" wrap="nowrap">
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
      </Group>
    </MantineRadio.Group>
  );
}
