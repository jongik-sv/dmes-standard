"use client";

/**
 * 포털 홈 위젯 — 샘플 지표·차트·표 카드와 기본 배치(행 배열).
 * 배치 상태·편집·저장은 shared 보드(useDashboardBoard)가 맡는다. 여기서는 카드 내용만 그린다.
 * 위젯 크기(span·height·최소값)는 page.tsx 의 위젯 목록이 정한다 — 카드에 span·height·cardId 를 주지 않는다.
 */
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, ProgressBar, type BadgeTone } from "@dk-oasis/shared/form";
import {
  DashboardCard,
  KpiTile,
  KpiTileGroup,
  type DashboardBoardDefaultRow,
} from "@dk-oasis/shared/dashboard";
import {
  DonutChart,
  HBarChart,
  StackedBarChart,
  StackedColumnChart,
} from "@dk-oasis/shared/charts";

import { monthlyChartHeight } from "./chart-sizing";
import {
  ALARM_SEVERITY,
  DEFECT_TYPES,
  EQUIPMENT_STATUS,
  MONTHLY_COATED,
  MONTHLY_COLD,
  MONTHLY_COLOR,
  MONTHLY_LAST_ACTUAL,
  MONTHLY_PLAN,
  MONTHS,
  PROCESS_OUTPUT,
  SAMPLE_ALARMS,
  SAMPLE_KPIS,
  SAMPLE_SHIPMENTS,
  SAMPLE_WORK_ORDERS,
  SHIFTS,
  SHIPMENT_STATUS_TONE,
  WORK_ORDER_STATUS_TONE,
  WORK_ORDER_SUMMARY,
  type SampleKpi,
} from "./sample-data";

/** 기본 배치 — 공지·알림 / 주요 지표 / 월별·설비 / 공정·불량 / 작업지시·알람 / 출하·바로가기. */
export const HOME_DEFAULT_ROWS: DashboardBoardDefaultRow[] = [
  { id: "top", widgets: ["notice", "notifications"] },
  { id: "kpi", widgets: ["kpi"] },
  { id: "charts", widgets: ["monthly", "equipment"] },
  { id: "charts2", widgets: ["process", "defect"] },
  { id: "tables", widgets: ["workOrders", "alarms"] },
  { id: "bottom", widgets: ["shipments", "quickLinks"] },
];

/* ── 그리드 배지 색(GridBadge 는 그리드 셀 안 전용) ── */
const GRID_BADGE_COLORS: Record<BadgeTone, { bg?: string; color?: string; muted?: boolean }> = {
  neutral: { muted: true },
  primary: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  success: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  warning: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

function toneBadge(label: string, tone: BadgeTone) {
  const c = GRID_BADGE_COLORS[tone];
  return <GridBadge label={label} bg={c.bg} color={c.color} muted={c.muted} />;
}

const WORK_ORDER_COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호", width: 130 },
  { key: "process", header: "공정", width: 110 },
  { key: "steel", header: "강종", width: 120 },
  { key: "spec", header: "규격", width: 110 },
  { key: "orderQty", header: "지시(t)", width: 70, align: "right", type: "number" },
  { key: "doneQty", header: "실적(t)", width: 70, align: "right", type: "number" },
  {
    key: "progress",
    header: "진행률",
    width: 110,
    tooltip: false,
    render: (v) => <ProgressBar status="running" value={Number(v)} label="" height={5} />,
  },
  {
    key: "status",
    header: "상태",
    width: 70,
    align: "center",
    render: (v) =>
      toneBadge(
        String(v),
        WORK_ORDER_STATUS_TONE[v as keyof typeof WORK_ORDER_STATUS_TONE] ?? "neutral"
      ),
  },
];

const SHIPMENT_COLUMNS: GridColumn[] = [
  { key: "shipDate", header: "출하일", width: 70, align: "center" },
  { key: "customer", header: "고객사", width: 130 },
  { key: "item", header: "품목", width: 140 },
  { key: "qty", header: "수량(t)", width: 80, align: "right", type: "number" },
  {
    key: "status",
    header: "상태",
    width: 90,
    align: "center",
    render: (v) =>
      toneBadge(
        String(v),
        SHIPMENT_STATUS_TONE[v as keyof typeof SHIPMENT_STATUS_TONE] ?? "neutral"
      ),
  },
];

const WORK_ORDER_DATA = SAMPLE_WORK_ORDERS as unknown as Record<string, unknown>[];
const SHIPMENT_DATA = SAMPLE_SHIPMENTS as unknown as Record<string, unknown>[];

/* ── 차트 입력(샘플 상수라 모듈에서 한 번만 만든다) ── */
const MONTHLY_SERIES = [
  { key: "cold", label: "냉연", color: "var(--color-chart-1)", values: MONTHLY_COLD },
  { key: "coated", label: "도금", color: "var(--color-chart-2)", values: MONTHLY_COATED },
  { key: "color", label: "컬러", color: "var(--color-chart-3)", values: MONTHLY_COLOR },
];
const MONTHLY_LINE = { label: "계획(합계)", color: "var(--color-chart-4)", values: MONTHLY_PLAN };
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
const DEFECT_BARS = DEFECT_TYPES.map((d, i) => ({
  label: d.label,
  value: d.value,
  color: i < 2 ? "var(--color-chart-1)" : "var(--color-chart-2)",
}));
const EQUIPMENT_TOTAL = EQUIPMENT_STATUS.reduce((s, d) => s + d.value, 0);
const EQUIPMENT_RATE = ((EQUIPMENT_STATUS[0].value / EQUIPMENT_TOTAL) * 100).toFixed(1);
const ALARM_CRITICAL = SAMPLE_ALARMS.filter((a) => a.severity === "critical").length;
const ALARM_WARNING = SAMPLE_ALARMS.filter((a) => a.severity === "warning").length;

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

/** 주요 지표 — KPI 6개를 한 위젯으로 묶는다(폭이 줄면 안에서 줄바꿈). */
export function KpiWidget() {
  return (
    <DashboardCard title="주요 지표" subtitle="전일 기준" testId="home-kpi-card">
      <KpiTileGroup ariaLabel="주요 지표">
        {SAMPLE_KPIS.map((k) => (
          <KpiTile key={k.key} {...kpiProps(k)} testId={`home-kpi-${k.key}`} />
        ))}
      </KpiTileGroup>
    </DashboardCard>
  );
}

export function MonthlyWidget() {
  return (
    <DashboardCard title="월별 생산 실적" subtitle="제품군별 · 단위 천 t">
      {(size) => (
        <StackedColumnChart
          height={monthlyChartHeight(size)}
          categories={MONTHS}
          series={MONTHLY_SERIES}
          line={MONTHLY_LINE}
          dimFrom={MONTHLY_LAST_ACTUAL + 1}
          dimLabel="10~12월은 전망(옅은 색)"
          totalAt={MONTHLY_LAST_ACTUAL}
          unit="천 t"
          ariaLabel="제품군별 월 생산 실적과 계획"
        />
      )}
    </DashboardCard>
  );
}

export function EquipmentWidget() {
  return (
    <DashboardCard title="설비 가동 상태" subtitle="전체 14개 라인 · 현재">
      <div className="mcm-home-chart-center">
        <DonutChart
          data={EQUIPMENT_STATUS}
          size={170}
          centerValue={EQUIPMENT_RATE}
          centerLabel="가동률 %"
        />
      </div>
    </DashboardCard>
  );
}

export function ProcessWidget() {
  return (
    <DashboardCard title="공정별 금일 생산" subtitle="교대조별 · 단위 t">
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
    </DashboardCard>
  );
}

export function DefectWidget() {
  return (
    <DashboardCard title="불량 유형 (이번 주)" subtitle="발생 건수">
      <div className="mcm-home-chart-center mcm-home-hscroll">
        <HBarChart
          data={DEFECT_BARS}
          maxValue={40}
          labelWidth={84}
          chartWidth={320}
          barHeight={22}
        />
      </div>
    </DashboardCard>
  );
}

export function WorkOrdersWidget() {
  return (
    <DashboardCard title="금일 작업지시 현황" subtitle={WORK_ORDER_SUMMARY} bodyPadding={false}>
      <AgDataGrid
        rowKey="woNo"
        columns={WORK_ORDER_COLUMNS}
        data={WORK_ORDER_DATA}
        columnSizing="fit"
        height="auto"
      />
    </DashboardCard>
  );
}

export function AlarmsWidget() {
  return (
    <DashboardCard
      title="설비 알람"
      subtitle="최근 24시간"
      actions={
        <>
          <Badge tone="danger" label={`위험 ${ALARM_CRITICAL}`} />
          <Badge tone="warning" label={`주의 ${ALARM_WARNING}`} />
        </>
      }
    >
      <ul className="mcm-home-alarm" aria-label="설비 알람 목록">
        {SAMPLE_ALARMS.map((a) => (
          <li key={a.id} className="mcm-home-alarm__item">
            <Badge
              tone={ALARM_SEVERITY[a.severity].tone}
              label={ALARM_SEVERITY[a.severity].label}
            />
            <span>
              <b className="mcm-home-alarm__title">{a.title}</b>
              <span className="mcm-home-alarm__detail">{a.detail}</span>
            </span>
            <time className="mcm-home-alarm__time">{a.time}</time>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

export function ShipmentsWidget() {
  return (
    <DashboardCard title="출하 예정" subtitle="D+0 ~ D+2" bodyPadding={false}>
      <AgDataGrid
        rowKey="id"
        columns={SHIPMENT_COLUMNS}
        data={SHIPMENT_DATA}
        columnSizing="fit"
        height="auto"
      />
    </DashboardCard>
  );
}
