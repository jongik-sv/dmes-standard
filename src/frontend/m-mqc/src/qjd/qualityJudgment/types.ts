/** 품질판정(qualityJudgment) 타입·상수. 서버 응답 모양은 QualityJudgmentService 와 같다. */

export const SCREEN_ID = "qualityJudgment";

export type JudgmentStatus = "WAIT" | "PASS" | "FAIL" | "HOLD";
export type ItemResult = "PASS" | "FAIL" | "HOLD" | "NONE";

export interface CheckBadge {
  grp: string;
  short: string;
  name: string;
  result: ItemResult;
}

export interface CoilRow extends Record<string, unknown> {
  coilNo: string;
  ordNo: string;
  cusNm: string | null;
  prdCd: string;
  prdLabel: string;
  specCd: string | null;
  sizeText: string;
  wgt: number | null;
  lineCd: string | null;
  heatNo: string | null;
  inspBy: string | null;
  inspAt: string | null;
  status: JudgmentStatus;
  statusNm: string;
  suggStatus: JudgmentStatus | null;
  suggStatusNm: string | null;
  badges: CheckBadge[];
  /** 화면이 붙이는 배지 요약 글(도:PASS …). 그리드 칸 값으로 쓴다. */
  checkText?: string;
}

export interface ItemView extends Record<string, unknown> {
  itemCd: string;
  itemNm: string;
  label: string;
  critTp: "RANGE" | "GRADE";
  critTxt: string | null;
  measVal: string | null;
  result: ItemResult;
  resultNm: string;
}

export interface JudgmentEvent extends Record<string, unknown> {
  histNo: number;
  coilNo: string;
  actCd: "JUDGE" | "CONFIRM";
  actNm: string;
  statBefNm: string | null;
  statAft: JudgmentStatus | null;
  statAftNm: string | null;
  suggStat: JudgmentStatus | null;
  suggStatNm: string | null;
  note: string | null;
  actBy: string | null;
  actAt: string;
}

export interface JudgmentDetail {
  coil: CoilRow;
  judgment: {
    status: JudgmentStatus;
    statusNm: string;
    suggStatus: JudgmentStatus | null;
    suggStatusNm: string | null;
    judgedAt: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
    note: string | null;
    open: boolean;
  };
  items: ItemView[];
  chemistry: { elemCd: string; value: number | null }[];
  history: JudgmentEvent[];
}

export interface CriteriaRow extends Record<string, unknown> {
  key: string;
  specCd: string;
  prdLabel: string;
  itemCd: string;
  itemNm: string;
  unitNm: string | null;
  critTxt: string | null;
  coilCount: number;
}

export interface SearchResult {
  rows: CoilRow[];
  counts: Record<JudgmentStatus, number>;
}

export interface Filters {
  fromDt: string;
  toDt: string;
  lineCd: string;
  prdCd: string;
  status: string;
  keyword: string;
}

/** 시연 데이터 기준 고정 시작일(오늘 기준 날짜를 쓰지 않는다 — docs/mqc/demo/README.md). 종료일은 비워 시연 중 처리한 건도 보이게 한다. */
export const DEFAULT_FILTERS: Filters = { fromDt: "2026-08-30", toDt: "", lineCd: "", prdCd: "", status: "", keyword: "" };

export const LINE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "2CGL", label: "2CGL" },
  { value: "5CGL", label: "5CGL" },
  { value: "CCL", label: "CCL" },
  { value: "7CGL", label: "7CGL" },
];

export const PRD_OPTIONS = [
  { value: "", label: "전체" },
  { value: "G", label: "G : GI" },
  { value: "L", label: "L : G/L" },
  { value: "3", label: "3 : CCGI" },
  { value: "4", label: "4 : CCLI" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "WAIT", label: "판정대기" },
  { value: "PASS", label: "합격" },
  { value: "FAIL", label: "불합격" },
  { value: "HOLD", label: "보류" },
];

export const STATUS_LABEL: Record<JudgmentStatus, string> = { WAIT: "판정대기", PASS: "합격", FAIL: "불합격", HOLD: "보류" };
