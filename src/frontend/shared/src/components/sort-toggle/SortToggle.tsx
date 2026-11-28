"use client";

/**
 * 정렬 단추 묶음 — 정렬 기준 단추(누르면 다음 기준)와 방향 단추(누르면 오름·내림을 뒤집음). 업무 도메인과 무관하다.
 *
 * - 제어형이다. `value`(기준·방향)를 부모가 쥐고 누를 때마다 `onChange(next)`.
 * - 기준 단추는 지금 기준의 `label` 을 보인다. 기준이 하나뿐이면 기준 단추를 그리지 않는다.
 * - 목록을 실제로 줄 세우는 일은 부모가 한다(값 비교 규칙은 화면마다 다르다).
 * - 스타일은 컴포넌트가 직접 넣는다(Part B §18-3). 색·간격은 공통 토큰만 쓴다.
 */
import { IconSortAscending, IconSortDescending } from "@tabler/icons-react";
import { flipSortDir, nextSortKey, type SortState } from "./sort-state";

export interface SortToggleOption<K extends string = string> {
  value: K;
  /** 기준 단추에 보일 짧은 이름(예: 「ID」·「이름」). */
  label: string;
}

export interface SortToggleProps<K extends string = string> {
  options: readonly SortToggleOption<K>[];
  /** 지금 정렬 상태(제어형). */
  value: SortState<K>;
  onChange: (next: SortState<K>) => void;
  /** 묶음 라벨(`role="group"`). 단추 설명 앞에도 붙는다. 기본 「정렬」. */
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

const STYLE_HREF = "cm-sort-toggle";
export const SORT_TOGGLE_CSS = `
.cm-sort { display: inline-flex; align-items: center; gap: 2px; }
.cm-sort-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 2px; height: 24px; min-width: 24px; padding: 0 var(--spacing-xs); border: 1px solid var(--color-border-medium); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-text-muted); font-size: var(--font-size-xs); line-height: 1; white-space: nowrap; cursor: pointer; }
.cm-sort-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-text); }
.cm-sort-btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cm-sort-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

function SortToggleStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {SORT_TOGGLE_CSS}
    </style>
  );
}

const DIR_TEXT = { asc: "오름차순", desc: "내림차순" } as const;

export function SortToggle<K extends string = string>({
  options, value, onChange, "aria-label": ariaLabel = "정렬", disabled = false, className, testId = "sort-toggle",
}: SortToggleProps<K>) {
  const keys = options.map((o) => o.value);
  const cur = options.find((o) => o.value === value.key) ?? options[0];
  const nextKey = nextSortKey(keys, value.key);
  const nextLabel = options.find((o) => o.value === nextKey)?.label ?? nextKey;
  const keyTip = `${ariaLabel} 기준: ${cur?.label ?? value.key} — 누르면 ${nextLabel}`;
  const dirTip = `${ariaLabel} 방향: ${DIR_TEXT[value.dir]} — 누르면 ${DIR_TEXT[flipSortDir(value.dir)]}`;
  return (
    <>
      <SortToggleStyle />
      <span className={className ? `cm-sort ${className}` : "cm-sort"} role="group" aria-label={ariaLabel} data-testid={testId}>
        {options.length > 1 && (
          <button
            type="button"
            className="cm-sort-btn"
            title={keyTip}
            aria-label={keyTip}
            disabled={disabled}
            data-testid={`${testId}-key`}
            data-key={value.key}
            onClick={() => onChange({ key: nextKey, dir: value.dir })}
          >
            {cur?.label ?? value.key}
          </button>
        )}
        <button
          type="button"
          className="cm-sort-btn"
          title={dirTip}
          aria-label={dirTip}
          disabled={disabled}
          data-testid={`${testId}-dir`}
          data-dir={value.dir}
          onClick={() => onChange({ key: value.key, dir: flipSortDir(value.dir) })}
        >
          {value.dir === "asc" ? <IconSortAscending size={14} aria-hidden /> : <IconSortDescending size={14} aria-hidden />}
        </button>
      </span>
    </>
  );
}
