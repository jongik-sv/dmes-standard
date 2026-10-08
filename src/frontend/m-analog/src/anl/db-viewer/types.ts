/** DB 뷰어 (anl/dbViewer) — BE DTO. */

export interface DbColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
  NULLABLE: string;
  /** 기본키 구성 컬럼이면 "Y". */
  PK_YN: string;
  /** 외래키 구성 컬럼이면 "Y". */
  FK_YN: string;
  /** 외래키 참조 대상 "스키마.테이블" — 권한이 없어 못 읽으면 null. */
  FK_REF: string | null;
}

/** LOB 계열 칸의 데이터 형식. */
export type DbLobType = "CLOB" | "NCLOB" | "BLOB" | "RAW" | "LONG RAW";

export interface DbQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  executedSql: string;
  /** 정규화된 대문자 스키마·테이블 이름 — LOB 상세 재조회용. */
  schema: string;
  table: string;
  /**
   * 행 Map 안의 숨은 ROWID 키(보통 "_ROWID"). `columns` 에는 들어 있지 않다.
   * null 이면 상세 재조회를 할 수 없다(뷰 등).
   */
  rowIdKey: string | null;
  /** LOB 칸 이름 → 데이터 형식. 셀 값은 서버가 이미 요약해 보낸다. */
  lobColumns: Record<string, DbLobType>;
}

export interface DbLobRequest {
  schema: string;
  table: string;
  column: string;
  rowid: string;
}

/** `POST /db/lob` 응답 — kind 에 따라 text / (mime, base64) / hex 중 하나가 채워진다. */
export interface DbLobResult {
  column: string;
  dataType: string;
  kind: "text" | "image" | "binary";
  /** CLOB·NCLOB 은 글자 수, 그 밖은 바이트 수. */
  length: number;
  truncated: boolean;
  /** false 면 전체 길이를 모른다(LONG RAW 등) — `length` 는 읽은 바이트 수다. */
  lengthKnown: boolean;
  /** 서버 안내(예: 이미지가 1MB 를 넘어 미리 보기를 생략). 없으면 null. */
  note: string | null;
  /** CLOB 앞 1,000,000자 또는 UTF-8 글인 BLOB. */
  text: string | null;
  /** 1MB 이하 이미지. */
  mime: string | null;
  base64: string | null;
  /** binary 앞 4,096바이트, 소문자 16진수 문자열(공백 없음). */
  hex: string | null;
}

export interface DbQueryRequest {
  sql?: string;
  schema?: string;
  table?: string;
  columns?: string[];
  limit?: number;
}
