/**
 * 컬럼 복사·붙여넣기(2차 p7) — 컬럼 그리드의 ⌘/Ctrl+C·V. 공용 클립보드(canvas/erd-clipboard.ts)의 kind "columns" 칸을 쓴다.
 * 순수 함수만 둔다. 복사는 고른 컬럼의 값만 담고(키·관계는 담지 않는다), 붙이기는 addColumn 한 묶음(되돌리기 1번)이다.
 * - 같은 모델 안에서만 붙인다. 같은 표에 붙이면 물리명이 겹치므로 `_COPY`, `_COPY2`… 로 바꾸고 논리명은 「… 복사」로 한다.
 *   다른 표에 붙일 때 물리명이 비어 있으면 원래 이름 그대로 둔다.
 * - 자리 = 고른 컬럼 바로 뒤. 고른 컬럼이 없으면 끝(서버가 끝 감사 덩어리 앞에 넣는다).
 */
import { copyLogical, copyName, type ErdClip, type ErdColumnsClip } from "../canvas/erd-clipboard";
import { MAX_BATCH } from "../canvas/erd-commands";
import type { ErdCommandJson, ErdModelJson } from "../types";

const deep = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 고른 컬럼(모델에 있고 같은 표의 것만, 표 안 순서대로)을 컬럼 묶음으로 복사한다. 없으면 null. */
export function copyColumns(model: ErdModelJson, modelId: string, tableId: string, columnIds: readonly string[]): ErdColumnsClip | null {
  const t = model.tables[tableId];
  if (!t) return null;
  const want = new Set(columnIds);
  const columns = t.columnOrder.filter((c) => want.has(c) && model.columns[c]).map((id) => ({ id, column: deep(model.columns[id]) }));
  return columns.length === 0 ? null : { kind: "columns", modelId, table: tableId, columns };
}

export interface ColumnPastePlan {
  commands: ErdCommandJson[];
  /** 새 컬럼 id(복사한 순서). */
  columnIds: string[];
  /** 붙이지 못한 이유. 있으면 commands 는 빈 목록. */
  error: string | null;
}

export interface ColumnPasteInput {
  model: ErdModelJson;
  modelId: string;
  tableId: string;
  clip: ErdClip | null;
  /** 이 컬럼 바로 뒤에 붙인다. null 이면 끝. */
  afterColumnId: string | null;
  newId: () => string;
}

export function pasteColumnsPlan(i: ColumnPasteInput): ColumnPastePlan {
  const none = (error: string): ColumnPastePlan => ({ commands: [], columnIds: [], error });
  const table = i.model.tables[i.tableId];
  if (!i.clip) return none("복사한 컬럼이 없습니다.");
  if (i.clip.kind !== "columns") return none("복사한 것은 표입니다. 표는 캔버스에 붙입니다.");
  if (i.clip.modelId !== i.modelId) return none("다른 모델에서 복사한 컬럼은 붙일 수 없습니다.");
  if (!table) return none("붙일 표를 먼저 고르세요.");
  const taken = new Set(table.columnOrder.map((c) => i.model.columns[c]?.phys).filter((p): p is string => !!p));
  const at = i.afterColumnId ? table.columnOrder.indexOf(i.afterColumnId) : -1;
  const commands: ErdCommandJson[] = [];
  const columnIds: string[] = [];
  for (const { column: c } of i.clip.columns) {
    const id = i.newId();
    const renamed = taken.has(c.phys);
    const phys = renamed ? copyName(c.phys, taken) : c.phys;
    taken.add(phys);
    const cmd: ErdCommandJson = {
      op: "addColumn", id, table: i.tableId, phys, logical: renamed ? copyLogical(c.logical) : c.logical, domainId: c.domainId,
      dataType: c.dataType, length: c.length, scale: c.scale, notNull: c.notNull, defaultValue: c.default, comment: c.comment ?? "",
    };
    if (at >= 0) cmd.position = at + 1 + columnIds.length;
    commands.push(cmd);
    columnIds.push(id);
  }
  if (commands.length > MAX_BATCH) return none(`한 번에 붙일 수 있는 컬럼은 ${MAX_BATCH}개입니다.`);
  return { commands, columnIds, error: null };
}
