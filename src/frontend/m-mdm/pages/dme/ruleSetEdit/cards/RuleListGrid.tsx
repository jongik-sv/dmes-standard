"use client";

/**
 * 룰 세트 카드의 룰 목록 그리드(TSK-08-06 design §6.9). 행 = 목록 순서의 룰 하나. 조건 변수 칩 강조(`condMarks`)·의존 룰·뒤에 있음(`laterDeps`)은
 * 부모가 넘긴 목록으로 매번 다시 계산한다(I21). 편집할 수 있을 때만 드래그 손잡이(`seqNo`)와 ▲▼✕ 를 둔다. 순서의 주인은 부모다.
 */
import { useMemo, type CSSProperties } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import { NO_LINK_TITLE, condTarget, openRule, openVar, type VarTarget } from "../links";
import { condMarks, laterDeps, setDeps } from "../set-model";
import type { RuleIo } from "../types";

export interface RuleListGridProps {
  ids: readonly string[];
  rules: Readonly<Record<string, RuleIo>>;
  canEdit: boolean;
  onUp: (id: string) => void;
  onDown: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (keys: readonly (string | number)[]) => void;
}

interface CondChip {
  name: string;
  red: boolean;
  missingBefore: boolean;
  target: VarTarget;
}

interface DepCell {
  id: string;
  later: boolean;
}

const LINK_STYLE: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--color-primary)",
  textDecoration: "underline",
  font: "inherit",
};

const ROW_BUTTON_STYLE: CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-bg)",
  borderRadius: "var(--radius-sm)",
  padding: "0 6px",
  marginRight: 2,
  cursor: "pointer",
  font: "inherit",
  lineHeight: "18px",
};

const CHIP_STYLE: CSSProperties = { marginRight: 6, whiteSpace: "nowrap" };
const RED_CHIP_STYLE: CSSProperties = { ...CHIP_STYLE, color: "var(--color-danger)" };

function kindPolicy(r: RuleIo | undefined): string {
  if (!r || !r.exists) return "-";
  if (r.ruleKind === "DECISION") return `DECISION · ${r.hitPolicy ?? "-"}`;
  return r.ruleKind ?? "-";
}

function Chip({ chip }: { chip: CondChip }) {
  const style = chip.red ? RED_CHIP_STYLE : CHIP_STYLE;
  const label = <code>{chip.name}</code>;
  return (
    <span style={style}>
      {chip.target ? (
        <button type="button" style={{ ...LINK_STYLE, color: "inherit" }} onClick={() => openVar(chip.target)}>
          {label}
        </button>
      ) : (
        <span title={NO_LINK_TITLE}>{label}</span>
      )}
      {chip.missingBefore && (
        <span style={{ ...badgeStyle("warning"), marginLeft: 2 }}>앞에 없음</span>
      )}
    </span>
  );
}

export function RuleListGrid({ ids, rules, canEdit, onUp, onDown, onRemove, onReorder }: RuleListGridProps) {
  const data = useMemo(() => {
    const marks = condMarks(ids, rules);
    const deps = setDeps(ids, rules);
    const later = laterDeps(ids, deps);
    const producer = new Map<string, string>();
    return ids.map((id, i) => {
      const r = rules[id];
      const conds: CondChip[] = marks[i].map((m) => ({
        name: m.name,
        red: m.red,
        missingBefore: m.missingBefore,
        target: condTarget(m.source, producer.get(m.name)),
      }));
      const results = r && r.exists ? (r.results ?? []).map((x) => x.name) : [];
      for (const n of results) if (!producer.has(n)) producer.set(n, id);
      const depCells: DepCell[] = (deps[id] ?? []).map((d) => ({ id: d, later: (later[id] ?? []).includes(d) }));
      return {
        seqNo: i + 1,
        ruleId: id,
        ruleName: r && r.exists && r.ruleName ? r.ruleName : "(없음)",
        kindPolicy: kindPolicy(r),
        // 칸 값은 문자열 서명으로 싣는다 — ag-grid 가 배열을 object 로 추론해 오류 #48 을 내지 않고, 서명이 바뀐 칸만 다시 그린다.
        conds: JSON.stringify(conds),
        results: results.join(","),
        deps: JSON.stringify(depCells),
        condChips: conds,
        resultNames: results,
        depCells,
        first: i === 0,
        last: i === ids.length - 1,
        // ag-grid 는 값이 바뀐 칸만 다시 그린다 — 동작 칸이 끝 자리 변화(▲▼ 비활성)를 받도록 값으로 싣는다.
        actions: `${i === 0 ? "first" : ""}:${i === ids.length - 1 ? "last" : ""}`,
      };
    });
  }, [ids, rules]);

  const columns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [
      { key: "seqNo", header: "순서", width: 70, minWidth: 60, align: "center" },
      {
        key: "ruleId",
        header: "룰 ID",
        width: 150,
        minWidth: 100,
        render: (value) => (
          <button type="button" data-testid={`set-rule-link-${String(value)}`} style={LINK_STYLE} onClick={() => openRule(String(value))}>
            {String(value)}
          </button>
        ),
      },
      { key: "ruleName", header: "룰명", width: 150, minWidth: 90 },
      { key: "kindPolicy", header: "종류·정책", width: 130, minWidth: 90 },
      {
        key: "conds",
        header: "조건 변수",
        width: 220,
        minWidth: 120,
        render: (_value, row) => (row.condChips as CondChip[]).map((c) => <Chip key={c.name} chip={c} />),
      },
      {
        key: "results",
        header: "결과 변수",
        width: 140,
        minWidth: 90,
        render: (_value, row) =>
          (row.resultNames as string[]).map((n) => (
            <code key={n} style={CHIP_STYLE}>
              {n}
            </code>
          )),
      },
      {
        key: "deps",
        header: "의존 룰",
        width: 190,
        minWidth: 100,
        render: (_value, row) => {
          const deps = row.depCells as DepCell[];
          if (deps.length === 0) return "없음";
          const id = String(row.ruleId);
          return deps.map((d) => (
            <span key={d.id} style={CHIP_STYLE}>
              <button type="button" style={LINK_STYLE} onClick={() => openRule(d.id)}>
                {d.id}
              </button>
              {d.later && (
                <span data-testid={`set-dep-later-${id}-${d.id}`} style={{ ...badgeStyle("warning"), marginLeft: 2 }}>
                  뒤에 있음
                </span>
              )}
            </span>
          ));
        },
      },
    ];
    if (canEdit) {
      cols.push({
        key: "actions",
        header: "동작",
        width: 110,
        minWidth: 100,
        align: "center",
        render: (_value, row) => {
          const id = String(row.ruleId);
          return (
            <span style={{ whiteSpace: "nowrap" }}>
              <button type="button" data-testid={`set-rule-up-${id}`} style={ROW_BUTTON_STYLE} disabled={row.first === true} onClick={() => onUp(id)}>
                ▲
              </button>
              <button type="button" data-testid={`set-rule-down-${id}`} style={ROW_BUTTON_STYLE} disabled={row.last === true} onClick={() => onDown(id)}>
                ▼
              </button>
              <button type="button" data-testid={`set-rule-remove-${id}`} style={ROW_BUTTON_STYLE} onClick={() => onRemove(id)}>
                ✕
              </button>
            </span>
          );
        },
      });
    }
    return cols;
  }, [canEdit, onUp, onDown, onRemove]);

  const height = Math.min(420, 32 + Math.max(data.length, 2) * 28 + 8);

  return (
    <div data-testid="set-rules-grid" style={{ height }}>
      <AgDataGrid
        key={canEdit ? "edit" : "read"}
        columns={columns}
        data={data}
        rowKey="ruleId"
        height={height}
        columnSizing="fixed"
        sortable={false}
        getRowHeight={() => 28}
        rowDragField={canEdit ? "seqNo" : undefined}
        onRowOrderChange={canEdit ? onReorder : undefined}
        emptyMessage="룰이 없다."
        ariaLabel="룰 목록"
      />
    </div>
  );
}
