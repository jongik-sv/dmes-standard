"use client";

/**
 * 오른쪽 패널의 접는 섹션(4단계 계획 Task 8, 스펙 §1.3) — 한 줄 머리(제목 + 오른쪽 `>`)를 누르면 펴고 접는다. 여러 개를 함께 펼 수 있다.
 * 펼침 상태는 종류(`PanelKind`)·섹션 ID 별로 page 의 화면 메모리(`useSectionMemory`)에만 둔다(저장하지 않는다). 기본은 펼침.
 * shared 에 접는 목록 래퍼가 없고 화면은 `@mantine/*` 를 import 하지 않으므로(mantine-aggrid-ui 스킬 §3) `button aria-expanded` 로 그린다.
 */
import { useId, useMemo, useState, type ReactNode } from "react";

import { IconChevronRight } from "@tabler/icons-react";

import type { PanelKind } from "./PanelHeader";

export interface SectionMemory {
  isOpen(kind: PanelKind, id: string): boolean;
  toggle(kind: PanelKind, id: string): void;
  /** 접혀 있으면 편다(룰 지정 섹션 열기). 이미 펴져 있으면 상태를 바꾸지 않는다. */
  open(kind: PanelKind, id: string): void;
}

/** 접은 섹션(`종류:ID`)만 기억한다 — 모드를 바꿔도(page 에 있어) 남고, 화면을 닫으면 사라진다. */
export function useSectionMemory(): SectionMemory {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  return useMemo(() => {
    const key = (k: PanelKind, id: string) => `${k}:${id}`;
    return {
      isOpen: (k, id) => !closed.has(key(k, id)),
      toggle: (k, id) =>
        setClosed((s) => {
          const x = key(k, id);
          const n = new Set(s);
          if (n.has(x)) n.delete(x);
          else n.add(x);
          return n;
        }),
      open: (k, id) =>
        setClosed((s) => {
          const x = key(k, id);
          if (!s.has(x)) return s;
          const n = new Set(s);
          n.delete(x);
          return n;
        }),
    };
  }, [closed]);
}

export interface SectionProps {
  kind: PanelKind;
  /** testid `flow-section-{id}`·`flow-section-{id}-head`. 한 패널 안에서 겹치지 않는다. */
  id: string;
  title: string;
  memory: SectionMemory;
  children: ReactNode;
}

export function Section({ kind, id, title, memory, children }: SectionProps) {
  const open = memory.isOpen(kind, id);
  const bodyId = useId();
  return (
    <section className="rsf-section" data-testid={`flow-section-${id}`} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="rsf-section-head"
        data-testid={`flow-section-${id}-head`}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => memory.toggle(kind, id)}
      >
        <span className="rsf-section-title">{title}</span>
        <IconChevronRight size={14} aria-hidden="true" className="rsf-section-chevron" />
      </button>
      {open && (
        <div id={bodyId} className="rsf-section-body">
          {children}
        </div>
      )}
    </section>
  );
}
