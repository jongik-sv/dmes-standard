/** 룰 화면 카드 틀 — 제목 한 줄과 본문. 색은 의미 토큰만 쓴다. */
import type { ReactNode } from "react";

export function CardFrame({ title, testId, right, children }: { title: string; testId: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section
      data-testid={testId}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-bg)",
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-xs) var(--spacing-md)",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-bg-header)",
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        {right}
      </header>
      <div style={{ padding: "var(--spacing-sm) var(--spacing-md)" }}>{children}</div>
    </section>
  );
}

export function MutedText({ children }: { children: ReactNode }) {
  return <span style={{ color: "var(--color-text-muted)" }}>{children}</span>;
}
