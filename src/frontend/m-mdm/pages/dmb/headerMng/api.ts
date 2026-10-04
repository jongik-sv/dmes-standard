/**
 * headerMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/headerMng/{action}`(TSK-05-02 design.md §6.1).
 *
 * TSK-04-03 B0 실측 규칙(F11)을 따른다. 요청 조립·봉투 해제는 `@dk-oasis/shared/http` 공통 계약(callOasisAt)에 맡긴다.
 *  - grid `items` 는 **빈 배열이라도 늘 보낸다** — 빠지면 OASIS 가 메서드를 찾지 못한다.
 *  - params 에서 **null·undefined·빈 문자열 값은 키째 뺀다** — null 값 하나로 요청 전체가 S999 로 실패한다.
 *  - 행은 서버가 읽는 키만 보낸다(화면 전용 KEY·파생 표시 칸·OFFSET·LENGTH 는 서버가 다시 계산하므로 빼고, 빈 값도 뺀다).
 */
import { callOasisAt, omitParams, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import { HEADER_MNG_FIELD_LABELS } from "./fieldLabels";

import type { ColumnInfo, LayoutItemRow } from "@/layout/types";
import type { HeaderDraft, SaveResult, SearchResult, ViewResult } from "./types";

const SERVICE = "headerMng";
const ITEM_KEYS = ["SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE", "FILLER_LENGTH"] as const;

type Grids = Record<string, { rows: Array<Record<string, unknown>> }>;

/** params 는 null·undefined·공백만 있는 문자열을 빼고, 성공은 data 전체 위에 `data.result` 를 덮고, 거부는 일반 Error 이고 문구는 `기본 문구 + "\n- 항목명: 메시지"`(서버 field 코드는 안 보임, 기본 문구에 든 메시지는 뺌). */
const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(HEADER_MNG_FIELD_LABELS), errorFactory: plainError };

/** null·undefined·빈 문자열 값을 뺀다(B0 e). 숫자 0 과 false 는 남긴다. */
export function cleanParams(params: object): Record<string, unknown> {
  return omitParams(params, "nullish+blank");
}

export function itemRows(items: LayoutItemRow[]): Array<Record<string, unknown>> {
  return items.map((r) => cleanParams(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]]))));
}

function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, grids, OASIS);
}

/** 헤더 목록·EAI 목록. */
export function searchHeaders(keyword: string): Promise<SearchResult> {
  return callAction("search", { keyword });
}

/** 진입 때 EAI 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음, headers 는 빈 배열). */
export function loadHeaderOptions(): Promise<SearchResult> {
  return callAction("search", { optionsOnly: true });
}

/** 컬럼 사전 검색(D8 — search target=COLUMN). */
export async function searchColumns(keyword: string): Promise<ColumnInfo[]> {
  const out = await callAction<SearchResult>("search", { target: "COLUMN", keyword });
  return out.columns ?? [];
}

/** 헤더 상세·항목·사용 전문. */
export function viewHeader(layoutId: number, ver?: string | null): Promise<ViewResult> {
  return callAction("view", { layoutId, ver });
}

/** 저장 — 항목은 grid items(행 순서가 SEQ). */
export function saveHeader(draft: HeaderDraft, items: LayoutItemRow[]): Promise<SaveResult> {
  return callAction("save", draft, { items: { rows: itemRows(items) } });
}
