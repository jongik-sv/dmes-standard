/**
 * DB 뷰어 (anl/dbViewer) — BE 호출 계층.
 * BFF 경유 base = /api/analog/rest/dbViewer/query — REST 신경로 규약(2026-07-28):
 * permKey `analog/dbviewer/query` 로 RBAC 검사 후, BFF 가 objId/action 을 제외한 backendPath 만
 * analog WAS 로 전달한다. (BE 매핑 /db/** 그대로: `${BASE}/db/tables` → BE `/db/tables`.)
 *
 * NOTE: BFF 는 제네릭 프록시라 코드 등록이 필요 없고 `ANALOG_WAS_URL` 만 보면 된다.
 * 운영 RBAC 에는 permKey `analog/dbviewer/query` 를 관리자 롤에 부여해야 한다.
 */

import { apiRequest } from "@dk-oasis/shared/http";
import type {
  DbColumnInfo,
  DbLobRequest,
  DbLobResult,
  DbQueryRequest,
  DbQueryResult,
} from "./types";

const BASE = "/api/analog/rest/dbViewer/query";

/** 허용 스키마 — BE 기본값과 동일 (ADR-0002 D2). 서버가 최종 강제한다(여기 목록은 표시 순서·라벨). */
export const ALLOWED_SCHEMAS = [
  "MCMAPUSER",
  "MCM_SOURCE",
  "MCM_BACKUP",
  "MCAAPUSER",
  "MDMAPUSER",
] as const;

/** 허용 스키마의 테이블 목록. */
export async function fetchTables(schema: string): Promise<string[]> {
  const q = new URLSearchParams({ schema });
  return apiRequest<string[]>(`${BASE}/db/tables?${q.toString()}`);
}

/** 테이블 컬럼 목록 (속성 패널용). */
export async function fetchColumns(
  schema: string,
  table: string,
): Promise<DbColumnInfo[]> {
  const q = new URLSearchParams({ schema, table });
  return apiRequest<DbColumnInfo[]>(`${BASE}/db/columns?${q.toString()}`);
}

/** 조회 실행 — 자유 SQL 또는 구조화 요청. */
export async function runQuery(
  request: DbQueryRequest,
): Promise<DbQueryResult> {
  return apiRequest<DbQueryResult>(`${BASE}/db/query`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/** LOB 한 칸의 상세 — 행의 ROWID 로 그 한 칸만 다시 읽는다. */
export async function fetchLob(
  request: DbLobRequest,
  signal?: AbortSignal,
): Promise<DbLobResult> {
  return apiRequest<DbLobResult>(`${BASE}/db/lob`, {
    method: "POST",
    signal,
    body: JSON.stringify(request),
  });
}

/** 테이블 기본 조회 SQL 생성 (편집창 초기값). */
export function defaultSql(schema: string, table: string): string {
  return `SELECT * FROM ${schema}.${table}`;
}
