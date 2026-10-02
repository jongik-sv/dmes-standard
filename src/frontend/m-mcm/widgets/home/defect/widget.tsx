"use client";

import { HBarChart } from "@dk-oasis/shared/charts";

import { DEFECT_TYPES } from "@/page-components/home/sample-data";

const DEFECT_BARS = DEFECT_TYPES.map((d, i) => ({
  label: d.label,
  value: d.value,
  color: i < 2 ? "var(--color-chart-1)" : "var(--color-chart-2)",
}));

export default function DefectWidget() {
  return (
    <div className="mcm-home-chart-center mcm-home-hscroll">
      <HBarChart data={DEFECT_BARS} maxValue={40} labelWidth={84} chartWidth={320} barHeight={22} />
    </div>
  );
}
