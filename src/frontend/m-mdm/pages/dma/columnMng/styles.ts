/** columnMng 화면 루트와 상세 폼이 함께 쓰는 인라인 스타일. */
export const panelScrollStyle = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--spacing-sm)",
} as const;
export const panelTitleStyle = {
  margin: "0 0 var(--spacing-xs)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
} as const;
export const rowStyle = {
  display: "flex",
  gap: "var(--spacing-xs)",
  alignItems: "center",
  flexWrap: "wrap",
} as const;
export const mutedText = {
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-xs)",
} as const;
