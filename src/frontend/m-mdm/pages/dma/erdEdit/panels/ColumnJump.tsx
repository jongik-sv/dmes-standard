"use client";

/**
 * 컬럼 점프(Ctrl/⌘+O·Alt+O, 스펙 8절) — 지금 표(없으면 모든 표)의 컬럼을 물리명·논리명으로 찾아 고른 컬럼으로 간다.
 * 키는 ErdViewer(FE1)가 window 캡처로 받아 ctx.nav.openColumnJump 로 이 창을 연다. 고르면 ctx.nav.selectColumn 과 컬럼 그리드 알림을 함께 부른다.
 * 목록은 AgDataGrid 로 그린다(데이터 목록 규칙). ↑/↓ 는 입력 칸에서 커서를 옮기고 Enter 로 고른다. 더블클릭도 고른다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import type { ErdEditContext } from "../edit-context";
import type { ErdModelJson, ErdTable } from "../types";
import { requestColumnFocus } from "./ColumnGrid";

export const JUMP_LIMIT = 200;

export interface JumpRow extends Record<string, unknown> { id: string; table: string; column: string; logical: string }

export function jumpRows(model: ErdModelJson, tableId: string | null, text: string): { rows: JumpRow[]; more: number } {
  const q = text.trim().toLowerCase();
  const tables: [string, ErdTable][] = tableId && model.tables[tableId]
    ? [[tableId, model.tables[tableId]]]
    : Object.entries(model.tables).sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  const rows: JumpRow[] = [];
  let total = 0;
  for (const [, t] of tables) {
    for (const cid of t.columnOrder) {
      const c = model.columns[cid];
      if (!c) continue;
      if (q !== "" && !c.phys.toLowerCase().includes(q) && !(c.logical ?? "").toLowerCase().includes(q)) continue;
      total += 1;
      if (rows.length < JUMP_LIMIT) rows.push({ id: cid, table: t.phys, column: c.phys, logical: c.logical });
    }
  }
  return { rows, more: total - rows.length };
}

const JUMP_COLUMNS: GridColumn[] = [
  { key: "table", header: "표", width: 140, meta: false },
  { key: "column", header: "컬럼", width: 140, meta: false },
  { key: "logical", header: "논리명", width: 140, meta: false },
];
const EMPTY: { rows: JumpRow[]; more: number } = { rows: [], more: 0 };
const BODY: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" };
// 모달 안 그리드는 기준 높이가 있어야 한다(Local-Rules §25).
const GRID_BOX: CSSProperties = { position: "relative", height: 320 };
const FILL: CSSProperties = { position: "absolute", inset: 0 };
const MORE: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };

export interface ColumnJumpProps {
  ctx: ErdEditContext;
  opened: boolean;
  onClose(): void;
}

export function ColumnJump({ ctx, opened, onClose }: ColumnJumpProps) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const model = ctx.state.model;
  const tableId = ctx.selectedTableId && model.tables[ctx.selectedTableId] ? ctx.selectedTableId : null;
  const found = useMemo(() => (opened ? jumpRows(model, tableId, text) : EMPTY), [opened, model, tableId, text]);
  const rowsRef = useRef(found.rows);
  rowsRef.current = found.rows;
  const navRef = useRef(ctx.nav);
  navRef.current = ctx.nav;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (opened) setText("");
  }, [opened]);
  useEffect(() => {
    setCursor(0);
  }, [text, opened]);

  const pick = useCallback((columnId: string) => {
    navRef.current.selectColumn(columnId);
    requestColumnFocus(columnId);
    closeRef.current();
  }, []);
  const onRowClick = useCallback((row: Record<string, unknown>) => {
    const i = rowsRef.current.findIndex((r) => r.id === row.id);
    if (i >= 0) setCursor(i);
  }, []);
  const onRowDoubleClick = useCallback((row: Record<string, unknown>) => pick(String(row.id)), [pick]);

  const current = found.rows.length > 0 ? found.rows[Math.min(cursor, found.rows.length - 1)].id : null;
  const title = tableId ? `컬럼 점프 — ${model.tables[tableId].phys}` : "컬럼 점프 — 모든 표";

  // 열렸다는 표시(FE1 Task 9 뼈대 계약 6). 창 본문은 포털(body)로 뜨므로, 화면 host 안에서 찾는 Task 9 의 Alt+O 시험을 위해 제자리에 숨은 표시를 둔다.
  return (
    <>
    {opened && <div data-testid="erd-column-jump" hidden />}
    <Modal open={opened} title={title} size="md" onClose={onClose}>
      {opened && (
        <div data-testid="erd-jump" style={BODY}>
          <Input data-testid="erd-jump-input" data-autofocus aria-label="컬럼 찾기" value={text} placeholder="물리명·논리명" onChange={setText}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = found.rows.length;
                if (n > 0) setCursor((c) => Math.max(0, Math.min(n - 1, c + (e.key === "ArrowDown" ? 1 : -1))));
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                if (current) pick(current);
              }
            }} />
          <div style={GRID_BOX}>
            <div style={FILL}>
              <AgDataGrid gridId="modal-erdColumnJump" title="컬럼" columnSizing="fit" columns={JUMP_COLUMNS} data={found.rows} rowKey="id"
                highlightedRowKey={current} scrollToRow={current} onRowClick={onRowClick} onRowDoubleClick={onRowDoubleClick}
                emptyMessage="맞는 컬럼이 없습니다." emptyTestId="erd-jump-empty" personalize={false} />
            </div>
          </div>
          {found.more > 0 && (
            <div data-testid="erd-jump-more" style={MORE}>
              {JUMP_LIMIT}건까지 보입니다. {found.more}건이 더 있으니 더 좁혀 찾으세요.
            </div>
          )}
        </div>
      )}
    </Modal>
    </>
  );
}
