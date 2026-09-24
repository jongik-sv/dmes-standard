import type { CSSProperties } from "react";

/** codeItemEdit 화면 인라인 스타일 — 의미 토큰만 쓴다(UI-Visual-Standard). */
export const hint: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
  margin: "0 0 var(--spacing-xs) 0",
};

export const fieldRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  marginBottom: "var(--spacing-xs)",
};

export const fieldLabel: CSSProperties = {
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
};

export const toolbar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--spacing-sm)",
  padding: "var(--spacing-xs) var(--spacing-sm)",
};

export const issueText: CSSProperties = {
  color: "var(--color-danger)",
  fontSize: "var(--font-size-sm)",
  marginLeft: "var(--spacing-xs)",
};

export const struck: CSSProperties = {
  color: "var(--color-text-disabled)",
  textDecoration: "line-through",
  marginRight: "var(--spacing-xs)",
};
