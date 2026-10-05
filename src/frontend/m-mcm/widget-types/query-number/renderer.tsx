"use client";

import { useMemo } from "react";
import { KpiTile, KpiTileGroup } from "@dk-oasis/shared/dashboard";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { numberConfigOf, toNumberTiles } from "../_query/format";
import { QueryShell } from "../_query/ConditionBar";
import { QueryEmpty, QueryStyle } from "../_query/parts";
import { useQueryData } from "../_query/useQueryData";

/**
 * 쿼리 숫자(스펙 §6 query-number) — 결과 행마다 KPI 타일(최대 8개). 라벨 labelField, 값 valueField
 * (number=천 단위, percent=소수 1자리 + %), 단위는 unitField 값 또는 unit. 폭이 줄면 타일이 다음 줄로 넘어간다.
 */
export default function QueryNumberRenderer({ definition, widgetId, refreshKey }: WidgetProps) {
  const { data, condition } = useQueryData(definition, widgetId, refreshKey);
  const cfg = useMemo(() => numberConfigOf(definition), [definition]);
  const tiles = useMemo(() => (data ? toNumberTiles(data.rows, cfg) : []), [data, cfg]);

  return (
    <>
      <QueryStyle />
      <QueryShell condition={condition}>
        {data &&
          (tiles.length === 0 ? (
            <QueryEmpty />
          ) : (
            <KpiTileGroup ariaLabel="쿼리 결과 숫자" testId="wq-number">
              {tiles.map((t) => (
                <KpiTile key={t.key} label={t.label} value={t.value} unit={t.unit} testId={`wq-number-${t.key}`} />
              ))}
            </KpiTileGroup>
          ))}
      </QueryShell>
    </>
  );
}
