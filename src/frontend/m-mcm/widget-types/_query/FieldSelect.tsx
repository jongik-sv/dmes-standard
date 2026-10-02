"use client";

import { Input, Select } from "@dk-oasis/shared/form";

import { fieldOptions } from "./format";

export interface FieldSelectProps {
  value: string;
  /** [쿼리 시험] 결과 컬럼. 비면 직접 입력 칸을 보인다. */
  columns: readonly string[];
  onChange: (value: string) => void;
  /** 고르지 않아도 되는 칸(빈 선택지 「(없음)」). */
  optional?: boolean;
  ariaLabel: string;
}

/** 필드 고르기 — 결과 컬럼이 있으면 select, 없으면 직접 입력 칸(계획 Task 7). */
export function FieldSelect({ value, columns, onChange, optional = false, ariaLabel }: FieldSelectProps) {
  if (columns.length === 0) {
    return (
      <Input
        value={value}
        onChange={onChange}
        placeholder="컬럼 이름([쿼리 시험] 뒤에는 목록에서 고릅니다)"
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <Select
      value={value}
      options={fieldOptions(columns, value)}
      onChange={onChange}
      placeholder={optional ? "(없음)" : "선택"}
      aria-label={ariaLabel}
    />
  );
}
