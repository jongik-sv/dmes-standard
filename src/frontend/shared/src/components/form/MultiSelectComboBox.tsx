"use client";

import { useId, useMemo, useRef, type CSSProperties } from "react";
import { MultiSelect } from "@mantine/core";
import clsx from "clsx";
import { useIsomorphicLayoutEffect } from "../../hooks/use-isomorphic-layout-effect";

export interface MultiSelectComboBoxProps {
  /** 원본 데이터 배열 (string[] 또는 object[]) */
  data: any[];
  /** value로 사용할 필드명 (기본: "value") */
  valueField?: string;
  /** 표시 텍스트로 사용할 필드명 (기본: "label") */
  labelField?: string;
  /** 선택된 value 배열 */
  value?: string[];
  /** 값 변경 콜백 */
  onChange?: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface ResolvedOption {
  value: string;
  label: string;
  raw: any;
}

function mergeDescribedBy(...values: Array<string | undefined>): string | undefined {
  const ids = values.flatMap((value) => value?.split(/\s+/) ?? []).filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

function resolveOptions(data: any[], valueField: string, labelField: string): ResolvedOption[] {
  return data.map((item) => {
    if (typeof item === "string") {
      return { value: item, label: item, raw: item };
    }
    return {
      value: String(item[valueField] ?? ""),
      label: String(item[labelField] ?? item[valueField] ?? ""),
      raw: item,
    };
  });
}

export function MultiSelectComboBox({
  data,
  valueField = "value",
  labelField = "label",
  value = [],
  onChange,
  placeholder = "",
  disabled = false,
  readOnly = false,
  error,
  id,
  className = "",
  style,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: MultiSelectComboBoxProps) {
  const autoId = useId();
  const comboId = id || autoId;
  const errorId = `${comboId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => resolveOptions(data, valueField, labelField), [data, valueField, labelField]);

  // 선택된 값 중 옵션 목록에 없는 항목도 태그(pill)로 계속 보이도록 임시 항목을 추가한다.
  const selectData = useMemo(() => {
    const missing = value
      .filter((v) => !options.some((o) => o.value === v))
      .map((v) => ({ value: v, label: v }));
    return missing.length > 0 ? [...missing, ...options] : options;
  }, [options, value]);

  const resolvedAriaInvalid = ariaInvalid ?? !!error;
  const resolvedAriaDescribedBy = mergeDescribedBy(ariaDescribedBy, error ? errorId : undefined);

  // MultiSelect 의 실제 입력 요소(PillsInput.Field)는 Input.tsx/Select 등과 달리
  // attributes.inputField 로 넘긴 값도 못 이긴다 — Mantine 소스
  // packages/@mantine/core/src/components/PillsInput/PillsInputField/PillsInputField.tsx
  // 가 getStyles("field")/attributes 스프레드 *뒤에* "aria-invalid": ctx?.hasError,
  // "aria-describedby": inputWrapperCtx?.describedBy 를 하드코딩해 항상 마지막에 이긴다.
  // (ctx/inputWrapperCtx 는 MultiSelect 자신의 error prop 으로만 채워진다 — FormGroup 처럼
  // 외부에서 주입한 값은 반영할 방법이 없다.) 이 경우만 DOM 커밋 이후 직접 보정한다.
  // useLayoutEffect 를 쓰되 SSR 에서는 useEffect 로 대체해 경고를 피한다 — 다만 SSR HTML
  // 자체에는 이 보정이 반영되지 않는다(첫 하이드레이션 직후에만 반영).
  useIsomorphicLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute("aria-invalid", resolvedAriaInvalid ? "true" : "false");
    if (resolvedAriaDescribedBy) el.setAttribute("aria-describedby", resolvedAriaDescribedBy);
  }, [resolvedAriaInvalid, resolvedAriaDescribedBy]);

  return (
    <MultiSelect
      ref={inputRef}
      id={comboId}
      searchable
      data={selectData}
      value={value}
      onChange={(v) => onChange?.(v)}
      placeholder={value.length === 0 ? placeholder : ""}
      disabled={disabled}
      readOnly={readOnly}
      comboboxProps={{ withinPortal: false }}
      nothingFoundMessage="검색 결과 없음"
      error={
        error ? (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        ) : undefined
      }
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={resolvedAriaInvalid}
      aria-describedby={resolvedAriaDescribedBy}
      classNames={{ input: "form-multiselect-box" }}
      className={clsx("form-multiselect", error && "form-error", className)}
      style={style}
    />
  );
}
