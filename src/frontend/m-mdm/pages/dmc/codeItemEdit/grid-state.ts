/**
 * 코드 편집 그리드의 편집 상태 — 순수 함수(TSK-06-03 design.md §3 커밋 D·§6.8).
 *
 * 서버 행(버전 V 의 모습)을 그리드 행으로 옮기고, 셀 편집·추가·삭제를 변경 목록(rowStatus ADDED·CHANGED·DELETED)으로
 * 만든다. CHANGED 는 행 전체 값을 보낸다(부분 갱신이 아니다, §6.1). 빈 문자열·null 칸은 페이로드에서 뺀다 — 서버는 빠진
 * 키를 null 로 본다. 판정(저장 검사)은 서버가 한다.
 */
import { LVL_KEYS } from "./code-tree";

export const VALUE_KEYS = [
  "name", "alterName", "seq", "description",
  "lvl1", "lvl2", "lvl3", "lvl4", "lvl5",
  "attr01", "attr02", "attr03", "attr04", "attr05", "attr06", "attr07", "attr08", "attr09", "attr10",
] as const;

export type ValueKey = (typeof VALUE_KEYS)[number];

export type RowChange = "ADDED" | "CHANGED" | "NONE" | "REMOVED";

/** 서버 view 응답의 행(§6.6). */
export interface ServerRow {
  code: string;
  fromVer: string;
  toVer: string;
  name: string | null;
  alterName: string | null;
  seq: number | null;
  description: string | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  lvl4: string | null;
  lvl5: string | null;
  attr01: string | null;
  attr02: string | null;
  attr03: string | null;
  attr04: string | null;
  attr05: string | null;
  attr06: string | null;
  attr07: string | null;
  attr08: string | null;
  attr09: string | null;
  attr10: string | null;
  change: RowChange;
  prev?: Record<string, unknown> | null;
  tableCategories?: string[];
  patchBlocked?: boolean;
}

/** 화면의 편집 상태 — none(서버 그대로)·edited·deleted·new. */
export type LocalState = "none" | "edited" | "deleted" | "new";

export type EditRow = Record<string, unknown> & {
  __key: string;
  __local: LocalState;
  __server: ServerRow | null;
  code: string;
};

let tempSeq = 0;

export function toEditRows(rows: ServerRow[]): EditRow[] {
  return rows.map((r) => ({ ...r, __key: r.code, __local: "none", __server: r }));
}

const norm = (v: unknown): unknown => (v === "" || v === undefined ? null : v);

function sameAsServer(row: EditRow): boolean {
  const s = row.__server;
  if (!s) return false;
  return VALUE_KEYS.every((k) => String(norm(row[k]) ?? "") === String(norm(s[k]) ?? ""));
}

export function editCell(rows: EditRow[], key: string, field: string, value: unknown): EditRow[] {
  return rows.map((r) => {
    if (r.__key !== key) return r;
    const next: EditRow = { ...r, [field]: value };
    if (r.__local === "new" || r.__local === "deleted") return next;
    next.__local = sameAsServer(next) ? "none" : "edited";
    return next;
  });
}

/** 새 행을 맨 앞에 넣는다. defaults 는 거르기 중 계층 칸(pathOf) 등. */
export function addRow(rows: EditRow[], defaults: Record<string, unknown>): EditRow[] {
  tempSeq += 1;
  const row: EditRow = { __key: `__new_${tempSeq}`, __local: "new", __server: null, code: "", change: "ADDED" };
  for (const k of VALUE_KEYS) row[k] = defaults[k] ?? "";
  return [row, ...rows];
}

/** 새 행은 목록에서 빼고, 서버 행은 삭제로 표시한다. */
export function removeRow(rows: EditRow[], key: string): EditRow[] {
  const target = rows.find((r) => r.__key === key);
  if (!target) return rows;
  if (target.__local === "new") return rows.filter((r) => r.__key !== key);
  return rows.map((r) => (r.__key === key ? { ...r, __local: "deleted" } : r));
}

/** 화면에서만 바꾼 것을 되돌린다(삭제 표시 해제·편집 취소). */
export function undoLocal(rows: EditRow[], key: string): EditRow[] {
  return rows.flatMap((r) => {
    if (r.__key !== key) return [r];
    if (r.__local === "new") return [];
    return r.__server ? [{ ...r.__server, __key: r.__key, __local: "none" as const, __server: r.__server }] : [r];
  });
}

function payloadValues(row: EditRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of VALUE_KEYS) {
    const v = norm(row[k]);
    if (v !== null) out[k] = k === "seq" && typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  }
  return out;
}

export function changesOf(rows: EditRow[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r.__local === "deleted") out.push({ rowStatus: "DELETED", code: r.code });
    else if (r.__local === "edited") out.push({ rowStatus: "CHANGED", code: r.code, ...payloadValues(r) });
    else if (r.__local === "new") out.push({ rowStatus: "ADDED", code: r.code, ...payloadValues(r) });
  }
  return out;
}

/** 칸 잠김(불변 규칙 39) — 편집 가능한 DRAFT 에서만, 삭제 표시한 행은 잠그고, 코드 칸은 새 행만 연다. */
export function isCellEditable(editable: boolean, row: EditRow, field: string): boolean {
  if (!editable || row.__local === "deleted") return false;
  if (field === "code") return row.__local === "new";
  return (VALUE_KEYS as readonly string[]).includes(field);
}

type Hier = { code: string } & Partial<Record<(typeof LVL_KEYS)[number], string | null>> & Record<string, unknown>;

/** 트리 노드로 거른다 — 그 코드 자신 또는 계층 칸에 그 값이 있는 행. sel 이 null 이면 전부. */
export function filterByNode<T extends Hier>(rows: T[], sel: string | null): T[] {
  if (sel === null) return rows;
  return rows.filter((r) => r.code === sel || LVL_KEYS.some((k) => r[k] === sel));
}

/** 노드 경로 — 그룹 값이면 그 칸까지의 앞 칸 + 자기 값, 코드만이면 그 코드의 경로 + 자기 값. */
export function pathOf(sel: string, rows: Hier[]): string[] {
  for (const r of rows) {
    const m = LVL_KEYS.findIndex((k) => r[k] === sel);
    if (m >= 0) return LVL_KEYS.slice(0, m + 1).map((k) => String(r[k]));
  }
  const self = rows.find((r) => r.code === sel);
  if (!self) return [sel];
  const path: string[] = [];
  for (const k of LVL_KEYS) {
    const v = self[k];
    if (v === null || v === undefined || v === "") break;
    path.push(String(v));
  }
  return [...path, sel];
}

/** 버전 표시 `v1.008` — 문자열로만 다룬다(JS number 는 2.000 의 소수 자릿수를 잃는다, 04:275). */
export function fmtVer(ver: string): string {
  const [int, frac = ""] = String(ver).split(".");
  return `v${int}.${`${frac}000`.slice(0, 3)}`;
}
