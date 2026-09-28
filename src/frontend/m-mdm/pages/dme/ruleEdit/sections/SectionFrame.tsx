"use client";

/**
 * 표 카드 아래 섹션 틀 — 제목 줄(접기 단추·제목·배지)과 본문. 접으면 본문을 숨기기만 하고 내리지 않는다:
 * 섹션이 내려가면 열 설정·피벗의 dirty 알림이 풀려 표 저장 막기(불변 13)가 사라진다. 제목 줄의 배지는 접혀도 보인다.
 */
import type { ReactNode } from "react";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

export function SectionFrame({
  testId,
  title,
  open,
  onOpenChange,
  headerExtra,
  children,
}: {
  testId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const toggle = () => onOpenChange(!open);
  return (
    <div data-testid={testId} style={{ paddingTop: "var(--spacing-md)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          flexWrap: "wrap",
          paddingBottom: "var(--spacing-xs)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <button
          type="button"
          data-testid={`${testId}-toggle`}
          aria-expanded={open}
          aria-label={`${title} ${open ? "접기" : "펼치기"}`}
          onClick={toggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            padding: 0,
            border: "none",
            background: "none",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </button>
        <strong onClick={toggle} style={{ cursor: "pointer", userSelect: "none" }}>
          {title}
        </strong>
        {headerExtra}
      </div>
      <div hidden={!open} data-testid={`${testId}-body`}>
        {children}
      </div>
    </div>
  );
}
