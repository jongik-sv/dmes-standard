import { useMemo, useState } from "react";
import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import {
  DonutChart,
  HBarChart,
  LineChart,
  PieChart,
  StackedBarChart,
} from "@dk-oasis/shared/charts";
import { useMessage } from "@dk-oasis/shared/message-provider";

const SHIFT_FACTOR: Record<string, number> = {
  ALL: 1,
  DAY: 0.64,
  NIGHT: 0.36,
};

const COLORS = {
  blue: "#337ab7",
  green: "#398269",
  amber: "#c98932",
  red: "#c6534f",
  gray: "#85909d",
};

export function ChartDashboardScreen() {
  const { showMessage } = useMessage();
  const [plant, setPlant] = useState("GMP");
  const [shift, setShift] = useState("ALL");
  const [range, setRange] = useState("WEEK");
  const factor = SHIFT_FACTOR[shift] ?? 1;

  const lineData = useMemo(
    () =>
      [1020, 1130, 1084, 1215, 1196, 1260, 1315].map((value, index) => ({
        label: `${7 + index}일`,
        value: Math.round(value * factor),
      })),
    [factor],
  );

  const refresh = () =>
    showMessage({
      message: `${plant} · ${shift} · ${range} 기준의 로컬 지표를 갱신했습니다.`,
      toast: true,
    });

  return (
    <PageLayout
      title="KPI·차트 종합 대시보드"
      breadcrumb="대시보드 > KPI·차트 종합"
      screenId="DSN-DB-002"
      buttons={[
        {
          id: "refresh",
          label: "새로고침",
          type: "primary",
          action: "search",
          onClick: refresh,
        },
      ]}
    >
      <SearchArea onSearch={refresh}>
        <SearchField
          label="공장"
          type="select"
          value={plant}
          onChange={setPlant}
          options={[
            { value: "GMP", label: "김포공장" },
            { value: "PH", label: "포항공장" },
          ]}
        />
        <SearchField
          label="교대"
          type="radio"
          value={shift}
          onChange={setShift}
          options={[
            { value: "ALL", label: "전체" },
            { value: "DAY", label: "주간" },
            { value: "NIGHT", label: "야간" },
          ]}
        />
        <SearchField
          label="기간"
          type="select"
          value={range}
          onChange={setRange}
          options={[
            { value: "DAY", label: "일간" },
            { value: "WEEK", label: "주간" },
            { value: "MONTH", label: "월간" },
          ]}
        />
      </SearchArea>

      <div className="chart-dashboard-scroll">
        <section className="compact-kpi-row">
          {[
            [
              "생산 실적",
              `${Math.round(7_824 * factor).toLocaleString()} t`,
              "+4.8%",
            ],
            [
              "계획 달성률",
              `${(96.4 - (shift === "NIGHT" ? 2.3 : 0)).toFixed(1)}%`,
              "+1.6%p",
            ],
            [
              "설비 가동률",
              `${(89.7 - (shift === "NIGHT" ? 4.1 : 0)).toFixed(1)}%`,
              "+0.9%p",
            ],
            ["납기 위험", `${Math.max(2, Math.round(9 * factor))} 건`, "-3건"],
            ["품질 보류", `${Math.max(1, Math.round(5 * factor))} 건`, "-1건"],
          ].map(([label, value, change]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{change}</small>
            </article>
          ))}
        </section>

        <div className="chart-dashboard-grid chart-dashboard-grid--primary">
          <section className="dashboard-plain-panel">
            <header>
              <strong>일별 생산 실적</strong>
              <span>LineChart · ton</span>
            </header>
            <div className="dashboard-chart-body">
              <LineChart
                data={lineData}
                height={245}
                color={COLORS.blue}
                avgColor={COLORS.green}
                avgLabel="기간 평균"
                yLabel="생산량"
              />
            </div>
          </section>

          <section className="dashboard-plain-panel">
            <header>
              <strong>작업지시 상태</strong>
              <span>DonutChart · 건</span>
            </header>
            <div className="dashboard-chart-body dashboard-chart-body--center">
              <DonutChart
                data={[
                  { label: "완료", value: 84, color: COLORS.green },
                  { label: "진행", value: 31, color: COLORS.blue },
                  { label: "대기", value: 18, color: COLORS.gray },
                  { label: "지연", value: 7, color: COLORS.red },
                ].map((row) => ({
                  ...row,
                  value: Math.max(1, Math.round(row.value * factor)),
                }))}
                size={215}
                innerRadius={66}
                centerValue={String(Math.round(140 * factor))}
                centerLabel="전체 지시"
              />
            </div>
          </section>
        </div>

        <div className="chart-dashboard-grid chart-dashboard-grid--secondary">
          <section className="dashboard-plain-panel">
            <header>
              <strong>공정별 투입 비중</strong>
              <span>PieChart · %</span>
            </header>
            <div className="dashboard-chart-body dashboard-chart-body--center">
              <PieChart
                data={[
                  { label: "Slitting", value: 34, color: COLORS.blue },
                  { label: "Annealing", value: 27, color: COLORS.green },
                  { label: "Inspection", value: 22, color: COLORS.amber },
                  { label: "Packing", value: 17, color: COLORS.gray },
                ]}
                size={205}
              />
            </div>
          </section>

          <section className="dashboard-plain-panel">
            <header>
              <strong>작업장별 가동률</strong>
              <span>HBarChart · %</span>
            </header>
            <div className="dashboard-chart-body">
              <HBarChart
                data={[
                  { label: "SLITTING-01", value: 94, color: COLORS.blue },
                  { label: "ANNEALING-01", value: 88, color: COLORS.green },
                  { label: "INSPECTION-01", value: 97, color: COLORS.amber },
                  { label: "PACKING-01", value: 82, color: COLORS.gray },
                ]}
                maxValue={100}
                labelWidth={105}
                chartWidth={220}
                barHeight={22}
              />
            </div>
          </section>

          <section className="dashboard-plain-panel">
            <header>
              <strong>계획 대비 실적</strong>
              <span>StackedBarChart · ton</span>
            </header>
            <div className="dashboard-chart-body">
              <StackedBarChart
                rows={[
                  { label: "Slitting", values: { done: 920, remain: 80 } },
                  { label: "Annealing", values: { done: 740, remain: 160 } },
                  { label: "Inspection", values: { done: 685, remain: 115 } },
                  { label: "Packing", values: { done: 510, remain: 90 } },
                ]}
                segments={[
                  { key: "done", label: "실적", color: COLORS.blue },
                  { key: "remain", label: "잔여", color: "#dfe4e9" },
                ]}
                labelWidth={78}
                chartWidth={220}
                barHeight={21}
                showPercentLabels
              />
            </div>
          </section>
        </div>

        <footer className="chart-dashboard-footnote">
          <span>모든 값은 디자인 검토용 하드코딩 데이터입니다.</span>
          <span>shared/charts의 5개 공개 차트 컴포넌트 사용</span>
        </footer>
      </div>
    </PageLayout>
  );
}
