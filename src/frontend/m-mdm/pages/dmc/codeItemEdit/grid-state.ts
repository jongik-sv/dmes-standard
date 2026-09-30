/**
 * 코드 편집 그리드의 편집 상태 — 순수 함수(TSK-06-03 design.md §3 커밋 D·§6.8).
 *
 * 서버 행(버전 V 의 모습)을 그리드 행으로 옮기고, 셀 편집·추가·삭제를 변경 목록(rowStatus ADDED·CHANGED·DELETED)으로
 * 만든다. CHANGED 는 행 전체 값을 보낸다(부분 갱신이 아니다, §6.1). 빈 문자열·null 칸은 페이로드에서 뺀다 — 서버는 빠진
 * 키를 null 로 본다. 판정(저장 검사)은 서버가 한다.
 */
import { LVL_KEYS } from "@/hier-tree";

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

/**
 * 드래그 재배열 — **실제로 당긴 행만** `seq` 를 다시 매긴다.
 *
 * <p>순서만 바꿔서는 저장이 되지 않는다. `changesOf` 는 `__local` 이 바뀐 행만 보내는데 재배열만으로는 그 상태가 되지
 * 않고 `seq` 도 그대로라서 저장 payload 가 빈 채로 나가고, 재조회하면 원래 순서로 되돌아간다. 서버는 `seq`(null 은
 * 마지막) → `code` 순으로 정렬하므로(`MasterCodeCategoryResolver.ITEM_ORDER`) `seq` 를 다시 매겨야 남는다.
 *
 * <p>**누가 당긴 행인가**(2026-09-30): 화면 위치가 아니라 **누군가와 상대 순서가 뒤집혔는가**로 잰다. C 를 맨 위로
 * 끌어올리면 A·B 의 화면 위치도 밀리지만 A·B 의 상대 순서는 그대로다. 위치 기준으로 잡으면 드래그 한 번에 목록 전체가
 * `CHANGED` 가 되어 저장 payload 가 불필요하게 커진다.
 *
 * <p>당긴 행만 새 `seq` 를 받고, **나머지 행(사람이 칸에 직접 친 번호 포함)은 손대지 않는다.** 새 값은 고정된 이웃
 * 사이에 10 단위로 들어가므로 정규화되면 10, 20, 30 … 으로 깔리고, 직접 친 번호는 옮기지 않는 한 그대로 남는다.
 * 맨 위로 당기면 아래 최솟값보다 10 작게 들어간다(1, 2, 3 → C 는 -9). 계속 올렸다 내리면 음수가 쌓일 수 있는데,
 * 정규화는 [순서 정규화] 로 한 번에 되돌릴 수 있다.
 */
export function reorderRows(rows: EditRow[], orderedKeys: string[]): EditRow[] {
  /** `seq` 는 `EditRow` 에서 `unknown` 이다 — 숫자면 그 값, 아니면 null(서버는 null 을 마지막으로 본다). */
  const seqOf = (r: EditRow): number | null => (typeof r.seq === "number" && Number.isFinite(r.seq) ? r.seq : null);

  const keySet = new Set(orderedKeys);
  const next = [...rows].sort((a, b) => {
    const ai = keySet.has(a.__key);
    const bi = keySet.has(b.__key);
    if (ai && bi) return orderedKeys.indexOf(a.__key) - orderedKeys.indexOf(b.__key);
    if (ai) return -1;
    if (bi) return 1;
    return 0;
  });

  // ★누가 당긴 행인가(2026-09-30): 새 순서에서 **원래 상대 순서를 유지하는 최대 집합**(최장 증가 부분 수열) 을 찾고,
  // 그 나머지를 "당긴 행"으로 본다.
  //   (A,B,C) → (C,A,B) : LIS 는 A,B → C 만 당긴 행. A·B 는 상대 순서가 그대로라 `seq` 를 손댈 필요가 없다.
  //   (A,B,C) → (B,C,A) : LIS 는 B,C → A 만 당긴 행.
  //   (A,B,C) → (C,B,A) : LIS 가 하나뿐 → 전부 당긴 행 → 정규화(10 단위)로 간다.
  // 화면 위치로 잡으면 드래그 한 번에 목록 전체가 CHANGED 가 되어 저장 payload 가 불필요하게 커진다.
  const oldIndex = new Map(rows.map((r, i) => [r.__key, i]));
  const fixed = longestUnchangedOrder(next.map((r) => oldIndex.get(r.__key) as number));
  const dragged = new Set(next.filter((_, i) => !fixed[i]).map((r) => r.__key));
  if (dragged.size === 0) return rows;

  // 고정된(당기지 않은) 행의 seq — 당긴 행은 이 사이·바깥에 끼어야 한다.
  const fixedSeqs = rows.filter((r) => !dragged.has(r.__key)).map(seqOf).filter((v): v is number => v !== null);
  const minFixed = fixedSeqs.length > 0 ? Math.min(...fixedSeqs) : 0;

  const out: EditRow[] = [];
  // 바로 위에서 확정된 seq(고정 행 또는 방금 매긴 당긴 행), null 이면 아직 위가 없다.
  let anchor: number | null = null;
  // 연속된 당긴 행이 몇 개인지 — 그만큼 10 씩 띄워 그들 사이의 순서도 지킨다.
  let run = 0;
  for (const row of next) {
    if (!dragged.has(row.__key)) {
      out.push(row);
      const s = seqOf(row);
      if (anchor === null || s !== null) anchor = s;
      run = 0;
      continue;
    }
    run += 1;
    // 위 고정 행이 있으면 그 아래, 맨 위면 전체 최솟값 아래에 10 간격으로 넣는다.
    let seq: number;
    let upper: number | null = null;
    for (let j = next.indexOf(row) + 1; j < next.length; j++) {
      const u = seqOf(next[j]);
      if (!dragged.has(next[j].__key) && u !== null) { upper = u; break; }
    }
    if (anchor === null) {
      seq = minFixed - 10 * run;
    } else if (upper !== null && upper <= anchor + 10 * run) {
      // 위·아래 고정 행 사이가 10 간격 자리보다 좁다(또는 딱 같아 겹친다) — 안쪽으로 나눠 끼운다.
      // 10,20,30 에서 B·C 를 맞바꾸면 C 는 20(=B 와 충돌)이 아니라 15 가 된다.
      seq = anchor + Math.max(1, Math.floor((upper - anchor) / (run + 1)));
    } else {
      seq = anchor + 10 * run;
    }
    if (row.seq === seq) {
      out.push(row);
      anchor = seq;
      continue;
    }
    const moved: EditRow = { ...row, seq };
    // 새 행·삭제 표시는 순서 상태를 유지한다(DELETED 가 CHANGED 로 뒤집히면 안 된다).
    if (row.__local !== "new" && row.__local !== "deleted") {
      moved.__local = sameAsServer(moved) ? "none" : "edited";
    }
    out.push(moved);
    anchor = seq;
  }
  return out;
}

/**
 * `values` 의 최장 증가 부분 수열에 속하는 위치를 `true` 로 돌려준다 — "원래 상대 순서를 그대로 유지한 행"을 찾는 용도.
 * (드래그로 뒤집히지 않은 행을 최대한 많이 남겨 두고, 나머지만 `seq` 를 다시 매긴다)
 */
function longestUnchangedOrder(values: number[]): boolean[] {
  const keep = new Array<boolean>(values.length).fill(false);
  if (values.length === 0) return keep;
  // patience 정렬 — tails[k] = 길이 k+1 인 증가 부분 수열의 마지막 값.
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tailIdx[lo - 1];
    if (lo === tails.length) {
      tails.push(v);
      tailIdx.push(i);
    } else {
      tails[lo] = v;
      tailIdx[lo] = i;
    }
  }
  let k = tailIdx[tailIdx.length - 1];
  while (k !== -1 && k !== undefined) {
    keep[k] = true;
    k = prev[k];
  }
  return keep;
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
