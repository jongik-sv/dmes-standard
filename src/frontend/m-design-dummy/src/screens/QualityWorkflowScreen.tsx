import { useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Button,
  FormGroup,
  Input,
  Select,
  Textarea,
} from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { INITIAL_QUALITY_CASES, type QualityCase } from "../data/mock-data";
import { StatusBadge } from "../components/StatusBadge";

const QUALITY_COLUMNS: GridColumn[] = [
  { key: "requestNo", header: "검사의뢰번호", width: 145, pinned: "left" },
  { key: "itemCode", header: "품목코드", width: 130 },
  { key: "itemName", header: "품목명", width: 190 },
  { key: "lotNo", header: "LOT", width: 130 },
  { key: "process", header: "발생 공정", width: 105, align: "center" },
  { key: "defect", header: "원인코드/코드명", width: 175 },
  { key: "inspectionQty", header: "검사수량", width: 82, align: "right" },
  { key: "defectQty", header: "부적합량", width: 82, align: "right" },
  {
    key: "status",
    header: "상태",
    width: 95,
    align: "center",
    render: (value) => <StatusBadge value={String(value)} />,
  },
  { key: "requestedAt", header: "검사일자", width: 105, align: "center" },
  { key: "owner", header: "담당자", width: 82, align: "center" },
];

const REVIEW_COLUMNS: GridColumn[] = [
  { key: "defect", header: "원인코드명", width: 170 },
  { key: "defectQty", header: "부적합", width: 72, align: "right" },
  { key: "scrapQty", header: "폐기", width: 62, align: "right" },
  { key: "reworkQty", header: "수정", width: 62, align: "right" },
  { key: "inspectionNote", header: "검사내역", width: 210 },
  { key: "qualityNote", header: "품질검토내역", width: 210 },
  { key: "processNote", header: "가공검토내역", width: 210 },
  { key: "reviewRequired", header: "가공검토필요", width: 95, align: "center" },
];

export function QualityWorkflowScreen() {
  const { showMessage } = useMessage();
  const [cases, setCases] = useState<QualityCase[]>(INITIAL_QUALITY_CASES);
  const [plant, setPlant] = useState("{CLIENT}");
  const [inspectionClass, setInspectionClass] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("2026-07-01");
  const [dateTo, setDateTo] = useState("2026-07-30");
  const [selectedId, setSelectedId] = useState(INITIAL_QUALITY_CASES[0].id);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({
    decision: "REWORK",
    reason: "선별 후 Edge 재가공. 재검사 합격 시 정상 투입.",
  });

  const visibleCases = useMemo(() => {
    const normalized = itemFilter.trim().toLowerCase();
    return cases.filter((row) => {
      if (
        normalized &&
        !`${row.itemCode} ${row.itemName} ${row.requestNo} ${row.lotNo}`
          .toLowerCase()
          .includes(normalized)
      ) {
        return false;
      }
      return true;
    });
  }, [cases, itemFilter]);

  const selected =
    cases.find((row) => row.id === selectedId) ??
    visibleCases[0] ??
    cases[0] ??
    null;

  const confirmReview = () => {
    if (!selected) return;
    const nextStatus: QualityCase["status"] =
      selected.status === "완료" ? "완료" : "완료";
    setCases((current) =>
      current.map((row) =>
        row.id === selected.id
          ? {
              ...row,
              status: nextStatus,
              disposition: review.reason,
            }
          : row,
      ),
    );
    setReviewOpen(false);
    showMessage({
      message: `${selected.requestNo} 가공검토 결과를 로컬 상태에 저장했습니다.`,
      alertType: "success",
      toast: true,
    });
  };

  const openReview = () => {
    if (!selected) return;
    setReview({
      decision: selected.status === "조치진행" ? "REWORK" : "REWORK",
      reason: selected.disposition,
    });
    setReviewOpen(true);
  };

  const reviewRows = selected
    ? [
        {
          id: selected.id,
          defect: selected.defect,
          defectQty: selected.defectQty,
          scrapQty: 0,
          reworkQty: selected.defectQty,
          inspectionNote: "외관검사 결과 규격 초과 확인",
          qualityNote: "해당 LOT 격리 및 재검사 필요",
          processNote: review.reason,
          reviewRequired: "필요",
        },
      ]
    : [];

  return (
    <PageLayout
      title="부적합가공검토"
      breadcrumb="품질관리 > 검사운영 > 부적합가공검토"
      screenId="QMA024K"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: () =>
            showMessage({
              message: `${visibleCases.length}건을 로컬 데이터에서 조회했습니다.`,
              toast: true,
            }),
        },
        {
          id: "review",
          label: "가공검토",
          type: "save",
          action: "confirm",
          disabled: !selected,
          onClick: openReview,
        },
      ]}
    >
      <SearchArea>
        <SearchField
          label="공장"
          type="select"
          value={plant}
          options={[{ value: "{CLIENT}", label: "{CLIENT}" }]}
          onChange={setPlant}
        />
        <SearchField
          label="검사분류"
          type="radio"
          value={inspectionClass}
          options={[
            { value: "", label: "전체" },
            { value: "PROCESS", label: "공정검사" },
            { value: "PRODUCT", label: "제품검사" },
            { value: "SHIP", label: "출하검사" },
          ]}
          onChange={setInspectionClass}
        />
        <SearchField label="검사의뢰일자(From)">
          <input
            type="date"
            name="qualityDateFrom"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </SearchField>
        <SearchField label="검사의뢰일자(To)">
          <input
            type="date"
            name="qualityDateTo"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </SearchField>
        <SearchField
          label="품목코드"
          value={itemFilter}
          placeholder="품목코드 / 품목명"
          onChange={setItemFilter}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="부적합 목록 (가공검토대기)"
            count={visibleCases.length}
            help={{
              title: "부적합 목록",
              summary:
                "현행 부적합가공검토 화면처럼 행을 선택하고 가공검토 팝업에서 처리합니다.",
              columns: QUALITY_COLUMNS.map((column) => ({
                header: column.header,
                description: "조회 항목",
              })),
            }}
          >
            <AgDataGrid
              columns={QUALITY_COLUMNS}
              data={visibleCases.map((row) => ({ ...row }))}
              rowKey="id"
              highlightedRowKey={selected?.id}
              onRowClick={(row) => setSelectedId(String(row.id))}
              onRowDoubleClick={(row) => {
                setSelectedId(String(row.id));
                setReviewOpen(true);
              }}
              columnSizing="fit"
              emptyMessage="조회된 부적합 건이 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <Modal
        open={reviewOpen}
        title="부적합가공검토"
        size="xl"
        onClose={() => setReviewOpen(false)}
        footer={
          <>
            <Button onClick={() => setReviewOpen(false)}>닫기</Button>
            <Button variant="primary" onClick={confirmReview}>
              저장
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="quality-review-dialog">
            <div className="form-panel quality-review-master">
              <div className="grid-panel-header">
                <div className="grid-panel-title">
                  <span>부적합 정보</span>
                </div>
                <StatusBadge value={selected.status} />
              </div>
              <div className="quality-review-master__body">
                <FormGroup label="검사의뢰번호" labelWidth={100}>
                  <Input value={selected.requestNo} readOnly />
                </FormGroup>
                <FormGroup label="품목코드" labelWidth={100}>
                  <Input value={selected.itemCode} readOnly />
                </FormGroup>
                <FormGroup label="품명" labelWidth={100}>
                  <Input value={selected.itemName} readOnly />
                </FormGroup>
                <FormGroup label="LOT" labelWidth={100}>
                  <Input value={selected.lotNo} readOnly />
                </FormGroup>
                <FormGroup label="검사수량" labelWidth={100}>
                  <Input value={selected.inspectionQty} readOnly />
                </FormGroup>
                <FormGroup label="부적합수량" labelWidth={100}>
                  <Input value={selected.defectQty} readOnly />
                </FormGroup>
                <FormGroup label="발생 공정" labelWidth={100}>
                  <Input value={selected.process} readOnly />
                </FormGroup>
                <FormGroup label="담당자" labelWidth={100}>
                  <Input value={selected.owner} readOnly />
                </FormGroup>
              </div>
            </div>

            <div className="quality-review-grid">
              <GridPanel title="검토 SET" count={reviewRows.length}>
                <AgDataGrid
                  columns={REVIEW_COLUMNS}
                  data={reviewRows}
                  rowKey="id"
                  highlightedRowKey={selected.id}
                  columnSizing="fixed"
                />
              </GridPanel>
            </div>

            <div className="form-panel quality-review-form">
              <div className="grid-panel-header">
                <div className="grid-panel-title">
                  <span>가공검토내역</span>
                </div>
              </div>
              <div className="form-panel-content">
                <FormGroup label="처리 판정" required labelWidth={120}>
                  <Select
                    value={review.decision}
                    options={[
                      { value: "REWORK", label: "재작업" },
                      { value: "SCRAP", label: "폐기" },
                      { value: "SPECIAL", label: "특채" },
                      { value: "RETURN", label: "공급사 반품" },
                    ]}
                    onChange={(decision) =>
                      setReview((current) => ({ ...current, decision }))
                    }
                  />
                </FormGroup>
                <FormGroup
                  label="가공검토내역"
                  required
                  labelWidth={120}
                  className="form-group--textarea"
                >
                  <Textarea
                    value={review.reason}
                    onChange={(reason) =>
                      setReview((current) => ({ ...current, reason }))
                    }
                    rows={3}
                  />
                </FormGroup>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageLayout>
  );
}
