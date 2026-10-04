"use client";

/**
 * 카드 묶음 — 제목 줄 하나(접기 단추)로 묶음 안 카드를 함께 접고 편다.
 * - 접으면 본문을 숨기기만 하고 내리지 않는다(`hidden`). 안쪽 카드의 입력·dirty 상태·결과가 그대로 남는다.
 * - 숨김은 바깥 본문 div 의 `hidden` 이 맡고 격자(columns)는 안쪽 div 가 그린다. 인라인 display 가 hidden 을 이기지 않게 둘을 나눈다.
 * - testId 는 `{testIdPrefix}-{id}`(뿌리)·`-toggle`(단추)·`-body`(본문)이다.
 */
import { useState, type ReactNode } from "react";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

export interface CardGroupProps {
  /** 묶음 id. testId 끝에 붙는다. */
  id: string;
  /** 제목 줄 글. 단추의 aria-label(`{title} 접기`/`{title} 펼치기`)에도 쓴다. */
  title: string;
  /** testId 접두어(기본 "card-group") — 뿌리 `{접두어}-{id}`, 단추 `-toggle`, 본문 `-body`. */
  testIdPrefix?: string;
  /** 본문 격자 칸 수. 주면 `repeat(n, minmax(0, 1fr))` 격자로 깔고 자식이 `gridColumn: span k` 로 칸을 잡는다. 없으면(기본) 격자 없이 흐름 배치. */
  columns?: number | null;
  /** 처음 펼침 여부(기본 true). */
  defaultOpen?: boolean;
  /** 단추 aria-label 의 동작 말(기본 접기·펼치기). */
  labels?: { collapse?: string; expand?: string };
  /** 묶음 안 카드. */
  children: ReactNode;
}

export function CardGroup({
  id,
  title,
  testIdPrefix = "card-group",
  columns = null,
  defaultOpen = true,
  labels,
  children,
}: CardGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((o) => !o);
  const base = `${testIdPrefix}-${id}`;
  const action = open ? (labels?.collapse ?? "접기") : (labels?.expand ?? "펼치기");
  return (
    <div data-testid={base}>
      <button
        type="button"
        data-testid={`${base}-toggle`}
        aria-expanded={open}
        aria-label={`${title} ${action}`}
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
      <div hidden={!open} data-testid={`${base}-body`}>
        <div
          style={
            columns != null
              ? {
                  display: "grid",
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: "var(--spacing-sm)",
                  paddingTop: "var(--spacing-xs)",
                }
              : { paddingTop: "var(--spacing-xs)" }
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
