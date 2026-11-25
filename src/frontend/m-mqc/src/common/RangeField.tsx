"use client";

/**
 * 범위 막대(슬라이더) 한 줄 — 라벨 · 현재 값·단위 · 막대 · [기본] 단추(선택). shared 에 슬라이더 래퍼가 없어 m-mqc 에 둔다(shared 등록 후보).
 * 브라우저 기본 range 입력을 쓰고 색은 의미 토큰(--color-primary)만 쓴다.
 */
import { useId, type CSSProperties } from "react";

import { Button } from "@dk-oasis/shared/form";

export interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 값 뒤에 붙일 단위(px·mm 등). */
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** 있으면 오른쪽에 되돌리기 단추를 둔다. */
  onReset?: () => void;
  resetLabel?: string;
}

const WRAP: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--spacing-sm)", alignItems: "end" };
const HEAD: CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const VAL: CSSProperties = { color: "var(--color-text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" };
const BAR: CSSProperties = { width: "100%", accentColor: "var(--color-primary)", margin: "4px 0 0" };

export function RangeField({ label, value, min, max, step = 1, unit = "", disabled, onChange, onReset, resetLabel = "기본" }: RangeFieldProps) {
  const id = useId();
  return (
    <div style={WRAP}>
      <div>
        <div style={HEAD}>
          <label htmlFor={id}>{label}</label>
          <span style={VAL}>
            {value}
            {unit}
          </span>
        </div>
        <input
          id={id}
          type="range"
          style={BAR}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
      </div>
      {onReset ? (
        <Button size="sm" disabled={disabled} onClick={onReset}>
          {resetLabel}
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}
