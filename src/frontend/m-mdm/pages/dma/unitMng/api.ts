/**
 * unitMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: `POST /api/mdm/oasis/unitMng/{action}`(TSK-04-02 design.md §1.2)
 *   - search  — 목록 + 차원별 확립된 기준 단위 후보(§3)
 *   - save    — 등록/수정(§4)
 *   - delete  — 삭제(불변 규칙 I5)
 *   - compare — 환산 미리보기(A-PREVIEW, 불변 규칙 I1·I2, 서버가 유일한 계산 근원)
 *
 * mls `noticeMgmt/api.ts` 의 unwrap 패턴을 그대로 따른다 — OASIS 는 BusinessException 을
 * HTTP 200 + `meta.success=false` 로 돌려주므로 이 판정이 없으면 저장 실패가 조용히 성공 처리된다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { ConvertPreviewForm, DimensionOption, UnitForm, UnitRow } from "./types";

const OASIS_BASE = "/api/mdm/oasis/unitMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
  errors?: Array<{ grid?: string; rowKey?: string; field?: string; message?: string }>;
}

export interface UnitSearchPayload {
  list?: UnitRow[];
  dimensionOptions?: DimensionOption[];
}

export interface ConvertPreviewPayload {
  value?: number;
  fromUnitCode?: string;
  toUnitCode?: string;
  dimension?: string;
}

function unwrap<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    const base = env.meta.message?.trim() || "요청이 거부되었습니다.";
    const details = (env.errors ?? [])
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .filter(Boolean);
    throw new Error(details.length > 0 ? `${base}\n- ${details.join("\n- ")}` : base);
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  return out as T;
}

async function callAction<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "unitMng" }, params }),
  });
  return unwrap<T>(res);
}

/** action=search — §3 S-001·S-002 조건으로 목록 + 차원별 확립된 기준 단위 후보 조회. */
export async function searchUnits(unitCode: string, dimension: string): Promise<UnitSearchPayload> {
  return callAction<UnitSearchPayload>("search", { unitCode, dimension });
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

/** action=compare(method=convertPreview) — A-PREVIEW, 불변 규칙 I1·I2. */
export async function convertPreview(form: ConvertPreviewForm): Promise<ConvertPreviewPayload> {
  return callAction<ConvertPreviewPayload>("compare", {
    value: form.value,
    fromUnitCode: form.fromUnitCode,
    toUnitCode: form.toUnitCode,
  });
}
