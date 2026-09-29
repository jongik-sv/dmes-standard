/**
 * 의사결정표 열(TSK-08-02 design §6.7.4) — 3줄 머리(조건/결과 묶음 → 변수 → 칸) `GridColumn` 트리, 칸 편집 가능 여부, 그리드 표시 행.
 *
 * 행 데이터 필드는 `c{varId}_{k}`(k ∈ op,left,right,na,expr,val). 강조는 표시 행의 표시(`__mk`)를 `cellClassRules` 가 읽는다 —
 * 색은 shared 그리드 토큰 클래스(`cell-light-pink`·`cell-warning`·`cell-edited`·`cell-emphasis`, 행 `ag-row-inserted`)만 쓴다.
 * 값 테스트 표시(TSK-08-04)는 `cell-test-hit`·`cell-test-false`·`cell-test-chosen`·`cell-test-dim`, 적중 행 `ag-row-test-hit`.
 */
import { createElement, type CSSProperties, type ReactNode } from "react";
import { IconTrash } from "@tabler/icons-react";
import type { GridColumn } from "@dk-oasis/shared/grid";

import type { ResolvedVar, VarCandidate, VarMeta } from "../types";
import type { TableTestMarks } from "../value-test/test-marks";
import type { SplitIssues } from "./analysis";
import type { TableDiff } from "./diff";
import type { CellKey, CellObj, GridRow } from "./grid-model";
import { OP_LABELS, isListOp, isNoValueOp, isRangeOp, opsFor } from "./ops";
import { BlockHeader } from "./BlockHeader";
import { VarHeader } from "./VarHeader";

export const ROW_LABEL_FIELD = "rowLabel";

/** 삭제 칸 아이콘 크기 — 열 설정 그리드(`column-grid.tsx` ICON)와 같은 값으로 맞춘다. */
const ICON_SIZE = 14;

/** 테두리 없는 작은 아이콘 버튼 — 열 설정 그리드의 `iconButton` 와 같은 모양. */
const DEL_BTN_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "none",
  borderRadius: "var(--radius-sm)",
  background: "none",
  color: "var(--color-text-secondary)",
};

export function fieldOf(varId: number, key: CellKey): string {
  return `c${varId}_${key}`;
}

export function parseField(field: string): { varId: number; key: CellKey } | null {
  const m = /^c(\d+)_(op|left|right|na|expr|val)$/.exec(field);
  return m ? { varId: Number(m[1]), key: m[2] as CellKey } : null;
}

/**
 * 칸 편집 가능 여부(§6.7.4 칸 잠금). 조건 식·결과 식 칸도 편집한다(D7 번복, 2026-09-28) — 식은 저장 때 서버가 파싱해 `ast` 를 채운다.
 */
export function cellEditable(v: ResolvedVar, key: CellKey, row: GridRow, editable: boolean): boolean {
  if (!editable) return false;
  if (v.varKind === "RESULT") return key === (v.dispType === "Expression" ? "expr" : "val");
  if (row.rowKind === "DEFAULT") return false; // 기본 행의 조건 칸은 비운 채 잠근다
  const cell: CellObj | undefined = row.cells[v.varId];
  if (v.dispType === "Expression") {
    // 식 칸은 늘 — 무관이어도 식을 적으면 풀리고, 비우면 무관이 된다. 무관은 켜기만 한다(끌 때 채울 식이 없다).
    // 나중에 더한 열은 기존 행에 셀이 없다 — 식을 넣거나 무관을 켜면 applyCellEdit 가 셀을 만든다(저장은 모든 조건 칸을 요구한다).
    if (key === "na") return cell?.op !== "NA";
    return key === "expr";
  }
  if (v.dispType === "Equal") {
    if (key === "na") return true;
    // 나중에 더한 열은 기존 행에 셀이 없다 — 값을 넣으면 applyCellEdit 가 EQ 셀을 만든다.
    return key === "left" && cell?.op !== "NA";
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

/**
 * 칸 강조 표시 — e 오류, w 경고, c base 대비 바뀐 칸, h 선택 행의 적중 조건 칸, t 값 테스트(hit 적중 행 칸, false 첫 거짓 칸,
 * chosen 그룹에서 고른 열, dim 같은 그룹 나머지 열).
 */
interface CellMark {
  e?: boolean;
  w?: boolean;
  c?: boolean;
  h?: boolean;
  t?: "hit" | "false" | "chosen" | "dim";
}

/** 적중 행 클래스(shared 그리드 테마). */
export const TEST_HIT_ROW_CLASS = "ag-row-test-hit";

export interface TableColumnContext {
  vars: ResolvedVar[];
  /** 저장 원값(결과 열 그룹 `resGrp`·열 조건 `grpCond`). 없으면 결과 열을 그룹으로 묶지 않는다. */
  varMeta?: readonly VarMeta[];
  /** 그룹 표시명을 찾을 컬럼 사전(view `varCandidates` 의 COLUMN). */
  candidates?: readonly VarCandidate[];
  editable: boolean;
  onEdit: (rowId: number, varId: number, key: CellKey, value: string | boolean) => void;
  onSelectRow: (rowId: number) => void;
  onDeleteRow: (rowId: number) => void;
  /** 열 머리 클릭(열 설정 표의 대응 줄 하이라이트). */
  onSelectVar?: (varId: number) => void;
}

export interface TableMarks {
  diff: TableDiff;
  split: SplitIssues;
  selectedRowId: number | null;
  /** 지금 보이는 검사가 서버 결과인가. */
  serverShown: boolean;
  /** 이 표가 보이는 정의의 값 테스트 결과(I33) — 없으면 칠하지 않는다. */
  test?: TableTestMarks;
}

function testMark(test: TableTestMarks | undefined, rowId: number, varId: number): CellMark["t"] {
  if (!test) return undefined;
  if (test.firstFalse.get(rowId) === varId) return "false";
  if (test.chosen.get(rowId)?.has(varId)) return "chosen";
  if (test.dimmed.get(rowId)?.has(varId)) return "dim";
  return test.hitRowIds.has(rowId) ? "hit" : undefined;
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
        t: testMark(marks.test, r.rowId, v.varId),
      };
    }
    out.__mk = mk;
    const counts = marks.split.byRow.get(r.rowId);
    const parts: string[] = [];
    if (counts?.errors) parts.push(`오류 ${counts.errors}`);
    if (counts?.warnings) parts.push(`경고 ${counts.warnings}`);
    out.check = parts.length > 0 ? `${parts.join(" · ")}${marks.serverShown ? " (서버)" : ""}` : "";
    out.__added = d?.status === "ADDED";
    out.__hit = !!marks.test?.hitRowIds.has(r.rowId);
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
    "cell-test-hit": (row) => markOf(row, varId).t === "hit",
    "cell-test-false": (row) => markOf(row, varId).t === "false",
    "cell-test-chosen": (row) => markOf(row, varId).t === "chosen",
    "cell-test-dim": (row) => markOf(row, varId).t === "dim",
  };
}

function naCheckbox(ctx: TableColumnContext, v: ResolvedVar) {
  return (value: unknown, row: Record<string, unknown>): ReactNode => {
    const src = sourceRow(row);
    if (src.rowKind === "DEFAULT") return null;
    const enabled = cellEditable(v, "na", src, ctx.editable);
    return createElement("input", {
      type: "checkbox",
      "aria-label": `무관 ${v.label || v.varName || v.varId}`,
      "data-testid": `dt-na-${src.rowId}-${v.varId}`,
      checked: value === true,
      disabled: !enabled,
      onChange: (e: { target: { checked: boolean } }) => ctx.onEdit(src.rowId, v.varId, "na", e.target.checked),
    });
  };
}

function varGroup(ctx: TableColumnContext, v: ResolvedVar, meta?: VarMeta): GridColumn {
  const grpNote = meta?.resGrp?.trim() ? (meta.grpCond?.trim() ? `열 조건 ${meta.grpCond.trim()}` : "기본 열(열 조건 없음)") : null;
  const tooltip = [v.description, v.domainName, grpNote].filter((s): s is string => !!s).join(" · ");
  const ops = opsFor(v);
  const labels = Object.fromEntries(ops.map((o) => [o, OP_LABELS[o] ?? o]));
  return {
    key: `v${v.varId}`,
    header: v.label || v.varName || `열 ${v.varId}`,
    headerTooltip: tooltip || undefined,
    headerComponent: VarHeader,
    headerStyle: v.varKind === "RESULT" ? RESULT_VAR_HEAD : undefined,
    headerComponentParams: {
      label: v.label || v.varName || `열 ${v.varId}`,
      physName: v.exprVar || v.dispType === "Expression" ? "" : (v.varName ?? ""),
      typeBadge: typeBadge(v),
      dispBadge: dispBadge(v),
      varId: v.varId,
      onSelect: ctx.onSelectVar ? () => ctx.onSelectVar?.(v.varId) : undefined,
    },
    children: leafKeys(v).map(({ key, header }) => {
      const col: GridColumn = {
        key: fieldOf(v.varId, key),
        header,
        width: key === "op" ? 110 : key === "na" ? 56 : key === "expr" ? 260 : 96,
        align: key === "na" ? "center" : "left",
        editable: key === "na" ? false : (row) => cellEditable(v, key, sourceRow(row), ctx.editable),
        cellClassRules: cellRules(v.varId),
        headerStyle: v.varKind === "RESULT" ? RESULT_VAR_HEAD : undefined,
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

/**
 * 조건·결과 묶음 머리(06 시안 `tr.grp`) — IF/THEN 설명 글자와 블록 색. 조건은 초록(success), 결과는 파랑(primary) 톤이다.
 * 시안의 남색(indigo)은 화면 표준(UI-Visual-Standard §2 단일 동작색)에 없어 파랑 토큰으로 바꿨다.
 */
const BLOCK_HEAD: Record<"cond" | "result", Pick<GridColumn, "headerComponent" | "headerComponentParams" | "headerStyle">> = {
  cond: {
    headerComponent: BlockHeader,
    headerComponentParams: { title: "조건", hint: "IF · 모든 조건 셀이 참이면" },
    headerStyle: { background: "var(--color-success-soft)", color: "var(--color-success)" },
  },
  result: {
    headerComponent: BlockHeader,
    headerComponentParams: { title: "결과", hint: "THEN · 결과 변수에 대입" },
    headerStyle: { background: "var(--color-primary-soft-hover)", color: "var(--color-primary-active)" },
  },
};

/** 결과 변수의 변수·칸 머리는 묶음보다 옅은 파랑으로 칠한다(06 시안 결과 열 머리). 조건 쪽은 기본 머리 색 그대로다. */
const RESULT_VAR_HEAD: GridColumn["headerStyle"] = { background: "var(--color-primary-soft)" };

/** 결과 열 그룹 머리 — 결과 묶음과 변수 머리 사이 톤. 맞는 의미 토큰이 없어 원시 팔레트를 쓴다(UI-Visual-Standard §3). */
const RESULT_GROUP_HEAD: GridColumn["headerStyle"] = { background: "var(--c-blue-150)", color: "var(--color-primary-active)" };

/**
 * 결과 변수 → 결과 묶음 아래 열. 같은 결과 열 그룹(`resGrp`)이 seq 순으로 연달아 나오는 열을 그룹 머리 하나로 묶는다(열 순서는 바꾸지 않는다).
 * 그룹 머리는 컬럼 사전 표시명과 그룹 이름을 보이고, 사전에 없으면 이름만 보인다.
 */
function resultColumns(ctx: TableColumnContext, result: readonly ResolvedVar[]): GridColumn[] {
  const metaOf = new Map((ctx.varMeta ?? []).map((m) => [m.varId, m] as const));
  const labelOf = new Map((ctx.candidates ?? []).filter((c) => c.kind === "COLUMN").map((c) => [c.name.toUpperCase(), c.label ?? null] as const));
  const groupOf = (v: ResolvedVar) => metaOf.get(v.varId)?.resGrp?.trim() || null;
  const out: GridColumn[] = [];
  for (let i = 0; i < result.length; ) {
    const v = result[i];
    const grp = groupOf(v);
    if (grp == null) {
      out.push(varGroup(ctx, v, metaOf.get(v.varId)));
      i++;
      continue;
    }
    let j = i;
    while (j < result.length && groupOf(result[j]) === grp) j++;
    const label = labelOf.get(grp.toUpperCase()) ?? null;
    out.push({
      key: `res_grp_${grp}_${i}`,
      header: label ?? grp,
      headerComponent: BlockHeader,
      headerComponentParams: { title: label ?? grp, name: label ? grp : undefined, hint: "열 조건으로 한 열을 고른다" },
      headerStyle: RESULT_GROUP_HEAD,
      children: result.slice(i, j).map((x) => varGroup(ctx, x, metaOf.get(x.varId))),
    });
    i = j;
  }
  return out;
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
      width: 56,
      pinned: "left",
      render: (value, row) => {
        const src = sourceRow(row);
        // 라벨은 표시 순번(seq) 하나만. 이전에 붙던 "row N"(rowId) 은 같은 정보를
        // 두 번 보여 주던 것이라 접었다 — 저장은 서버 row_id 를 따로 쓰고, 값을 맞춰야 할
        // 땐 행 설명(note) 과 아래 diff 요약이 식별자로 준다. title 에 rowId 를 남겨
        // 필요할 때는 마우스를 올려 확인할 수 있게 한다.
        return createElement(
          "button",
          {
            type: "button",
            "data-testid": `dt-row-${src.rowId}`,
            title: src.note ? `${src.note} (row ${src.rowId})` : `row ${src.rowId}`,
            onClick: () => ctx.onSelectRow(src.rowId),
            style: { border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--color-primary)" },
          },
          `${String(value)}`,
        );
      },
    },
  ];
  if (cond.length > 0) cols.push({ key: "grp_cond", header: "조건", ...BLOCK_HEAD.cond, children: cond.map((v) => varGroup(ctx, v)) });
  if (result.length > 0) cols.push({ key: "grp_result", header: "결과", ...BLOCK_HEAD.result, children: resultColumns(ctx, result) });
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
        // 글자 "✕" 대신 휴지통 아이콘 — 열 설정 그리드의 삭제 칸(`column-grid.tsx` IconTrash)과 같은
        // 모양으로 맞춘다. 여기서 지운 건 "어느 행" 이지 창을 닫는 게 아니라서 ✕ 는 겉으로 헷갈렸다.
        return createElement(
          "button",
          {
            type: "button",
            "aria-label": `행 삭제 ${src.rowId}`,
            "data-testid": `dt-del-${src.rowId}`,
            disabled: !ctx.editable,
            onClick: () => ctx.onDeleteRow(src.rowId),
            style: {
              ...DEL_BTN_STYLE,
              cursor: ctx.editable ? "pointer" : "default",
              opacity: ctx.editable ? 1 : 0.4,
            },
          },
          createElement(IconTrash, { size: ICON_SIZE }),
        );
      },
    },
  );
  return cols;
}
