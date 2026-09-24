import type { CSSProperties } from "react";

/** codeCateEdit 화면 인라인 스타일 — 의미 토큰만 쓴다(UI-Visual-Standard, codeItemEdit/components/styles.ts 복제). */
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

/** transfer-list 좌우 패널. */
export const transferGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: "var(--spacing-sm)",
  alignItems: "stretch",
  minHeight: 0,
};

export const transferColumn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

export const transferList: CSSProperties = {
  flex: 1,
  minHeight: 200,
  maxHeight: 320,
  overflowY: "auto",
  padding: "var(--spacing-xs)",
};

export const transferButtons: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "var(--spacing-xs)",
};

export const transferRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  padding: "2px var(--spacing-xs)",
  fontSize: "var(--font-size-sm)",
};
