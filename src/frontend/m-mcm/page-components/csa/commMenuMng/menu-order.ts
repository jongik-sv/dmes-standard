/**
 * 메뉴 관리 — 끌어 놓기로 순서·폴더를 바꿀 때의 계산 (2026-11-26).
 *
 * 화면은 이 함수들로 행을 바꾸고, 저장하면 BE 가 MENU_SEQ 를 8자리로 채운다. 순서는 같은 폴더 안 MENU_SEQ 하나로 정한다
 * (2026-11-27 FULL_SEQ 삭제, BE mcm.menu.MenuOrder). 그래서 여기서는 MENU_SEQ 만 10, 20, 30 … 으로 다시 매긴다.
 *
 * 순서 바꾸기는 한 폴더의 화면이 목록에 모두 있을 때만 맞다. 검색어로 일부만 보이면 숨은 화면과 번호가 섞이므로
 * 화면이 그때는 끌기를 막는다(page.tsx `reorderBlockedReason`).
 */
import type { CommMenuMngTreeRow, RowStatus } from "./types";

/** 끌어 놓기 계산이 다루는 행 — 메뉴 행의 일부 칸과 행 상태. */
export interface OrderRow {
  MENU_ID?: string;
  MENU_SEQ?: string;
  PARENT_MENU_ID?: string;
  nativeeditor_status?: RowStatus;
  [key: string]: unknown;
}

/** 순서 번호 간격. 사이에 손으로 끼워 넣을 여유를 둔다. */
export const SEQ_STEP = 10;

/** MENU_SEQ 를 숫자로. 비었거나 숫자가 아니면 맨 뒤로 보낸다. */
export function seqNumber(v: unknown): number {
  const n = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * 폴더의 트리 순서. 트리를 위에서 아래로 읽은 순번(깊이 우선)과 모듈(최상위) 폴더 id 를 돌려준다.
 * 같은 부모 안에서는 MENU_SEQ 순이다(buildMenuTree 와 같은 기준).
 */
export function folderOrder(treeRows: CommMenuMngTreeRow[]): { index: Map<string, number>; roots: Set<string> } {
  const byParent = new Map<string, CommMenuMngTreeRow[]>();
  const ids = new Set(treeRows.map((r) => String(r.MENU_ID ?? "")));
  for (const r of treeRows) {
    const id = String(r.MENU_ID ?? "");
    if (!id) continue;
    const raw = String(r.PARENT_MENU_ID ?? "").trim();
    const parent = raw && raw !== "null" && ids.has(raw) ? raw : "";
    const list = byParent.get(parent) ?? [];
    list.push(r);
    byParent.set(parent, list);
  }
  const index = new Map<string, number>();
  const roots = new Set<string>();
  const walk = (parent: string) => {
    const children = [...(byParent.get(parent) ?? [])].sort(
      (a, b) => seqNumber(a.MENU_SEQ) - seqNumber(b.MENU_SEQ) || String(a.MENU_ID).localeCompare(String(b.MENU_ID)),
    );
    for (const c of children) {
      const id = String(c.MENU_ID);
      if (index.has(id)) continue; // 순환 방어
      index.set(id, index.size);
      if (parent === "") roots.add(id);
      walk(id);
    }
  };
  walk("");
  return { index, roots };
}

/** 메뉴 행을 트리 순서(폴더 순서 → MENU_SEQ → MENU_ID)로 늘어놓는다. 삭제 표시 행은 맨 뒤. */
export function sortMenuRows<T extends OrderRow>(rows: T[], folderIndex: Map<string, number>): T[] {
  const fi = (r: OrderRow) => folderIndex.get(String(r.PARENT_MENU_ID ?? "")) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => {
    const da = a.nativeeditor_status === "deleted" ? 1 : 0;
    const db = b.nativeeditor_status === "deleted" ? 1 : 0;
    return (
      da - db ||
      fi(a) - fi(b) ||
      seqNumber(a.MENU_SEQ) - seqNumber(b.MENU_SEQ) ||
      String(a.MENU_ID ?? "").localeCompare(String(b.MENU_ID ?? ""))
    );
  });
}

/** 바뀐 칸이 있을 때만 행 상태를 「updated」 로 올린다(신규 행은 그대로 inserted). */
function withChange<T extends OrderRow>(row: T, patch: Partial<OrderRow>): T {
  const changed = Object.entries(patch).some(([k, v]) => row[k] !== v);
  if (!changed) return row;
  const status: RowStatus =
    row.nativeeditor_status === "inserted" ? "inserted" : row.nativeeditor_status === "deleted" ? "deleted" : "updated";
  return { ...row, ...patch, nativeeditor_status: status };
}

/** 폴더별로 지금 순서대로 MENU_SEQ 를 10, 20, 30 … 으로 다시 매긴다. `folders` 를 주면 그 폴더만. */
export function renumber<T extends OrderRow>(ordered: T[], folders?: Set<string>): T[] {
  const counter = new Map<string, number>();
  return ordered.map((r) => {
    if (r.nativeeditor_status === "deleted") return r;
    const folder = String(r.PARENT_MENU_ID ?? "");
    if (folders && !folders.has(folder)) return r;
    const n = (counter.get(folder) ?? 0) + 1;
    counter.set(folder, n);
    return withChange(r, { MENU_SEQ: String(n * SEQ_STEP) });
  });
}

/**
 * 새 순서에서 「움직이지 않은」 행의 자리 목록 — 예전 순번 열의 가장 긴 증가 부분열(LIS)이다.
 * 나머지가 사용자가 끈 행이다. 여러 행을 함께 끌어도, 한 행만 끌어도 같은 방법으로 찾는다.
 */
function stationaryPositions(oldIndexes: number[]): Set<number> {
  const tails: number[] = []; // tails[k] = 길이 k+1 증가열의 마지막 위치
  const prevOf: number[] = new Array(oldIndexes.length).fill(-1);
  for (let i = 0; i < oldIndexes.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (oldIndexes[tails[mid]] < oldIndexes[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prevOf[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out = new Set<number>();
  let p = tails.length > 0 ? tails[tails.length - 1] : -1;
  while (p >= 0) {
    out.add(p);
    p = prevOf[p];
  }
  return out;
}

/**
 * 목록 안에서 끌어 순서를 바꾼 결과를 행에 반영한다.
 *
 * - `orderedKeys` 는 그리드가 알려 준 새 순서(보이는 행 전부). 예전 순서는 `rows` 의 순서다.
 * - 끈 행의 위·아래 화면(끌지 않은 화면) 중 하나가 자기 폴더면 폴더를 지키고 순서만 바뀐다.
 *   둘 다 다른 폴더면 **바로 위 화면의 폴더**로 들어간다(맨 위에 놓으면 바로 아래 화면의 폴더).
 *   위·아래 화면도 끈 행이면 더 올라가며(내려가며) 움직이지 않은 화면을 찾는다.
 * - 그다음 끈 행이 떠난 폴더와 들어간 폴더만 MENU_SEQ 를 다시 매긴다. 순서·폴더가 실제로 바뀐 행만 updated 가 된다.
 */
export function applyReorder<T extends OrderRow>(rows: T[], orderedKeys: (string | number)[], keyOf: (r: T) => string): T[] {
  const byKey = new Map(rows.map((r) => [keyOf(r), r]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const k of orderedKeys) {
    const r = byKey.get(String(k));
    if (r && !seen.has(String(k))) {
      ordered.push(r);
      seen.add(String(k));
    }
  }
  // 그리드에 없던 행(삭제 표시 등)은 뒤에 그대로 붙인다.
  for (const r of rows) if (!seen.has(keyOf(r))) ordered.push(r);

  const live = ordered.filter((r) => r.nativeeditor_status !== "deleted");
  const oldIndex = new Map(rows.map((r, i) => [keyOf(r), i]));
  const stay = stationaryPositions(live.map((r) => oldIndex.get(keyOf(r)) ?? 0));
  const folderOf = (r: OrderRow) => String(r.PARENT_MENU_ID ?? "");
  const adjusted = live.map((r, i) => {
    if (stay.has(i)) return r;
    let above: string | undefined;
    let below: string | undefined;
    for (let j = i - 1; j >= 0 && above === undefined; j--) if (stay.has(j)) above = folderOf(live[j]);
    for (let j = i + 1; j < live.length && below === undefined; j++) if (stay.has(j)) below = folderOf(live[j]);
    const own = folderOf(r);
    // 폴더 경계에 놓았을 때 위·아래 중 하나가 자기 폴더면 폴더를 지킨다(순서만 바뀐다).
    if (own === above || own === below) return r;
    const target = above ?? below;
    if (target === undefined) return r;
    return withChange(r, { PARENT_MENU_ID: target });
  });
  // 번호는 끈 행이 떠난 폴더와 들어간 폴더만 다시 매긴다 — 손대지 않은 폴더의 행까지 「바뀜」 이 되지 않게.
  const touched = new Set<string>();
  live.forEach((r, i) => {
    if (stay.has(i)) return;
    touched.add(folderOf(r));
    touched.add(folderOf(adjusted[i]));
  });
  const dead = ordered.filter((r) => r.nativeeditor_status === "deleted");
  return [...renumber(adjusted, touched), ...dead];
}

/**
 * 행들을 다른 폴더의 맨 뒤로 옮긴다(트리 폴더에 끌어 놓기).
 * `lastSeq` 는 그 폴더에 이미 있는 화면의 가장 큰 MENU_SEQ — 목록에 그 폴더 행이 없을 수 있어 화면이 서버에서 구해 넘긴다.
 * 옮긴 행이 원래 있던 폴더는 남은 행끼리 번호를 다시 매긴다(목록에 그 폴더 행이 모두 있을 때만 — `renumberSources`).
 */
export function moveToFolder<T extends OrderRow>(
  rows: T[],
  movedKeys: Set<string>,
  folderId: string,
  lastSeq: number,
  keyOf: (r: T) => string,
  renumberSources: boolean,
): T[] {
  const sources = new Set<string>();
  let seq = lastSeq;
  const moved = rows.map((r) => {
    if (!movedKeys.has(keyOf(r)) || r.nativeeditor_status === "deleted") return r;
    const from = String(r.PARENT_MENU_ID ?? "");
    if (from === folderId) return r;
    sources.add(from);
    seq += SEQ_STEP;
    return withChange(r, { PARENT_MENU_ID: folderId, MENU_SEQ: String(seq) });
  });
  if (!renumberSources || sources.size === 0) return moved;
  // 원래 폴더의 남은 행은 지금 MENU_SEQ 순서를 지키며 번호만 다시 매긴다.
  const sorted = [...moved].sort((a, b) => seqNumber(a.MENU_SEQ) - seqNumber(b.MENU_SEQ));
  const renumbered = new Map(renumber(sorted, sources).map((r) => [keyOf(r), r]));
  return moved.map((r) => renumbered.get(keyOf(r)) ?? r);
}

/** 폴더 안 화면의 가장 큰 MENU_SEQ(없으면 0). 숫자가 아닌 번호는 건너뛴다. */
export function maxSeqIn(rows: OrderRow[], folderId: string): number {
  let max = 0;
  for (const r of rows) {
    if (String(r.PARENT_MENU_ID ?? "") !== folderId || r.nativeeditor_status === "deleted") continue;
    const n = seqNumber(r.MENU_SEQ);
    if (n !== Number.MAX_SAFE_INTEGER && n > max) max = n;
  }
  return max;
}
