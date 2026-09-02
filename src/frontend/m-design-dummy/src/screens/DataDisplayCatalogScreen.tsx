import { useMemo, useState } from "react";
import { PageLayout } from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  CustomDataGrid,
  DataGrid,
  GridBadge,
  GridBadgeCell,
  GridBadgeGroup,
  GridPanel,
  MuiDataGrid,
  Pagination,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import {
  MatrixTable,
  type MatrixTableColumn,
  type MatrixTableRow,
} from "@dk-oasis/shared/matrix-table";
import { Tabs } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";

const GRID_ROWS: Record<string, unknown>[] = [
  {
    id: "PD-260730-001",
    item: "FG-AL-1250",
    workCenter: "SLITTING-01",
    planQty: 120,
    actualQty: 118,
    status: "진행",
    flags: "긴급|납기주의",
  },
  {
    id: "PD-260730-002",
    item: "FG-AL-980",
    workCenter: "ANNEALING-01",
    planQty: 96,
    actualQty: 96,
    status: "완료",
    flags: "품질확인",
  },
  {
    id: "PD-260730-003",
    item: "SF-CU-600",
    workCenter: "INSPECTION-02",
    planQty: 75,
    actualQty: 42,
    status: "지연",
    flags: "설비점검|납기위험",
  },
  {
    id: "PD-260730-004",
    item: "RM-AL-INGOT",
    workCenter: "MELTING-01",
    planQty: 210,
    actualQty: 0,
    status: "대기",
    flags: "",
  },
];

function badgeForStatus(value: unknown) {
  const status = String(value);
  const palette: Record<string, { bg: string; color: string }> = {
    진행: { bg: "#e8f1fb", color: "#245d8f" },
    완료: { bg: "#e6f3ed", color: "#276a55" },
    지연: { bg: "#fbeaea", color: "#a53f3b" },
    대기: { bg: "#f1f2f4", color: "#626b76" },
  };
  return (
    <GridBadge
      label={status}
      bg={palette[status]?.bg}
      color={palette[status]?.color}
      strong
    />
  );
}

const GRID_COLUMNS: GridColumn[] = [
  { key: "id", header: "작업지시", width: 145, pinned: "left" },
  { key: "item", header: "품목", width: 130 },
  { key: "workCenter", header: "작업장", width: 150 },
  {
    key: "planQty",
    header: "계획",
    width: 78,
    align: "right",
    type: "number",
  },
  {
    key: "actualQty",
    header: "실적",
    width: 78,
    align: "right",
    type: "number",
  },
  {
    key: "status",
    header: "상태",
    width: 80,
    align: "center",
    render: badgeForStatus,
  },
  {
    key: "flags",
    header: "관리 항목",
    width: 190,
    render: (value) => {
      const flags = String(value ?? "")
        .split("|")
        .filter(Boolean);
      return (
        <GridBadgeCell>
          <GridBadgeGroup>
            {flags.length ? (
              flags.map((flag) => (
                <GridBadge
                  key={flag}
                  label={flag}
                  muted={flag === "품질확인"}
                  dimmed={flag === "설비점검"}
                  bg={flag.includes("위험") ? "#fbeaea" : undefined}
                  color={flag.includes("위험") ? "#a53f3b" : undefined}
                />
              ))
            ) : (
              <GridBadge label="없음" muted />
            )}
          </GridBadgeGroup>
        </GridBadgeCell>
      );
    },
  },
];

const DIRECT_GRID_COLUMNS: GridColumn[] = [
  { key: "id", header: "작업지시", width: 120 },
  { key: "item", header: "품목", width: 100 },
  {
    key: "status",
    header: "상태",
    width: 70,
    align: "center",
    render: badgeForStatus,
  },
];

const MATRIX_COLUMNS: MatrixTableColumn[] = [
  { key: "baseline", header: "기준계획", highlight: true },
  { key: "capacity", header: "능력우선" },
  { key: "delivery", header: "납기우선" },
];

const MATRIX_VALUES: Record<string, Record<string, number | string>> = {
  achievement: { baseline: 96.4, capacity: 94.8, delivery: 98.1 },
  utilization: { baseline: 89.7, capacity: 93.2, delivery: 87.5 },
  late: { baseline: 9, capacity: 12, delivery: 4 },
  changeover: { baseline: 18, capacity: 14, delivery: 22 },
  score: { baseline: 88, capacity: 85, delivery: 92 },
};

const MATRIX_ROWS: MatrixTableRow[] = [
  {
    key: "achievement",
    label: "계획 달성률 (%)",
    renderCell: (key) => MATRIX_VALUES.achievement[key],
  },
  {
    key: "utilization",
    label: "평균 가동률 (%)",
    renderCell: (key) => MATRIX_VALUES.utilization[key],
  },
  {
    key: "late",
    label: "납기 위험 (건)",
    renderCell: (key) => MATRIX_VALUES.late[key],
    cellStyle: (key) =>
      Number(MATRIX_VALUES.late[key]) >= 10 ? { color: "#b5443f" } : undefined,
  },
  {
    key: "changeover",
    label: "교체 횟수",
    renderCell: (key) => MATRIX_VALUES.changeover[key],
  },
  {
    key: "score",
    label: <strong>종합 점수</strong>,
    highlight: true,
    renderCell: (key) => <strong>{MATRIX_VALUES.score[key]}</strong>,
  },
];

type GridKind = "ag" | "mui" | "custom";

export function DataDisplayCatalogScreen() {
  const { showMessage } = useMessage();
  const [gridKind, setGridKind] = useState<GridKind>("ag");
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([
    String(GRID_ROWS[0].id),
  ]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const selectedLabel = useMemo(
    () => selectedRows.map(String).join(", ") || "선택 없음",
    [selectedRows],
  );

  const commonProps = {
    columns: GRID_COLUMNS,
    data: GRID_ROWS,
    rowKey: "id",
    height: 245,
    selectable: true,
    multiSelect: true,
    selectedRows,
    onRowSelect: (ids: (string | number)[]) => setSelectedRows(ids),
    ariaLabel: `${gridKind} 데이터 그리드 샘플`,
  };

  return (
    <PageLayout
      title="데이터 표시 컴포넌트"
      breadcrumb="디자인 검토 > 컴포넌트 카탈로그 > 데이터 표시"
      screenId="DSN-CAT-002"
      buttons={[
        {
          id: "export",
          label: "선택 확인",
          type: "primary",
          onClick: () =>
            showMessage({
              message: `선택 행: ${selectedLabel}`,
              toast: true,
            }),
        },
      ]}
    >
      <div className="catalog-scroll">
        <section className="catalog-intro">
          <strong>shared 데이터 표시 전체 구성</strong>
          <span>
            AG Grid, MUI Grid, 경량 Custom Grid, 배지, 패널 도움말,
            페이지네이션과 MatrixTable을 동일 데이터로 비교합니다.
          </span>
        </section>

        <section className="catalog-panel data-grid-catalog">
          <header>
            <strong>그리드 구현 비교</strong>
          </header>
          <Tabs
            items={[
              { key: "ag", label: "AgDataGrid / DataGrid" },
              { key: "mui", label: "MuiDataGrid" },
              { key: "custom", label: "CustomDataGrid" },
            ]}
            activeKey={gridKind}
            onChange={(key) => setGridKind(key as GridKind)}
          />
          <GridPanel
            title={
              gridKind === "ag"
                ? "작업지시 — AgDataGrid"
                : gridKind === "mui"
                  ? "작업지시 — MuiDataGrid"
                  : "작업지시 — CustomDataGrid"
            }
            count={GRID_ROWS.length}
            titleExtra={
              <span className="catalog-grid-note">
                DataGrid export는 AgDataGrid 별칭
              </span>
            }
            help={{
              title: "컬럼 설명",
              summary: "작업지시 목록에서 사용되는 대표 열입니다.",
              columns: [
                {
                  header: "상태",
                  description: "작업지시 실행 상태",
                  values: [
                    { label: "진행", description: "현재 생산 중" },
                    { label: "지연", description: "계획 종료 초과" },
                  ],
                },
                {
                  header: "관리 항목",
                  description: "운영자가 확인해야 할 복수 표식",
                },
              ],
            }}
            buttons={[
              {
                id: "refresh-grid",
                label: "새로고침",
                onClick: () =>
                  showMessage({
                    message: "로컬 Grid 데이터를 다시 표시했습니다.",
                    toast: true,
                  }),
              },
            ]}
          >
            {gridKind === "ag" ? (
              <DataGrid {...commonProps} columnSizing="fit" />
            ) : gridKind === "mui" ? (
              <MuiDataGrid {...commonProps} />
            ) : (
              <CustomDataGrid {...commonProps} />
            )}
            <Pagination
              page={page}
              totalPages={4}
              totalElements={34}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50]}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(0);
              }}
              showFirstLast
            />
          </GridPanel>
        </section>

        <div className="catalog-two-column">
          <section className="catalog-panel">
            <header>
              <strong>GridBadge 조합</strong>
            </header>
            <div className="badge-catalog-table cm-data-grid">
              <div>
                <span>상태</span>
                <GridBadgeCell align="left">
                  <GridBadgeGroup>
                    {["진행", "완료", "지연", "대기"].map((status) => (
                      <span key={status}>{badgeForStatus(status)}</span>
                    ))}
                  </GridBadgeGroup>
                </GridBadgeCell>
              </div>
              <div>
                <span>강조 수준</span>
                <GridBadgeCell align="left">
                  <GridBadgeGroup wrap>
                    <GridBadge label="기본" />
                    <GridBadge label="강조" strong />
                    <GridBadge label="보조" muted />
                    <GridBadge label="비활성" dimmed />
                    <GridBadge
                      label="위험"
                      bg="#fbeaea"
                      color="#a53f3b"
                      borderColor="#e7b8b5"
                    />
                  </GridBadgeGroup>
                </GridBadgeCell>
              </div>
            </div>
          </section>

          <section className="catalog-panel">
            <header>
              <strong>AgDataGrid 직접 사용</strong>
            </header>
            <div className="alias-grid-sample">
              <AgDataGrid
                columns={DIRECT_GRID_COLUMNS}
                data={GRID_ROWS.slice(0, 3)}
                rowKey="id"
                height={146}
                columnSizing="fit"
                ariaLabel="AgDataGrid 직접 사용 샘플"
              />
            </div>
          </section>
        </div>

        <section className="catalog-panel">
          <header>
            <strong>시나리오 비교 MatrixTable</strong>
          </header>
          <div className="matrix-catalog-wrap">
            <MatrixTable
              cornerHeader="평가 지표"
              columns={MATRIX_COLUMNS}
              rows={MATRIX_ROWS}
            />
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
