/**
 * 의사결정표 열(TSK-08-02 design §6.7.4) — 3줄 머리(조건/결과 묶음 → 변수 → 칸) `GridColumn` 트리, 칸 편집 가능 여부, 그리드 표시 행.
 *
 * 행 데이터 필드는 `c{varId}_{k}`(k ∈ op,left,right,na,expr,val). 강조는 표시 행의 표시(`__mk`)를 `cellClassRules` 가 읽는다 —
 * 색은 shared 그리드 토큰 클래스(`cell-light-pink`·`cell-warning`·`cell-edited`·`cell-emphasis`, 행 `ag-row-inserted`)만 쓴다.
 */
import { createElement, type ReactNode } from "react";
import type { GridColumn } from "@dk-oasis/shared/grid";

import type { ResolvedVar } from "../types";
import type { SplitIssues } from "./analysis";
import type { TableDiff } from "./diff";
import type { CellKey, CellObj, GridRow } from "./grid-model";
import { OP_LABELS, isListOp, isNoValueOp, isRangeOp, opsFor } from "./ops";
import { VarHeader } from "./VarHeader";

export const ROW_LABEL_FIELD = "rowLabel";

export function fieldOf(varId: number, key: CellKey): string {
  return `c${varId}_${key}`;
}

export function parseField(field: string): { varId: number; key: CellKey } | null {
  const m = /^c(\d+)_(op|left|right|na|expr|val)$/.exec(field);
  return m ? { varId: Number(m[1]), key: m[2] as CellKey } : null;
}

/** 칸 편집 가능 여부(§6.7.4 칸 잠금, I20). */
export function cellEditable(v: ResolvedVar, key: CellKey, row: GridRow, editable: boolean): boolean {
  if (!editable) return false;
  if (v.dispType === "Expression") return false; // 조건 식·결과 식은 읽기 전용(D7)
  if (v.varKind === "RESULT") return key === "val";
  if (row.rowKind === "DEFAULT") return false; // 기본 행의 조건 칸은 비운 채 잠근다
  const cell: CellObj | undefined = row.cells[v.varId];
  if (v.dispType === "Equal") {
    if (key === "na") return true;
    return key === "left" && !!cell && cell.op !== "NA";
  }
  if (key === "op") return true;
  if (!cell || isNoValueOp(cell.op)) return false;
  if (key === "right") return isRangeOp(cell.op);
  return key === "left";
}

/** 칸 표시 문자. */
function cellText(cell: CellObj | undefined, key: CellKey): unknown {
  if (!cell) return key === "na" ? false : "";
  switch (key) {
    case "op":
      return cell.op ?? "";
    case "left":
      return isListOp(cell.op) ? (cell.list ?? []).join(", ") : cell.op === "NA" ? "" : (cell.left ?? "");
    case "right":
      return cell.right ?? "";
    case "na":
      return cell.op === "NA";
    case "expr":
      return cell.expr ?? "";
    case "val":
      return cell.val ?? "";
  }
}

/** 변수 열의 칸 목록 — 2 타입 OP·하한·상한, 1 타입 OP·값, Equal 무관·값, Expression 조건 무관·식, 결과 값 또는 식. */
export function leafKeys(v: ResolvedVar): Array<{ key: CellKey; header: string }> {
  if (v.varKind === "RESULT") return v.dispType === "Expression" ? [{ key: "expr", header: "식" }] : [{ key: "val", header: "값" }];
  switch (v.dispType) {
    case "2":
      return [
        { key: "op", header: "OP" },
        { key: "left", header: "하한" },
        { key: "right", header: "상한" },
      ];
    case "Equal":
      return [
        { key: "na", header: "무관" },
        { key: "left", header: "값" },
      ];
    case "Expression":
      return [
        { key: "na", header: "무관" },
        { key: "expr", header: "식" },
      ];
    default:
      return [
        { key: "op", header: "OP" },
        { key: "left", header: v.dataType === "STRING" ? "값·목록" : "값" },
      ];
  }
}

/** 표시 타입 배지 문구. */
export function dispBadge(v: ResolvedVar): string {
  if (v.varKind === "RESULT") return v.dispType === "Expression" ? "식" : "상수";
  switch (v.dispType) {
    case "Equal":
      return "Equal";
    case "2":
      return "2 타입";
    case "Expression":
      return "식";
    default:
      return "1 타입";
  }
}

/** 값 타입 배지 문구 — 서버가 해석한 타입만 쓴다(I16). */
export function typeBadge(v: ResolvedVar): string {
  if (v.typeSource === "EXPRESSION_COLUMN") return "자유식";
  if (v.typeSource === "UNRESOLVED") return "타입 없음";
  if (v.dateString || v.dataType === "DATE") return "일자";
  if (v.maruCodeId) return "코드";
  if (v.dataType === "NUMBER") return v.scale != null ? `Number(${v.scale})` : "Number";
  if (v.dataType === "BOOLEAN") return "Boolean";
  return "String";
}

/** 칸 강조 표시 — e 오류, w 경고, c base 대비 바뀐 칸, h 선택 행의 적중 조건 칸. */
interface CellMark {
  e?: boolean;
  w?: boolean;
  c?: boolean;
  h?: boolean;
}

export interface TableColumnContext {
  vars: ResolvedVar[];
  editable: boolean;
  onEdit: (rowId: number, varId: number, key: CellKey, value: string | boolean) => void;
  onSelectRow: (rowId: number) => void;
  onDeleteRow: (rowId: number) => void;
}

export interface TableMarks {
  diff: TableDiff;
  split: SplitIssues;
  selectedRowId: number | null;
  /** 지금 보이는 검사가 서버 결과인가. */
  serverShown: boolean;
}

function markOf(row: Record<string, unknown>, varId: number): CellMark {
  return ((row.__mk as Record<number, CellMark> | undefined) ?? {})[varId] ?? {};
}

function sourceRow(row: Record<string, unknown>): GridRow {
  return row.__row as GridRow;
}

/** 그리드 표시 행 — 칸 문자와 강조 표시를 편다. */
export function displayRows(rows: readonly GridRow[], vars: readonly ResolvedVar[], marks: TableMarks): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {
      rowKey: String(r.rowId),
      rowId: r.rowId,
      rowKind: r.rowKind,
      [ROW_LABEL_FIELD]: r.rowKind === "DEFAULT" ? "기본" : String(r.seq),
      note: r.note,
      __row: r,
    };
    const d = marks.diff.rows.get(r.rowId);
    const mk: Record<number, CellMark> = {};
    for (const v of vars) {
      const cell = r.cells[v.varId];
      for (const { key } of leafKeys(v)) out[fieldOf(v.varId, key)] = cellText(cell, key);
      const sev = marks.split.byCell.get(`${r.rowId}:${v.varId}`);
      mk[v.varId] = {
        e: sev === "ERROR",
        w: sev === "WARNING",
        c: d?.status === "CHANGED" && d.changedVarIds.has(v.varId),
        h: marks.selectedRowId === r.rowId && v.varKind === "COND" && !!cell && cell.op !== "NA" && cell.op !== undefined,
      };
    }
    out.__mk = mk;
    const counts = marks.split.byRow.get(r.rowId);
    const parts: string[] = [];
    if (counts?.errors) parts.push(`오류 ${counts.errors}`);
    if (counts?.warnings) parts.push(`경고 ${counts.warnings}`);
    out.check = parts.length > 0 ? `${parts.join(" · ")}${marks.serverShown ? " (서버)" : ""}` : "";
    out.__added = d?.status === "ADDED";
    out.__noteChanged = !!d?.noteChanged;
    return out;
  });
}

function cellRules(varId: number): GridColumn["cellClassRules"] {
  return {
    "cell-light-pink": (row) => !!markOf(row, varId).e,
    "cell-warning": (row) => !!markOf(row, varId).w && !markOf(row, varId).e,
    "cell-edited": (row) => !!markOf(row, varId).c && !markOf(row, varId).e && !markOf(row, varId).w,
    "cell-emphasis": (row) => !!markOf(row, varId).h,
  };
}

function naCheckbox(ctx: TableColumnContext, v: ResolvedVar) {
  return (value: unknown, row: Record<string, unknown>): ReactNode => {
    const src = sourceRow(row);
    if (src.rowKind === "DEFAULT") return null;
    const enabled = cellEditable(v, "na", src, ctx.editable);
    return createElement("input", {
      type: "checkbox",
      "aria-label": `무관 ${v.varName ?? v.varId}`,
      "data-testid": `dt-na-${src.rowId}-${v.varId}`,
      checked: value === true,
      disabled: !enabled,
      onChange: (e: { target: { checked: boolean } }) => ctx.onEdit(src.rowId, v.varId, "na", e.target.checked),
    });
  };
}

function varGroup(ctx: TableColumnContext, v: ResolvedVar): GridColumn {
  const tooltip = [v.description, v.domainName].filter((s): s is string => !!s).join(" · ");
  const ops = opsFor(v);
  const labels = Object.fromEntries(ops.map((o) => [o, OP_LABELS[o] ?? o]));
  return {
    key: `v${v.varId}`,
    header: v.label || v.varName || `열 ${v.varId}`,
    headerTooltip: tooltip || undefined,
    headerComponent: VarHeader,
    headerComponentParams: {
      label: v.label || v.varName || `열 ${v.varId}`,
      physName: v.exprVar || v.dispType === "Expression" ? "" : (v.varName ?? ""),
      typeBadge: typeBadge(v),
      dispBadge: dispBadge(v),
    },
    children: leafKeys(v).map(({ key, header }) => {
      const col: GridColumn = {
        key: fieldOf(v.varId, key),
        header,
        width: key === "op" ? 110 : key === "na" ? 56 : key === "expr" ? 200 : 96,
        align: key === "na" ? "center" : "left",
        editable: key === "na" ? false : (row) => cellEditable(v, key, sourceRow(row), ctx.editable),
        cellClassRules: cellRules(v.varId),
      };
      if (key === "op") {
        col.cellEditor = "select";
        col.cellEditorValues = ops;
        col.cellEditorValueLabels = labels;
      }
      if (key === "na") col.render = naCheckbox(ctx, v);
      return col;
    }),
  };
}

/** 열 트리 — 행 | 조건 묶음 | 결과 묶음 | 행 설명 | 검사 | 삭제. */
export function buildTableColumns(ctx: TableColumnContext): GridColumn[] {
  const byOrder = (a: ResolvedVar, b: ResolvedVar) => a.seq - b.seq || a.varId - b.varId;
  const cond = ctx.vars.filter((v) => v.varKind === "COND").sort(byOrder);
  const result = ctx.vars.filter((v) => v.varKind === "RESULT").sort(byOrder);
  const cols: GridColumn[] = [
    {
      key: ROW_LABEL_FIELD,
      header: "행",
      width: 96,
      pinned: "left",
      render: (value, row) => {
        const src = sourceRow(row);
        return createElement(
          "button",
          {
            type: "button",
            "data-testid": `dt-row-${src.rowId}`,
            title: src.note || undefined,
            onClick: () => ctx.onSelectRow(src.rowId),
            style: { border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--color-primary)" },
          },
          `${String(value)}`,
          createElement("span", { style: { color: "var(--color-text-muted)", marginLeft: 4, fontSize: "var(--font-size-xs)" } }, src.rowId > 0 ? `row ${src.rowId}` : "새 행"),
        );
      },
    },
  ];
  if (cond.length > 0) cols.push({ key: "grp_cond", header: "조건", children: cond.map((v) => varGroup(ctx, v)) });
  if (result.length > 0) cols.push({ key: "grp_result", header: "결과", children: result.map((v) => varGroup(ctx, v)) });
  cols.push(
    {
      key: "note",
      header: "행 설명",
      width: 180,
      editable: () => ctx.editable,
      cellClassRules: { "cell-edited": (row) => row.__noteChanged === true },
    },
    { key: "check", header: "검사", width: 130 },
    {
      key: "del",
      header: "삭제",
      width: 56,
      align: "center",
      render: (_v, row) => {
        const src = sourceRow(row);
        return createElement(
          "button",
          {
            type: "button",
            "aria-label": `행 삭제 ${src.rowId}`,
            "data-testid": `dt-del-${src.rowId}`,
            disabled: !ctx.editable,
            onClick: () => ctx.onDeleteRow(src.rowId),
            style: { border: "none", background: "none", cursor: ctx.editable ? "pointer" : "default", color: "var(--color-text-secondary)" },
          },
          "✕",
        );
      },
    },
  );
  return cols;
}
