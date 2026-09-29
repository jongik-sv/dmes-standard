"use client";

/**
 * 카테고리 이력 패널 — 항목 편집 [카테고리] 탭 오른쪽 열 아래칸(D-104, 옛 dataHistory 화면의 대상 카테고리·소속 조회).
 *
 * 대상 「카테고리」는 고른 카테고리 ID 를 키로 바로 조회하고, 카테고리 쓰기가 성공할 때마다(`refreshToken`) 다시 부른다.
 * 대상 「소속」은 고른 카테고리 안에서 항목 키 하나의 소속 선분을 본다 — 키를 넣고 [조회] 를 눌러야 부른다. 키 필수 판정은
 * 서버가 한다(H3). 표는 항목 이력과 같은 {@link DataHistoryTimeline} 이다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "@dk-oasis/shared/form";

import { errorMessage } from "../types";
import { searchDataHistory } from "./api";
import { DataHistoryTimeline } from "./DataHistoryTimeline";
import { TARGET_OPTIONS, type DataHistoryResult } from "./types";

type CateTarget = "CATE" | "CATE_ITEM";

const CATE_TARGET_OPTIONS = TARGET_OPTIONS.filter((o) => o.value !== "ITEM");
const hint = { color: "var(--color-text-muted)", margin: 0 } as const;

export interface CategoryHistoryPanelProps {
  maruDataId: string;
  cateId: string | null;
  /** 바뀔 때마다 대상 「카테고리」 이력을 다시 부른다(카테고리 쓰기 성공 횟수). */
  refreshToken: number;
  onError: (message: string) => void;
}

export function CategoryHistoryPanel({ maruDataId, cateId, refreshToken, onError }: CategoryHistoryPanelProps) {
  const [target, setTarget] = useState<CateTarget>("CATE");
  const [itemKey, setItemKey] = useState("");
  const [result, setResult] = useState<DataHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  /** 요청 순번 — 다른 카테고리를 고른 뒤 도착한 옛 응답을 버린다. */
  const seq = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const search = useCallback(async (t: CateTarget, key: string) => {
    const mine = ++seq.current;
    if (!maruDataId || !cateId) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const out = await searchDataHistory(
        t === "CATE"
          ? { maruDataId, target: "CATE", cateId: "", key: cateId }
          : { maruDataId, target: "CATE_ITEM", cateId, key },
      );
      if (mine === seq.current) setResult(out);
    } catch (e) {
      if (mine === seq.current) {
        setResult(null);
        errorRef.current(errorMessage(e));
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [maruDataId, cateId]);

  // 대상 「카테고리」는 고른 카테고리가 바뀌거나 카테고리를 쓸 때마다 바로 부른다. 「소속」은 [조회] 로만 부르므로
  // 카테고리가 바뀌면 옛 결과만 지운다.
  useEffect(() => {
    if (target === "CATE") void search("CATE", "");
    else {
      seq.current++;
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maruDataId, cateId, target, refreshToken]);

  return (
    <div data-testid="cate-history" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 오른쪽 열은 1280 폭에서 330px 안팎이라 제목과 조회 칸을 한 줄에 두면 대상 Select 가 잘린다 — 두 줄로 둔다. */}
      <span style={{ fontWeight: 600, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap" }}>
        {cateId ? `카테고리 이력 — ${cateId}` : "카테고리 이력"}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", flexWrap: "wrap",
        paddingTop: "var(--spacing-xs)" }}>
        <Select
          data-testid="cate-history-target"
          aria-label="이력 대상"
          value={target}
          options={CATE_TARGET_OPTIONS}
          onChange={(v) => setTarget(v as CateTarget)}
        />
        {target === "CATE_ITEM" && (
          <>
            <Input
              data-testid="cate-history-key"
              aria-label="항목 키"
              value={itemKey}
              placeholder="항목 키"
              onChange={setItemKey}
            />
            <Button
              size="sm"
              data-testid="cate-history-search"
              disabled={!cateId || loading}
              onClick={() => void search("CATE_ITEM", itemKey.trim())}
            >
              조회
            </Button>
          </>
        )}
      </div>
      {cateId ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DataHistoryTimeline result={result} />
        </div>
      ) : (
        <p data-testid="cate-history-empty" style={hint}>왼쪽 목록에서 카테고리를 고르면 이력이 보입니다</p>
      )}
    </div>
  );
}
