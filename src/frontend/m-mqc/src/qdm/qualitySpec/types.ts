/**
 * qualitySpec(품질사양 관리) 화면의 서버 계약 타입과 라벨·선택지 상수.
 * 서버 = OASIS 서비스 qualitySpec(POST /api/mqc/oasis/qualitySpec/{action}). params 는 모두 납작한 글자 값이다.
 */

export const SCREEN_ID = "qualitySpec";

export type SpecStatus = "DRAFT" | "CONF" | "SENT" | "FAIL";
export type Op = "=" | "~" | "≥" | "≤" | ">" | "<";
export type AttrKind = "COND" | "RESULT" | "BOTH";
export type DataType = "VARCHAR2" | "NUMBER" | "CHAR" | "DATE";

export interface Term {
  side: "IF" | "THEN";
  seq: number;
  attrCd: string | null;
  attrNm: string;
  op: Op;
  val: string;
  unit: string | null;
}

export interface SpecView {
  specNo: string;
  rev: number;
  cusCd: string;
  cusNm: string | null;
  prdNmCd: string;
  prdNm: string | null;
  rawText: string;
  status: SpecStatus;
  statusNm: string;
  failMsg: string | null;
  author: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  conds: Term[];
  results: Term[];
  mapped: boolean;
}

export interface ChangeItem {
  item: string;
  before: string;
  after: string;
}

export type ChangeAction = "REG" | "CONF" | "MOD" | "REV" | "SEND" | "SEND_FAIL" | "DEL";

export interface ChangeView {
  chgId: number;
  specNo: string;
  rev: number;
  action: ChangeAction;
  actionNm: string;
  changes: ChangeItem[];
  summary: string;
  worker: string;
  chgAt: string;
  specStatus: SpecStatus | null;
  specStatusNm: string | null;
}

export interface IfLogView {
  ifNo: string;
  ifAt: string;
  direction: "MES_OMS" | "OMS_MES";
  directionNm: string;
  target: string;
  specNo: string | null;
  rev: number | null;
  ordNo: string | null;
  result: "OK" | "FAIL";
  resultNm: string;
  msg: string;
  elapsedMs: number;
  resendable: boolean;
}

export interface AttrView {
  attrCd: string;
  attrNm: string;
  kind: AttrKind;
  dataType: DataType;
  dataLen: string | null;
  unit: string | null;
  description: string | null;
  useYn: "Y" | "N";
  useCount: number;
  seq: number;
}

export interface OrderView {
  ordNo: string;
  cusCd: string;
  cusNm: string | null;
  prdNmCd: string;
  prdNm: string | null;
  qty: string;
  recvAt: string;
  attrs: Record<string, string>;
}

export interface MatchCond {
  attrCd: string | null;
  attrNm: string;
  op: Op;
  val: string;
  unit: string | null;
  orderVal: string | null;
  pass: boolean;
}

export type MatchVerdict = "APPLIED" | "EXCLUDED" | "NO_MATCH";

export interface MatchView {
  specNo: string;
  rev: number;
  status: SpecStatus;
  statusNm: string;
  verdict: MatchVerdict;
  conds: MatchCond[];
  results: Term[];
}

export interface DesignRow {
  attrCd: string;
  attrNm: string;
  unit: string | null;
  baseVal: string | null;
  finalVal: string;
  overridden: boolean;
  sources: string[];
}

export interface ConflictView {
  attrCd: string;
  attrNm: string;
  chain: string;
  specNos: string[];
}

export interface CustomerView {
  cusCd: string;
  cusNm: string;
}

export interface ProductView {
  prdNmCd: string;
  prdNm: string;
  label: string;
}

export interface BaseDesignView {
  attrCd: string;
  attrNm: string;
  baseVal: string;
  remark: string | null;
  unit: string | null;
}

// ── 응답 모양 ─────────────────────────────────────────────

export interface SearchResult {
  specs: SpecView[];
  total: number;
  counts: Record<SpecStatus, number>;
  allSpecNos: string[];
}

export interface ViewResult {
  spec: SpecView;
  changes: ChangeView[];
  ifLogs: IfLogView[];
}

export interface SavedSpec {
  specNo: string;
  rev: number;
  status: SpecStatus;
  action: string;
}

export interface SkippedSpec {
  specNo: string;
  reason: string;
}

export interface ConfirmResult {
  confirmed: { specNo: string; rev: number }[];
  skipped: SkippedSpec[];
}

export interface SendRow {
  specNo: string;
  rev: number;
  ifNo: string;
  result: "OK" | "FAIL";
  msg: string;
  elapsedMs: number;
}

export interface SendResult {
  ifId: string;
  results: SendRow[];
  skipped: SkippedSpec[];
  payload: string;
  okCount: number;
  failCount: number;
}

export interface CodesResult {
  attrs: AttrView[];
  customers: CustomerView[];
  products: ProductView[];
  baseDesign: BaseDesignView[];
  orders: OrderView[];
}

export interface RunResult {
  order: OrderView;
  payload: string;
  matches: MatchView[];
  design: DesignRow[];
  conflicts: ConflictView[];
}

// ── 요청 모양 ─────────────────────────────────────────────

export interface SpecFilters {
  status: string;
  keyword: string;
  cusCd: string;
  prdNmCd: string;
  attrCd: string;
}

export interface ChangeFilters {
  fromDt: string;
  toDt: string;
  keyword: string;
  specNo: string;
}

export interface IfFilters {
  direction: string;
  result: string;
  keyword: string;
  specNo: string;
}

export interface AttrFilters {
  kind: string;
  useYn: string;
  keyword: string;
}

export interface AttrForm {
  origAttrCd: string | null;
  attrCd: string;
  attrNm: string;
  kind: AttrKind;
  dataType: DataType;
  dataLen: string;
  unit: string;
  description: string;
  useYn: "Y" | "N";
}

// ── 라벨·선택지 ───────────────────────────────────────────

export const STATUS_LABEL: Record<SpecStatus, string> = { DRAFT: "작성중", CONF: "확정", SENT: "전송완료", FAIL: "전송실패" };
export const STATUS_ORDER: SpecStatus[] = ["DRAFT", "CONF", "SENT", "FAIL"];
export const STATUS_OPTIONS = [{ value: "", label: "전체" }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))];

export const KIND_LABEL: Record<AttrKind, string> = { COND: "조건", RESULT: "설계결과", BOTH: "공통" };
export const KIND_OPTIONS = [
  { value: "", label: "전체" },
  { value: "COND", label: "조건 COND" },
  { value: "RESULT", label: "설계결과 RESULT" },
  { value: "BOTH", label: "공통 BOTH" },
];
export const KIND_EDIT_OPTIONS = KIND_OPTIONS.slice(1);
export const USE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "중지" },
];
export const DATA_TYPES: DataType[] = ["VARCHAR2", "NUMBER", "CHAR", "DATE"];

export const DIRECTION_OPTIONS = [
  { value: "", label: "전체" },
  { value: "MES_OMS", label: "MES→OMS 사양 송신" },
  { value: "OMS_MES", label: "OMS→MES 주문 수신" },
];
export const RESULT_OPTIONS = [
  { value: "", label: "전체" },
  { value: "OK", label: "성공" },
  { value: "FAIL", label: "실패" },
];

/** 간편 입력의 연산자 — 같음/이상/이하/초과/미만. */
export const GUIDED_OPS: { value: Op; label: string }[] = [
  { value: "=", label: "같음 (=)" },
  { value: "≥", label: "이상 (≥)" },
  { value: "≤", label: "이하 (≤)" },
  { value: ">", label: "초과 (>)" },
  { value: "<", label: "미만 (<)" },
];

/** 품명 기본값 — 서버 codes 가 오기 전과 시험에 쓴다(설계 화면 어휘 3/4/G/L/W). */
export const DEFAULT_PRODUCTS: ProductView[] = [
  { prdNmCd: "3", prdNm: "CCGI", label: "3 : CCGI" },
  { prdNmCd: "4", prdNm: "CCLI", label: "4 : CCLI" },
  { prdNmCd: "G", prdNm: "GI", label: "G : GI" },
  { prdNmCd: "L", prdNm: "G/L", label: "L : G/L" },
  { prdNmCd: "W", prdNm: "GLX", label: "W : GLX" },
];

/** OMS 송신 I/F 머리 정보(전송 결과 창). */
export const SEND_META = {
  ifId: "MESQ_OMS_SPEC_001",
  method: "RFC · IDoc QSPEC01",
  dest: "SAP ERP PRD/500 → OMS",
};
