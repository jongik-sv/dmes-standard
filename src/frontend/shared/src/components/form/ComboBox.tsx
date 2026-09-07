"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Select } from "@mantine/core";
import clsx from "clsx";

export interface ComboBoxProps {
  /** 원본 데이터 배열 (string[] 또는 object[]) */
  data: any[];
  /** value로 사용할 필드명 (기본: "value") */
  valueField?: string;
  /** 표시 텍스트로 사용할 필드명 (기본: "label") */
  labelField?: string;
  /** 선택된 value */
  value?: string;
  /** 값 변경 콜백 (value, 원본 객체) */
  onChange?: (value: string, item?: any) => void;
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
  /**
   * Creatable 모드 활성화. 입력 텍스트가 기존 옵션과 일치하지 않을 때
   * 드롭다운 하단에 "+ '...' 신규 생성" 항목이 노출된다. 선택 시 호출됨.
   */
  onCreateNew?: (text: string) => void;
  /** Creatable 항목 라벨 포맷 (기본: `+ "{text}" 신규 생성`) */
  createLabel?: (text: string) => string;
  /**
   * 드롭다운에 한 번에 렌더할 최대 항목 수. 대용량(수만~수십만) 옵션을 받을 때
   * 초기 렌더/필터링이 폭주하지 않도록 캡을 둔다. 미지정 시 무제한.
   */
  maxVisible?: number;
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

export function ComboBox({
  data,
  valueField = "value",
  labelField = "label",
  value = "",
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
  onCreateNew,
  createLabel,
  maxVisible,
}: ComboBoxProps) {
  const autoId = useId();
  const comboId = id || autoId;
  const errorId = `${comboId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => resolveOptions(data, valueField, labelField), [data, valueField, labelField]);

  // 검색어를 직접 제어한다 — onCreateNew 노출 판정과 표시 텍스트 동기화에 필요하다.
  const [searchValue, setSearchValue] = useState("");

  // value 가 현재 옵션 목록에 없어도(대용량 데이터의 maxVisible 캡 등으로 화면에 없을 수 있다)
  // 입력창 표시가 사라지지 않도록 임시 항목을 앞에 추가한다.
  const selectData = useMemo(() => {
    if (value && !options.some((o) => o.value === value)) {
      return [{ value, label: value }, ...options];
    }
    return options;
  }, [options, value]);

  // value(선택된 옵션)가 바뀌면 검색어를 그 라벨로 동기화한다 — 기존 구현의
  // "value prop → input 표시 텍스트 동기화" 이펙트와 동일한 역할.
  useEffect(() => {
    const found = options.find((o) => o.value === value);
    setSearchValue(found ? found.label : value || "");
  }, [value, options]);

  const trimmed = searchValue.trim();
  const showCreateItem = !!onCreateNew && trimmed.length > 0 && !options.some((o) => o.label === trimmed);

  const resolvedAriaInvalid = ariaInvalid ?? !!error;
  const resolvedAriaDescribedBy = mergeDescribedBy(ariaDescribedBy, error ? errorId : undefined);

  // Mantine Select(InputBase 계열)는 자신의 error prop 으로만 aria-invalid/
  // aria-describedby 를 계산해 외부 주입값을 덮어써 버린다(Input/Select/Textarea/
  // DatePicker 공통 이슈). DOM 커밋 이후 직접 반영한다.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute("aria-invalid", String(resolvedAriaInvalid));
    if (resolvedAriaDescribedBy) el.setAttribute("aria-describedby", resolvedAriaDescribedBy);
  }, [resolvedAriaInvalid, resolvedAriaDescribedBy]);

  return (
    <Select
      ref={inputRef}
      id={comboId}
      searchable
      data={selectData}
      value={value || null}
      onChange={(v) => {
        const item = v == null ? undefined : options.find((o) => o.value === v)?.raw;
        onChange?.(v ?? "", item);
      }}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      limit={maxVisible}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      comboboxProps={{ withinPortal: false }}
      nothingFoundMessage={
        showCreateItem ? (
          <button
            type="button"
            className="form-combobox-create"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCreateNew?.(trimmed)}
          >
            {(createLabel ?? ((t) => `+ "${t}" 신규 생성`))(trimmed)}
          </button>
        ) : undefined
      }
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
      className={clsx("form-combobox", error && "form-error", className)}
      style={style}
    />
  );
}
