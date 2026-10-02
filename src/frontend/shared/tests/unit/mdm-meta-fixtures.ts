/**
 * MDM 화면 메타 시험 공용 — 업무 BE `/api/{module}/mdmMeta/columns·domains` 응답 모양의 값과 가짜 fetch.
 */
import { vi } from "vitest";
import type { MdmDomainMeta, MdmScreenColumn } from "../../src/mdm-meta";

export function column(physName: string, over: Partial<MdmScreenColumn> = {}): MdmScreenColumn {
  return {
    physName,
    columnName: null,
    labelLong: null,
    labelMid: null,
    labelShort: null,
    description: null,
    usageNote: null,
    dataType: "STRING",
    length: 20,
    scale: null,
    required: false,
    defaultValue: null,
    refKind: null,
    refTarget: null,
    refCateId: null,
    domain: null,
    stdExpr: null,
    bizRuleOnServer: false,
    bizRequiredVars: [],
    codeRef: null,
    allowedCodes: null,
    ...over,
  };
}

export function domain(domainId: string, over: Partial<MdmDomainMeta> = {}): MdmDomainMeta {
  return {
    domainId,
    domainName: null,
    stdName: null,
    domainKind: null,
    dataType: "STRING",
    length: 20,
    scale: null,
    unitCode: null,
    description: null,
    stdExpr: null,
    bizRuleOnServer: false,
    codeRef: null,
    ...over,
  };
}

export const TITLE = column("TITLE", {
  columnName: "제목",
  labelLong: "공지 제목",
  labelMid: "공지제목",
  labelShort: "제목",
  description: "공지사항의 제목",
  dataType: "STRING",
  length: 1000,
  required: true,
  domain: { domainId: "D_TEXT", domainName: "텍스트", domainKind: "TEXT" },
});

export const TEXT_DOMAIN = domain("D_TEXT", { domainName: "텍스트", domainKind: "TEXT", unitCode: null });

export interface FakeMeta {
  columns?: Record<string, MdmScreenColumn>;
  domains?: Record<string, MdmDomainMeta>;
  unavailable?: string[];
  /** 모든 요청에 이 상태로 답한다(예: 401). */
  status?: number;
}

export interface FakeCall {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** mdmMeta columns·domains 를 흉내 내는 fetch. 호출 기록을 calls 에 남긴다. */
export function fakeMetaFetch(meta: FakeMeta) {
  const calls: FakeCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (meta.status && meta.status !== 200) {
      return new Response(JSON.stringify({ message: "x" }), { status: meta.status });
    }
    const unavailable = new Set(meta.unavailable ?? []);
    const isDomains = url.endsWith("/mdmMeta/domains");
    const names = ((isDomains ? body.domainIds : body.names) ?? []) as string[];
    const source = (isDomains ? meta.domains : meta.columns) ?? {};
    const items: Record<string, unknown> = {};
    const missing: string[] = [];
    const unav: string[] = [];
    for (const n of names) {
      if (unavailable.has(n)) unav.push(n);
      else if (source[n]) items[n] = source[n];
      else missing.push(n);
    }
    return new Response(JSON.stringify({ items, missing, unavailable: unav }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn, calls };
}

/** 한 틱 모음(16ms)과 응답 처리까지 기다린다. */
export function settle(ms = 40): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
