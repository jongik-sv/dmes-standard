"use client";

/**
 * dataHistory — 항목 이력 화면(05 「화면」 항목 이력, 01 생성·변경·소멸 이력 조회, TSK-07-03 design.md §2).
 *
 * (마루 데이터, 대상 = 항목·카테고리·소속, 키)의 선분 행을 시간순으로 본다. 조회 전용이다. 사건·닫혀 있던 구간·마지막
 * 상태는 서버가 계산하고 화면은 {@link DataHistoryTimeline} 으로 그대로 그린다. 키 필수 판정은 서버가 한다(H3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { Input, Select } from "@dk-oasis/shared/form";
import { MdmPageLayout } from "@/shell";

import { errorMessage, toMaruOptions, type DataItemHeader, type MaruDataOption } from "../dataItemMng/types";
import { searchDataHistory, viewDataHistory } from "./api";
import { DataHistoryTimeline } from "./DataHistoryTimeline";
import {
  TARGET_OPTIONS,
  emptyHistoryFilters,
  type DataHistoryFilters,
  type DataHistoryResult,
  type HistoryTarget,
} from "./types";

export default function DataHistoryPage() {
  const [options, setOptions] = useState<MaruDataOption[]>([]);
  const [header, setHeader] = useState<DataItemHeader | null>(null);
  const [filters, setFilters] = useState<DataHistoryFilters>(emptyHistoryFilters);
  const [result, setResult] = useState<DataHistoryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 요청 순번 — 늦게 도착한 옛 머리 응답이 새 선택을 덮지 않게 한다. */
  const selectSeq = useRef(0);

  const selectMaruData = useCallback(async (maruDataId: string) => {
    const seq = ++selectSeq.current;
    setFilters((prev) => ({ ...prev, maruDataId, cateId: "" }));
    setResult(null);
    if (!maruDataId) {
      setHeader(null);
      return;
    }
    try {
      const view = await viewDataHistory(maruDataId);
      if (seq === selectSeq.current) setHeader(view.header ?? null);
    } catch (e) {
      if (seq === selectSeq.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const view = await viewDataHistory();
        const list = view.maruDataOptions ?? [];
        setOptions(list);
        if (list.length > 0) await selectMaruData(list[0].maruDataId);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [selectMaruData]);

  const handleSearch = useCallback(async () => {
    setBusy(true);
    try {
      setResult(await searchDataHistory(filters));
    } catch (e) {
      setResult(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [filters]);

  const maruOptions = useMemo(() => toMaruOptions(options), [options]);
  const cateOptions = useMemo(
    () => [
      { value: "", label: "선택" },
      ...(header?.categories ?? []).map((c) => ({ value: c.cateId, label: `${c.cateName ?? c.cateId} (${c.cateId})` })),
    ],
    [header],
  );

  return (
    <MdmPageLayout
      group="dmd"
      screenId="dataHistory"
      title="항목 이력"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: () => void handleSearch(),
          type: "primary" as const,
          disabled: busy,
          action: "search",
        },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="마루 데이터">
          <Select
            data-testid="history-search-maru"
            aria-label="마루 데이터"
            value={filters.maruDataId}
            options={maruOptions}
            onChange={(v) => void selectMaruData(v)}
          />
        </SearchField>
        <SearchField label="대상">
          <Select
            data-testid="history-search-target"
            aria-label="대상"
            value={filters.target}
            options={TARGET_OPTIONS}
            onChange={(v) => setFilters((prev) => ({ ...prev, target: v as HistoryTarget }))}
          />
        </SearchField>
        {filters.target === "CATE_ITEM" && (
          <SearchField label="카테고리">
            <Select
              data-testid="history-search-cate"
              aria-label="카테고리"
              value={filters.cateId}
              options={cateOptions}
              onChange={(v) => setFilters((prev) => ({ ...prev, cateId: v }))}
            />
          </SearchField>
        )}
        <SearchField label="키">
          <Input
            data-testid="history-search-key"
            aria-label="키"
            value={filters.key}
            placeholder={filters.target === "CATE" ? "카테고리 ID" : "항목 키"}
            onChange={(v) => setFilters((prev) => ({ ...prev, key: v }))}
          />
        </SearchField>
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <DataHistoryTimeline result={result} />
        </ContentPanel>
      </ContentBody>

      {error && <ErrorModal message={error} onClose={() => setError(null)} />}
    </MdmPageLayout>
  );
}
