"use client";

/**
 * 카드 묶음 틀 — 제목 줄 하나로 묶음 안 카드를 함께 접는다(① 헤더·② 버전, ④ 값 테스트·⑤ 테스트 결과).
 * 접으면 본문을 숨기기만 하고 내리지 않는다: 카드가 내려가면 카드의 dirty 알림·값 테스트 결과가 사라진다.
 * 숨김은 바깥 div 의 `hidden` 이 맡고 16칸 격자는 안쪽 div 가 그린다(인라인 display 가 hidden 을 이기지 않게).
 */
import { useState, type ReactNode } from "react";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

export function CardGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const toggle = () => setOpen((o) => !o);
  return (
    <div data-testid={`rule-group-${id}`}>
      <button
        type="button"
        data-testid={`rule-group-${id}-toggle`}
        aria-expanded={open}
        aria-label={`${title} ${open ? "접기" : "펼치기"}`}
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          width: "100%",
          height: 26,
          padding: "0 var(--spacing-sm)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-bg-grid-header)",
          color: "var(--color-text)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        <span>{title}</span>
      </button>
      <div hidden={!open} data-testid={`rule-group-${id}-body`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(16, minmax(0, 1fr))", gap: "var(--spacing-sm)", paddingTop: "var(--spacing-xs)" }}>{children}</div>
      </div>
    </div>
  );
}
