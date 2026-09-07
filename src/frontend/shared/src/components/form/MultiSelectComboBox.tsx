"use client";

import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import { MultiSelect } from "@mantine/core";
import clsx from "clsx";

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

  // Mantine MultiSelect(InputBase 계열)도 Select 와 동일하게 자신의 error prop 으로만
  // aria-invalid/aria-describedby 를 계산해 외부 주입값을 덮어써 버린다.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute("aria-invalid", String(resolvedAriaInvalid));
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
      className={clsx("form-combobox", "form-multiselect", error && "form-error", className)}
      style={style}
    />
  );
}
