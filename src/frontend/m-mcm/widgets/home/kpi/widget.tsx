"use client";

import { KpiTile, KpiTileGroup } from "@dk-oasis/shared/dashboard";

import { SAMPLE_KPIS, type SampleKpi } from "@/page-components/home/sample-data";

const fmtNum = (v: number) => (v >= 1000 ? v.toLocaleString("ko-KR") : String(v));

function kpiProps(k: SampleKpi) {
  const ratio = k.lowerBetter ? (k.plan / k.value) * 100 : (k.value / k.plan) * 100;
  return {
    label: k.label,
    value: fmtNum(k.value),
    unit: k.unit,
    trend: k.trend,
    target: k.lowerBetter ? `목표 ≤ ${fmtNum(k.plan)}${k.unit}` : `계획 ${fmtNum(k.plan)}${k.unit}`,
    delta: `전일 ${k.delta}`,
    deltaTone: k.good ? ("good" as const) : ("bad" as const),
    progress: ratio,
    warn: k.warn,
  };
}

/** 주요 지표 — KPI 6개(샘플). 폭이 줄면 안에서 줄바꿈한다. */
export default function KpiWidget() {
  return (
    <div data-testid="home-kpi-card">
      <KpiTileGroup ariaLabel="주요 지표">
        {SAMPLE_KPIS.map((k) => (
          <KpiTile key={k.key} {...kpiProps(k)} testId={`home-kpi-${k.key}`} />
        ))}
      </KpiTileGroup>
    </div>
  );
}
