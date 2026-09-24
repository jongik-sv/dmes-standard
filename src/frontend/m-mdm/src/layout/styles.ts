/** 레이아웃 화면(headerMng·layoutMng) 공용 인라인 스타일 — 의미 토큰만 쓴다(UI-Visual-Standard). */
import type { CSSProperties } from "react";

export const sectionTitle: CSSProperties = {
  margin: 0,
  padding: "var(--spacing-sm) var(--spacing-md)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};

export const sectionBody: CSSProperties = {
  padding: "0 var(--spacing-md) var(--spacing-md)",
};

export const hint: CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-xs)",
};

export const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--spacing-sm)",
};

export const empty: CSSProperties = {
  padding: "var(--spacing-md)",
  color: "var(--color-text-muted)",
};

export const badge: CSSProperties = {
  display: "inline-block",
  padding: "0 var(--spacing-xs)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  color: "var(--color-text-secondary)",
};
