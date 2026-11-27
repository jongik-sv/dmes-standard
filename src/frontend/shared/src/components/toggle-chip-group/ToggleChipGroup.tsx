"use client";

/**
 * 켜고 끄는 칩 묶음 — 정해진 옵션 목록에서 여러 개를 켜 두는 칩(단추, `aria-pressed`). 업무 도메인과 무관하다.
 *
 * - 제어형이다. `value`(켜진 값 목록)를 부모가 쥐고 눌릴 때마다 `onChange(next)` — `next` 는 항상 `options` 순서다.
 * - `baseValue` 를 주면 기준과 비교해 추가(점선 테두리)·제거(취소선)를 보인다 — 저장 전 초안 비교용.
 * - `presets` 는 칩 뒤에 붙는 일괄 선택 단추(모두·없음 같은 것)다. 사용 안 함(`disabled`) 옵션은 일괄 선택으로도 바뀌지 않는다. 문구와 고르는 규칙은 화면이 정한다.
 * - 스타일은 컴포넌트가 직접 넣는다(Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import type { ReactNode } from "react";
import { applyPreset, chipDiffState, toggleValue } from "./chip-state";

export interface ToggleChipOption {
  value: string;
  /** 칩에 보일 내용. 없으면 `value`. */
  label?: ReactNode;
  /** 마우스오버 설명. */
  title?: string;
  /** true 면 눌러도 바뀌지 않는다(켜진 채로 남는다). */
  disabled?: boolean;
}

export interface ToggleChipPreset {
  /** key·testId 에 쓰는 값. 없으면 `label` 을 쓴다(같은 문구가 둘이면 꼭 준다). */
  id?: string;
  label: string;
  /** 모든 옵션 값(`options` 순서)을 받아 켤 값 목록을 돌려준다. */
  pick: (all: string[]) => string[];
  title?: string;
}

export interface ToggleChipGroupProps {
  options: readonly ToggleChipOption[];
  /** 켜진 값(제어형). */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** 비교 기준. 주면 기준과 다른 칩을 추가·제거 모양으로 보인다. */
  baseValue?: readonly string[];
  /** true 면 바꿀 수 없다(모양은 그대로, 일괄 단추는 숨김). */
  readOnly?: boolean;
  size?: "xs" | "sm" | "md";
  /** 칩 뒤에 붙는 일괄 선택 단추. */
  presets?: readonly ToggleChipPreset[];
  /** 추가·제거 칩의 마우스오버에 덧붙는 문구. */
  diffTitles?: { added?: string; removed?: string };
  "aria-label"?: string;
  className?: string;
  testId?: string;
}

const STYLE_HREF = "cm-toggle-chip-group";
export const TOGGLE_CHIP_GROUP_CSS = `
.cm-tcg { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.cm-tcg-chip, .cm-tcg-preset { box-sizing: border-box; display: inline-flex; align-items: center; padding: 0 var(--spacing-sm); border: 1px solid var(--color-border-medium); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-text-muted); font-size: var(--font-size-sm); line-height: 1; white-space: nowrap; cursor: pointer; }
.cm-tcg-chip { font-family: var(--font-family-mono); }
.cm-tcg[data-size="xs"] :is(.cm-tcg-chip, .cm-tcg-preset) { height: 20px; font-size: var(--font-size-xs); }
.cm-tcg[data-size="sm"] :is(.cm-tcg-chip, .cm-tcg-preset) { height: 24px; }
.cm-tcg[data-size="md"] :is(.cm-tcg-chip, .cm-tcg-preset) { height: 28px; font-size: var(--font-size-md); }
.cm-tcg-chip:hover:not(:disabled):not([data-readonly="true"]), .cm-tcg-preset:hover { border-color: var(--color-primary); color: var(--color-text); }
.cm-tcg-chip:focus-visible, .cm-tcg-preset:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cm-tcg-chip[aria-pressed="true"] { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); font-weight: 600; }
.cm-tcg-chip[data-state="added"] { border-style: dashed; border-color: var(--color-warning); }
.cm-tcg-chip[data-state="removed"] { border-style: dashed; border-color: var(--color-warning); background: var(--color-warning-soft); text-decoration: line-through; }
.cm-tcg-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.cm-tcg-chip[data-readonly="true"] { cursor: default; }
.cm-tcg-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cm-tcg-preset { margin-left: var(--spacing-xs); background: transparent; }
`;

function ToggleChipGroupStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {TOGGLE_CHIP_GROUP_CSS}
    </style>
  );
}

export function ToggleChipGroup({
  options, value, onChange, baseValue, readOnly = false, size = "sm", presets, diffTitles, "aria-label": ariaLabel, className, testId = "toggle-chip-group",
}: ToggleChipGroupProps) {
  const order = options.map((o) => o.value);
  const added = diffTitles?.added ?? "추가됨";
  const removed = diffTitles?.removed ?? "빠짐";
  return (
    <>
      <ToggleChipGroupStyle />
      <span className={className ? `cm-tcg ${className}` : "cm-tcg"} role="group" aria-label={ariaLabel} data-size={size} data-testid={testId}>
        {options.map((o) => {
          const state = chipDiffState(o.value, value, baseValue);
          const tip = [o.title, state === "added" ? added : state === "removed" ? removed : ""].filter(Boolean).join(" · ");
          return (
            <button
              key={o.value}
              type="button"
              className="cm-tcg-chip"
              aria-pressed={value.includes(o.value)}
              data-state={state}
              data-readonly={readOnly}
              disabled={o.disabled}
              aria-disabled={readOnly || undefined}
              title={tip || undefined}
              data-testid={`${testId}-chip-${o.value}`}
              onClick={() => { if (!readOnly) onChange(toggleValue(value, o.value, order)); }}
            >
              {o.label ?? o.value}
              {state === "added" && <span className="cm-tcg-sr"> ({added})</span>}
              {state === "removed" && <span className="cm-tcg-sr"> ({removed})</span>}
            </button>
          );
        })}
        {!readOnly && presets?.map((p) => (
          <button
            key={p.id ?? p.label}
            type="button"
            className="cm-tcg-preset"
            title={p.title}
            data-testid={`${testId}-preset-${p.id ?? p.label}`}
            onClick={() => onChange(applyPreset(p.pick([...order]), value, options))}
          >
            {p.label}
          </button>
        ))}
      </span>
    </>
  );
}
