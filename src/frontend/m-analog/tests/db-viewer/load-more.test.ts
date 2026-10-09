import { describe, expect, it } from "vitest";
import { loadAllChunks } from "../../src/anl/db-viewer/load-more";
import type { DbQueryResult } from "../../src/anl/db-viewer/types";

function chunk(
  from: number,
  count: number,
  extra: Partial<DbQueryResult> = {},
): DbQueryResult {
  return {
    columns: ["A"],
    rows: Array.from({ length: count }, (_, i) => ({ A: String(from + i) })),
    rowCount: count,
    elapsedMs: 10,
    executedSql: "SELECT A FROM T",
    schema: "S",
    table: "T",
    rowIdKey: null,
    lobColumns: {},
    hasMore: false,
    ...extra,
  };
}

/** offset 별 응답표대로 답하는 가짜 서버. 받은 요청의 offset 을 기록한다. */
function server(script: Record<number, DbQueryResult>) {
  const offsets: number[] = [];
  const fetchChunk = async (req: { sql: string; offset: number }) => {
    offsets.push(req.offset);
    const res = script[req.offset];
    if (!res) throw new Error(`예상 밖 offset ${req.offset}`);
    return structuredClone(res);
  };
  return { offsets, fetchChunk };
}

describe("loadAllChunks", () => {
  it("hasMore 인 동안 offset 을 받은 행 수로 올려 이어 읽고, 끝나면 누적 결과를 돌려준다", async () => {
    const s = server({
      0: chunk(0, 5000, { hasMore: true }),
      5000: chunk(5000, 5000, { hasMore: true }),
      10000: chunk(10000, 3, { hasMore: false }),
    });
    const merged = await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: s.fetchChunk,
      isCurrent: () => true,
      onProgress: () => {},
    });
    expect(s.offsets).toEqual([0, 5000, 10000]);
    expect(merged?.rows).toHaveLength(10003);
    expect(merged?.rowCount).toBe(10003);
    expect(merged?.elapsedMs).toBe(30);
    expect(merged?.hasMore).toBe(false);
  });

  it("서버가 응답 바이트 상한으로 묶음을 짧게 끊어도(hasMore) 받은 만큼만 offset 을 올려 빠짐없이 이어진다", async () => {
    const s = server({
      0: chunk(0, 831, { hasMore: true }),
      831: chunk(831, 831, { hasMore: true }),
      1662: chunk(1662, 338, { hasMore: false }),
    });
    const merged = await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: s.fetchChunk,
      isCurrent: () => true,
      onProgress: () => {},
    });
    expect(s.offsets).toEqual([0, 831, 1662]);
    expect(merged?.rows.map((r) => r.A)).toEqual(
      Array.from({ length: 2000 }, (_, i) => String(i)),
    );
  });

  it("빈 묶음이 hasMore 로 와도 무한히 돌지 않고 멈춘다", async () => {
    const s = server({ 0: chunk(0, 0, { hasMore: true }) });
    const merged = await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: s.fetchChunk,
      isCurrent: () => true,
      onProgress: () => {},
    });
    expect(s.offsets).toEqual([0]);
    expect(merged?.rows).toHaveLength(0);
  });

  it("행 수 상한(capReached)에서 멈추고 마지막 묶음의 표지를 그대로 둔다", async () => {
    const s = server({
      0: chunk(0, 100, { hasMore: true }),
      100: chunk(100, 50, { hasMore: false, capReached: true }),
    });
    const parts: boolean[] = [];
    const merged = await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: s.fetchChunk,
      isCurrent: () => true,
      onProgress: (_m, part) => parts.push(Boolean(part.capReached)),
    });
    expect(parts).toEqual([false, true]);
    expect(merged?.capReached).toBe(true);
    expect(merged?.rows).toHaveLength(150);
  });

  it("열 정의는 첫 묶음의 참조를 유지한다", async () => {
    const first = chunk(0, 2, { hasMore: true, lobColumns: { B: "CLOB" } });
    const second = chunk(2, 1, { hasMore: false, columns: ["A", "X"] });
    const seen: DbQueryResult[] = [];
    await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: async (req) => (req.offset === 0 ? first : second),
      isCurrent: () => true,
      onProgress: (m) => seen.push(m),
    });
    expect(seen).toHaveLength(2);
    expect(seen[1].columns).toBe(first.columns);
    expect(seen[1].lobColumns).toBe(first.lobColumns);
  });

  it("새 조회가 시작돼 연쇄가 낡았으면 그 묶음을 버리고 멈춘다", async () => {
    const s = server({
      0: chunk(0, 10, { hasMore: true }),
      10: chunk(10, 10, { hasMore: true }),
    });
    let calls = 0;
    let progress = 0;
    const merged = await loadAllChunks({
      sql: "SELECT A FROM T",
      fetchChunk: s.fetchChunk,
      // 첫 묶음 응답까지는 최신, 둘째 응답이 올 때는 낡음.
      isCurrent: () => ++calls < 2,
      onProgress: () => {
        progress += 1;
      },
    });
    expect(merged).toBeNull();
    expect(progress).toBe(1);
    expect(s.offsets).toEqual([0, 10]);
  });

  it("읽기 오류는 호출자에게 던지고 그때까지의 진행 알림은 이미 나갔다", async () => {
    const s = server({ 0: chunk(0, 10, { hasMore: true }) });
    let progress = 0;
    await expect(
      loadAllChunks({
        sql: "SELECT A FROM T",
        fetchChunk: s.fetchChunk,
        isCurrent: () => true,
        onProgress: () => {
          progress += 1;
        },
      }),
    ).rejects.toThrow("예상 밖 offset 10");
    expect(progress).toBe(1);
  });
});
