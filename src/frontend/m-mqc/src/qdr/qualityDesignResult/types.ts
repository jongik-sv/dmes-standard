/**
 * 품질설계결과·시뮬레이션이 함께 쓰는 응답 모양. 계약 정본은 서버(qcdOrder·qualityDesignResult·designSimulation)다.
 * 설계값(DesignDoc)·설계 형상(ShapeModel)·단계 판정(Stage)은 서버가 Maru 룰로 계산해 주고, 화면은 그리기만 한다.
 */

export const SCREEN_ID = "qualityDesignResult";
export const ORDER_SERVICE = "qcdOrder";

/** P 통과 · F 불통/차단 · C 조건부 · null 판정 불가. */
export type Verdict = "P" | "F" | "C" | null;
export type EvidenceKind = "rule" | "spec" | "formula" | "constant" | "missing";
export type DesignStatus = "WAIT" | "ING" | "CONF" | "HOLD";
export type RunVerdict = "OK" | "WARN" | "BLOCK";

export interface OrderRow {
  orderKey: string;
  ordReqNo: string;
  ordReqLn: string;
  prdNmCd: string;
  prdLabel: string;
  prdShp: string;
  edge: string;
  spcAvr: string;
  usgCd: string;
  usgNm: string;
  usgFull: string;
  cusCd: string;
  cusNm: string;
  thk: number;
  wid: number;
  matCd: string;
  matLabel: string;
  urgent: boolean;
  export: boolean;
  reqDt: string;
}

export type EvidenceStatus = "MATCHED" | "NO_MATCH" | "RULE_NOT_FOUND" | "UNAVAILABLE" | "INPUT_ERROR" | "SKIPPED";

export interface Evidence {
  ruleId: string;
  title: string;
  ver: string | null;
  status: EvidenceStatus;
  seq: number | null;
  rowId: number | null;
  ruleKey: string | null;
  results: Record<string, string | null>;
  input: Record<string, string | null>;
  message: string | null;
  screen: string | null;
}

export type StageKey = "input" | "consistency" | "weight" | "feasibility" | "spec" | "design";

export interface Stage {
  no: number;
  key: StageKey;
  name: string;
  verdict: Verdict;
  summary: string;
  blocked: boolean;
  advisory: boolean;
  screen: string | null;
  evidence: Evidence[];
  /** 단계별 모양 — InputDetail · ConsistencyDetail · WeightDetail · FeasibilityDetail · SpecDetail · DesignStageDetail. */
  detail: unknown;
}

export interface InputDetail {
  required: { field: string; label: string; value: string | null; missing: boolean }[];
  missing: string[];
}

export interface FiredRule {
  ruleKey: string;
  errCd: string;
  errMsg: string;
  category: string;
  severity: string;
  actor: string;
  ownerDept: string;
  targetItem: string;
  targetLabel: string;
  source: string;
  concurrent: boolean;
}

export interface ConsistencyDetail {
  available: boolean;
  errorCount: number;
  fired: FiredRule[];
}

export interface WeightDetail {
  weight: number | null;
  split: number | null;
  unitWeight: number | null;
  inRange: boolean | null;
  okSplits: number[];
  min: number;
  max: number;
  reason: string | null;
  note: string;
}

export interface FeasibilityRow {
  sheet: string;
  line: string;
  ruleId: string;
  title: string;
  matGrp: string;
  matGrpNm: string;
  widthBand: number | null;
  thk: number | null;
  state: string | null;
  stateNm: string;
  main: boolean;
  flags: string[];
}

export interface FeasibilityDetail {
  mainLine: string | null;
  mainSheet: string | null;
  state: string | null;
  stateNm: string | null;
  missingSheet: string | null;
  rows: FeasibilityRow[];
}

export interface SpecCandidate {
  specNo: string;
  status: string;
  statusNm: string;
  matched: boolean;
  applied: boolean;
  excludedReason: string | null;
  conds: { attrCd: string; attrNm: string; op: string; val: string; orderVal: string | null; ok: boolean }[];
  results: { attrCd: string; attrNm: string; op: string; val: string; unit: string | null }[];
}

export interface SpecDetail {
  available: boolean;
  note: string | null;
  conflicts: string[];
  candidates: SpecCandidate[];
  rows: { attrCd: string; attrNm: string; base: string | null; value: string | null; srcs: string[]; conflict: boolean; path: string | null }[];
}

export interface DesignStageDetail {
  sections: { key: string; title: string; summary: string; anomalies: number }[];
}

export interface ValueTrace {
  path: string;
  label: string;
  value: string | null;
  unit: string | null;
  kind: EvidenceKind;
  formula: string | null;
  note: string | null;
  ruleId: string | null;
  ver: string | null;
  ruleKey: string | null;
  seq: number | null;
  screen: string | null;
  base: string | null;
  specs: string[];
}

export type KvRow = [string, string, ("b" | "wide" | "warn")?];

export interface DesignDoc {
  head: { buyer: string; spec: string; size: string; prd: string; use: string; mat: string; mat2: string; bom: string };
  common: KvRow[];
  mat: { bands: string[][]; spc: string[][] };
  tol: { tols: string[][]; base: string[][]; shape: string[][] };
  cgl: {
    lines: string[][];
    pltcm: [string, string][];
    ops: string[][];
    coat: {
      min: string | number;
      max: string | number;
      target: string | number;
      thk: string | number;
      spangle: string;
      lv: string;
      skin: string;
      sizeT: string | number;
      sizeW: string | number;
    };
  };
  egl: null;
  post: {
    t2c: string;
    st: string;
    wMin: string | number;
    wMax: string | number;
    pack: string;
    packMsg: string;
    qMsg: string;
    widSet?: string[];
    emboss?: string;
    sheetLoad?: string;
    oil?: string;
    shlSize?: string;
    film?: string[][];
  };
  color: null | {
    matrix: string[][];
    sum: {
      way: string;
      cT: string;
      cB: string;
      thkT: string;
      thkB: string;
      glossT: string;
      glossB: string;
      resinT: string;
      resinB: string;
      szT: string | number;
      szW: string | number;
      chem: string;
      name: string;
    };
    test: [string, string][];
  };
  route: { no: string; rows: [string, string, string][] };
  comp: { g1: string[][]; g2: string[][] };
  trace: Record<string, ValueTrace>;
}

export type LayerKind = "substrate" | "zinc" | "az" | "am" | "primer" | "topcoat" | "backcoat";

export interface ShapeLayer {
  id: string;
  kind: LayerKind;
  side: "top" | "core" | "bottom";
  thkUm: number | null;
  label: string;
}

export interface ShapeValue {
  key: string;
  label: string;
  value: string | number | null;
  unit: string | null;
  formula: string | null;
  evidence: {
    kind: EvidenceKind;
    ruleId: string | null;
    ver: string | null;
    ruleKey: string | null;
    seq: number | null;
    screen: string | null;
    note: string | null;
  };
}

export interface ShapeChange {
  key: "thk_mm" | "wid_mm" | "layers";
  from: number;
  to: number;
  delta: number;
  unit: string | null;
}

export interface ShapeScene {
  id: "raw" | "rolled" | "coated" | "painted" | "product";
  no: number;
  title: string;
  process: { code: string; name: string } | null;
  geometry: { thkMm: number | null; widMm: number | null; idMm: number | null; weightT: number | null };
  layers: ShapeLayer[];
  values: ShapeValue[];
  changes: ShapeChange[];
}

export interface ShapeModel {
  productType: string;
  summary: string;
  warnings: string[];
  scenes: ShapeScene[];
}

export interface Anomaly {
  kind: string;
  severity: "error" | "warn" | "info";
  label: string;
  detail: string;
  ref: string | null;
}

export interface PipelineRun {
  orderKey: string;
  evalTs: string;
  source: { label: string; used: string[]; missing: string[]; note: string };
  stages: Stage[];
  blockedAt: number;
  mainLine: string | null;
  design: DesignDoc;
  shape: ShapeModel;
  anomalies: Anomaly[];
  summary: { verdict: RunVerdict; errors: number; warnings: number };
}

export interface DesignRow extends OrderRow {
  status: DesignStatus;
  statusNm: string;
  calcAt: string | null;
  verdict: RunVerdict | null;
}

export interface DesignSearchResult {
  rows: DesignRow[];
  totalCount: number;
  counts: Record<DesignStatus, number>;
}

export interface DesignView {
  order: OrderRow;
  fields: Record<string, string | null>;
  status: DesignStatus;
  statusNm: string;
  stored: boolean;
  calcAt: string | null;
  calcBy: string | null;
  confAt: string | null;
  confBy: string | null;
  run: PipelineRun;
}

export interface DesignHistoryEvent {
  histId: number | string;
  action: "CALC" | "CONF" | "HOLD" | "UNHOLD" | string;
  actionNm: string;
  before: string | null;
  after: string | null;
  note: string | null;
  by: string | null;
  at: string | null;
}

export interface DesignFilters {
  fromDt: string;
  toDt: string;
  prdNmCd: string;
  status: string;
  keyword: string;
}

export interface OrderSearchResult {
  rows: OrderRow[];
  totalCount: number;
}

export interface OrderViewResult {
  order: OrderRow;
  fields: Record<string, string | null>;
  labels: Record<string, string>;
  coreFields: string[];
  requiredFields: string[];
}

export const DEFAULT_FILTERS: DesignFilters = {
  fromDt: "2026-08-30",
  toDt: "2026-08-31",
  prdNmCd: "",
  status: "",
  keyword: "",
};

export const PRODUCT_OPTIONS = [
  { value: "", label: "전체" },
  { value: "3", label: "3 : CCGI" },
  { value: "4", label: "4 : CCLI" },
  { value: "G", label: "G : GI" },
  { value: "L", label: "L : G/L" },
  { value: "W", label: "W : GLX" },
];

export const STATUS_LABEL: Record<DesignStatus, string> = {
  WAIT: "미설계",
  ING: "설계중",
  CONF: "확정",
  HOLD: "보류",
};

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  ...(Object.keys(STATUS_LABEL) as DesignStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] })),
];
