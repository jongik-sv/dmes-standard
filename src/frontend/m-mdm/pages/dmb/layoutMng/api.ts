/**
 * layoutMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/layoutMng/{action}`(TSK-05-02 design.md §6.1).
 *
 * TSK-04-03 B0 실측 규칙(F11): grid `headers`·`consts`·`items` 셋을 **빈 배열이라도 늘 보내고**, params 의 null·빈 값 키는
 * 뺀다. 헤더 항목을 보내는 grid 는 없다 — 전문에서 헤더 구성·길이는 잠긴다(불변 I8). 요청 조립·봉투 해제는
 * `@dk-oasis/shared/http` 공통 계약(callOasisAt)에 맡긴다.
 * TSK-05-03: validate(등록 검증 7종)·execute(샘플 전문 렌더, grid samples 추가)·export(스냅샷)·search target=IMPACT(영향 전문).
 */
import { callOasisAt, omitParams, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import { LAYOUT_MNG_FIELD_LABELS } from "./fieldLabels";

import type { ColumnInfo, LayoutItemRow } from "@/layout/types";
import type {
  CheckResult, ConstRow, ExportResult, HeaderOption, ImpactRow, LayoutDraft, SampleResult, SaveResult, SearchFilters, SearchResult, ViewResult,
} from "./types";

const SERVICE = "layoutMng";
const ITEM_KEYS = ["SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE", "FILLER_LENGTH"] as const;

type Grids = Record<string, { rows: Array<Record<string, unknown>> }>;

/** params 는 null·undefined·공백만 있는 문자열을 빼고, 성공은 data 전체 위에 `data.result` 를 덮고, 거부는 일반 Error 이고 문구는 `기본 문구 + "\n- 항목명: 메시지"`(서버 field 코드는 안 보임, 기본 문구에 든 메시지는 뺌). */
const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", fieldLabel: mdmFieldLabel(LAYOUT_MNG_FIELD_LABELS), errorFactory: plainError };

/** null·undefined·빈 문자열 값을 뺀다(B0 e). 숫자 0 과 false 는 남긴다. */
export function cleanParams(params: object): Record<string, unknown> {
  return omitParams(params, "nullish+blank");
}

function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, grids, OASIS);
}

/**
 * 전문 목록 + 조회 조건용 시스템·EAI·헤더. `limit` 은 조건(검색어·송수신·헤더)이 하나도 없을 때만 서버가 적용하는 행 수 상한이다(R1) —
 * 주면 응답에 totalCount·truncated 가 온다. 비우면 상한 없음.
 */
export function searchLayouts(f: SearchFilters, limit?: number): Promise<SearchResult> {
  return callAction("search", {
    keyword: f.keyword, headerLayoutId: f.headerLayoutId ? Number(f.headerLayoutId) : null, sndSystem: f.sndSystem,
    rcvSystem: f.rcvSystem, limit,
  });
}

/** 진입 때 시스템·EAI·헤더 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음, layouts 는 빈 배열). */
export function loadLayoutOptions(): Promise<SearchResult> {
  return callAction("search", { optionsOnly: true });
}

/**
 * 헤더 추가 팝업·EAI 표준 헤더 선택 목록(D8 — search target=HEADER). 항목(items)은 빼고 받는다(withoutItems) — 모든 헤더의 항목을
 * 한 번에 싣지 않는다. 고른 헤더의 항목은 {@link loadHeaderPick} 으로 받는다.
 */
export async function searchHeaders(keyword: string): Promise<HeaderOption[]> {
  const out = await callAction<SearchResult>("search", { target: "HEADER", keyword, withoutItems: true });
  return out.headers ?? [];
}

/** 고른 헤더 한 건과 그 항목(search target=HEADER + headerLayoutId). 지금 적용 중인 확정 버전이 없으면 null. */
export async function loadHeaderPick(headerLayoutId: number): Promise<HeaderOption | null> {
  const out = await callAction<SearchResult>("search", { target: "HEADER", headerLayoutId });
  return out.headers?.[0] ?? null;
}

/** 컬럼 사전 검색(D8 — search target=COLUMN). */
export async function searchColumns(keyword: string): Promise<ColumnInfo[]> {
  const out = await callAction<SearchResult>("search", { target: "COLUMN", keyword });
  return out.columns ?? [];
}

/** ver 를 빼면 서버가 고른다(내 DRAFT 우선, 없으면 T 시점 현재). asOf 는 `yyyy-MM-dd HH:mm:ss`. */
export function viewLayout(layoutId: number, ver?: string | null, asOf?: string | null): Promise<ViewResult> {
  return callAction("view", { layoutId, ver, asOf });
}

/** 편집 상태 → grid 셋(헤더 구성 행 순서가 쌓는 순서, 본문 행 순서가 SEQ). save·validate·execute 가 같은 모양을 보낸다. */
function draftGrids(headers: Array<{ HEADER_LAYOUT_ID: number }>, consts: ConstRow[], items: LayoutItemRow[]): Grids {
  return {
    headers: { rows: headers.map((h, i) => ({ SEQ: i + 1, HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID })) },
    consts: { rows: consts.map((c) => ({ HEADER_LAYOUT_ID: c.HEADER_LAYOUT_ID, HEADER_SEQ: c.HEADER_SEQ, CONST_VALUE: c.CONST_VALUE })) },
    items: { rows: items.map((r) => cleanParams(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]])))) },
  };
}

/** 저장 — 헤더 구성(행 순서가 쌓는 순서)·상수 재정의·본문 항목(행 순서가 SEQ). */
export function saveLayout(draft: LayoutDraft, headers: Array<{ HEADER_LAYOUT_ID: number }>, consts: ConstRow[],
                           items: LayoutItemRow[]): Promise<SaveResult> {
  return callAction("save", draft, draftGrids(headers, consts, items));
}

/** 등록 검증 7종 표(TSK-05-03 §6.2) — 쓰지 않는다. */
export function validateLayout(draft: LayoutDraft, headers: Array<{ HEADER_LAYOUT_ID: number }>, consts: ConstRow[],
                               items: LayoutItemRow[]): Promise<CheckResult> {
  return callAction("validate", draft, draftGrids(headers, consts, items));
}

/** 샘플 전문 렌더(TSK-05-03 D13) — 예시 값은 grid samples, 인코딩 바이트 구간은 서버가 만든다. */
export function renderSample(draft: LayoutDraft, headers: Array<{ HEADER_LAYOUT_ID: number }>, consts: ConstRow[], items: LayoutItemRow[],
                             samples: Record<string, string>, opts: { sendTime?: string; seq?: number } = {}): Promise<SampleResult> {
  return callAction("execute", { ...draft, ...opts }, {
    ...draftGrids(headers, consts, items),
    samples: { rows: Object.entries(samples).map(([COLUMN_PHYS, VALUE]) => ({ COLUMN_PHYS, VALUE })) },
  });
}

/** 고른 버전·시각 T 의 스냅샷(빼면 서버가 현재로 푼다). */
export function exportSnapshot(layoutId: number, ver?: string | null, asOf?: string | null): Promise<ExportResult> {
  return callAction("export", { layoutId, ver, asOf });
}

/** 컬럼·도메인 변경 영향 전문(search target=IMPACT). */
export async function searchImpact(keyword: string): Promise<ImpactRow[]> {
  const out = await callAction<SearchResult>("search", { target: "IMPACT", keyword });
  return out.impacts ?? [];
}
