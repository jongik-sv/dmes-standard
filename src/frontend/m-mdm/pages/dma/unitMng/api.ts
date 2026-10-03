/**
 * unitMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: `POST /api/mdm/oasis/unitMng/{action}`(TSK-04-02 design.md §1.2)
 *   - search  — 목록 + 차원별 확립된 기준 단위 후보(§3)
 *   - save    — 등록/수정(§4)
 *   - delete  — 삭제(불변 규칙 I5)
 *   - compare — 환산 계산기(A-PREVIEW, 불변 규칙 I1·I2, 서버가 유일한 계산 근원)
 *
 * 봉투 해제·거부 판정은 `@dk-oasis/shared/http` 공통 계약(callOasisAt)이 한다 — OASIS 는 BusinessException 을
 * HTTP 200 + `meta.success=false` 로 돌려주므로 이 판정이 없으면 저장 실패가 조용히 성공 처리된다.
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { ConvertRequest, DimensionOption, UnitForm, UnitOption, UnitRow } from "./types";

const SERVICE = "unitMng";

export interface UnitSearchPayload {
  list?: UnitRow[];
  dimensionOptions?: DimensionOption[];
  unitOptions?: UnitOption[];
}

export interface ConvertPreviewPayload {
  value?: number | null;
  fromUnitCode?: string;
  toUnitCode?: string;
  dimension?: string;
}

/**
 * 지금 동작 그대로 — 성공은 data 전체 위에 `data.result` 를 덮고, 거부는 일반 Error 다. 거부 문구는 meta.message 뒤에
 * errors[] 를 `field: message` 로 붙인다(base 와 같은 문구도 거르지 않는다).
 */
const OASIS: OasisCallOptions = { merge: "data+result", details: "append", errorFactory: plainError };

/**
 * OASIS `CactusRequestConverter` 는 `params` 의 각 값을 `TypedObject`(타입 힌트 없음)로 감싸는데,
 * 그 단일 인자 생성자는 값이 `null` 이면 "The type cannot be determined because object is null" 로
 * 즉시 죽는다(termMng/api.ts 에서 실측 확인). 이 화면은 현재 null 을 보내는 필드가 없지만, 향후
 * 필드 추가에 대비해 동일하게 방어한다 — 공통 계약 기본값(`omit: "nullish"`)이 null·undefined 를 뺀다.
 */
function callAction<T>(action: string, params: Record<string, unknown>): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, undefined, OASIS);
}

/** action=search — §3 S-001·S-002 조건으로 목록 + 차원별 확립된 기준 단위 후보 조회. */
export async function searchUnits(unitCode: string, dimension: string): Promise<UnitSearchPayload> {
  return callAction<UnitSearchPayload>("search", { unitCode, dimension });
}

/** action=search + optionsOnly — 진입 때 차원 콤보 값만 받는다(서버 목록 조회 없음, list 는 빈 배열). */
export async function loadUnitOptions(): Promise<UnitSearchPayload> {
  return callAction<UnitSearchPayload>("search", { optionsOnly: true });
}

/** action=save — §4 D-001~D-004 등록/수정. */
export async function saveUnit(form: UnitForm): Promise<UnitRow> {
  return callAction<UnitRow>("save", {
    unitCode: form.unitCode,
    dimension: form.dimension,
    baseUnit: form.baseUnit,
    factor: form.factor,
  });
}

/** action=delete — 불변 규칙 I5(FK 참조·형제 단위 존재 시 서버가 거부). */
export async function deleteUnit(unitCode: string): Promise<void> {
  await callAction<Record<string, unknown>>("delete", { unitCode });
}

/** action=compare(method=convertPreview) — A-PREVIEW 환산 계산기 한 칸, 불변 규칙 I1·I2. */
export async function convertPreview(req: ConvertRequest): Promise<ConvertPreviewPayload> {
  return callAction<ConvertPreviewPayload>("compare", {
    value: req.value,
    fromUnitCode: req.fromUnitCode,
    toUnitCode: req.toUnitCode,
  });
}
