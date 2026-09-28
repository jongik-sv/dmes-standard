/**
 * codeMng 오른쪽 상세(옛 codeEdit)의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/codeEdit/{action}`(TSK-06-02
 * design.md §6.1, 2026-09-28 통합 D-101·D-102). view(읽기), save(saveHeader)·execute(deprecate)·reg(createVersion)·
 * restore(restoreVersion)·delete(deleteDraft 또는 deleteCode)·lock(acquire)·unlock(release)·handover(handover).
 * lock·unlock·handover 는 ADR-0003 D5 권장 이름을 문자열로만 쓴다 — BFF 권한은 TSK-08-02 머지 뒤 연결(D-075).
 * 모든 쓰기는 헤더 `auditVer` 또는 선택 버전의 `rowVersion` 을 함께 보낸다. 코드 선택은 codeMng 왼쪽 목록이 하므로
 * 옛 `search`(코드 옵션 조회)는 없앴다 — 목록 조회는 `./api` 의 `searchCodes` 를 쓴다.
 */
import { callMdmOasis } from "./api";

import { ATTR_KEYS, type CodeEditView, type HeaderForm } from "./edit-types";

const SVC = "codeEdit";

export function viewCode(maruCodeId: string): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, "view", { maruCodeId });
}

export function saveHeader(maruCodeId: string, auditVer: number | null, form: HeaderForm): Promise<CodeEditView> {
  const params: Record<string, unknown> = {
    maruCodeId,
    auditVer,
    maruCodeName: form.maruCodeName,
    description: form.description,
    lvlCnt: Number(form.lvlCnt),
  };
  // 빈 라벨도 보낸다 — 서버가 공백을 NULL 로 바꿔 지운다.
  for (const key of ATTR_KEYS) params[key] = form[key];
  return callMdmOasis<CodeEditView>(SVC, "save", params);
}

export function deprecateCode(maruCodeId: string, auditVer: number | null): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, "execute", { maruCodeId, auditVer });
}

export function createVersion(maruCodeId: string, verKind: "MAJOR" | "MINOR"): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, "reg", { maruCodeId, verKind });
}

export function restoreVersion(maruCodeId: string, verKind: "MAJOR" | "MINOR", sourceVer: string): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, "restore", { maruCodeId, verKind, sourceVer });
}

export type DraftAction = "delete" | "lock" | "unlock" | "handover";

export function draftAction(
  action: DraftAction,
  maruCodeId: string,
  ver: string,
  rowVersion: number,
  newOwnerId?: string,
): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, action, { maruCodeId, ver, rowVersion, newOwnerId });
}

export interface DeleteCodeResult {
  deleted: "CODE";
  maruCodeId: string;
}

/**
 * 마루 코드 전체 삭제(2026-09-28 사용자 결정 D-102) — `flags.neverReleased` 일 때만 화면이 이 버튼을 보인다.
 * `draftAction("delete", ...)` 와 같은 액션(`delete`)이지만 `target:"CODE"` 로 서버가 구분한다. 헤더가 사라지므로
 * 응답은 `CodeEditView` 가 아니다 — 성공하면 화면은 선택을 비우고 목록을 다시 조회한다.
 */
export function deleteCode(maruCodeId: string, auditVer: number | null): Promise<DeleteCodeResult> {
  return callMdmOasis<DeleteCodeResult>(SVC, "delete", { maruCodeId, auditVer, target: "CODE" });
}

/**
 * 확정 취소 — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다(ADR-0002 D8, TSK-02-01 D4-1).
 * `draftAction("delete", ...)` 와 같은 액션(`delete`)이지만 `target:"CONFIRM"` 으로 서버가 구분한다.
 * 06 룰 영역도 같은 target 문자열을 쓴다.
 */
export function cancelConfirm(maruCodeId: string, ver: string, rowVersion: number): Promise<CodeEditView> {
  return callMdmOasis<CodeEditView>(SVC, "delete", { maruCodeId, ver, rowVersion, target: "CONFIRM" });
}
