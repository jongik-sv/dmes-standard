"use client";

/** 출력물 편집 패널(검사증명서·품질보증서) 공통 배치 — 세로 쌓기, 한 줄 묶음, 라벨-값 상세 표 행. 색·간격은 의미 토큰만 쓴다. */
import type { CSSProperties, ReactNode } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { GridBadge } from "@dk-oasis/shared/grid";

const STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-md)", padding: "var(--spacing-sm)" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-xs)", flexWrap: "wrap" };
const GROW: CSSProperties = { flex: 1, minWidth: 0 };
const LABEL: CSSProperties = { ...DETAIL_LABEL_CELL, width: 112 };
const HINT: CSSProperties = { color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: 2, lineHeight: 1.45 };
const LEAD: CSSProperties = { color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", lineHeight: 1.55, margin: 0 };

export const Stack = ({ children }: { children: ReactNode }) => <div style={STACK}>{children}</div>;
export const Row = ({ children }: { children: ReactNode }) => <div style={ROW}>{children}</div>;
export const Grow = ({ children }: { children: ReactNode }) => <div style={GROW}>{children}</div>;
export const Hint = ({ children }: { children: ReactNode }) => <div style={HINT}>{children}</div>;
export const Lead = ({ children }: { children: ReactNode }) => <p style={LEAD}>{children}</p>;

export const DetailTable = ({ children }: { children: ReactNode }) => (
  <table style={DETAIL_TABLE_STYLE}>
    <tbody>{children}</tbody>
  </table>
);

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <tr>
      <th style={LABEL}>{label}</th>
      <td style={DETAIL_VALUE_CELL}>
        {children}
        {hint ? <Hint>{hint}</Hint> : null}
      </td>
    </tr>
  );
}

type Tone = "primary" | "success" | "warning" | "danger";
/** 그리드 셀 배지(의미 색). */
export const cellBadge = (label: string, tone?: Tone) =>
  tone ? <GridBadge label={label} bg={`var(--color-${tone}-soft)`} color={`var(--color-${tone})`} /> : <GridBadge label={label} muted />;

/** 여러 줄 글을 한 줄로(⏎ 표시). */
export const oneLine = (s: unknown) => String(s ?? "").replace(/\n/g, " ⏎ ");
