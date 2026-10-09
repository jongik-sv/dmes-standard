/**
 * DB 뷰어 — 「더보기」 묶음 연쇄 읽기 (화면·React 의존 없음).
 * 서버가 묶음마다 같은 정렬로 자르므로 첫 묶음(offset 0)부터 읽어 이어 붙인다.
 * 다음 offset 은 지금까지 받은 행 수이며, 서버가 응답 바이트 상한 등으로 묶음을 짧게 끊어도(hasMore) 그대로 이어진다.
 */

import type { DbQueryResult } from "./types";

export interface LoadMoreDeps {
  sql: string;
  /** 묶음 하나를 읽는다 — `offset` 번째 행부터. */
  fetchChunk: (request: { sql: string; offset: number }) => Promise<DbQueryResult>;
  /** 새 조회가 시작돼 이 연쇄를 버려야 하면 false. */
  isCurrent: () => boolean;
  /** 묶음을 받을 때마다 누적 결과로 부른다(열 정의는 첫 묶음 참조를 유지한다). */
  onProgress: (merged: DbQueryResult, part: DbQueryResult) => void;
}

/**
 * 끝(hasMore 가 아님·빈 묶음)까지 이어 읽는다. 연쇄가 버려졌으면(isCurrent false) 거기서 멈추고 null,
 * 끝까지 읽었으면 누적 결과를 돌려준다. 읽기 오류는 호출자에게 그대로 던진다.
 */
export async function loadAllChunks(
  deps: LoadMoreDeps,
): Promise<DbQueryResult | null> {
  let rows: Record<string, unknown>[] = [];
  let first: DbQueryResult | null = null;
  let elapsedMs = 0;
  let merged: DbQueryResult | null = null;
  for (;;) {
    const part = await deps.fetchChunk({ sql: deps.sql, offset: rows.length });
    if (!deps.isCurrent()) return null;
    rows = rows.concat(part.rows);
    elapsedMs += part.elapsedMs;
    first ??= part;
    merged = {
      ...part,
      columns: first.columns,
      lobColumns: first.lobColumns,
      rows,
      rowCount: rows.length,
      elapsedMs,
    };
    deps.onProgress(merged, part);
    if (!part.hasMore || part.rows.length === 0) return merged;
  }
}
