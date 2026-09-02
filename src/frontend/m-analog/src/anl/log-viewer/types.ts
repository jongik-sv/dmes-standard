/**
 * 로그 분석 (anl/logViewer) — 화면 타입.
 * 원본: analog-express-ui-plate (AnlaogMainPage.js / LogViewer.js) 상태 모델의 TS 이식.
 */

/** 콤보 옵션 (BE meta 응답의 label/value 쌍). */
export interface LovItem {
  label: string;
  value: string;
}

/** GET api/meta 응답. */
export interface AnalogMeta {
  modules: LovItem[];
  clientTypes: LovItem[];
  stageTitle: string;
  title: string;
}

/**
 * 서비스 목록 행 (정규화 후).
 * BE 원시 응답은 오류 필드가 error / isError 두 형태가 관측되어 API 계층에서 error 로 통일한다.
 */
export interface ServiceItem {
  serviceName: string;
  serviceTag: string;
  startTime: string;
  endTime: string;
  runTime?: number;
  action?: string;
  error: boolean;
}

/** GET log/range/time 응답 (정규화 후). */
export interface LogSearchResult {
  log: string;
  serviceList: ServiceItem[];
}

/** 검색 조건 — from/to 는 표시 형식("YYYY-MM-DD HH:mm:ss"), API 호출 시 14자리로 정규화. */
export interface SearchCond {
  from: string;
  to: string;
  module: string;
  keyword: string;
  ignoreCase: boolean;
  byThread: boolean;
}

/** API 호출 파라미터 — from/to 는 yyyyMMddHHmmss(14자리), keyword 는 평문(호출 시 base64 인코딩). */
export interface LogSearchParams {
  from: string;
  to: string;
  keyword: string;
  serverType: string;
  module: string;
  clientType: string;
  ignoreCase: boolean;
  byThread: boolean;
}

/**
 * 워크스페이스 1개 상태.
 * 대용량 로그 문자열(logData)은 리렌더 비용 때문에 리듀서 밖 별도 state 로 분리한다(원본 설계 유지).
 */
export interface Workspace {
  workspaceId: string;
  /** 탭에 표시되는 번호. */
  label: number;
  cond: SearchCond;
  /** 마지막 검색 실행 시점의 cond 스냅샷 — 서비스 태그 드릴다운 시간창 계산에 사용. */
  lastCond: SearchCond | null;
  /** SQL Binder 편집 내용. */
  bindData: string;
  /** GET log/range/time/tree 응답(구조 미정 — 그대로 트리 뷰에 전달). */
  jsonData: unknown;
  serviceList: ServiceItem[];
}

/** 문서 탭 키 (LOG / JSON / Binder). */
export type DocTabKey = "text" | "json" | "binder";

/** 검색 실행 종류. */
export type SearchType = "search" | "json" | "download";

/** 검색 실행 옵션 — serviceTag 가 있으면 서비스 태그 드릴다운. */
export interface SearchOptions {
  type: SearchType;
  serviceTag?: string;
  startTime?: string;
  endTime?: string;
  action?: string;
  runTime?: number;
}
