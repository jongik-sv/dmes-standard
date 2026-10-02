"use client";

import { StackedBarChart } from "@dk-oasis/shared/charts";

import { PROCESS_OUTPUT, SHIFTS } from "@/page-components/home/sample-data";

const SHIFT_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-5)"];
const SHIFT_SEGMENTS = SHIFTS.map((s, i) => ({
  key: s.code,
  label: s.label,
  color: SHIFT_COLORS[i],
}));
const PROCESS_ROWS = PROCESS_OUTPUT.map((r) => ({
  label: r.label,
  values: { A: r.A, B: r.B, C: r.C },
}));

export default function ProcessWidget() {
  return (
    <div className="mcm-home-chart-center mcm-home-hscroll">
      <StackedBarChart
        rows={PROCESS_ROWS}
        segments={SHIFT_SEGMENTS}
        labelWidth={96}
        chartWidth={300}
        barHeight={20}
        showPercentLabels={false}
      />
    </div>
  );
}
