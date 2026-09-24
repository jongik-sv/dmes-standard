/**
 * codeEdit 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/codeEdit/{action}`(TSK-06-02 design.md §6.1).
 *   search·view(읽기), save(saveHeader)·execute(deprecate)·reg(createVersion)·restore(restoreVersion)·delete(deleteDraft),
 *   lock(acquire)·unlock(release)·handover(handover).
 * lock·unlock·handover 는 ADR-0003 D5 권장 이름을 문자열로만 쓴다 — BFF 권한은 TSK-08-02 머지 뒤 연결(D-TSK-06-02-1).
 * 모든 쓰기는 헤더 `auditVer` 또는 선택 버전의 `rowVersion` 을 함께 보낸다.
 */
import { callMdmOasis } from "../codeMng/api";

import { ATTR_KEYS, type CodeEditView, type CodeOption, type HeaderForm } from "./types";

const SVC = "codeEdit";

export async function searchCodeOptions(): Promise<CodeOption[]> {
  const result = await callMdmOasis<{ rows?: CodeOption[] }>(SVC, "search", {});
  return result.rows ?? [];
}

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
