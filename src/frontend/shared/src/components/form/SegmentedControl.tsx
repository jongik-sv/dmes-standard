"use client";

/**
 * 세그먼트 선택 — 2~6개의 짧은 선택지(일·주·월, 제품군, 목록 필터) 중 하나를 붙어 있는 버튼 줄로 고른다.
 * Mantine SegmentedControl 래퍼다. 선택된 칸은 주 색(dmes) 채움 + 흰 글자, 크기는 표준 xs(26px).
 * 선택지를 모두 펼쳐 보이는 단일 선택이라는 점은 Radio 와 같다. 폼 입력 항목이면 Radio, 보기·필터 전환이면 이것을 쓴다.
 */
import type { CSSProperties } from "react";
import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";

export type SegmentedControlOption = string | { value: string; label: string; disabled?: boolean };

export interface SegmentedControlProps {
  /** 선택한 값. */
  value: string;
  /** 다른 칸을 골랐을 때. */
  onChange?: (value: string) => void;
  /** 선택지(문자열이면 값과 글자가 같다). */
  options: SegmentedControlOption[];
  /** 화면 읽기 프로그램용 묶음 이름(예: "제품군"). */
  ariaLabel?: string;
  /** 전체 비활성. */
  disabled?: boolean;
  /** 부모 폭을 꽉 채운다(기본 false). */
  fullWidth?: boolean;
  /** 라디오 묶음 name(없으면 자동). */
  name?: string;
  className?: string;
  style?: CSSProperties;
  /** 뿌리 data-testid. */
  testId?: string;
}

export function SegmentedControl({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  fullWidth = false,
  name,
  className = "",
  style,
  testId,
}: SegmentedControlProps) {
  const data = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <MantineSegmentedControl
      data={data}
      value={value}
      onChange={(v) => onChange?.(v)}
      disabled={disabled}
      fullWidth={fullWidth}
      name={name}
      size="xs"
      color="dmes"
      withItemsBorders
      transitionDuration={0}
      aria-label={ariaLabel}
      className={`form-segmented ${className}`.trim()}
      style={style}
      data-testid={testId}
    />
  );
}
