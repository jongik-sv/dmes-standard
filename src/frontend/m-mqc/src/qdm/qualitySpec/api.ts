/**
 * qualitySpec 화면의 OASIS BFF 호출 래퍼. POST /api/mqc/oasis/qualitySpec/{action}, body {meta:{menuId}, params}.
 * params 는 납작한 글자 값만 싣는다(배열은 쉼표 목록 글자로). 봉투 해제는 shared unwrapOasis. 인증 헤더는 BFF 가 넣는다.
 */
import { apiRequest, unwrapOasis } from "@dk-oasis/shared/http";

import {
  SCREEN_ID,
  type AttrFilters,
  type AttrForm,
  type ChangeFilters,
  type ChangeView,
  type CodesResult,
  type ConfirmResult,
  type IfFilters,
  type IfLogView,
  type RunResult,
  type SavedSpec,
  type SearchResult,
  type SendResult,
  type SpecFilters,
  type ViewResult,
  type AttrView,
} from "./types";

const OASIS_BASE = `/api/mqc/oasis/${SCREEN_ID}`;

export type QualitySpecAction = "search" | "view" | "save" | "delete" | "confirm" | "send" | "history" | "codes" | "run";

/** 빈 글자·undefined 는 보내지 않는다(서버가 「조건 없음」 으로 읽는다). */
export function compactParams(params: Record<string, string | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s.trim() === "") continue;
    out[k] = s;
  }
  return out;
}

export async function callQualitySpec<T>(action: QualitySpecAction, params: Record<string, string | undefined | null>): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SCREEN_ID }, params: compactParams(params) }),
  });
  return unwrapOasis<T>(res);
}

const EMPTY_COUNTS = { DRAFT: 0, CONF: 0, SENT: 0, FAIL: 0 };

export async function searchSpecs(f: Partial<SpecFilters>): Promise<SearchResult> {
  const out = await callQualitySpec<Partial<SearchResult>>("search", { ...f });
  return { specs: out.specs ?? [], total: out.total ?? 0, counts: { ...EMPTY_COUNTS, ...(out.counts ?? {}) }, allSpecNos: out.allSpecNos ?? [] };
}

export async function viewSpec(specNo: string): Promise<ViewResult> {
  const out = await callQualitySpec<Partial<ViewResult>>("view", { specNo });
  if (!out.spec) throw new Error("사양을 찾을 수 없습니다.");
  return { spec: out.spec, changes: out.changes ?? [], ifLogs: out.ifLogs ?? [] };
}

/** 사양 저장 — text 는 여러 줄(줄마다 사양 하나). 수정이면 specNo 와 한 줄. 저장 후 확정이면 confirm=Y. */
export async function saveSpecs(text: string, opts: { specNo?: string | null; confirm?: boolean } = {}): Promise<SavedSpec[]> {
  const out = await callQualitySpec<{ saved?: SavedSpec[] }>("save", {
    text,
    specNo: opts.specNo ?? undefined,
    confirm: opts.confirm ? "Y" : undefined,
  });
  return out.saved ?? [];
}

export async function deleteSpecs(specNos: string[]): Promise<string[]> {
  const out = await callQualitySpec<{ deleted?: string[] }>("delete", { specNos: specNos.join(",") });
  return out.deleted ?? [];
}

export async function confirmSpecs(specNos: string[]): Promise<ConfirmResult> {
  const out = await callQualitySpec<Partial<ConfirmResult>>("confirm", { specNos: specNos.join(",") });
  return { confirmed: out.confirmed ?? [], skipped: out.skipped ?? [] };
}

export async function sendSpecs(specNos: string[]): Promise<SendResult> {
  const out = await callQualitySpec<Partial<SendResult>>("send", { specNos: specNos.join(",") });
  return {
    ifId: out.ifId ?? "MESQ_OMS_SPEC_001",
    results: out.results ?? [],
    skipped: out.skipped ?? [],
    payload: out.payload ?? "",
    okCount: out.okCount ?? 0,
    failCount: out.failCount ?? 0,
  };
}

export async function searchChanges(f: Partial<ChangeFilters>): Promise<ChangeView[]> {
  const out = await callQualitySpec<{ changes?: ChangeView[] }>("history", { kind: "CHANGE", ...f });
  return out.changes ?? [];
}

export async function searchIfLogs(f: Partial<IfFilters>): Promise<IfLogView[]> {
  const out = await callQualitySpec<{ ifLogs?: IfLogView[] }>("history", { kind: "IF", ...f });
  return out.ifLogs ?? [];
}

export async function loadCodes(f: Partial<AttrFilters> = {}): Promise<CodesResult> {
  const out = await callQualitySpec<Partial<CodesResult>>("codes", { ...f });
  return {
    attrs: out.attrs ?? [],
    customers: out.customers ?? [],
    products: out.products ?? [],
    baseDesign: out.baseDesign ?? [],
    orders: out.orders ?? [],
  };
}

export async function saveAttr(form: AttrForm): Promise<AttrView | null> {
  const out = await callQualitySpec<{ attr?: AttrView }>("save", {
    target: "ATTR",
    origAttrCd: form.origAttrCd ?? undefined,
    attrCd: form.attrCd.trim().toUpperCase(),
    attrNm: form.attrNm.trim(),
    kind: form.kind,
    dataType: form.dataType,
    dataLen: form.dataType === "DATE" ? undefined : form.dataLen.trim(),
    unit: form.unit.trim(),
    description: form.description.trim(),
    useYn: form.useYn,
  });
  return out.attr ?? null;
}

export async function deleteAttr(attrCd: string): Promise<string[]> {
  const out = await callQualitySpec<{ deleted?: string[] }>("delete", { target: "ATTR", attrCd });
  return out.deleted ?? [];
}

/** 주문 적용 시뮬레이션 — 받은 주문(ordNo) 또는 직접 넣은 주문(고객사·품명·속성 JSON). */
export async function runSimulation(input: { ordNo: string } | { cusCd: string; prdNmCd: string; attrs: Record<string, string> }): Promise<RunResult> {
  const params = "ordNo" in input ? { ordNo: input.ordNo } : { cusCd: input.cusCd, prdNmCd: input.prdNmCd, attrsJson: JSON.stringify(input.attrs) };
  const out = await callQualitySpec<Partial<RunResult>>("run", params);
  if (!out.order) throw new Error("주문을 찾을 수 없습니다.");
  return { order: out.order, payload: out.payload ?? "", matches: out.matches ?? [], design: out.design ?? [], conflicts: out.conflicts ?? [] };
}
