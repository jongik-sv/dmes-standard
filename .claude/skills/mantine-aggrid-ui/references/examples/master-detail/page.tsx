"use client";

/**
 * workOrderMng — 작업지시 조회. 화면 유형 D(마스터-디테일, 상하 분할) + E(등록 팝업) 표준 예제.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §D·§E
 */
import { useCallback, useEffect, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DatePicker } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { searchOpers, searchWorkOrders } from "./api";
import { RegisterModal } from "./RegisterModal";
import {
  WO_STATUS_LABELS,
  WO_STATUS_OPTIONS,
  emptyFilters,
  type WorkOrderFilters,
  type WorkOrderOperRow,
  type WorkOrderRow,
} from "./types";

const SCREEN_ID = "workOrderMng";

/** 상태 배지 색: 의미 토큰만 쓴다(screen-patterns.md §배지 색). */
const STATUS_BADGE: Record<string, { bg?: string; color?: string; muted?: boolean }> = {
  WAIT: { muted: true },
  RUN: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  DONE: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  HOLD: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
};

const MASTER_COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호", width: 120, align: "left" },
  { key: "itemCd", header: "품번", width: 120, align: "left" },
  { key: "itemNm", header: "품명", width: 180, align: "left" },
  { key: "planQty", header: "계획수량", width: 100, align: "right", type: "number" },
  { key: "prodQty", header: "생산수량", width: 100, align: "right", type: "number" },
  {
    key: "woStatus",
    header: "상태",
    width: 80,
    align: "center",
    render: (v) => <GridBadge label={WO_STATUS_LABELS[String(v)] ?? String(v)} {...STATUS_BADGE[String(v)]} />,
  },
  { key: "planDt", header: "계획일자", width: 100, align: "center" },
];

const DETAIL_COLUMNS: GridColumn[] = [
  { key: "operSeq", header: "순서", width: 80, align: "center", type: "number" },
  { key: "operCd", header: "공정코드", width: 120, align: "left" },
  { key: "operNm", header: "공정명", width: 180, align: "left" },
  { key: "equipCd", header: "설비코드", width: 120, align: "left" },
  { key: "goodQty", header: "양품수량", width: 100, align: "right", type: "number" },
  {
    key: "defectQty",
    header: "불량수량",
    width: 100,
    align: "right",
    type: "number",
    // 셀 단위 강조는 shared grid.css 의 셀 상태 클래스로 준다(화면 CSS 금지).
    cellClassRules: { "cell-light-pink": (row) => Number(row.defectQty) > 0 },
  },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function WorkOrderMngPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<WorkOrderFilters>(emptyFilters);
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [opers, setOpers] = useState<WorkOrderOperRow[]>([]);
  const [selectedWoNo, setSelectedWoNo] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      setOrders(await searchWorkOrders(filters));
      setSelectedWoNo("");
      setOpers([]);
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [filters, showMessage]);

  useEffect(() => {
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 마스터 행을 누르면 디테일을 조회한다. 디테일 로딩은 별도 상태로 둔다. */
  const handleMasterClick = useCallback(
    async (row: Record<string, unknown>) => {
      const woNo = String(row.woNo ?? "");
      setSelectedWoNo(woNo);
      setIsDetailBusy(true);
      try {
        setOpers(await searchOpers(woNo));
      } catch (e) {
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsDetailBusy(false);
      }
    },
    [showMessage],
  );

  const setFilter = (key: keyof WorkOrderFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <PageLayout
      title="작업지시 조회"
      breadcrumb="생산관리 > 작업지시 조회"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: isBusy, action: "search" },
        { id: "btn_new", label: "신규", onClick: () => setRegisterOpen(true), disabled: isBusy, action: "save" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="계획일자">
          <DatePicker value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        </SearchField>
        <SearchField label="~">
          <DatePicker value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        </SearchField>
        <SearchField label="상태" type="select" options={WO_STATUS_OPTIONS} value={filters.woStatus} onChange={(v) => setFilter("woStatus", v)} />
        <SearchField label="품번" value={filters.itemCd} onChange={(v) => setFilter("itemCd", v)} />
      </SearchArea>

      <ContentBody root direction="column" resizable storageKey="mpp.pwo.workOrderMng">
        <ContentPanel>
          <GridPanel title="작업지시 목록" count={orders.length}>
            <AgDataGrid
              rowKey="woNo"
              columns={MASTER_COLUMNS}
              data={orders}
              columnSizing="fit"
              highlightedRowKey={selectedWoNo}
              onRowClick={(row) => void handleMasterClick(row)}
              loading={isBusy}
            />
          </GridPanel>
        </ContentPanel>
        <ContentPanel height="40%">
          <GridPanel title="공정 실적" count={opers.length}>
            <AgDataGrid rowKey="operSeq" columns={DETAIL_COLUMNS} data={opers} columnSizing="fit" loading={isDetailBusy} />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} onRegistered={() => void handleSearch()} />
    </PageLayout>
  );
}
