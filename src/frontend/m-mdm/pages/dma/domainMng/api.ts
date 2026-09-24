/**
 * domainMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/domainMng/{action}`(기능설계서 §1.2).
 *
 * BFF 가 MDM_WAS_URL 로 프록시하고 신뢰 헤더를 붙인다. 두 가지는 B0 실측(design.md §9.1)으로 정한 규칙이다.
 *  - grids(testCases·examples·vars)는 **빈 배열이라도 늘 보낸다** — 빠지면 OASIS 가 메서드를 찾지 못한다.
 *  - params 에서 **null·undefined·빈 문자열 값은 키째 뺀다** — null 값이 하나라도 있으면 요청 전체가 S999 로 실패한다.
 * OASIS 는 서비스 예외를 HTTP 200 + `meta.success=false` 로 돌려주므로 여기서 던진다(선례 m-mls noticeMgmt/api.ts).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type {
  DomainDraft, ExecuteResult, PreviewRequest, SaveResult, SearchFilters, SearchResult, TestCaseRow,
  ValidateResult, ViewResult,
} from "./types";

const OASIS_BASE = "/api/mdm/oasis/domainMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
}

type Grids = Record<string, { rows: Array<Record<string, unknown>> }>;

function unwrap<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
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

/** null·undefined·빈 문자열 값을 뺀다(B0 e). 숫자 0 과 false 는 남긴다. */
export function cleanParams(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

async function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "domainMng" }, params: cleanParams(params), ...(grids ? { grids } : {}) }),
  });
  return unwrap<T>(res);
}

function draftGrids(cases: TestCaseRow[], examples: string[]): Grids {
  return {
    testCases: { rows: cases as unknown as Array<Record<string, unknown>> },
    examples: { rows: examples.map((v) => ({ VALUE: v })) },
  };
}

/** B-001 조회. */
export function searchDomains(filters: SearchFilters): Promise<SearchResult> {
  return callAction("search", { keyword: filters.keyword, domainKind: filters.domainKind });
}

/** 행 선택 — 상세·요구 변수·영향도. */
export function viewDomain(domainId: number): Promise<ViewResult> {
  return callAction("view", { domainId });
}

/** B-004 도메인검증 — 쓰기 없음. */
export function validateDomain(draft: DomainDraft, cases: TestCaseRow[], examples: string[]): Promise<ValidateResult> {
  return callAction("validate", draft, draftGrids(cases, examples));
}

/** B-005 저장. */
export function saveDomain(draft: DomainDraft, cases: TestCaseRow[], examples: string[]): Promise<SaveResult> {
  return callAction("save", draft, draftGrids(cases, examples));
}

/** 서버 미리보기(자동, 디바운스) — 쓰기 없음. vars = [{NAME, VALUE}]. */
export function executePreview(req: PreviewRequest, vars: Array<{ NAME: string; VALUE: string }>): Promise<ExecuteResult> {
  return callAction("execute", req, { vars: { rows: vars } });
}
