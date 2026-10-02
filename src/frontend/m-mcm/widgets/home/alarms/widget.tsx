"use client";

import { Badge } from "@dk-oasis/shared/form";
import { WidgetHeaderActions } from "@dk-oasis/shared/widget";

import { ALARM_SEVERITY, SAMPLE_ALARMS } from "@/page-components/home/sample-data";

const ALARM_CRITICAL = SAMPLE_ALARMS.filter((a) => a.severity === "critical").length;
const ALARM_WARNING = SAMPLE_ALARMS.filter((a) => a.severity === "warning").length;

export default function AlarmsWidget() {
  return (
    <>
      <WidgetHeaderActions>
        <Badge tone="danger" label={`위험 ${ALARM_CRITICAL}`} />
        <Badge tone="warning" label={`주의 ${ALARM_WARNING}`} />
      </WidgetHeaderActions>
      <ul className="mcm-home-alarm" aria-label="설비 알람 목록">
        {SAMPLE_ALARMS.map((a) => (
          <li key={a.id} className="mcm-home-alarm__item">
            <Badge tone={ALARM_SEVERITY[a.severity].tone} label={ALARM_SEVERITY[a.severity].label} />
            <span>
              <b className="mcm-home-alarm__title">{a.title}</b>
              <span className="mcm-home-alarm__detail">{a.detail}</span>
            </span>
            <time className="mcm-home-alarm__time">{a.time}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
