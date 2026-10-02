"use client";

import { Input } from "./Input";
import { Select } from "./Select";
import { withCurrentOption } from "./select-or-input-options";

export interface SelectOrInputProps {
  value: string;
  /** 고를 수 있는 값 목록. 비어 있으면 직접 입력 칸을 보인다. */
  options: readonly string[];
  onChange: (value: string) => void;
  /** 고르지 않아도 되는 칸이면 true(선택지 맨 앞에 「(없음)」 빈 값). 기본 false. */
  optional?: boolean;
  /** 화면 낭독용 이름. */
  ariaLabel: string;
  /** 직접 입력 칸 안내 문구. */
  inputPlaceholder?: string;
  /** 선택 칸의 빈 값 문구. 기본은 optional 이면 「(없음)」, 아니면 「선택」. */
  selectPlaceholder?: string;
  disabled?: boolean;
}

/**
 * 선택지가 있으면 드롭다운, 없으면 직접 입력 칸을 보이는 한 칸 입력.
 * 목록이 나중에 채워지는 칸(예: 조회해 본 결과 컬럼)에 쓴다. 지금 값이 목록에 없어도 선택지에 남겨 값을 잃지 않는다.
 */
export function SelectOrInput({
  value,
  options,
  onChange,
  optional = false,
  ariaLabel,
  inputPlaceholder = "직접 입력",
  selectPlaceholder,
  disabled = false,
}: SelectOrInputProps) {
  if (options.length === 0) {
    return (
      <Input
        value={value}
        onChange={onChange}
        placeholder={inputPlaceholder}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    );
  }
  return (
    <Select
      value={value}
      options={withCurrentOption(options, value)}
      onChange={onChange}
      placeholder={selectPlaceholder ?? (optional ? "(없음)" : "선택")}
      aria-label={ariaLabel}
      disabled={disabled}
    />
  );
}
