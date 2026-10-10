/**
 * 감사 컬럼(순수) — 물리명이 아래 8개인 컬럼. 대소문자는 가린다. VER 은 감사 컬럼이 아니다.
 * 서버 엔진이 새 표마다 이 8개를 끝에 붙인다. 화면은 기본으로 숨기고 도구 막대 단추로 켜고 끈다(보기 상태, 사람마다 다르다).
 * 판정은 isAuditColumn 하나만 쓴다 — 캔버스 노드·컬럼 그리드·크기 어림이 같은 함수를 부른다.
 *
 * 위치 규칙(결정 23): 서버는 addColumn(자리 없음)·moveColumn(끝)을 "표 끝에 이어진 감사 컬럼 덩어리 앞"에 넣는다.
 * 넣는 컬럼이 감사 컬럼이면 맨 끝이다. 안 보이는 감사 컬럼 때문에 화면 자리(걸러진 목록의 인덱스)를 서버에 그대로 보내면 어긋나므로,
 * 화면 자리는 toRealPosition 으로 columnOrder 의 실제 인덱스로 바꾼다.
 */
import type { ErdModelJson } from "./types";

export const AUDIT_COLUMN_NAMES: readonly string[] = [
  "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID",
];

const AUDIT_SET: ReadonlySet<string> = new Set(AUDIT_COLUMN_NAMES);

/** 물리명이 감사 컬럼인가(대소문자 무시). */
export function isAuditColumn(phys: string | null | undefined): boolean {
  return !!phys && AUDIT_SET.has(phys.toUpperCase());
}

/** 컬럼 id 가 감사 컬럼인가. 모델에 없는 id 는 아니다. */
export function isAuditColumnId(model: Pick<ErdModelJson, "columns">, columnId: string): boolean {
  return isAuditColumn(model.columns[columnId]?.phys);
}

/** 보일 컬럼 id — 모델에 있는 컬럼만, showAudit 가 꺼져 있으면 감사 컬럼을 뺀다. 순서는 columnOrder 그대로. */
export function visibleColumnIds(model: ErdModelJson, tableId: string, showAudit: boolean): string[] {
  const t = model.tables[tableId];
  if (!t) return [];
  const order = t.columnOrder.filter((c) => model.columns[c]);
  return showAudit ? order : order.filter((c) => !isAuditColumn(model.columns[c].phys));
}

/**
 * order 끝에 이어진 감사 컬럼 덩어리의 시작 인덱스. 덩어리가 없으면 order.length.
 * physOf 가 undefined 를 주는 id(모델에 없는 컬럼)는 감사 컬럼이 아니다.
 */
export function auditEndIndex(order: readonly string[], physOf: (id: string) => string | undefined): number {
  let i = order.length;
  while (i > 0 && isAuditColumn(physOf(order[i - 1]))) i--;
  return i;
}

/**
 * 서버(결정 23)와 같은 도착 자리. rest 는 옮기는 컬럼을 뺀 순서다.
 * position 이 rest 길이 이상("끝")이고 옮기는 컬럼이 감사 컬럼이 아니면 끝 감사 덩어리 앞, 아니면 범위로 맞춘 position 그대로.
 */
export function landingIndex(
  rest: readonly string[], position: number, movingPhys: string | undefined, physOf: (id: string) => string | undefined,
): number {
  if (position >= rest.length && !isAuditColumn(movingPhys)) return auditEndIndex(rest, physOf);
  return Math.max(0, Math.min(position, rest.length));
}

/**
 * 걸러진 목록(visibleAfter, 옮긴 뒤 순서)에서의 위치를 columnOrder(full)의 실제 인덱스로 바꾼다.
 * 옮긴 컬럼 바로 앞의 보이는 컬럼 뒤에 넣는다. 맨 앞이면 바로 뒤의 보이는 컬럼 앞에 넣는다. 앞뒤가 없으면 null(호출자가 쓰던 자리를 쓴다).
 * 걸러진 것이 없으면(full 이 곧 보이는 목록) 쓰던 자리와 같다.
 */
export function toRealPosition(full: readonly string[], movedId: string, visibleAfter: readonly string[]): number | null {
  const rest = full.filter((c) => c !== movedId);
  const at = visibleAfter.indexOf(movedId);
  if (at < 0) return null;
  if (at > 0) {
    const prev = rest.indexOf(visibleAfter[at - 1]);
    return prev < 0 ? null : prev + 1;
  }
  if (visibleAfter.length > 1) {
    const next = rest.indexOf(visibleAfter[1]);
    return next < 0 ? null : next;
  }
  return null;
}

/** 표에서 보기가 꺼져 가려진 감사 컬럼 수(보기 켬이면 0). 모델에 없는 컬럼 id 는 세지 않는다. */
export function hiddenAuditCount(model: ErdModelJson, tableId: string | null, showAudit: boolean): number {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t || showAudit) return 0;
  return t.columnOrder.reduce((n, c) => (isAuditColumnId(model, c) ? n + 1 : n), 0);
}

/** 이 컬럼을 고르려면 감사 컬럼 보기를 켜야 하는가 — 감사 컬럼인데 꺼져 있을 때. */
export function needsAuditReveal(model: Pick<ErdModelJson, "columns">, columnId: string, showAudit: boolean): boolean {
  return !showAudit && isAuditColumnId(model, columnId);
}

// ── 보기 상태 저장(localStorage). 읽고 쓰기 모두 막힐 수 있다(비공개 창·저장 차단) — 모두 try/catch, 안 되면 숨김이 기본이다. ──

export const SHOW_AUDIT_KEY = "dmes.erdEdit.showAudit";

export function loadShowAudit(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_AUDIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveShowAudit(show: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHOW_AUDIT_KEY, show ? "1" : "0");
  } catch {
    // 저장이 막혀도 화면은 그대로 동작한다(이번 방문만 유지).
  }
}
