/**
 * dataMng 오른쪽 상세(옛 dataEdit 화면, 2026-09-29 통합 D-104)의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataEdit/{action}` — view(READ), save·delete(EDIT, D9). 합친 뒤에도 서비스 경로와
 * 권한 키(`dataEdit`)는 그대로다(서버 OBJECT dataEdit 는 메뉴만 없어지고 남는다, codeMng→codeEdit 선례).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import { unwrap } from "./api";
import { ATTR_KEYS, type DataEditView, type HeaderForm } from "./edit-types";

async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/dataEdit/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "dataEdit" }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function viewDataEdit(maruDataId: string): Promise<DataEditView> {
  return callOasis<DataEditView>("view", { maruDataId });
}

/** action=save — 헤더+키 패턴+라벨+lvl_cnt 한 번에(D3). 빈 라벨도 보낸다 — 서버가 공백을 NULL 로 바꿔 지운다. */
export function saveHeader(maruDataId: string, auditVer: number, form: HeaderForm): Promise<DataEditView> {
  const params: Record<string, unknown> = {
    maruDataId,
    auditVer,
    maruDataName: form.maruDataName,
    description: form.description,
    codePattern: form.codePattern,
    lvlCnt: Number(form.lvlCnt),
  };
  for (const key of ATTR_KEYS) params[key] = form[key];
  return callOasis<DataEditView>("save", params);
}

/** action=delete — 폐기(method=deprecate). */
export function deprecateData(maruDataId: string, auditVer: number): Promise<DataEditView> {
  return callOasis<DataEditView>("delete", { maruDataId, auditVer });
}
