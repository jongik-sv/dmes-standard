/**
 * 표 카드 아래 HTML 표 섹션(피벗·입력 계약)이 함께 쓰는 데이터 표 모양. 그리드(UI-Visual-Standard §7)와 같게 헤더
 * `--color-bg-grid-header`·11px 600, 열 구분선, 줄무늬를 둔다. 피벗은 머리 칸 안에 구간 입력이 들어가
 * `AgDataGrid` 대신 HTML 표로 그린다(열 설정은 의사결정표와 같은 `AgDataGrid`). 색은 의미 토큰만 쓴다.
 */
import type { CSSProperties } from "react";

export const dtWrap: CSSProperties = { overflowX: "auto", paddingTop: "var(--spacing-xs)" };

export const dtTable: CSSProperties = {
  borderCollapse: "collapse",
  minWidth: "100%",
  fontSize: "var(--font-size-sm)",
  border: "1px solid var(--color-border-grid)",
};

export const dtTh: CSSProperties = {
  textAlign: "left",
  height: 28,
  padding: "0 8px",
  whiteSpace: "nowrap",
  fontSize: "var(--font-size-xs)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  background: "var(--color-bg-grid-header)",
  border: "1px solid var(--color-border-grid)",
};

export const dtTd: CSSProperties = {
  padding: "4px 6px",
  verticalAlign: "top",
  border: "1px solid var(--color-border-light)",
};

/** 줄무늬 — 홀수 번째(0부터) 줄에 배경을 준다. */
export function zebra(index: number): string | undefined {
  return index % 2 === 1 ? "var(--color-bg-zebra)" : undefined;
}

export const mutedText: CSSProperties = { color: "var(--color-text-muted)" };
