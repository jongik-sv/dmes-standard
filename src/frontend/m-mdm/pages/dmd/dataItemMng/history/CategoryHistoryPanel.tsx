"use client";

/**
 * 카테고리 이력 패널 — 카테고리 목록 바로 밑에 놓는다(2026-09-30). 고른 카테고리의 정의를 만든 이력을 표로 보여준다
 * (D-104 로 옛 dataHistory 화면의 대상 카테고리 조회를 옮김).
 *
 * 조회는 **고른 카테고리 하나가 곧 조건**이다 — 대상 Select·항목 키·[조회]를 두지 않는다. 고르면 자동으로 읽고,
 * 카테고리를 쓰면 `refreshToken` 이 올라 다시 읽는다. "누가 이 카테고리를 언제 바꿨는지" 만 보면 되는 자리라서
 * 소속 선분 조회(항목 키를 직접 넣어야 하는 related 조회)는 이 패널에 두지 않는다 — 서버 `dataHistory/search` 의
 * `CATE_ITEM` 대상은 그대로 살아 있고, 다른 곳에서 쓸 수 있다.
 */
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../types";
import { searchDataHistory } from "./api";
import { DataHistoryTimeline } from "./DataHistoryTimeline";
import type { DataHistoryResult } from "./types";

const hint = { color: "var(--color-text-muted)", margin: 0 } as const;

export interface CategoryHistoryPanelProps {
  maruDataId: string;
  /** 고른 카테고리 ID — 이 값이 곧 조회 조건이다. 아직 고르지 않았으면 null(칸은 그려 두고 안내만 한다). */
  cateId: string | null;
  /** 바뀔 때마다 다시 부른다(카테고리 쓰기 성공 횟수). */
  refreshToken: number;
  onError: (message: string) => void;
}

export function CategoryHistoryPanel({ maruDataId, cateId, refreshToken, onError }: CategoryHistoryPanelProps) {
  const [result, setResult] = useState<DataHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  /** 요청 순번 — 다른 카테고리를 고른 뒤 도착한 옛 응답을 버린다. */
  const seq = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const mine = ++seq.current;
    if (!maruDataId || !cateId) {
      setResult(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const out = await searchDataHistory({ maruDataId, target: "CATE", cateId: "", key: cateId });
        if (mine === seq.current) setResult(out);
      } catch (e) {
        if (mine === seq.current) {
          setResult(null);
          errorRef.current(errorMessage(e));
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    })();
  }, [maruDataId, cateId, refreshToken]);

  // 패널을 내릴 때 진행 중 조회의 늦은 결과가 새 카테고리에 붙지 않게 한다.
  useEffect(() => () => { seq.current++; }, []);

  return (
    <div data-testid="cate-history" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <span
        data-testid="cate-history-title"
        style={{ fontWeight: 600, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap" }}
      >
        {cateId ? `카테고리 이력 — ${cateId}` : "카테고리 이력"}
      </span>
      {!cateId ? (
        /* 칸 자체는 카테고리 그리드 오른쪽 2분할을 유지하려고 항상 그린다(없으면 아래 소속까지 밀린다). */
        <p data-testid="cate-history-empty" style={hint}>카테고리를 고르면 이력이 보입니다</p>
      ) : loading ? (
        <p data-testid="cate-history-loading" style={hint}>이력을 읽는 중...</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DataHistoryTimeline result={result} />
        </div>
      )}
    </div>
  );
}
