"use client";

/**
 * 정시 수집 위젯 렌더러(docs/widget-2026-10/spec-widget-data.md §6) — 항목별 최신 값 타일(값·단위·전 회차 대비·수집 시각)과,
 * 타일을 고르면 그 항목의 추이 선 차트. 값이 없으면 「아직 수집된 값이 없습니다」, 최근 수집이 실패했으면 타일 위에 「최근 수집 실패」 한 줄.
 * 데이터는 widgetData/run(useCollectData), 변환은 ./format 의 순수 함수가 맡는다.
 */
import { useMemo, useState } from "react";
import { LineChart } from "@dk-oasis/shared/charts";
import { KpiTile, KpiTileGroup } from "@dk-oasis/shared/dashboard";
import { useWidgetBodySize, type WidgetProps } from "@dk-oasis/shared/widget";

import { QueryStyle } from "../_query/parts";
import { unitOf } from "./config";
import { COLLECT_EMPTY, COLLECT_FAILED, COLLECT_PREVIEW_NOTE, defaultSelection, shouldRunCollect, toCollectTiles, toTrendPoints } from "./format";
import { COLLECT_CSS, COLLECT_STYLE_HREF } from "./styles";
import { useCollectData } from "./useCollectData";

/** 추이 선 높이 — 본문 높이의 절반(최소 140), 높이를 모르면 200. */
function chartHeight(bodyHeight: number | null): number {
  return bodyHeight == null || bodyHeight <= 0 ? 200 : Math.max(140, Math.round(bodyHeight * 0.5));
}

export default function CollectRenderer({ definition, widgetId, refreshKey }: WidgetProps) {
  const data = useCollectData(widgetId, refreshKey);
  const body = useWidgetBodySize();
  const unit = useMemo(() => unitOf(definition), [definition]);
  const tiles = useMemo(() => (data ? toCollectTiles(data.items, unit) : []), [data, unit]);
  const [picked, setPicked] = useState<string | null>(null);
  // 고른 항목이 이번 결과에 없으면(항목이 바뀐 경우) 처음 고를 항목으로 돌아간다.
  const selected = picked !== null && tiles.some((t) => t.key === picked) ? picked : defaultSelection(tiles);
  const item = data?.items.find((i) => i.key === selected);
  const trend = useMemo(() => toTrendPoints(item), [item]);

  return (
    <>
      <QueryStyle />
      <style href={COLLECT_STYLE_HREF} precedence="default">
        {COLLECT_CSS}
      </style>
      {!shouldRunCollect(widgetId) && (
        <p className="wc__note" data-testid="wc-preview-note">
          {COLLECT_PREVIEW_NOTE}
        </p>
      )}
      {data && (
        <div className="wc" data-testid="wc">
          {data.lastRun?.status === "FAIL" && (
            <p className="wc__fail" role="status" data-testid="wc-fail">
              {COLLECT_FAILED}
            </p>
          )}
          {tiles.length === 0 ? (
            <div className="wq-empty" data-testid="wc-empty">
              {COLLECT_EMPTY}
            </div>
          ) : (
            <>
              <KpiTileGroup ariaLabel="정시 수집 최신 값" testId="wc-tiles">
                {tiles.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="wc__pick"
                    aria-pressed={t.key === selected}
                    onClick={() => setPicked(t.key)}
                    data-testid={`wc-pick-${t.key}`}
                  >
                    <KpiTile
                      label={t.key}
                      value={t.value}
                      unit={t.unit}
                      delta={t.delta ? <span className={`wc-delta--${t.deltaDir}`}>{t.delta}</span> : undefined}
                      target={`수집 ${t.collectedAt}`}
                      testId={`wc-tile-${t.key}`}
                    />
                  </button>
                ))}
              </KpiTileGroup>
              {trend.length >= 2 ? (
                <div className="wc__chart" data-testid="wc-chart">
                  <p className="wc__chart-title">{selected} 추이</p>
                  <LineChart data={trend} height={chartHeight(body.height)} color="var(--color-chart-1)" showAvg={false} yLabel={unit || undefined} />
                </div>
              ) : (
                <p className="wc__note" data-testid="wc-chart-none">
                  추이를 그릴 숫자 값이 2회 이상 모이면 선 차트가 보입니다
                </p>
              )}
              {data.truncated && <p className="wc__note">오래된 값 일부는 보이지 않습니다(최대 500건)</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
