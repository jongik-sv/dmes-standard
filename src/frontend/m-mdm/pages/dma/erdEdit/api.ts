/**
 * erdEdit 화면의 OASIS 호출 — `POST /api/mdm/oasis/erdEdit/{action}`(단계 0 BPMN + 단계 1·2 의 kind).
 * - OASIS params 는 배열을 싣지 못하므로 viewJson·commandsJson·itemsJson 은 JSON 문자열로 보낸다.
 * - search 는 서비스가 목록(List)을 돌려주므로 OASIS 가 `data.result` 가 아니라 `grids.result.rows` 로 싣는다.
 *   그래서 search 만 `includeGrids` 로 불러 그 행을 `result` 로 올려 읽는다(다른 액션은 객체라 `data.result` 다).
 * - save·restore·import 의 명령 거절(INVALID·CONFLICT·NOT_EDITOR 등)은 성공 응답의 `applied=false`·`rejection` 으로 온다. 던지지 않는다.
 *   업무 오류(MDM0xx, 권한, 확정 검사 등)는 `meta.success=false` 라 Error 로 던진다.
 * - 화면 레인 FE2·FE3 은 이 파일을 고치지 않는다. 더 필요한 호출은 자기 파일에서 erdCall 로 만든다(S2-19).
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import type {
  ErdApplyResult, ErdChangesView, ErdClaimResult, ErdCommandJson, ErdConfirmCheck, ErdDbDiffView, ErdDiffApplyResult, ErdImportResult,
  ErdModelRow, ErdModelView, ErdNamePreview, ErdRejection, ErdStatusView, ErdViewState,
} from "./types";

export const SCREEN_ID = "erdEdit";

/** 서버 field → 화면 항목명(오류 문구용). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  MODEL_ID: "모델 ID",
  MODULE_ID: "모듈",
  SCHEMA_NAME: "스키마",
  MODEL_NAME: "모델 이름",
  BASE_REV: "기준 rev",
  VIEW_JSON: "화면 상태",
  ROW_VERSION: "행 버전",
  USER_ID: "사용자 ID",
  TABLE_ID: "표",
};

const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(FIELD_LABELS), errorFactory: plainError };

/** 목록 응답(`grids.<이름>.rows`)을 결과의 `<이름>` 으로 올린다. */
const OASIS_GRIDS: OasisCallOptions = { ...OASIS, includeGrids: true };

/** erdEdit 액션 하나(객체 결과). 값은 `data.result` 다. */
export function erdCall<T>(action: string, params: object): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SCREEN_ID, action, params, undefined, OASIS);
}

/** 모델 목록 — 서버는 `grids.result.rows` 로 준다(BPMN searchTask output=result, 반환형 List). */
export async function searchModels(): Promise<ErdModelRow[]> {
  const out = await callOasisAt<{ result?: unknown }>(MDM_OASIS_BASE, SCREEN_ID, "search", {}, undefined, OASIS_GRIDS);
  return Array.isArray(out.result) ? (out.result as ErdModelRow[]) : [];
}

/**
 * 스키마 이름 목록(search kind=SCHEMAS, 2차 §7.2) — 새 모델 등록 창이 고른다. 서버가 행을 이름 글이나 `{schemaName|name}` 로 줄 수 있어 둘 다 읽는다.
 * 실패하거나 비면 빈 목록이다(화면은 직접 입력을 받는다). 던지지 않는다.
 */
export async function searchSchemas(): Promise<string[]> {
  try {
    const out = await callOasisAt<{ result?: unknown }>(MDM_OASIS_BASE, SCREEN_ID, "search", { kind: "SCHEMAS" }, undefined, OASIS_GRIDS);
    if (!Array.isArray(out.result)) return [];
    const names = out.result.map((r) => {
      if (typeof r === "string") return r;
      const o = r as { schemaName?: unknown; name?: unknown };
      return String(o?.schemaName ?? o?.name ?? "");
    });
    return names.filter((n) => n !== "");
  } catch {
    return [];
  }
}

/** 모델 전체. ver 를 빼면 서버가 DRAFT, 없으면 최신 RELEASED 를 고른다. */
export function viewModel(modelId: string, ver?: string | null): Promise<ErdModelView> {
  return erdCall("view", { modelId, ver });
}

/** sinceRev 뒤의 변경 기록(500건 초과·다시 읽기 지점이면 reload=true). */
export function viewChanges(modelId: string, sinceRev: number): Promise<ErdChangesView> {
  return erdCall("view", { modelId, sinceRev });
}

export function viewStatus(modelId: string, ver?: string | null): Promise<ErdStatusView> {
  return erdCall("view", { modelId, ver, kind: "STATUS" });
}

/** 화면 상태 알리기(S1). SSE 에 연결된 세션만 받는다(아니면 INVALID). */
export function setViewState(modelId: string, session: string, view: ErdViewState): Promise<{ ok: boolean }> {
  return erdCall("view", { modelId, session, kind: "SET_VIEW", viewJson: JSON.stringify(view) });
}

export function compareDbDiff(modelId: string): Promise<ErdDbDiffView> {
  return erdCall("compare", { modelId, kind: "DB_DIFF" });
}

export interface RegInput {
  modelId: string;
  moduleId: string;
  schemaName: string;
  modelName: string;
}

export function regModel(input: RegInput): Promise<{ modelId: string }> {
  return erdCall("reg", input);
}

/** 첫 가져오기(S3). 표가 이미 있으면 applied=false·INVALID. 화면은 ctx.exclusive 안에서 부른다. */
export function importFromDb(modelId: string, baseRev: number, session: string): Promise<ErdImportResult> {
  return erdCall("import", { modelId, baseRev, session, source: "UI", kind: "FROM_DB" });
}

/** 명령 묶음(save). 1~200건, 모델·다이어그램 명령을 섞어도 된다. 화면은 ctx.apply 로만 부른다. */
export function applyCommands(modelId: string, baseRev: number, session: string, commands: ErdCommandJson[]): Promise<ErdApplyResult> {
  return erdCall("save", { modelId, baseRev, session, source: "UI", commandsJson: JSON.stringify(commands) });
}

export type RelationDecision = "confirmRelation" | "rejectRelation";

/** 관계 확정·기각 — 명령 하나짜리 applyCommands(단계 1 이름을 남긴다). */
export function decideRelation(modelId: string, baseRev: number, session: string, op: RelationDecision, relationId: string): Promise<ErdApplyResult> {
  return applyCommands(modelId, baseRev, session, [{ op, id: relationId }]);
}

/** 되돌리기(restore) — 그 rev 의 역명령을 새 rev 로 넣는다. 바뀐 것이 없으면 INVALID(S2-24). */
export function undoRev(modelId: string, rev: number, session: string): Promise<ErdApplyResult> {
  return erdCall("restore", { modelId, rev, session, source: "UI" });
}

/** 논리명 → 물리명(또는 반대) 미리보기. 명령을 보내지 않는다. 300ms 디바운스와 늦은 응답 버리기는 부르는 쪽이 한다(§37). */
export function previewName(input: { logical?: string; phys?: string }): Promise<ErdNamePreview> {
  return erdCall("compare", { logical: input.logical, phys: input.phys });
}

/** 다시 가져오기 반영(S2-14). itemIds 는 compare kind=DB_DIFF 의 items[].id. 화면은 ctx.exclusive 안에서 부른다. */
export function applyDbDiff(modelId: string, baseRev: number, session: string, itemIds: string[]): Promise<ErdDiffApplyResult> {
  return erdCall("import", { modelId, baseRev, session, source: "UI", kind: "APPLY_DIFF", itemsJson: JSON.stringify(itemIds) });
}

/** 작업 중 표시(TTL 600초). 단계 2 서버는 쥔 세션 정보를 돌려준다(S2-26). */
export function claimTable(modelId: string, tableId: string, session: string): Promise<ErdClaimResult> {
  return erdCall("execute", { modelId, kind: "CLAIM", tableId, session, source: "UI" });
}

export function releaseTable(modelId: string, tableId: string, session: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "RELEASE", tableId, session, source: "UI" });
}

/** 공동 편집자 더하기·빼기 — DRAFT 소유자만(서버 판정). */
export function addEditor(modelId: string, userId: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "ADD_EDITOR", userId });
}

export function removeEditor(modelId: string, userId: string): Promise<{ ok: boolean }> {
  return erdCall("execute", { modelId, kind: "REMOVE_EDITOR", userId });
}

/** 새 버전(copy) — 직전 RELEASED 를 복사한 DRAFT. 서버가 reload 를 보낸다. */
export function newVersion(modelId: string, verKind: "MAJOR" | "MINOR"): Promise<{ ver: string }> {
  return erdCall("copy", { modelId, verKind });
}

export function deleteDraft(modelId: string, ver: string, rowVersion: number): Promise<{ ok: boolean }> {
  return erdCall("delete", { modelId, ver, rowVersion });
}

/**
 * 모델 완전 삭제(2차 §7.2) — 되돌리기 없음. 화면 확인 창에서 모델 ID 를 입력해야 부른다.
 * 거절(권한)은 업무 오류로 던져진다 — 문구를 그대로 보인다.
 */
export function deleteModel(modelId: string): Promise<{ ok: boolean }> {
  return erdCall("delete", { modelId, kind: "MODEL" });
}

export function lockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }> {
  return erdCall("lock", { modelId, ver, rowVersion });
}

export function unlockDraft(modelId: string, ver: string, rowVersion: number): Promise<{ rowVersion: number }> {
  return erdCall("unlock", { modelId, ver, rowVersion });
}

/** 확정 전 검사(D19) — 확정 때와 같은 검사를 미리 부른다. */
export function validateConfirm(modelId: string): Promise<ErdConfirmCheck> {
  return erdCall("validate", { modelId });
}

/**
 * 확정. 경고가 있으면 warningsAcknowledged=true 여야 한다(아니면 MDM014 를 던진다).
 * applyFrom 은 적용 시작 시각 `yyyy-MM-dd HH:mm:ss`(RuleConfirmService.parseApplyFrom). 서버는 이 값을 요구한다.
 * 미래 시각으로 확정하면 그 시각 전까지 `copy` 가 MDM006 으로 막힌다. 화면 기본값은 지금 시각이다(Task 11).
 */
export function confirmVersion(
  modelId: string, ver: string, rowVersion: number, warningsAcknowledged: boolean, applyFrom: string,
): Promise<{ ok: boolean }> {
  return erdCall("confirm", { modelId, ver, rowVersion, warningsAcknowledged, applyFrom });
}

/** 거절 문구 — 사람용 안내(userHint)가 있으면 붙인다(스펙 4.5, U27). LLM 용 hint 는 보이지 않는다. */
export function rejectionText(r: ErdRejection | null): string {
  if (!r) return "요청이 거절되었습니다.";
  return r.userHint ? `${r.message} — ${r.userHint}` : r.message;
}
