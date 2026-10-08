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

export interface DbQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  executedSql: string;
}

export interface DbQueryRequest {
  sql?: string;
  schema?: string;
  table?: string;
  columns?: string[];
  limit?: number;
}
