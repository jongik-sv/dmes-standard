"use client";

import { DonutChart } from "@dk-oasis/shared/charts";

import { EQUIPMENT_STATUS } from "@/page-components/home/sample-data";

const EQUIPMENT_TOTAL = EQUIPMENT_STATUS.reduce((s, d) => s + d.value, 0);
const EQUIPMENT_RATE = ((EQUIPMENT_STATUS[0].value / EQUIPMENT_TOTAL) * 100).toFixed(1);

export default function EquipmentWidget() {
  return (
    <div className="mcm-home-chart-center">
      <DonutChart data={EQUIPMENT_STATUS} size={170} centerValue={EQUIPMENT_RATE} centerLabel="가동률 %" />
    </div>
  );
}
