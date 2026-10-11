/**
 * 사람이 읽는 문구 사전(UX 1차 U30) — 서버 코드·영어 값을 한국어로. 모르는 값은 원문을 그대로 돌려준다(숨기지 않음).
 * 화면 여러 곳(검토 패널·변경 기록·확정 창·도구 막대)이 함께 쓴다. 순수.
 */
import type { ErdSource } from "./types";

export const ISSUE_LABEL: Readonly<Record<string, string>> = {
  ERD_STD_TYPE: "타입 불일치", ERD_STD_DOMAIN: "도메인 다름", ERD_STD_MISS: "사전 없음", ERD_INFERRED_LEFT: "검토 안 한 추정 관계",
};
export const EVIDENCE_LABEL: Readonly<Record<string, string>> = { DOC: "설계 문서", SQL_JOIN: "SQL 조인", NAME_RULE: "이름 규칙" };
export const SOURCE_LABEL: Readonly<Record<ErdSource, string>> = { UI: "화면", MCP: "Claude", CLI: "CLI", SYSTEM: "시스템" };
// "key" 는 따옴표로 둔다 — 맨 이름 `key:` 는 컬럼 사전 연결 고정 시험(ui-meta-lock)이 열 정의로 읽는다.
export const KIND_LABEL: Readonly<Record<string, string>> = {
  table: "표", column: "컬럼", "key": "키", relation: "관계", diagram: "다이어그램", diagramNode: "표 자리",
};

export const issueLabel = (code: string): string => ISSUE_LABEL[code] ?? code;

/** 경로 꼴 ref 는 마지막 조각(파일:줄)만. 원문은 부른 쪽이 title 로 보인다. */
export function evidenceText(e: { kind: string; ref: string }): string {
  const ref = e.ref.includes("/") ? e.ref.slice(e.ref.lastIndexOf("/") + 1) : e.ref;
  return `${EVIDENCE_LABEL[e.kind] ?? e.kind} ${ref}`.trim();
}

const AT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** 서버 at(yyyy-MM-ddTHH:mm:ss, 서버 지역 시각) → 오늘이면 "HH:mm", 아니면 "MM-dd HH:mm". */
export function timeText(at: string | null | undefined, now: Date = new Date()): string {
  const m = at ? AT_RE.exec(at) : null;
  if (!m) return "";
  const [, y, mo, d, h, mi] = m;
  const today = Number(y) === now.getFullYear() && Number(mo) === now.getMonth() + 1 && Number(d) === now.getDate();
  return today ? `${h}:${mi}` : `${mo}-${d} ${h}:${mi}`;
}
