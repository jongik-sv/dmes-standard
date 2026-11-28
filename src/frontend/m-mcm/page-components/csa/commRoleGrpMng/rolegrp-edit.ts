/**
 * commRoleGrpMng 편집 도우미(perm-crudfix c1·c2) — 화면(page.tsx)이 부르는 순수 함수.
 *
 * - c1: 역할이 연결된 그룹도 이름·설명·사용 여부·기간을 고칠 수 있다. 그룹을 끄거나(USE_TP Y→N) 종료일을 오늘 이전으로
 *   바꾸면 저장 전에 「이 그룹을 받은 사용자 n명이 연결된 역할을 잃습니다」를 묻는다(lossTargets·lossMessage).
 * - c2: 역할 매핑(◀/▶) 저장이 그룹 행의 저장 안 한 변경을 지우지 않게, 저장 전 변경 행을 다시 얹는다(keepDirtyRows).
 */

/**
 * 그룹 행 — ROLE_GROUP_ID · ROLE_GROUP_NM · USE_TP · END_ACTIVE_DATE · USER_CNT · ROLE_CNT ·
 * __origUseTp/__origEnd(조회 시점 사용 여부·종료일, 바뀜 판정 기준) 를 읽는다.
 */
export interface RoleGrpEditRow extends Record<string, unknown> {
  nativeeditor_status?: string;
}

/** 날짜 값(yyyyMMdd · yyyy-MM-dd · ISO) → yyyyMMdd. 못 읽으면 "". */
export function ymd(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (/^\d{8}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

/** 그 날에 그룹이 쓰이는 중인가(USE_TP=Y 이고 시작일 ≤ 그날 ≤ 종료일 — 끝 날 포함, 서버 SysadminGuard 와 같은 기준). */
function activeOn(useTp: unknown, start: unknown, end: unknown, today: string): boolean {
  if (String(useTp ?? "") !== "Y") return false;
  const s = ymd(start);
  const e = ymd(end);
  return (!s || s <= today) && (!e || e >= today);
}

export interface LossTarget {
  id: string;
  nm: string;
  userCnt: number;
}

/**
 * 저장하면 받은 사람이 연결된 역할을 잃는 그룹 — 수정 줄 중 조회 시점엔 쓰이던 그룹이 이번 값으로 쓰이지 않게 되고,
 * 받은 사람과 연결된 역할이 둘 다 있는 것. today = yyyyMMdd.
 */
export function lossTargets(rows: RoleGrpEditRow[], today: string): LossTarget[] {
  const out: LossTarget[] = [];
  for (const r of rows) {
    if (r.nativeeditor_status !== "updated") continue;
    const users = Number(r.USER_CNT ?? 0);
    const roles = Number(r.ROLE_CNT ?? 0);
    if (!(users > 0 && roles > 0)) continue;
    const before = activeOn(r.__origUseTp, r.__origStart, r.__origEnd, today);
    const after = activeOn(r.USE_TP, r.START_ACTIVE_DATE, r.END_ACTIVE_DATE, today);
    if (before && !after) out.push({ id: String(r.ROLE_GROUP_ID ?? ""), nm: String(r.ROLE_GROUP_NM ?? ""), userCnt: users });
  }
  return out;
}

/** 확인 창 문구. 그룹 하나 = 「이 그룹을 받은 사용자 n명이 연결된 역할을 잃습니다」. */
export function lossMessage(targets: LossTarget[]): string {
  if (targets.length === 1) {
    const t = targets[0];
    return `「${t.nm || t.id}」 그룹을 끄면 이 그룹을 받은 사용자 ${t.userCnt}명이 연결된 역할을 잃습니다. 저장할까요?`;
  }
  const names = targets.map((t) => `「${t.nm || t.id}」 ${t.userCnt}명`).join(", ");
  return `그룹 ${targets.length}개를 끄면 그 그룹을 받은 사용자가 연결된 역할을 잃습니다(${names}). 저장할까요?`;
}

/**
 * 저장 전 변경 행(dirty)을 지금 행 목록에 다시 얹는다 — 같은 키(keyOf)의 행이 변경 표시를 잃었으면 저장 전 행으로 바꾼다.
 * 이미 변경 표시가 있는 행·목록에 없는 행은 그대로(지운 행은 되살리지 않는다). 바뀐 것이 없으면 같은 배열을 돌려준다.
 */
export function keepDirtyRows<T extends { nativeeditor_status?: string }>(
  rows: T[],
  dirty: T[],
  keyOf: (r: T) => string,
  merge: (cur: T, saved: T) => T = (_cur, saved) => saved,
): T[] {
  if (dirty.length === 0) return rows;
  const byKey = new Map(dirty.map((d) => [keyOf(d), d]));
  let changed = false;
  const next = rows.map((r) => {
    if (r.nativeeditor_status) return r;
    const d = byKey.get(keyOf(r));
    if (!d) return r;
    changed = true;
    return merge(r, d);
  });
  return changed ? next : rows;
}

/** 오늘(KST — 서버 판정과 같은 날짜) yyyyMMdd. */
export function todayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/-/g, "");
}

/** 그룹 행의 연결된 역할 수를 지금 매핑 수로 맞춘다(매핑 저장 뒤 — 끄기 확인·삭제 막기가 낡은 수를 쓰지 않게). 같으면 같은 배열. */
export function withRoleCnt<T extends Record<string, unknown>>(rows: T[], groupId: string, roleCnt: number): T[] {
  let changed = false;
  const next = rows.map((r) => {
    if (String(r.ROLE_GROUP_ID ?? "") !== groupId || Number(r.ROLE_CNT ?? 0) === roleCnt) return r;
    changed = true;
    return { ...r, ROLE_CNT: roleCnt };
  });
  return changed ? next : rows;
}
