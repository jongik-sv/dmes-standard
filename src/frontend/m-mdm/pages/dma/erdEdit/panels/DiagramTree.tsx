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

import type { ErdEditContext } from "../edit-context";
import { shortReason } from "../state/permissions";
import { countTableViolations } from "../state/violations";
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

/**
 * 업무영역별 다이어그램. 표 수는 지금 버전에 있는 표만, 위반 수는 그 표들의 고칠 위반 컬럼 수다(U25 규칙 하나 — state/violations.ts,
 * 감사 컬럼은 showAudit 일 때만). 한 표가 여러 다이어그램에 있으면 다이어그램마다 센다.
 */
export function diagramGroups(state: ErdState, statuses: Readonly<Record<string, ErdColumnStatus>>, showAudit = false): DiagramGroup[] {
  const m = state.model;
  const per = new Map<string, { tables: number; violations: number }>();
  for (const n of Object.values(state.nodes)) {
    if (!m.tables[n.table]) continue;
    const e = per.get(n.diagram) ?? { tables: 0, violations: 0 };
    e.tables += 1;
    e.violations += countTableViolations(m, n.table, statuses as Record<string, ErdColumnStatus>, showAudit);
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

/** 범례 항목 — 견본 종류(data-k, 모양은 erd-styles.ts 의 .erd-legend__sw)·견본 글·뜻. */
const LEGEND_ITEMS: readonly { k: string; sample: string; text: string }[] = [
  { k: "line", sample: "", text: "DB FK·확정 관계" },
  { k: "dash", sample: "", text: "추정 관계(검토 대기)" },
  { k: "miss", sample: "", text: "사전 없음" },
  { k: "warn", sample: "", text: "타입 불일치·도메인 다름" },
  { k: "bad", sample: "3", text: "고칠 위반 수(표 머리)" },
  { k: "audit", sample: "감사 8", text: "숨긴 감사 컬럼 수" },
  { k: "keys", sample: "PK FK FK?", text: "기본 키·외래 키·추정 외래 키" },
  { k: "cand", sample: "다른 후보 n개", text: "같은 자식 컬럼의 다른 부모 후보" },
  { k: "logical", sample: "", text: "캔버스 바탕 — 논리 모드" },
  { k: "physical", sample: "", text: "캔버스 바탕 — 물리 모드" },
];

/**
 * 범례(U35) — 견본 · 뜻 두 칸. 왼쪽 패널과 위 막대 [범례] 팝오버(왼쪽 패널을 접었을 때용)가 같은 것을 쓴다.
 * 데이터 목록이 아니라 라벨-값 짝이라 그리드가 아닌 dl 로 그린다.
 */
export function Legend({ testId = "erd-legend" }: { testId?: string }) {
  return (
    <div className="erd-legend" data-testid={testId}>
      <dl className="erd-legend__list">
        {LEGEND_ITEMS.map((x) => (
          <div key={x.k} className="erd-legend__row">
            <dt className="erd-legend__sw" data-k={x.k}>{x.sample}</dt>
            <dd className="erd-legend__text">{x.text}</dd>
          </div>
        ))}
      </dl>
      <div className="erd-legend__note">배율이 낮으면 이름만, 더 낮으면 큰 이름판으로 보입니다(개요).</div>
    </div>
  );
}

export interface DiagramTreeProps {
  state: ErdState | null;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  /** 감사 컬럼 보기(ctx.audit.show). 켜져 있을 때만 감사 컬럼 위반을 센다(U25). */
  showAudit: boolean;
  activeDiagram: string | null;
  onSelectDiagram(diagramId: string): void;
  onRevealTable(tableId: string): void;
  /** 오를 때마다 찾기 칸을 연다(Ctrl/⌘+T·K). */
  findSeq: number;
  /** 편집 문맥(단계 2). 모델을 읽기 전에는 null — [새 다이어그램]을 막는다. */
  ctx: ErdEditContext | null;
  /** 있으면 머리에 [‹] 접기 단추(erd-side-toggle)를 둔다(UX 1차 U13). */
  onCollapse?(): void;
}

export function DiagramTree({
  state, statuses, showAudit, activeDiagram, onSelectDiagram, onRevealTable, findSeq, ctx, onCollapse,
}: DiagramTreeProps) {
  const [openSeq, setOpenSeq] = useState(0); // 0 = 닫힘, 오를 때마다 입력 칸에 초점
  const [wizard, setWizard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mac = useMemo(() => isMacPlatform(), []);
  const find = useTableFind(state?.model.tables ?? NO_TABLES, onRevealTable);
  const groups = useMemo(() => (state ? diagramGroups(state, statuses, showAudit) : []), [state, statuses, showAudit]);
  const unplaced = useMemo(() => (state ? unplacedCount(state) : 0), [state]);
  const newOff = !ctx || !ctx.rights.diagram.ok;
  // 꺼진 [새 다이어그램] 의 짧은 이유(U34). 긴 글은 읽기 전용 칩 팝오버에만 둔다(U19).
  const newReason = ctx && !ctx.rights.diagram.ok ? shortReason(ctx.rights.diagram.reason) : "";
  const newTitle = newReason || undefined;

  useEffect(() => {
    if (findSeq > 0) setOpenSeq((s) => s + 1);
  }, [findSeq]);

  return (
    <div className="erd-tree" data-testid="erd-tree">
      {onCollapse && (
        <div className="erd-panel-head">
          <span className="erd-panel-head__title">다이어그램</span>
          <Button size="mini" data-testid="erd-side-toggle" title="다이어그램 목록 접기" aria-label="다이어그램 목록 접기" onClick={onCollapse}>
            ‹
          </Button>
        </div>
      )}
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
                <span className="erd-tree__bad" title="고칠 위반 컬럼 수(타입·도메인·사전 없음)">
                  {d.violations}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {state && unplaced > 0 && (
        <div className="erd-tree__note" data-testid="erd-unplaced">
          다이어그램에 없는 표 {unplaced}개 — [새 다이어그램]에서 놓을 수 있습니다{newReason ? `(지금은 ${newReason})` : ""}
        </div>
      )}
      <div className="erd-tree__legend">
        <Legend testId="erd-tree-legend" />
      </div>
      {ctx && <DiagramWizard open={wizard} ctx={ctx} onClose={() => setWizard(false)} onCreated={onSelectDiagram} />}
    </div>
  );
}
