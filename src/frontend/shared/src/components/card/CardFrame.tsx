/**
 * 카드 틀 — 제목 한 줄(제목 + 오른쪽 자리)과 본문을 테두리 상자로 묶는다. 색·간격은 의미 토큰만 쓴다.
 * 그리드 제목·건수·버튼 툴바가 필요하면 grid 의 GridPanel, 대시보드 격자 칸·접기·크기 조절이 필요하면 dashboard 의 DashboardCard 를 쓴다.
 * 이 틀은 높이를 채우지 않고 내용 높이를 따른다.
 */
import type { ReactNode } from "react";

export interface CardFrameProps {
  /** 제목 줄 왼쪽 글. */
  title: ReactNode;
  /** 뿌리 `<section>` 의 data-testid. 없으면 붙이지 않는다. */
  testId?: string;
  /** 제목 줄 오른쪽 자리(배지·버튼 등). */
  right?: ReactNode;
  /** 본문. */
  children: ReactNode;
}

export function CardFrame({ title, testId, right, children }: CardFrameProps) {
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

export interface MutedTextProps {
  children: ReactNode;
}

/** 흐린 보조 글(설명·빈 값 표시) — `--color-text-muted` 색의 `<span>`. */
export function MutedText({ children }: MutedTextProps) {
  return <span style={{ color: "var(--color-text-muted)" }}>{children}</span>;
}
