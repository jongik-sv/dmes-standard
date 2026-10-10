/**
 * erdEdit 화면의 OASIS 호출 — `POST /api/mdm/oasis/erdEdit/{action}`(단계 0 BPMN + 단계 1 의 kind·import).
 * - OASIS params 는 배열을 싣지 못하므로 viewJson·commandsJson 은 JSON 문자열로 보낸다.
 * - search 응답은 목록이라 `data.result` 가 배열이다. 공통 계약(merge "data+result")은 객체만 펴므로 `result` 를 그대로 읽는다.
 * - save·import 의 명령 거절(INVALID·CONFLICT·NOT_EDITOR 등)은 성공 응답의 `applied=false`·`rejection` 으로 온다. 던지지 않는다.
 *   업무 오류(MDM0xx, 권한 등)는 `meta.success=false` 라 Error 로 던진다.
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import type {
  ErdApplyResult, ErdChangesView, ErdDbDiffView, ErdImportResult, ErdModelRow, ErdModelView, ErdRejection, ErdStatusView, ErdViewState,
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
};

const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(FIELD_LABELS), errorFactory: plainError };

function call<T>(action: string, params: object): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SCREEN_ID, action, params, undefined, OASIS);
}

export async function searchModels(): Promise<ErdModelRow[]> {
  const out = await call<{ result?: unknown }>("search", {});
  return Array.isArray(out.result) ? (out.result as ErdModelRow[]) : [];
}

/** 모델 전체. ver 를 빼면 서버가 DRAFT, 없으면 최신 RELEASED 를 고른다. */
export function viewModel(modelId: string, ver?: string | null): Promise<ErdModelView> {
  return call("view", { modelId, ver });
}

/** sinceRev 뒤의 변경 기록(500건 초과·다시 읽기 지점이면 reload=true). */
export function viewChanges(modelId: string, sinceRev: number): Promise<ErdChangesView> {
  return call("view", { modelId, sinceRev });
}

export function viewStatus(modelId: string, ver?: string | null): Promise<ErdStatusView> {
  return call("view", { modelId, ver, kind: "STATUS" });
}

/** 화면 상태 알리기(S1). SSE 에 연결된 세션만 받는다(아니면 INVALID). */
export function setViewState(modelId: string, session: string, view: ErdViewState): Promise<{ ok: boolean }> {
  return call("view", { modelId, session, kind: "SET_VIEW", viewJson: JSON.stringify(view) });
}

export function compareDbDiff(modelId: string): Promise<ErdDbDiffView> {
  return call("compare", { modelId, kind: "DB_DIFF" });
}

export interface RegInput {
  modelId: string;
  moduleId: string;
  schemaName: string;
  modelName: string;
}

export function regModel(input: RegInput): Promise<{ modelId: string }> {
  return call("reg", input);
}

/** 첫 가져오기(S3). 표가 이미 있으면 applied=false·INVALID. */
export function importFromDb(modelId: string, baseRev: number, session: string): Promise<ErdImportResult> {
  return call("import", { modelId, baseRev, session, source: "UI", kind: "FROM_DB" });
}

export type RelationDecision = "confirmRelation" | "rejectRelation";

/** 관계 확정·기각(S14) — save 에 명령 하나. */
export function decideRelation(modelId: string, baseRev: number, session: string, op: RelationDecision, relationId: string): Promise<ErdApplyResult> {
  return call("save", { modelId, baseRev, session, source: "UI", commandsJson: JSON.stringify([{ op, id: relationId }]) });
}

/** 거절 문구 — 다음에 할 일(hint)까지 붙인다(스펙 4.5). */
export function rejectionText(r: ErdRejection | null): string {
  if (!r) return "요청이 거절되었습니다.";
  return r.hint ? `${r.message} — ${r.hint}` : r.message;
}
