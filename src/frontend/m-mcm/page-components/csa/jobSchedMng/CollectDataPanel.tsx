"use client";

/**
 * 수집 값 — 고른 수집(COLLECT) 작업이 TB_MCM_JOB_COLLECT_DATA 에 쌓은 값을 읽는다(읽기 전용).
 * 「최신 회차」는 가장 큰 SLOT 한 회차의 항목·값 표, 「이력」은 SLOT 을 행·항목을 열로 편 표다. 엑셀은 그리드 설정 메뉴의 「엑셀 출력」이 맡는다.
 * 이 패널은 수집 값 탭이 열려 있을 때만 마운트되므로 탭을 보지 않으면 요청이 나가지 않는다. 작업·보기·기간·항목을 바꿀 때만 다시 받는다.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, SegmentedControl, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { jobSchedApi } from "./api";
import {
  COLLECT_DAYS_OPTIONS,
  COLLECT_DEFAULT_DAYS,
  COLLECT_PAGE_LIMIT,
  formatSlot,
  mergePages,
  pivotBySlot,
  toLatestRows,
} from "./collect-data";
import type { CollectDataRow } from "./types";

type View = "latest" | "history";

const VIEW_OPTIONS = [
  { value: "latest", label: "최신 회차" },
  { value: "history", label: "이력" },
];
const DAYS_SELECT_OPTIONS = COLLECT_DAYS_OPTIONS.map((d) => ({ value: String(d), label: `최근 ${d}일` }));
const ALL_KEYS = { value: "", label: "항목 전체" };

const LATEST_COLUMNS: GridColumn[] = [
  { key: "itemKey", header: "항목 키", width: 3, minWidth: 140, align: "left", meta: false },
  { key: "value", header: "값", width: 3, minWidth: 140, align: "right", meta: false },
  { key: "collectedAt", header: "수집 시각", width: 2, minWidth: 150, align: "center", meta: false, render: (v) => String(v ?? "").replace("T", " ") },
];

const TOOLBAR_STYLE = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", padding: "var(--spacing-xs) var(--spacing-sm)", flexWrap: "wrap" } as const;
const NOTE_STYLE = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" } as const;

export interface CollectDataPanelProps {
  jobId: string;
  jobNm: string;
  onError: (e: unknown) => void;
}

function CollectDataPanelImpl({ jobId, jobNm, onError }: CollectDataPanelProps) {
  const [view, setView] = useState<View>("latest");
  const [days, setDays] = useState(COLLECT_DEFAULT_DAYS);
  const [itemKey, setItemKey] = useState("");
  const [knownKeys, setKnownKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<CollectDataRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [nextBeforeSlot, setNextBeforeSlot] = useState("");
  const [latestSlot, setLatestSlot] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const seq = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    // 조건을 바꾼 재조회가 실패해도 이전 조건의 행·이어 받기 기준이 남지 않게 먼저 비운다.
    setRows([]);
    setTruncated(false);
    setNextBeforeSlot("");
    const latest = view === "latest";
    jobSchedApi
      .collectData({ jobId, latestOnly: latest, days, limit: COLLECT_PAGE_LIMIT, itemKey: !latest && itemKey ? itemKey : undefined })
      .then((res) => {
        if (mine !== seq.current) return;
        setRows(res.rows);
        setTruncated(res.truncated);
        setNextBeforeSlot(res.nextBeforeSlot);
        setLatestSlot(res.latestSlot);
        setLoaded(true);
        // 항목 선택지는 조건 없이 받은 값에서 모은다(조건을 건 결과로 선택지가 줄지 않게 합친다).
        setKnownKeys((prev) => [...new Set([...prev, ...res.rows.map((r) => r.itemKey)])].sort());
      })
      .catch((e) => {
        if (mine !== seq.current) return;
        setLoaded(true);
        onErrorRef.current(e);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
    return () => {
      seq.current++;
    };
  }, [jobId, view, days, itemKey, reloadTick]);

  const loadMore = useCallback(() => {
    if (!nextBeforeSlot) return;
    const mine = ++seq.current;
    setLoading(true);
    jobSchedApi
      .collectData({ jobId, days, limit: COLLECT_PAGE_LIMIT, itemKey: itemKey || undefined, beforeSlot: nextBeforeSlot })
      .then((res) => {
        if (mine !== seq.current) return;
        setRows((prev) => mergePages(prev, res.rows));
        setTruncated(res.truncated);
        setNextBeforeSlot(res.nextBeforeSlot);
      })
      .catch((e) => {
        if (mine === seq.current) onErrorRef.current(e);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [jobId, days, itemKey, nextBeforeSlot]);

  const handleView = useCallback((v: string) => setView(v === "history" ? "history" : "latest"), []);
  const handleDays = useCallback((v: string) => setDays(Number(v) || COLLECT_DEFAULT_DAYS), []);
  const handleReload = useCallback(() => setReloadTick((n) => n + 1), []);

  const latestRows = useMemo(() => toLatestRows(rows), [rows]);
  const pivot = useMemo(() => pivotBySlot(rows), [rows]);
  const pivotColumns = useMemo<GridColumn[]>(
    () => [
      { key: "slotLabel", header: "수집 회차", width: 2, minWidth: 150, align: "center", meta: false },
      ...pivot.columns.map<GridColumn>((c) => ({ key: c.key, header: c.header, width: 2, minWidth: 110, align: "right", meta: false })),
    ],
    [pivot.columns],
  );
  const keyOptions = useMemo(() => [ALL_KEYS, ...knownKeys.map((k) => ({ value: k, label: k }))], [knownKeys]);
  const excelExport = useMemo(() => ({ title: `수집 값_${jobId}`, fallbackName: "수집 값" }), [jobId]);

  const isLatest = view === "latest";
  const title = isLatest ? `수집 값 · 최신 회차${latestSlot ? ` ${formatSlot(latestSlot)}` : ""}` : `수집 값 · ${jobNm}`;
  const emptyMessage = loaded ? (isLatest ? "저장된 수집 값이 없습니다." : `최근 ${days}일 동안 수집된 값이 없습니다.`) : "불러오는 중입니다.";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0 }} data-testid="job-collect-panel">
      <div style={TOOLBAR_STYLE}>
        <SegmentedControl value={view} onChange={handleView} options={VIEW_OPTIONS} ariaLabel="수집 값 보기" />
        {isLatest ? null : (
          <>
            <div style={{ width: 130 }}>
              <Select value={String(days)} options={DAYS_SELECT_OPTIONS} aria-label="기간" onChange={handleDays} />
            </div>
            <div style={{ width: 200 }}>
              <Select value={itemKey} options={keyOptions} aria-label="항목 키" onChange={setItemKey} />
            </div>
          </>
        )}
        <Button onClick={handleReload} disabled={loading} data-testid="job-collect-reload">
          새로 고침
        </Button>
        {truncated && !isLatest ? (
          <Button onClick={loadMore} disabled={loading} data-testid="job-collect-more">
            이전 회차 더 보기
          </Button>
        ) : null}
        {!isLatest && pivot.clipped ? <span style={NOTE_STYLE}>항목이 많아 앞쪽 {pivot.columns.length}개만 열로 보입니다. 항목 키로 좁혀 보세요.</span> : null}
        {truncated ? <span style={NOTE_STYLE}>{isLatest ? `이 회차의 항목이 많아 앞쪽 ${rows.length}행만 보입니다.` : `${rows.length}행까지 받았습니다.`}</span> : null}
      </div>
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <GridPanel title={title} count={isLatest ? latestRows.length : pivot.rows.length} loading={loading}>
          {isLatest ? (
            <AgDataGrid gridId="jobCollectLatest" rowKey="itemKey" columns={LATEST_COLUMNS} data={latestRows} columnSizing="fixed" loading={loading} emptyMessage={emptyMessage} excelExport={excelExport} />
          ) : (
            <AgDataGrid gridId="jobCollectHistory" personalize={false} rowKey="slot" columns={pivotColumns} data={pivot.rows} columnSizing="fixed" loading={loading} emptyMessage={emptyMessage} excelExport={excelExport} />
          )}
        </GridPanel>
      </div>
    </div>
  );
}

export const CollectDataPanel = memo(CollectDataPanelImpl);
