import { useCallback, useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  M30_KND_TP_OPTIONS,
  M30_LOC_OPTIONS,
  M30_STOCK_GROUP_ROWS,
  M30_STOCK_ID_ROWS,
  type M30Row,
} from "../../data/m30-mock-data";
import { includesText, numberColumn } from "./m30-common";

/** M303001010 재고현황(그룹별)조회 — 그룹별 현재고(위) + ID별 현재고(아래) 상하 분할. */
const SCREEN_ID = "M303001010";

type Filters = {
  smtlLoc: string;
  smtlKndTp: string;
  smtlId: string;
  smtlClrCd: string;
  smtlLotNo: string;
  smtlSlpCd: string;
  cclBomNo: string;
};

// 표본은 품목 PCM도료(S31) 조회 결과라 진입 조건도 같게 둔다.
const INITIAL_FILTERS: Filters = {
  smtlLoc: "",
  smtlKndTp: "S31",
  smtlId: "",
  smtlClrCd: "",
  smtlLotNo: "",
  smtlSlpCd: "",
  cclBomNo: "",
};

const QTY_COLUMNS: GridColumn[] = [
  numberColumn("whsQty", "입고대기", 80),
  numberColumn("curQty", "현재고", 80),
  numberColumn("useQty", "가용재고", 80),
  {
    ...numberColumn("defQty", "불량판정", 80),
    cellClassRules: { "cell-light-pink": (row) => Number(row.defQty) > 0 },
  },
];

const GROUP_COLUMNS: GridColumn[] = [
  { key: "smtlLocNm", header: "위치", width: 120 },
  { key: "smtlCd", header: "부재료코드", width: 110 },
  { key: "smtlCharNo", header: "배치", width: 80, align: "center" },
  { key: "smtlPrdNm", header: "품명", width: 100 },
  { key: "smtlClrCd", header: "색상", width: 80 },
  numberColumn("smtlFlmWth", "필름폭", 70),
  { key: "smtlSlpNm", header: "공급업체", width: 160 },
  { key: "smtlLotNo", header: "LOT번호", width: 140 },
  ...QTY_COLUMNS,
  { key: "curQtyUnt", header: "단위", width: 60, align: "center" },
  { key: "smtlLoc", header: "위치코드", hide: true },
  { key: "smtlSlpCd", header: "공급업체코드", hide: true },
];

const ID_COLUMNS: GridColumn[] = [
  { key: "smtlLocNm", header: "위치", width: 110 },
  { key: "smtlCd", header: "부재료코드", width: 100 },
  { key: "smtlCharNo", header: "배치", width: 80, align: "center" },
  { key: "smtlPrdNm", header: "품명", width: 90 },
  numberColumn("smtlFlmWth", "필름폭", 70),
  { key: "smtlSlpNm", header: "공급업체", width: 150 },
  { key: "smtlLotNo", header: "LOT번호", width: 130 },
  { key: "smtlId", header: "포장ID", width: 100 },
  ...QTY_COLUMNS,
  { key: "curQtyUnt", header: "단위", width: 60, align: "center" },
  numberColumn("untPrc", "단가", 80),
  { key: "priceUnit", header: "통화", width: 60, align: "center" },
  { key: "lastLoc", header: "최종사용라인", width: 100, align: "center" },
  { key: "ordChrUid", header: "주문담당자", width: 100, align: "center" },
  { key: "moNo", header: "주문MO", width: 100, align: "center" },
  { key: "smtlPrNo", header: "PR번호", width: 100, align: "center" },
];

const hasCondition = (f: Filters) =>
  Object.values(f).some((v) => v.trim() !== "");

function filterGroups(rows: M30Row[], f: Filters) {
  return rows.filter((row) => {
    if (f.smtlLoc && row.smtlLoc !== f.smtlLoc) return false;
    // 표본은 모두 PCM도료다. 다른 품목을 고르면 0건이 된다.
    if (f.smtlKndTp && f.smtlKndTp !== "S31") return false;
    if (
      f.smtlId.trim() &&
      !(M30_STOCK_ID_ROWS[String(row.groupKey)] ?? []).some((r) =>
        includesText(r.smtlId, f.smtlId),
      )
    ) {
      return false;
    }
    return (
      includesText(row.smtlClrCd, f.smtlClrCd) &&
      includesText(row.smtlLotNo, f.smtlLotNo) &&
      includesText(row.smtlSlpCd, f.smtlSlpCd)
    );
  });
}

export function StockByGroupScreen() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const groupRows = useMemo(
    () => filterGroups(M30_STOCK_GROUP_ROWS, applied),
    [applied],
  );
  const idRows = useMemo(
    () => (selectedGroup ? (M30_STOCK_ID_ROWS[selectedGroup] ?? []) : []),
    [selectedGroup],
  );

  const handleSearch = useCallback(() => {
    if (!hasCondition(filters)) {
      showMessage({
        message: "조회 조건을 하나 이상 입력하세요.",
        alertType: "warning",
      });
      return;
    }
    setApplied(filters);
    setSelectedGroup(null);
  }, [filters, showMessage]);

  const handleGroupClick = useCallback(
    (row: Record<string, unknown>) => setSelectedGroup(String(row.groupKey)),
    [],
  );

  return (
    <PageLayout
      title="재고현황(그룹별)조회"
      breadcrumb="부재료관리 > 재고관리 > 재고현황(그룹별)조회"
      screenId={SCREEN_ID}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          type: "primary",
          onClick: handleSearch,
          action: "search",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="위치"
          name="SMTL_LOC"
          type="select"
          options={M30_LOC_OPTIONS}
          value={filters.smtlLoc}
          onChange={(v) => setFilter("smtlLoc", v)}
        />
        <SearchField
          label="품목"
          name="SMTL_KND_TP"
          type="select"
          options={M30_KND_TP_OPTIONS}
          value={filters.smtlKndTp}
          onChange={(v) => setFilter("smtlKndTp", v)}
        />
        <SearchField
          label="포장ID"
          name="SMTL_ID"
          value={filters.smtlId}
          onChange={(v) => setFilter("smtlId", v)}
        />
        <SearchField
          label="칼라"
          name="SMTL_CLR_CD"
          value={filters.smtlClrCd}
          onChange={(v) => setFilter("smtlClrCd", v)}
        />
        <SearchField
          label="LOT"
          name="SMTL_LOT_NO"
          value={filters.smtlLotNo}
          onChange={(v) => setFilter("smtlLotNo", v)}
        />
        <SearchField
          label="공급업체"
          name="SMTL_SLP_CD"
          value={filters.smtlSlpCd}
          onChange={(v) => setFilter("smtlSlpCd", v)}
        />
        <SearchField
          label="BOM"
          name="CCL_BOM_NO"
          value={filters.cclBomNo}
          onChange={(v) => setFilter("cclBomNo", v)}
        />
      </SearchArea>

      <ContentBody
        root
        direction="column"
        resizable
        storageKey="design-dummy.m30.M303001010"
      >
        <ContentPanel>
          <GridPanel title="그룹별 현재고현황" count={groupRows.length}>
            <AgDataGrid
              gridId="group"
              columns={GROUP_COLUMNS}
              data={groupRows}
              rowKey="groupKey"
              columnSizing="fixed"
              highlightedRowKey={selectedGroup}
              onRowClick={handleGroupClick}
            />
          </GridPanel>
        </ContentPanel>
        <ContentPanel height="45%">
          <GridPanel title="ID별 현재고현황" count={idRows.length}>
            <AgDataGrid
              gridId="id"
              columns={ID_COLUMNS}
              data={idRows}
              rowKey="smtlId"
              columnSizing="fixed"
              emptyMessage="위 목록에서 그룹을 선택하세요."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
