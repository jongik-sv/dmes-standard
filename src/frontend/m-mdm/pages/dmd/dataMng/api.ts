/**
 * dataMng 화면의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2, codeMng/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataMng/{action}` — search(READ), reg(EDIT, D9). BFF 가 `MDM_WAS_URL` 로
 * 프록시하고 인증 헤더를 주입한다.
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import type { DataMngRegForm, DataMngRegResult, DataMngSearchResult } from "./types";

/** params 는 null·undefined·빈 문자열("")을 빼고, 성공은 `data.result` 만 펴고, 거부는 일반 Error 이고 문구는 `기본 문구 + "\n- 항목명: 메시지"`(서버 field 코드는 안 보임, 기본 문구에 든 메시지는 뺌). */
const OASIS: OasisCallOptions = { omit: "nullish+empty", merge: "result", fieldLabel: mdmFieldLabel(), errorFactory: plainError };

/** 응답 봉투 해제 + 업무 거부 판정. 성공이면 `data.result` 를 펼친다(F12). */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  return unwrapOasis<T>(res, OASIS);
}

function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, "dataMng", action, params, undefined, OASIS);
}

export function searchDataMng(id: string, name: string, status: string): Promise<DataMngSearchResult> {
  return callOasis<DataMngSearchResult>("search", { maruDataId: id.trim(), maruDataName: name.trim(), status });
}

/** action=reg — 등록(R1·R6·R10). */
export function registerDataMng(form: DataMngRegForm): Promise<DataMngRegResult> {
  return callOasis<DataMngRegResult>("reg", {
    maruDataId: form.maruDataId.trim(),
    maruDataName: form.maruDataName.trim(),
    description: form.description.trim(),
    codePattern: form.codePattern.trim(),
    lvlCnt: Number(form.lvlCnt),
  });
}
