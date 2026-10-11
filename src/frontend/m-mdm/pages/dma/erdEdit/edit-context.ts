/**
 * 편집 문맥(README "화면 내부 계약") — 패널·캔버스가 받는 한 묶음. FE2·FE3 은 이 이름·모양을 그대로 쓴다(S2-19).
 * 거절 → 알림 변환, 다이어그램 명령 판정도 여기 둔다(순수).
 */
import type { ErdCommandJson, ErdRejection, ErdState, ErdStatusView, ErdWarning } from "./types";

export interface Right { ok: boolean; reason: string | null }
export interface EditRights { model: Right; diagram: Right; confirm: Right; manageEditors: Right; owner: boolean }

export type ErdNoticeCode = "CONFLICT" | "NOT_FOUND" | "INVALID" | "NEEDS_CHOICE" | "NOT_EDITOR" | "NETWORK" | "RELOAD";
export interface ErdNotice {
  code: ErdNoticeCode;
  label: string; message: string; hint: string | null; commandIndex: number | null; elementId: string | null;
  property: string | null; byRev: number | null; byUserId: string | null; bySession: string | null;
  current: unknown; mine: unknown; choices: unknown;
}
export type ApplyOutcome = { ok: true; rev: number; warnings: ErdWarning[] } | { ok: false; notice: ErdNotice };

export interface ErdNav {
  selectTable(tableId: string): void;
  /** 그 컬럼의 표를 고르고 selectedColumnId 를 둔다(그리드가 그 행으로 간다, FE3). */
  selectColumn(columnId: string): void;
  openTableFind(): void;
  openColumnJump(): void;
  /** 그 표를 고르고 속성 패널을 연 뒤 컬럼 입력 칸에 초점을 준다. pk 면 PK 모드. 권한은 부른 쪽이 본다. */
  startColumnAdd(tableId: string, pk: boolean): void;
  /** 그 다이어그램을 연다(왼쪽 목록 누르기와 같다). 모르는 id 면 아무것도 안 함. 주제별 나누기 뒤 FE2 가 부른다(U53). */
  selectDiagram(diagramId: string): void;
}
export interface ErdHighlight { code: ErdNotice["code"]; elementId: string; property: string | null; message: string; mine: unknown }

export type MessageTone = "info" | "warn" | "error";

/** 감사 컬럼 보기(사람마다 다른 보기 상태, audit-columns.ts). 켜면 캔버스 노드·컬럼 그리드에 감사 컬럼 8개가 보인다. */
export interface AuditView {
  show: boolean;
  setShow(show: boolean): void;
}

export interface ErdEditContext {
  modelId: string; session: string; me: string; state: ErdState; status: ErdStatusView | null;
  rights: EditRights; diagramId: string | null; selectedTableId: string | null;
  /** 고른 컬럼. 표를 바꾸면 null. */
  selectedColumnId: string | null;
  /** 마지막 CONFLICT·NOT_FOUND·INVALID 의 칸(그리드 칸 강조·칸 아래 빨간 문구·노드 강조). 알림을 닫으면 null. */
  highlight: ErdHighlight | null;
  /** queued·sending·held 묶음이 건드리는 요소 id(흐린 자리표시, S2-18). Task 9 에서는 늘 비어 있다. */
  pendingIds: ReadonlySet<string>;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  /** 내 쓰기 줄이 빌 때까지 기다렸다가 fn 을 돌린다. 도는 동안 다음 묶음을 보내지 않는다. import 계열 쓰기(FROM_DB·APPLY_DIFF)용. */
  /** 내 쓰기 줄이 빌 때까지 기다렸다가 fn 을 돈다. fn 안에서 apply 를 부르지 않는다(같은 줄을 기다려 멈춘다). */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  clearHighlight(): void;
  notify(message: string, tone?: MessageTone): void;
  nav: ErdNav;
  audit: AuditView;
}

export const NOTICE_LABEL: Readonly<Record<ErdNoticeCode, string>> = {
  CONFLICT: "충돌", NOT_FOUND: "이미 지워짐", INVALID: "규칙 위반", NEEDS_CHOICE: "선택 필요",
  NOT_EDITOR: "편집 권한 없음", NETWORK: "연결 문제", RELOAD: "다시 읽음",
};

const SERVER_CODES: ReadonlySet<string> = new Set(["CONFLICT", "NOT_FOUND", "INVALID", "NEEDS_CHOICE", "NOT_EDITOR"]);

/** 다이어그램 명령(버전 밖, R9-2). Java ErdDiagramCommand.isDiagramOp 와 같은 목록이다. */
const DIAGRAM_OPS: ReadonlySet<string> = new Set([
  "addDiagram", "updateDiagram", "deleteDiagram", "placeTables", "moveNodes", "setFold", "removeFromDiagram", "restoreDiagram",
]);

export function isDiagramOp(op: string): boolean {
  return DIAGRAM_OPS.has(op);
}

/** 알림에 넣을 값 글. 글자는 따옴표로 감싼다. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return "(없음)";
  return typeof v === "string" ? `"${v}"` : JSON.stringify(v);
}

/** 서버 거절이 아닌 알림(끊김·권한·다시 읽음). */
export function localNotice(code: ErdNoticeCode, message: string, hint: string | null = null): ErdNotice {
  return {
    code, label: NOTICE_LABEL[code], message, hint, commandIndex: null, elementId: null, property: null,
    byRev: null, byUserId: null, bySession: null, current: null, mine: null, choices: null,
  };
}

/**
 * 서버 거절 → 알림(스펙 4.5). 바꾼 사람은 사용자 ID(byUserId), 없으면 세션 이름이다(S2-13).
 * mine 은 거절된 명령의 set[property] — CONFLICT 의 [내 값 복사] 가 쓴다.
 */
export function noticeFromRejection(r: ErdRejection | null, commands: readonly ErdCommandJson[]): ErdNotice {
  if (!r) return localNotice("INVALID", "서버가 묶음을 받아들이지 않았습니다.", "다시 보내 보세요. 계속되면 모델을 다시 읽으세요.");
  const code: ErdNoticeCode = SERVER_CODES.has(r.code) ? (r.code as ErdNoticeCode) : "INVALID";
  const cmd = commands[r.commandIndex];
  const set = cmd && typeof cmd.set === "object" && cmd.set !== null ? (cmd.set as Record<string, unknown>) : null;
  const mine = r.property && set && r.property in set ? set[r.property] : null;
  const byUserId = r.byUserId ?? null;
  const who = byUserId ?? r.bySession ?? null;
  let message = r.message;
  if (code === "CONFLICT" && r.byRev != null && who) message = `${who} 님이 rev ${r.byRev} 에서 먼저 바꿨습니다. 지금 값: ${valueText(r.current)}`;
  if (code === "NOT_FOUND" && r.byRev != null && who) message = `${who} 님이 rev ${r.byRev} 에서 지웠습니다.`;
  return {
    code, label: NOTICE_LABEL[code], message, hint: r.hint, commandIndex: r.commandIndex, elementId: r.elementId, property: r.property,
    byRev: r.byRev ?? null, byUserId, bySession: r.bySession ?? null, current: r.current, mine, choices: r.choices,
  };
}
