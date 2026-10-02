/**
 * noticeMgmt × MDM 렌더 시험 공용 — happy-dom 보충, 가짜 MDM TITLE 정의, 응답 도우미.
 * import 하는 것만으로 happy-dom 에 없는 브라우저 API 를 채운다(shared tests/setup.ts 와 같은 보충).
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!("ResizeObserver" in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

/**
 * 업무 BE POST /api/mls/mdmMeta/columns 응답의 TITLE 한 칸 — 실제(STRING 1000·선택)보다 엄격하게 5자·필수로 둔다.
 * 실제 정의는 입력 칸의 200자 제한에 먼저 걸려 화면 검사가 보일 일이 없어서다.
 */
export const STRICT_TITLE = {
  physName: "TITLE",
  columnName: "제목",
  labelLong: "공지 제목",
  labelMid: "공지제목",
  labelShort: "제목단",
  description: null,
  usageNote: null,
  dataType: "STRING",
  length: 5,
  scale: null,
  required: true,
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
};

export const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

export const settle = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));
