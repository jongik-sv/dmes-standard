"use client";

/**
 * 룰 고르기 — 선택지가 6개 이하면 SegmentedControl, 넘으면 Select. 선택지가 하나면 그리지 않는다.
 * 간편판정·버전 이력 탭이 같은 모양으로 쓴다.
 */
import { SegmentedControl, Select } from "@dk-oasis/shared/form";

const SEGMENT_MAX = 6;

export interface RulePickerProps {
  value: string;
  onChange: (ruleId: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  testId?: string;
}

export function RulePicker({
  value,
  onChange,
  options,
  disabled,
  testId,
}: RulePickerProps) {
  if (options.length <= 1) return null;
  if (options.length <= SEGMENT_MAX) {
    return (
      <SegmentedControl
        ariaLabel="룰"
        testId={testId}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
      />
    );
  }
  return (
    <Select
      aria-label="룰"
      data-testid={testId}
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
    />
  );
}
