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
  M30_CONSUMPTION_ROWS,
  M30_CONSUMPTION_TOTAL,
  M30_CSM_TP_OPTIONS,
  M30_KND_TP_OPTIONS,
  M30_LOC_OPTIONS,
  type M30Row,
} from "../../data/m30-mock-data";
import {
  ToneBadge,
  formatNumber,
  includesText,
  inDateRange,
  numberColumn,
} from "./m30-common";

/** M302001010 소모실적조회 — 조회조건 + 소모실적 목록 + 아래 합계 줄. 판정사유·A급잔량발생사유만 편집. */
const SCREEN_ID = "M302001010";

type Filters = {
  fromDt: string;
  toDt: string;
  smtlKndTp: string;
  smtlId: string;
  smtlCd: string;
  smtlLoc: string;
  csmTp: string;
  smtlClrCd: string;
};

const INITIAL_FILTERS: Filters = {
  fromDt: M30_CONSUMPTION_TOTAL.fromDay,
  toDt: M30_CONSUMPTION_TOTAL.toDay,
  smtlKndTp: "",
  smtlId: "",
  smtlCd: "",
  smtlLoc: "",
  csmTp: "",
  smtlClrCd: "",
};

const labelOf = (
  options: readonly { value: string; label: string }[],
  code: string,
) => (code ? (options.find((o) => o.value === code)?.label ?? "") : "");

const notTotalRow = (row: Record<string, unknown>) => !row.isTotal;

const COLUMNS: GridColumn[] = [
  { key: "csmDocNo", header: "문서번호", width: 150, pinned: "left" },
  { key: "smtlKndTp", header: "품목", width: 90 },
  { key: "smtlSpc", header: "규격", width: 260 },
  { key: "smtlGiglTpNm", header: "제품구분", width: 80, align: "center" },
  { key: "smtlSlpNm", header: "공급업체", width: 160 },
  {
    key: "whsGroup",
    header: "입고",
    children: [
      { key: "whsPrsDh", header: "입고일자", width: 100, align: "center" },
      { key: "whsTpNm", header: "입고구분", width: 80, align: "center" },
      numberColumn("untPrc", "단가", 80),
      { key: "priceUnit", header: "통화", width: 60, align: "center" },
      numberColumn("whsQty", "입고량", 80),
    ],
  },
  {
    key: "csmGroup",
    header: "소모 수량",
    children: [
      numberColumn("invenCurQty", "직전재고량", 90),
      numberColumn("csmQty", "소모량", 90),
      { key: "csmUnt", header: "단위", width: 60, align: "center" },
      numberColumn("csmCnt", "개수", 60),
      numberColumn("csmTopLosQty", "T.Loss", 70),
      numberColumn("csmEndLosQty", "E.Loss", 70),
    ],
  },
  { key: "remark", header: "특기사항", width: 140 },
  numberColumn("smtlFlmWth", "필름폭", 70),
  { key: "smtlLoc", header: "위치", width: 100, align: "center" },
  { key: "procCd", header: "공정", width: 60, align: "center" },
  { key: "smtlLotNo", header: "LOT", width: 120 },
  { key: "smtlId", header: "포장ID", width: 100, align: "center" },
  { key: "smtlCd", header: "자재코드", width: 110 },
  { key: "csmPrsId", header: "처리자", width: 80, align: "center" },
  { key: "csmPrsDh", header: "소모일시", width: 140, align: "center" },
  { key: "csmPstDd", header: "소모전기일", width: 100, align: "center" },
  {
    key: "csmTp",
    header: "소모구분",
    width: 90,
    align: "center",
    render: (value) => (
      <ToneBadge
        value={value}
        tones={{
          일반소모: "info",
          폐기소모: "danger",
          반출소모: "warning",
          반품소모: "warning",
          조정소모: "warning",
          원재료소모: "info",
        }}
      />
    ),
  },
  { key: "csmWay", header: "소모방법", width: 90, align: "center" },
  { key: "pdaUiTp", header: "구분", width: 60, align: "center" },
  { key: "discYn", header: "폐기대상", width: 70, align: "center" },
  { key: "discCmt", header: "폐기사유", width: 140 },
  { key: "badJdgCmt", header: "판정사유", width: 160, editable: notTotalRow },
  {
    key: "badRmnCmt",
    header: "A급잔량발생사유",
    width: 160,
    editable: notTotalRow,
  },
  { key: "useFreqTp", header: "사용빈도", width: 80, align: "center" },
  { key: "unitSmtlId", header: "합본ID", width: 100, align: "center" },
  numberColumn("unitSmtlFlmWth", "합본필름폭", 90),
  numberColumn("unitSmtlFlmLth", "합본필름길이", 100),
  { key: "smtlPrNo", header: "PR번호", width: 100, align: "center" },
  { key: "smtlChgCmt", header: "소모수정사유", width: 140 },
  { key: "ordChrUid", header: "주문담당자", width: 90, align: "center" },
  { key: "moNo", header: "주문MO", width: 90, align: "center" },
  { key: "smtlCharNo", header: "배치번호", hide: true },
];

function filterRows(rows: M30Row[], f: Filters) {
  const knd = labelOf(M30_KND_TP_OPTIONS, f.smtlKndTp);
  const loc = labelOf(M30_LOC_OPTIONS, f.smtlLoc);
  const csm = labelOf(M30_CSM_TP_OPTIONS, f.csmTp);
  return rows.filter(
    (row) =>
      inDateRange(row.csmPstDd, f.fromDt, f.toDt) &&
      (!knd || row.smtlKndTp === knd) &&
      (!loc || row.smtlLoc === loc) &&
      (!csm || row.csmTp === csm) &&
      includesText(row.smtlId, f.smtlId) &&
      includesText(row.smtlCd, f.smtlCd) &&
      includesText(row.smtlSpc, f.smtlClrCd),
  );
}

export function ConsumptionResultScreen() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [edits, setEdits] = useState<Record<string, Partial<M30Row>>>({});
  const [selectedDocNo, setSelectedDocNo] = useState<string | null>(null);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const rows = useMemo(
    () =>
      filterRows(M30_CONSUMPTION_ROWS, applied).map((row) => ({
        ...row,
        ...edits[String(row.csmDocNo)],
      })),
    [applied, edits],
  );

  // 옛 화면 아래 합계 폼(총 건수·총 수량·총 금액)을 표 아래 고정 줄로 옮겼다. 금액은 단가 × 소모량.
  const totals = useMemo(() => {
    const qty = rows.reduce((sum, row) => sum + Number(row.csmQty ?? 0), 0);
    const amount = rows.reduce(
      (sum, row) => sum + Number(row.csmQty ?? 0) * Number(row.untPrc ?? 0),
      0,
    );
    return { qty, amount };
  }, [rows]);
  const pinnedBottomRows = useMemo(
    () => [
      {
        csmDocNo: `합계 ${rows.length.toLocaleString()}건`,
        csmQty: totals.qty,
        isTotal: true,
      },
    ],
    [rows.length, totals.qty],
  );

  const handleSearch = useCallback(() => {
    if (!filters.fromDt || !filters.toDt) {
      showMessage({ message: "처리일을 입력하세요.", alertType: "warning" });
      return;
    }
    if (filters.fromDt > filters.toDt) {
      showMessage({
        message: "시작일이 종료일보다 늦을 수 없습니다.",
        alertType: "warning",
      });
      return;
    }
    setApplied(filters);
    setSelectedDocNo(null);
  }, [filters, showMessage]);

  const handleSave = useCallback(() => {
    showMessage({
      message: "저장되었습니다.",
      alertType: "success",
      toast: true,
    });
  }, [showMessage]);

  const handleCellChange = useCallback(
    ({
      rowKey,
      field,
      newValue,
    }: {
      rowKey: string | number;
      field: string;
      newValue: unknown;
    }) =>
      setEdits((prev) => ({
        ...prev,
        [String(rowKey)]: {
          ...prev[String(rowKey)],
          [field]: String(newValue ?? ""),
        },
      })),
    [],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedDocNo(String(row.csmDocNo)),
    [],
  );

  return (
    <PageLayout
      title="소모실적조회"
      breadcrumb="부재료관리 > 소모관리 > 소모실적조회"
      screenId={SCREEN_ID}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          type: "primary",
          onClick: handleSearch,
          action: "search",
        },
        {
          id: "btn_save",
          label: "저장",
          type: "save",
          onClick: handleSave,
          disabled: !Object.keys(edits).length,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="처리일"
          defaultKey="fromDt"
          type="date"
          value={filters.fromDt}
          onChange={(v) => setFilter("fromDt", v)}
        />
        <SearchField
          label="~"
          type="date"
          value={filters.toDt}
          onChange={(v) => setFilter("toDt", v)}
        />
        <SearchField
          label="품목구분"
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
          label="자재코드"
          name="SMTL_CD"
          value={filters.smtlCd}
          onChange={(v) => setFilter("smtlCd", v)}
        />
        <SearchField
          label="적재위치"
          name="SMTL_LOC"
          type="select"
          options={M30_LOC_OPTIONS}
          value={filters.smtlLoc}
          onChange={(v) => setFilter("smtlLoc", v)}
        />
        <SearchField
          label="소모구분"
          name="CSM_TP"
          type="select"
          options={M30_CSM_TP_OPTIONS}
          value={filters.csmTp}
          onChange={(v) => setFilter("csmTp", v)}
        />
        <SearchField
          label="칼라코드"
          name="SMTL_CLR_CD"
          value={filters.smtlClrCd}
          onChange={(v) => setFilter("smtlClrCd", v)}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="소모실적"
            count={rows.length}
            titleExtra={
              <span>
                총 수량 {formatNumber(totals.qty)} · 총 금액{" "}
                {formatNumber(Math.round(totals.amount))}원
              </span>
            }
          >
            <AgDataGrid
              columns={COLUMNS}
              data={rows}
              rowKey="csmDocNo"
              columnSizing="fixed"
              highlightedRowKey={selectedDocNo}
              onRowClick={handleRowClick}
              onCellValueChanged={handleCellChange}
              pinnedBottomRows={pinnedBottomRows}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
