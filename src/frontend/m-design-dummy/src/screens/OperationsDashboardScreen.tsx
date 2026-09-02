import { useMemo, useState } from "react";
import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DonutChart, LineChart } from "@dk-oasis/shared/charts";
import { FormGroup, Input } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  OPERATION_ALERTS,
  ORDER_STATUS,
  OUTPUT_TREND,
} from "../data/mock-data";
import { StatusBadge } from "../components/StatusBadge";

const ALERT_COLUMNS: GridColumn[] = [
  {
    key: "severity",
    header: "등급",
    width: 72,
    align: "center",
    render: (value) => <StatusBadge value={String(value)} />,
  },
  { key: "orderNo", header: "작업지시", width: 130, pinned: "left" },
  { key: "itemName", header: "품목", width: 210 },
  { key: "resource", header: "자원", width: 90, align: "center" },
  { key: "issue", header: "예외 내용", width: 230 },
  { key: "dueAt", header: "납기", width: 105, align: "center" },
  { key: "owner", header: "담당", width: 80, align: "center" },
];

const SHIFT_MULTIPLIER: Record<string, number> = {
  ALL: 1,
  DAY: 0.61,
  NIGHT: 0.39,
};

export function OperationsDashboardScreen() {
  const { showMessage } = useMessage();
  const [plant, setPlant] = useState("김포");
  const [shift, setShift] = useState("ALL");
  const [date, setDate] = useState("2026-07-30");
  const [selectedAlert, setSelectedAlert] = useState<string | null>(
    OPERATION_ALERTS[0].id,
  );
  const multiplier = SHIFT_MULTIPLIER[shift] ?? 1;

  const kpis = useMemo(
    () => [
      {
        label: "계획 달성률",
        value: `${(96.4 - (shift === "NIGHT" ? 2.1 : 0)).toFixed(1)}%`,
        delta: "+2.8%p",
        direction: "up",
        note: "목표 95.0%",
      },
      {
        label: "현재 투입",
        value: `${Math.round(128 * multiplier)}건`,
        delta: `${Math.round(11 * multiplier)}건 대기`,
        direction: "neutral",
        note: "4개 작업장",
      },
      {
        label: "생산 실적",
        value: `${Math.round(1084 * multiplier).toLocaleString()}t`,
        delta: "+7.6%",
        direction: "up",
        note: "전일 동시간 대비",
      },
      {
        label: "납기 위험",
        value: `${Math.max(2, Math.round(9 * multiplier))}건`,
        delta: "-3건",
        direction: "down",
        note: "Critical 2건",
      },
      {
        label: "설비 가동률",
        value: `${(89.7 - (shift === "NIGHT" ? 4.2 : 0)).toFixed(1)}%`,
        delta: "+1.4%p",
        direction: "up",
        note: "점검 1대 제외",
      },
    ],
    [multiplier, shift],
  );

  const trend = OUTPUT_TREND.map((point) => ({
    ...point,
    value: Math.round(point.value * multiplier),
  }));
  const status = ORDER_STATUS.map((slice) => ({
    ...slice,
    value: Math.max(1, Math.round(slice.value * multiplier)),
  }));
  const selected = OPERATION_ALERTS.find((alert) => alert.id === selectedAlert);

  const refresh = () =>
    showMessage({
      message: `${date} ${plant} ${shift === "ALL" ? "전체 교대" : shift} 데이터를 새로 고쳤습니다.`,
      toast: true,
    });

  return (
    <PageLayout
      title="스케줄 현황(대시보드)"
      breadcrumb="공정계획 > 스케줄링 > 스케줄 현황(대시보드)"
      screenId="MPF-MON-001"
      buttons={[
        {
          id: "refresh",
          label: "새로고침",
          type: "primary",
          onClick: refresh,
          action: "search",
        },
      ]}
    >
      <SearchArea onSearch={refresh}>
        <SearchField label="기준일">
          <input
            type="date"
            name="dashboardBaseDate"
            autoComplete="off"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </SearchField>
        <SearchField
          label="공장"
          type="select"
          value={plant}
          options={[
            { value: "김포", label: "김포공장" },
            { value: "포항", label: "포항공장" },
          ]}
          onChange={setPlant}
        />
        <SearchField
          label="교대"
          type="radio"
          value={shift}
          options={[
            { value: "ALL", label: "전체" },
            { value: "DAY", label: "주간" },
            { value: "NIGHT", label: "야간" },
          ]}
          onChange={setShift}
        />
      </SearchArea>

      <div className="dashboard-scroll">
        <section className="compact-kpi-row" aria-label="핵심 지표">
          {kpis.map((kpi) => (
            <article key={kpi.label}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small
                className={`metric-delta metric-delta--${kpi.direction}`}
                title={kpi.note}
              >
                {kpi.delta}
              </small>
            </article>
          ))}
        </section>

        <div className="dashboard-chart-grid">
          <section className="dashboard-plain-panel">
            <header>
              <strong>일별 생산 실적</strong>
              <span>단위: ton</span>
            </header>
            <div className="dashboard-chart-body">
              <LineChart
                data={trend}
                height={260}
                color="#337ab7"
                avgColor="#2f7d66"
                avgLabel="평균"
                yLabel="생산량"
              />
            </div>
          </section>

          <section className="dashboard-plain-panel">
            <header>
              <strong>작업지시 상태</strong>
              <span>단위: 건</span>
            </header>
            <div className="dashboard-chart-body dashboard-chart-body--center">
              <DonutChart
                data={status}
                size={220}
                innerRadius={70}
                centerValue={String(
                  status.reduce((sum, row) => sum + row.value, 0),
                )}
                centerLabel="작업지시"
              />
            </div>
          </section>
        </div>

        <div className="dashboard-alert-grid">
          <GridPanel
            title="실행 예외"
            count={OPERATION_ALERTS.length}
            buttons={[
              {
                id: "ack",
                label: "확인 처리",
                disabled: !selected,
                onClick: () =>
                  showMessage({
                    message: `${selected?.orderNo ?? ""} 예외를 확인 상태로 변경했습니다.`,
                    toast: true,
                  }),
              },
            ]}
          >
            <AgDataGrid
              columns={ALERT_COLUMNS}
              data={OPERATION_ALERTS.map((row) => ({ ...row }))}
              rowKey="id"
              highlightedRowKey={selectedAlert}
              onRowClick={(row) => setSelectedAlert(String(row.id))}
              columnSizing="fit"
              height={245}
            />
          </GridPanel>

          <aside className="form-panel dashboard-exception-detail">
            <div className="grid-panel-header">
              <div className="grid-panel-title">
                <span>예외 상세</span>
              </div>
              {selected ? <StatusBadge value={selected.severity} /> : null}
            </div>
            <div className="form-panel-content">
              {selected ? (
                <>
                  <FormGroup label="작업지시" labelWidth={92}>
                    <Input value={selected.orderNo} readOnly />
                  </FormGroup>
                  <FormGroup label="예외 내용" labelWidth={92}>
                    <Input value={selected.issue} readOnly />
                  </FormGroup>
                  <FormGroup label="품목" labelWidth={92}>
                    <Input value={selected.itemName} readOnly />
                  </FormGroup>
                  <FormGroup label="자원" labelWidth={92}>
                    <Input value={selected.resource} readOnly />
                  </FormGroup>
                  <FormGroup label="요청 납기" labelWidth={92}>
                    <Input value={selected.dueAt} readOnly />
                  </FormGroup>
                  <FormGroup label="담당자" labelWidth={92}>
                    <Input value={selected.owner} readOnly />
                  </FormGroup>
                  <div className="dashboard-exception-detail__note">
                    <strong>조치 메모</strong>
                    <p>
                      대체 자원 SLT-108로 잔여 수량을 분할 배정하고 납기 영향을
                      재계산합니다.
                    </p>
                  </div>
                </>
              ) : (
                <div className="data-table-empty">
                  예외 행을 선택하세요.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
