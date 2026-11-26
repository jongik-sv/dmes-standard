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
  M30_INSPECTION_ROWS,
  M30_KND_TP_OPTIONS,
  type M30Row,
} from "../../data/m30-mock-data";
import {
  DUMMY_ACTION_MESSAGE,
  ToneBadge,
  includesText,
  inDateRange,
  numberColumn,
} from "./m30-common";

/** M301004020 수입검사대상조회 — 조회조건(검색조건·판정결과 라디오) + 판정 대상 목록 1개. */
const SCREEN_ID = "M301004020";

type Filters = {
  searchTp: string;
  resultTp: string;
  smtlKndTp: string;
  fromDt: string;
  toDt: string;
  smtlSlpNm: string;
  smtlLotNo: string;
  smtlSpc: string;
  smtlClrCd: string;
};

const INITIAL_FILTERS: Filters = {
  searchTp: "",
  resultTp: "",
  smtlKndTp: "",
  fromDt: "2026-11-01",
  toDt: "2026-11-24",
  smtlSlpNm: "",
  smtlLotNo: "",
  smtlSpc: "",
  smtlClrCd: "",
};

const SEARCH_TP_OPTIONS = [
  { value: "", label: "전체" },
  { value: "T", label: "검사대상" },
  { value: "N", label: "판정대상" },
  { value: "Y", label: "판정완료" },
];

const RESULT_OPTIONS = [
  { value: "", label: "전체" },
  { value: "합격", label: "합격" },
  { value: "불합격", label: "불합격" },
  { value: "특채", label: "특채" },
];

const KND_LABEL_BY_CODE = Object.fromEntries(
  M30_KND_TP_OPTIONS.map((o) => [o.value, o.label]),
);

const COLUMNS: GridColumn[] = [
  {
    key: "smtlInsReqDd",
    header: "검사의뢰일",
    width: 100,
    align: "center",
    pinned: "left",
  },
  { key: "smtlSlpNm", header: "공급처", width: 170, pinned: "left" },
  { key: "smtlSpc", header: "규격", width: 300 },
  numberColumn("whsQty", "입고량", 80),
  { key: "smtlLotNo", header: "검사LOT", width: 130 },
  { key: "smtlInsId", header: "검사자", width: 80, align: "center" },
  { key: "smtlInsDh", header: "검사일자", width: 100, align: "center" },
  { key: "smtlJdgId", header: "판정자", width: 80, align: "center" },
  { key: "smtlJdgDh", header: "판정일자", width: 100, align: "center" },
  { key: "smtlCd", header: "부재료코드", width: 110 },
  { key: "smtlJdgYn", header: "판정", width: 60, align: "center" },
  {
    key: "smtlInsRltNm",
    header: "합부",
    width: 80,
    align: "center",
    render: (value) => (
      <ToneBadge
        value={value}
        tones={{ 합격: "success", 불합격: "danger", 특채: "warning" }}
      />
    ),
  },
  { key: "addInsYn", header: "추가검사", width: 70, align: "center" },
  { key: "whsDocNo", header: "입고번호", width: 130, align: "center" },
  { key: "smtlCharNo", header: "배치번호", width: 80, align: "center" },
  { key: "smtlKndTpNm", header: "검사품목", width: 90 },
  { key: "smtlPrdNm", header: "품명", width: 90 },
  { key: "smtlInsMthNm", header: "검사방법", width: 100 },
  { key: "smtlJdgCmt", header: "판정자의견", width: 360 },
  { key: "erpSndDh", header: "ERP전송일자", width: 100, align: "center" },
  { key: "sampleYn", header: "샘플링대상", width: 80, align: "center" },
  { key: "smtlInsReqSeqNo", header: "검사의뢰순번", hide: true },
  { key: "jdgCnt", header: "판정건수", hide: true },
  { key: "smtlSlpCd", header: "공급업체코드", hide: true },
];

/** 불합격 행은 shared grid.css 의 오류 행 색으로 칠한다. */
const rejectedRowClass = (row: Record<string, unknown>) =>
  row.smtlInsRltNm === "불합격" ? "ag-row-error" : undefined;

/** 검색조건 라디오: 검사대상=검사 전, 판정대상=검사 후 판정 전, 판정완료=판정 Y. */
function matchesSearchTp(row: M30Row, searchTp: string) {
  if (!searchTp) return true;
  const inspected = Boolean(row.smtlInsDh);
  const judged = row.smtlJdgYn === "Y";
  if (searchTp === "T") return !inspected;
  if (searchTp === "N") return inspected && !judged;
  return judged;
}

function filterRows(rows: M30Row[], f: Filters) {
  const kndLabel = f.smtlKndTp ? KND_LABEL_BY_CODE[f.smtlKndTp] : "";
  return rows.filter(
    (row) =>
      matchesSearchTp(row, f.searchTp) &&
      (!f.resultTp || row.smtlInsRltNm === f.resultTp) &&
      (!kndLabel || row.smtlKndTpNm === kndLabel) &&
      inDateRange(row.smtlInsReqDd, f.fromDt, f.toDt) &&
      includesText(row.smtlSlpNm, f.smtlSlpNm) &&
      includesText(row.smtlLotNo, f.smtlLotNo) &&
      includesText(row.smtlSpc, f.smtlSpc) &&
      includesText(row.smtlSpc, f.smtlClrCd),
  );
}

export function IncomingInspectionScreen() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const rows = useMemo(
    () => filterRows(M30_INSPECTION_ROWS, applied),
    [applied],
  );

  const handleSearch = useCallback(() => {
    if (filters.fromDt && filters.toDt && filters.fromDt > filters.toDt) {
      showMessage({
        message: "시작일이 종료일보다 늦을 수 없습니다.",
        alertType: "warning",
      });
      return;
    }
    setApplied(filters);
    setSelectedId(null);
  }, [filters, showMessage]);

  const notImplemented = useCallback(
    () => showMessage({ message: DUMMY_ACTION_MESSAGE, toast: true }),
    [showMessage],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedId(String(row.rowId)),
    [],
  );

  return (
    <PageLayout
      title="수입검사대상조회"
      breadcrumb="부재료관리 > 입고관리 > 수입검사대상조회"
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
          id: "btn_lot_judge",
          label: "검사LOT판정",
          onClick: notImplemented,
          action: "save",
        },
        {
          id: "btn_print",
          label: "성적서출력",
          onClick: notImplemented,
          disabled: !selectedId,
          action: "print",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="검색조건"
          name="SEARCH_SMTL_JDG_YN"
          className="span-2"
          type="radio"
          options={SEARCH_TP_OPTIONS}
          value={filters.searchTp}
          onChange={(v) => setFilter("searchTp", v)}
        />
        <SearchField
          label="판정결과"
          name="SMTL_INS_RLT_CD"
          className="span-2"
          type="radio"
          options={RESULT_OPTIONS}
          value={filters.resultTp}
          onChange={(v) => setFilter("resultTp", v)}
        />
        <SearchField
          label="검사품목"
          name="SMTL_KND_TP"
          type="select"
          options={M30_KND_TP_OPTIONS}
          value={filters.smtlKndTp}
          onChange={(v) => setFilter("smtlKndTp", v)}
        />
        <SearchField
          label="의뢰일자"
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
          label="공급처"
          name="SMTL_SLP_NM"
          value={filters.smtlSlpNm}
          onChange={(v) => setFilter("smtlSlpNm", v)}
        />
        <SearchField
          label="검사LOT"
          name="SMTL_LOT_NO"
          value={filters.smtlLotNo}
          onChange={(v) => setFilter("smtlLotNo", v)}
        />
        <SearchField
          label="규격"
          name="SMTL_SPC"
          value={filters.smtlSpc}
          onChange={(v) => setFilter("smtlSpc", v)}
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
          <GridPanel title="수입검사 대상 및 결과" count={rows.length}>
            <AgDataGrid
              columns={COLUMNS}
              data={rows}
              rowKey="rowId"
              columnSizing="fixed"
              highlightedRowKey={selectedId}
              onRowClick={handleRowClick}
              getRowClassExtra={rejectedRowClass}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
