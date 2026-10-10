"use client";

/**
 * 왼쪽 패널(스펙 2.2) — 업무영역 → 다이어그램 목록(표 수·위반 수), 다이어그램에 없는 표 수, 표 찾기(물리명·논리명·주석),
 * [새 다이어그램](마법사, 단계 2). 찾기는 shared FindWidget 을 쓴다. 다음·이전으로 돌 때마다 그 표를 고르고 캔버스를 그 표로 옮긴다(onRevealTable).
 * 표 찾기 키(Ctrl/⌘+T·K)는 ErdViewer 의 전역 키가 findSeq 를 올려 연다(S2-8·S2-27).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@dk-oasis/shared/form";
import {
  DEFAULT_FIND_OPTIONS, FindWidget, INVALID_FIND, compileFind, isMacPlatform, type FindOptions, type FindState,
} from "@dk-oasis/shared/react-flow";

import { BAD_STATUSES } from "../canvas/erd-flow";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnStatus, ErdDiagram, ErdState, ErdTable } from "../types";
import { DiagramWizard } from "./DiagramWizard";

export interface DiagramItem {
  id: string;
  name: string;
  tables: number;
  violations: number;
}

export interface DiagramGroup {
  area: string;
  diagrams: DiagramItem[];
}

export function sortedDiagrams(diagrams: Readonly<Record<string, ErdDiagram>>): ErdDiagram[] {
  return Object.values(diagrams).sort((a, b) => a.sortSeq - b.sortSeq || a.id.localeCompare(b.id));
}

/** 업무영역별 다이어그램. 표 수는 지금 버전에 있는 표만, 위반 수는 그 표들의 TYPE·DOMAIN·MISS 컬럼 수다. */
export function diagramGroups(state: ErdState, statuses: Readonly<Record<string, ErdColumnStatus>>): DiagramGroup[] {
  const m = state.model;
  const per = new Map<string, { tables: number; violations: number }>();
  for (const n of Object.values(state.nodes)) {
    const t = m.tables[n.table];
    if (!t) continue;
    const e = per.get(n.diagram) ?? { tables: 0, violations: 0 };
    e.tables += 1;
    e.violations += t.columnOrder.filter((c) => BAD_STATUSES.has(statuses[c] as string)).length;
    per.set(n.diagram, e);
  }
  const groups: DiagramGroup[] = [];
  for (const d of sortedDiagrams(state.diagrams)) {
    let g = groups.find((x) => x.area === d.areaName);
    if (!g) {
      g = { area: d.areaName, diagrams: [] };
      groups.push(g);
    }
    g.diagrams.push({ id: d.id, name: d.diagramName, ...(per.get(d.id) ?? { tables: 0, violations: 0 }) });
  }
  return groups;
}

export function unplacedCount(state: ErdState): number {
  const placed = new Set(Object.values(state.nodes).map((n) => n.table));
  return Object.keys(state.model.tables).filter((id) => !placed.has(id)).length;
}

/** 물리명·논리명·주석 가운데 하나라도 맞는 표(물리명 순). */
export function findTables(tables: Readonly<Record<string, ErdTable>>, query: string, options: FindOptions): { hits: string[]; invalid: boolean } {
  const match = compileFind(query, options);
  if (match === null) return { hits: [], invalid: false };
  if (match === INVALID_FIND) return { hits: [], invalid: true };
  const hits = Object.entries(tables)
    .filter(([, t]) => match(t.phys) || match(t.logical) || (!!t.comment && match(t.comment)))
    .sort(([, a], [, b]) => a.phys.localeCompare(b.phys))
    .map(([id]) => id);
  return { hits, invalid: false };
}

const NO_TABLES: Readonly<Record<string, ErdTable>> = {};

function useTableFind(tables: Readonly<Record<string, ErdTable>>, onReveal: (tableId: string) => void): FindState {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FindOptions>({ ...DEFAULT_FIND_OPTIONS });
  const [index, setIndex] = useState(-1);
  const { hits, invalid } = useMemo(() => findTables(tables, query, options), [tables, query, options]);
  const move = (step: 1 | -1) => {
    if (hits.length === 0) return;
    const i = index < 0 ? (step > 0 ? 0 : hits.length - 1) : (index + step + hits.length) % hits.length;
    setIndex(i);
    onReveal(hits[i]);
  };
  return {
    query, options, invalid, hits, index,
    setQuery: (q) => {
      setQuery(q);
      setIndex(-1);
    },
    toggleOption: (key) => {
      setOptions((o) => ({ ...o, [key]: !o[key] }));
      setIndex(-1);
    },
    next: () => move(1),
    prev: () => move(-1),
  };
}

export interface DiagramTreeProps {
  state: ErdState | null;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  activeDiagram: string | null;
  onSelectDiagram(diagramId: string): void;
  onRevealTable(tableId: string): void;
  /** 오를 때마다 찾기 칸을 연다(Ctrl/⌘+T·K). */
  findSeq: number;
  /** 편집 문맥(단계 2). 모델을 읽기 전에는 null — [새 다이어그램]을 막는다. */
  ctx: ErdEditContext | null;
}

export function DiagramTree({ state, statuses, activeDiagram, onSelectDiagram, onRevealTable, findSeq, ctx }: DiagramTreeProps) {
  const [openSeq, setOpenSeq] = useState(0); // 0 = 닫힘, 오를 때마다 입력 칸에 초점
  const [wizard, setWizard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mac = useMemo(() => isMacPlatform(), []);
  const find = useTableFind(state?.model.tables ?? NO_TABLES, onRevealTable);
  const groups = useMemo(() => (state ? diagramGroups(state, statuses) : []), [state, statuses]);
  const unplaced = useMemo(() => (state ? unplacedCount(state) : 0), [state]);
  const newOff = !ctx || !ctx.rights.diagram.ok;
  const newTitle = ctx && !ctx.rights.diagram.ok ? ctx.rights.diagram.reason ?? undefined : undefined;

  useEffect(() => {
    if (findSeq > 0) setOpenSeq((s) => s + 1);
  }, [findSeq]);

  return (
    <div className="erd-tree" data-testid="erd-tree">
      <div className="erd-tree__find">
        {openSeq > 0 ? (
          <FindWidget find={find} inputRef={inputRef} focusSeq={openSeq} onClose={() => setOpenSeq(0)} mac={mac}
            testId="erd-find" label="표 찾기" inputLabel="표 찾기 — 물리명·논리명·주석" placeholder="표 찾기" />
        ) : (
          <Button size="sm" data-testid="erd-find-open" disabled={!state} onClick={() => setOpenSeq((s) => s + 1)}>
            표 찾기 ({mac ? "⌘K" : "Ctrl+K"})
          </Button>
        )}
      </div>
      <div className="erd-tree__actions">
        <Button size="sm" data-testid="erd-diagram-new" disabled={newOff} title={newTitle} onClick={() => setWizard(true)}>
          새 다이어그램
        </Button>
      </div>
      {groups.map((g) => (
        <div key={g.area} className="erd-tree__area">
          <div className="erd-tree__area-name">{g.area}</div>
          {g.diagrams.map((d) => (
            <button
              type="button"
              key={d.id}
              className="erd-tree__item"
              data-active={d.id === activeDiagram ? "" : undefined}
              aria-current={d.id === activeDiagram ? "true" : undefined}
              data-testid={`erd-diagram-${d.id}`}
              onClick={() => onSelectDiagram(d.id)}
            >
              <span>{d.name}</span>
              <span className="erd-tree__count">{d.tables}</span>
              {d.violations > 0 && (
                <span className="erd-tree__bad" title="표준 위반 컬럼 수">
                  {d.violations}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {state && unplaced > 0 && (
        <div className="erd-tree__note" data-testid="erd-unplaced">
          다이어그램에 없는 표 {unplaced}개 — [새 다이어그램]에서 놓을 수 있습니다
        </div>
      )}
      <div className="erd-tree__legend">
        <div>실선: DB FK·확정 관계</div>
        <div>노란 파선: 추정 관계(검토 대기)</div>
        <div>행 바탕: 붉은색 사전 없음, 노란색 타입·도메인 다름</div>
      </div>
      {ctx && <DiagramWizard open={wizard} ctx={ctx} onClose={() => setWizard(false)} onCreated={onSelectDiagram} />}
    </div>
  );
}
