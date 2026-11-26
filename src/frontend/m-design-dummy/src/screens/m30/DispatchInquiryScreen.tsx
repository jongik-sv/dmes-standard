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
  M30_DISPATCH_DETAILS,
  M30_DISPATCH_ROWS,
  type M30Row,
} from "../../data/m30-mock-data";
import {
  DUMMY_ACTION_MESSAGE,
  ToneBadge,
  includesText,
  inDateRange,
  numberColumn,
} from "./m30-common";

/** M301001010 배차정보 조회 — 조회조건 + 배차 공통(위) + 배차 상세(아래) 상하 분할. */
const SCREEN_ID = "M301001010";

type Filters = {
  fromDt: string;
  toDt: string;
  rfidNo: string;
  carNoFul: string;
  alcCarNo: string;
  smtlClrCd: string;
  smtlId: string;
  smtlSlpCd: string;
  includeTp: string;
};

const INITIAL_FILTERS: Filters = {
  fromDt: "2026-11-01",
  toDt: "2026-11-24",
  rfidNo: "",
  carNoFul: "",
  alcCarNo: "",
  smtlClrCd: "",
  smtlId: "",
  smtlSlpCd: "",
  includeTp: "",
};

const INCLUDE_OPTIONS = [
  { value: "", label: "포함 안 함" },
  { value: "CNL", label: "배차취소 포함" },
  { value: "CLT", label: "입고완료 포함" },
  { value: "ALL", label: "둘 다 포함" },
];

const MASTER_COLUMNS: GridColumn[] = [
  { key: "alcCarNo", header: "배차번호", width: 130, pinned: "left" },
  {
    key: "smtlAlcPrgNm",
    header: "상태",
    width: 70,
    align: "center",
    render: (value) => (
      <ToneBadge
        value={value}
        tones={{
          확정: "info",
          완료: "success",
          취소: "danger",
          등록: "warning",
        }}
      />
    ),
  },
  { key: "carNoFul", header: "차량번호", width: 90, align: "center" },
  { key: "rfidNo", header: "RFID", width: 70, align: "center" },
  { key: "drvTelNo", header: "운전자 전화번호", width: 130, align: "center" },
  { key: "drvNm", header: "운전자명", width: 90, align: "center" },
  { key: "alcCarDd", header: "입(출)문예정일", width: 110, align: "center" },
  { key: "alcCarRgsDh", header: "배차등록일시", width: 140, align: "center" },
  { key: "meaReqNo", header: "계량요청번호", width: 130, align: "center" },
  { key: "rgsUiNm", header: "구분", width: 70, align: "center" },
  { key: "smtlSlpNm", header: "공급(반출)업체", width: 220 },
  { key: "sampleYn", header: "샘플링요청", width: 90, align: "center" },
  { key: "smtlAlcPrgCd", header: "진행상태코드", hide: true },
  { key: "smtlSlpCd", header: "공급업체코드", hide: true },
  { key: "rgsUi", header: "등록화면 ID", hide: true },
  { key: "alcCarCfmDh", header: "배차확정일", hide: true },
  { key: "cicoTp", header: "반출여부", hide: true },
];

const DETAIL_COLUMNS: GridColumn[] = [
  { key: "smtlId", header: "포장ID", width: 100, pinned: "left" },
  { key: "smtlSpc", header: "규격", width: 300 },
  { key: "smtlCd", header: "부재료코드", width: 130 },
  { key: "smtlCharNo", header: "배치번호", width: 80, align: "center" },
  { key: "whsTp", header: "입고구분", width: 70, align: "center" },
  { key: "smtlLotNo", header: "LOT번호", width: 120 },
  { key: "smtlPrNo", header: "PR번호", width: 100, align: "center" },
  { key: "procCd", header: "공정코드", width: 70, align: "center" },
  { key: "smtlFlowChl", header: "유통경로", width: 70, align: "center" },
  {
    key: "alcGroup",
    header: "배차",
    children: [
      numberColumn("alcCarQty", "수량", 80),
      numberColumn("crynRepQty", "대체", 70),
      { key: "alcCarUnt", header: "단위", width: 60, align: "center" },
    ],
  },
  {
    key: "deGroup",
    header: "공제물",
    children: [
      { key: "deTp", header: "유형", width: 110 },
      numberColumn("deCnt", "개수", 60),
    ],
  },
  {
    key: "pltGroup",
    header: "파렛트",
    children: [
      { key: "pltTp", header: "유형", width: 110 },
      numberColumn("pltCnt", "개수", 60),
    ],
  },
  {
    key: "carLodCpltYn",
    header: "하차상차여부",
    width: 90,
    align: "center",
    render: (value) => <ToneBadge value={value} tones={{ Y: "success" }} />,
  },
  { key: "crytApprYn", header: "반출결제", width: 80, align: "center" },
  { key: "sampleYn", header: "샘플요청", width: 80, align: "center" },
  { key: "smtlFlmWth", header: "필름폭", hide: true },
  { key: "smtlClrCd", header: "컬러코드", hide: true },
  { key: "smtlSlpCd", header: "공급업체코드", hide: true },
  { key: "smtlSlpNm", header: "공급업체명", hide: true },
  { key: "smtlKndTp", header: "부재료품목구분", hide: true },
  { key: "carLodCpltDh", header: "하차완료일시", hide: true },
];

function filterRows(rows: M30Row[], f: Filters) {
  return rows.filter(
    (row) =>
      inDateRange(row.alcCarRgsDh, f.fromDt, f.toDt) &&
      includesText(row.rfidNo, f.rfidNo) &&
      includesText(row.carNoFul, f.carNoFul) &&
      includesText(row.alcCarNo, f.alcCarNo) &&
      includesText(row.smtlSlpCd, f.smtlSlpCd) &&
      // 칼라코드·포장ID 는 상세 행에 있다. 표본 상세가 있는 배차만 걸러진다.
      (!f.smtlClrCd.trim() && !f.smtlId.trim()
        ? true
        : (M30_DISPATCH_DETAILS[String(row.alcCarNo)] ?? []).some(
            (d) =>
              includesText(d.smtlClrCd, f.smtlClrCd) &&
              includesText(d.smtlId, f.smtlId),
          )),
  );
}

export function DispatchInquiryScreen() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [selectedAlcNo, setSelectedAlcNo] = useState<string | null>(null);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const masterRows = useMemo(
    () => filterRows(M30_DISPATCH_ROWS, applied),
    [applied],
  );
  const detailRows = useMemo(
    () => (selectedAlcNo ? (M30_DISPATCH_DETAILS[selectedAlcNo] ?? []) : []),
    [selectedAlcNo],
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
    setSelectedAlcNo(null);
  }, [filters, showMessage]);

  const notImplemented = useCallback(
    () => showMessage({ message: DUMMY_ACTION_MESSAGE, toast: true }),
    [showMessage],
  );

  const handleMasterClick = useCallback(
    (row: Record<string, unknown>) => setSelectedAlcNo(String(row.alcCarNo)),
    [],
  );

  return (
    <PageLayout
      title="배차정보 조회"
      breadcrumb="부재료관리 > 입고관리 > 배차정보 조회"
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
          id: "btn_new",
          label: "신규",
          onClick: notImplemented,
          action: "save",
        },
        {
          id: "btn_modify",
          label: "수정",
          onClick: notImplemented,
          disabled: !selectedAlcNo,
          action: "save",
        },
        {
          id: "btn_cancel",
          label: "배차취소",
          onClick: notImplemented,
          disabled: !selectedAlcNo,
          action: "save",
        },
        {
          id: "btn_confirm",
          label: "확정",
          onClick: notImplemented,
          disabled: !selectedAlcNo,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="배차등록일자"
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
          label="RFID번호"
          name="RFID_NO"
          value={filters.rfidNo}
          onChange={(v) => setFilter("rfidNo", v)}
        />
        <SearchField
          label="차량번호"
          name="CAR_NO_FUL"
          value={filters.carNoFul}
          onChange={(v) => setFilter("carNoFul", v)}
        />
        <SearchField
          label="배차번호"
          name="ALC_CAR_NO"
          value={filters.alcCarNo}
          onChange={(v) => setFilter("alcCarNo", v)}
        />
        <SearchField
          label="칼라코드"
          name="SMTL_CLR_CD"
          value={filters.smtlClrCd}
          onChange={(v) => setFilter("smtlClrCd", v)}
        />
        <SearchField
          label="포장ID"
          name="SMTL_ID"
          value={filters.smtlId}
          onChange={(v) => setFilter("smtlId", v)}
        />
        <SearchField
          label="공급업체코드"
          name="SMTL_SLP_CD"
          value={filters.smtlSlpCd}
          onChange={(v) => setFilter("smtlSlpCd", v)}
        />
        {/* 옛 화면의 「배차취소 포함」·「입고완료 포함」 체크박스 2개. 조회영역 체크박스가
            shared CSS 때문에 보이지 않아 같은 뜻의 선택 상자로 둔다. */}
        <SearchField
          label="포함"
          name="INCLUDE_TP"
          type="select"
          options={INCLUDE_OPTIONS}
          value={filters.includeTp}
          onChange={(v) => setFilter("includeTp", v)}
        />
      </SearchArea>

      <ContentBody
        root
        direction="column"
        resizable
        storageKey="design-dummy.m30.M301001010"
      >
        <ContentPanel>
          <GridPanel
            title="배차 공통 정보"
            count={masterRows.length}
            buttons={[
              {
                id: "btn_ret_print",
                label: "반출증",
                onClick: notImplemented,
                disabled: !selectedAlcNo,
              },
              {
                id: "btn_doc_print",
                label: "배차지시서",
                onClick: notImplemented,
                disabled: !selectedAlcNo,
              },
            ]}
          >
            <AgDataGrid
              gridId="master"
              columns={MASTER_COLUMNS}
              data={masterRows}
              rowKey="alcCarNo"
              columnSizing="fixed"
              highlightedRowKey={selectedAlcNo}
              onRowClick={handleMasterClick}
            />
          </GridPanel>
        </ContentPanel>
        <ContentPanel height="50%">
          <GridPanel
            title="배차 상세 정보"
            count={detailRows.length}
            buttons={[
              {
                id: "btn_sum",
                label: "품목별 배차 수량 합계",
                onClick: notImplemented,
                disabled: !detailRows.length,
              },
              {
                id: "btn_tag",
                label: "TAG 출력",
                onClick: notImplemented,
                disabled: !detailRows.length,
              },
              {
                id: "btn_lamina_tag",
                label: "라미나 TAG 출력",
                onClick: notImplemented,
                disabled: !detailRows.length,
              },
            ]}
          >
            <AgDataGrid
              gridId="detail"
              columns={DETAIL_COLUMNS}
              data={detailRows}
              rowKey="rowId"
              columnSizing="fixed"
              emptyMessage={
                selectedAlcNo
                  ? "표본에 상세가 없는 배차입니다. 공급업체가 다른 배차(예: 20261118A0026)를 눌러 보세요."
                  : "위 목록에서 배차를 선택하세요."
              }
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
