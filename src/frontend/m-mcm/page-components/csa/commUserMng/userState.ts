/**
 * commUserMng 계정 상태 — 화면이 쓰는 순수 값·함수 (시안 「사용자 비활성화·퇴직 처리」, 2026-11-28).
 *
 * 상태 계산은 서버(AccountState.of)가 한다. 화면은 받은 USER_ST·USE_TP·HR_ST 로 보일 단추·안내 문구만 정한다.
 */
import { todayYmd } from "./detailUtils";
import type { ActiveUserLovRow, CommUserMngRow, HandoverResult, OwnedRow, RetireResult } from "./types";

/** 상세 영역의 상태 단추. 이름은 서버 action(권한 키)과 같다. 계정 재생성만 reRegCmUser. */
export type StateAction = "unlock" | "suspend" | "resume" | "retire" | "handover" | "reRegCmUser";

/** 상태 단추 문구. */
export const STATE_ACTION_LABEL: Record<StateAction, string> = {
  unlock: "잠금 해제",
  suspend: "비활성화",
  resume: "다시 사용",
  retire: "퇴직 처리",
  handover: "담당 데이터 인계",
  reRegCmUser: "계정 재생성",
};

/** 상태 이름(서버 USER_ST_NM 이 없을 때). */
export const USER_ST_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  LOCKED: "잠금",
  SUSPENDED: "비활성",
  EXPIRED: "기한 밖",
  RETIRED: "퇴직",
};

/** 조회 영역 상태 칸. 기본은 전체(시안과 같다). */
export const USER_ST_SEARCH_OPTIONS = [
  { value: "", label: "전체" },
  { value: "ACTIVE", label: "활성" },
  { value: "LOCKED", label: "잠금" },
  { value: "SUSPENDED", label: "비활성" },
  { value: "EXPIRED", label: "기한 밖" },
  { value: "RETIRED", label: "퇴직" },
];

/** 조회 영역 관리 구분 칸. */
export const MANAGE_TP_SEARCH_OPTIONS = [
  { value: "", label: "전체" },
  { value: "HR", label: "ERP 인사" },
  { value: "MANUAL", label: "수동 관리만" },
];

/** 관리 구분 표시 — MANUAL = 외부 구분 O(협력업체·부산 운영팀). */
export function manageLabel(manageTp: unknown): string {
  return manageTp === "MANUAL" ? "수동 관리" : manageTp === "HR" ? "ERP 인사" : "";
}

/** 상태 배지 색(의미 토큰 이름 — Badge tone 과 같다). */
export type StTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function stTone(st: unknown): StTone {
  switch (st) {
    case "ACTIVE":
      return "success";
    case "LOCKED":
      return "warning";
    case "SUSPENDED":
      return "primary";
    case "RETIRED":
      return "danger";
    default:
      return "neutral"; // EXPIRED·값 없음
  }
}

/** 배지 tone → 그리드 배지(GridBadge) 색 토큰 쌍. neutral 은 회색 기본. */
export function toneColors(tone: StTone): { bg?: string; color?: string } {
  if (tone === "neutral") return {};
  return { bg: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` };
}

type StateRow = Pick<CommUserMngRow, "USER_ST" | "USE_TP" | "HR_ST" | "MANAGE_TP">;

/** 인사 휴직만으로 막힌 계정 — 관리자가 풀 수 없다(D5). 「다시 사용」을 보이지 않는다. */
export function isHrLeaveOnly(row: StateRow): boolean {
  return row.USER_ST === "SUSPENDED" && row.HR_ST === "LEAVE" && row.USE_TP === "Y";
}

/** 관리자 비활성(USE_TP='N') — 「다시 사용」으로 푼다. */
export function isAdminSuspended(row: StateRow): boolean {
  return row.USER_ST === "SUSPENDED" && row.USE_TP === "N";
}

/**
 * 상태별로 상세 영역에 보일 단추(순서 그대로). 권한은 보지 않는다 — 권한 없는 단추는 화면이 비활성으로 그린다.
 *
 * <ul>
 *   <li>활성: 비활성화 · 퇴직 처리</li>
 *   <li>잠금: 잠금 해제 · 비활성화 · 퇴직 처리</li>
 *   <li>비활성: 다시 사용(관리자 비활성만) · 퇴직 처리</li>
 *   <li>기한 밖: 퇴직 처리 (계속 쓰려면 유효기한일을 고쳐 저장한다)</li>
 *   <li>퇴직: 담당 데이터 인계(남은 담당 데이터가 있을 때) · 계정 재생성(ERP 인사 퇴직이 아닐 때 — 재입사는 인사 입사 정보로)</li>
 * </ul>
 *
 * @param ownedCnt 퇴직자의 남은 담당 데이터 건수. 모르면 null.
 */
export function stateActionsOf(row: StateRow | null | undefined, ownedCnt: number | null): StateAction[] {
  if (!row) return [];
  switch (row.USER_ST) {
    case "ACTIVE":
      return ["suspend", "retire"];
    case "LOCKED":
      return ["unlock", "suspend", "retire"];
    case "SUSPENDED":
      return isAdminSuspended(row) ? ["resume", "retire"] : ["retire"];
    case "EXPIRED":
      return ["retire"];
    case "RETIRED": {
      const out: StateAction[] = [];
      if (ownedCnt != null && ownedCnt > 0) out.push("handover");
      if (row.HR_ST !== "RETIRED") out.push("reRegCmUser");
      return out;
    }
    default:
      return []; // 신규 행(아직 저장 전)
  }
}

/** 상태별 안내 문구(시안의 상세 영역 안내). */
export function stateNotes(row: StateRow | null | undefined, ownedCnt: number | null): string[] {
  if (!row || !row.USER_ST) return [];
  const notes: string[] = [];
  switch (row.USER_ST) {
    case "LOCKED":
      notes.push("시스템이 잠갔습니다. 잠금 해제는 비밀번호를 바꾸지 않고 실패 횟수만 0으로 돌립니다.");
      break;
    case "SUSPENDED":
      if (isHrLeaveOnly(row)) {
        notes.push("ERP 인사 휴직입니다. 인사 복직 정보가 오면 자동으로 풀립니다. 관리자가 풀 수 없습니다.");
      } else if (row.HR_ST === "LEAVE") {
        notes.push("관리자 비활성과 ERP 인사 휴직이 함께 걸려 있습니다. 「다시 사용」은 관리자 비활성만 풉니다.");
      } else {
        notes.push("「다시 사용」을 누르면 바로 예전처럼 씁니다.");
      }
      notes.push("역할과 담당 데이터는 그대로 있습니다.");
      break;
    case "EXPIRED":
      notes.push("유효 기간 밖이라 로그인할 수 없습니다. 계속 쓰려면 유효기한일을 고쳐 저장하세요.");
      break;
    case "RETIRED":
      if (ownedCnt != null && ownedCnt > 0) notes.push(`담당 데이터 ${ownedCnt}건이 아직 이 사람에게 있습니다. 인계가 필요합니다.`);
      else if (ownedCnt === 0) notes.push("역할 회수와 인계가 끝났습니다.");
      if (row.HR_ST === "RETIRED") notes.push("ERP 인사에서 퇴직한 사람입니다. 재입사는 인사 입사 정보로 처리합니다.");
      else notes.push("계정 재생성은 역할 없이 새로 시작합니다.");
      break;
    default:
      break;
  }
  if (row.MANAGE_TP === "MANUAL" && row.USER_ST !== "RETIRED") {
    notes.push("수동 관리 계정입니다. 그만두면 ERP에서 알려 주지 않습니다. 관리자가 직접 비활성·퇴직 처리합니다.");
  }
  return notes;
}

/** 날짜·시각 값 → "yyyy-MM-dd HH:mm" (못 읽으면 ""). 서버 LocalDateTime ISO 또는 "yyyy-MM-dd HH:mm:ss". */
export function fmtDateTime(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(s);
  if (!m) return "";
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

/** 로그인한 본인 계정인가(대소문자 무시). me 가 비면 false. */
export function isSelf(userId: unknown, me: string): boolean {
  return !!me && String(userId ?? "").trim().toLowerCase() === me.trim().toLowerCase();
}

/** yyyyMMdd 에 n 일을 더한다(달력 계산, 시간대 무관). */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 임시 비밀번호를 쓸 수 있는 기간 문구(시안 D10) — 초기화는 그날 23:59, 새 계정은 7일 뒤 23:59.
 * 날짜는 KST 오늘 기준(서버 판정과 같다).
 */
export function tempPwdUntil(kind: "reset" | "new", now: Date = new Date()): string {
  const today = todayYmd(now);
  return kind === "new" ? `7일 뒤(${fmtYmd(addDaysYmd(today, 7))}) 23:59까지` : `오늘(${fmtYmd(today)}) 23:59까지`;
}

/** yyyyMMdd → yyyy-MM-dd (그 밖은 그대로). */
export function fmtYmd(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

/** 담당 데이터 합계(건너뛴 항목 포함). */
export function ownedTotal(rows: readonly OwnedRow[] | null | undefined): number {
  return (rows ?? []).reduce((n, r) => n + (Number(r.CNT) || 0), 0);
}

/** MDM 담당 종류 — ERD 작업 중 표시. 넘기지 않고 퇴직 때 지운다(MDM UserOwnershipKind.ERD_CLAIM). */
export const CLAIM_KIND = "ERD_CLAIM";

/**
 * 퇴직 미리 보기의 담당 데이터를 「넘길 것」과 「ERD 작업 중 표시」로 나눈다.
 * claims 는 서버 CLAIM_CNT 가 있으면 그것을, 없으면 ERD_CLAIM 행의 합을 쓴다.
 */
export function splitOwned(
  rows: readonly OwnedRow[] | null | undefined,
  claimCnt?: number | null,
): { owned: OwnedRow[]; claims: number } {
  const all = rows ?? [];
  const owned = all.filter((r) => r.KIND !== CLAIM_KIND);
  const fromRows = ownedTotal(all.filter((r) => r.KIND === CLAIM_KIND));
  const claims = claimCnt == null || Number.isNaN(Number(claimCnt)) ? fromRows : Number(claimCnt);
  return { owned, claims };
}

/** 받을 사람 후보 행 → 찾기 팝업 행. 이름 칸은 「이름 · 부서(없으면 부서코드) · 잠금」. */
export function lovRowToLookup(r: ActiveUserLovRow): { code: string; name: string } {
  return {
    code: String(r.USER_ID ?? ""),
    name: [r.USER_NM, r.DEPT_NM || r.DEPT_CD, r.USER_ST === "LOCKED" ? "잠금" : null].filter(Boolean).join(" · "),
  };
}

/** 담당 데이터 요약 — 「MDM 코드 12 · 룰 3」. */
export function ownedSummary(rows: readonly OwnedRow[] | null | undefined): string {
  return (rows ?? [])
    .filter((r) => (Number(r.CNT) || 0) > 0)
    .map((r) => `${r.KIND_NM || r.KIND || "기타"} ${Number(r.CNT) || 0}`)
    .join(" · ");
}

/** 결과 안내 — 문구와 수준(success = 토스트, warning = 알림 창). */
export interface ResultNotice {
  text: string;
  level: "success" | "warning";
}

/** 인계 결과 문구. DONE 이면 넘긴 건수·건너뛴 건수, PENDING·FAILED 이면 서버 문구. */
export function handoverText(res: HandoverResult, toLabel: string): ResultNotice {
  if (res.HANDOVER_ST === "DONE") {
    const items = res.HANDOVER_ITEMS ?? [];
    const moved = ownedTotal(items.filter((r) => r.SKIPPED !== "Y"));
    const skipped = ownedTotal(items.filter((r) => r.SKIPPED === "Y"));
    if (moved === 0 && skipped === 0) return { text: "넘길 담당 데이터가 없었습니다.", level: "success" };
    const text = `담당 데이터 ${moved}건을 ${toLabel}에게 넘겼습니다.` + (skipped > 0 ? ` ${skipped}건은 넘기지 못했습니다.` : "");
    return { text, level: skipped > 0 ? "warning" : "success" };
  }
  const msg = res.HANDOVER_MSG?.trim() || "담당 데이터는 「인계 대기」로 남았습니다.";
  return { text: msg.endsWith(".") ? msg : `${msg}.`, level: res.HANDOVER_ST === "FAILED" ? "warning" : "success" };
}

/** 퇴직 처리 결과 문구. */
export function retireText(userNm: string, res: RetireResult, toLabel: string | null, hadOwned: boolean): ResultNotice {
  const parts = [`${userNm} 계정을 퇴직 처리했습니다.`];
  const rg = Number(res.ROLE_GROUP_CNT) || 0;
  const as = Number(res.ASSIGN_CNT) || 0;
  if (rg > 0) parts.push(`역할그룹 ${rg}개를 회수했습니다.`);
  if (as > 0) parts.push(`사용자 쿼리 배정 ${as}건을 해제했습니다.`);
  let level: ResultNotice["level"] = "success";
  if (toLabel || res.HANDOVER_ST === "FAILED" || hadOwned) {
    const h = handoverText(res, toLabel ?? "");
    parts.push(h.text);
    level = h.level;
  }
  return { text: parts.join(" "), level };
}

/** 사유 + 메모 → 서버 REASON(이력 DESCRIPTION 300자 안). 「기타」 는 메모가 곧 사유다. */
export function joinReason(reason: string, memo: string, etc = "기타"): string {
  const r = reason.trim();
  const m = memo.trim();
  if (r === etc) return m;
  return m ? `${r} · ${m}` : r;
}

/** 퇴직 사유(시안). */
export const RETIRE_REASONS = ["퇴사", "계약 종료", "타 법인 전출", "기타"] as const;
/** 비활성 사유(시안·서버 DTO 주석). 휴직은 ERP 인사에서 받으므로 여기 없다(D5). */
export const SUSPEND_REASONS = ["장기 출장", "보안 점검", "업체 요청", "기타"] as const;

/** ERP 인사 정보 구분 이름. */
export const HR_EVT_TP_LABEL: Record<string, string> = {
  HIRE: "입사",
  LEAVE: "휴직",
  RETURN: "복직",
  RETIRE: "퇴직",
  MOVE: "부서 이동",
  INFO: "이름·연락처 변경",
};

/** ERP 인사 정보 처리 상태 이름. */
export const HR_PROC_ST_LABEL: Record<string, string> = {
  WAIT: "대기",
  DONE: "완료",
  SKIP: "건너뜀",
  FAIL: "실패",
  HOLD: "계정 생성 대기",
};

export function hrProcTone(st: unknown): StTone {
  switch (st) {
    case "DONE":
      return "success";
    case "FAIL":
      return "danger";
    case "HOLD":
      return "warning";
    case "WAIT":
      return "primary";
    default:
      return "neutral";
  }
}

/** ERP 인사 연동 조회 조건(처리 상태). 빈 값 = 서버 기본(FAIL·HOLD·WAIT). */
export const HR_PROC_ST_OPTIONS = [
  { value: "", label: "처리할 것(실패·계정 생성 대기·대기)" },
  { value: "FAIL", label: "실패" },
  { value: "HOLD", label: "계정 생성 대기" },
  { value: "WAIT", label: "대기" },
  { value: "DONE", label: "완료" },
  { value: "SKIP", label: "건너뜀" },
  { value: "WAIT,DONE,SKIP,FAIL,HOLD", label: "전체" },
];

/** 다시 처리 결과 요약. */
export function retrySummary(results: readonly { PROC_ST?: string }[]): ResultNotice {
  const done = results.filter((r) => r.PROC_ST === "DONE" || r.PROC_ST === "SKIP").length;
  const left = results.length - done;
  if (left === 0) return { text: `${results.length}건을 처리했습니다.`, level: "success" };
  return { text: `${results.length}건 중 ${done}건을 처리했습니다. ${left}건은 아직 처리하지 못했습니다.`, level: "warning" };
}
