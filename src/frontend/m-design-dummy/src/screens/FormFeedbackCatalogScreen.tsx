import { useState } from "react";
import { PageLayout, ErrorModal } from "@dk-oasis/shared/layout";
import {
  Button,
  Checkbox,
  ComboBox,
  DatePicker,
  FormGroup,
  Input,
  LoadingOverlay,
  MultiSelectComboBox,
  ProgressBar,
  Radio,
  Select,
  Spinner,
  Textarea,
} from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { ErrorBoundary } from "@dk-oasis/shared/error-boundary";
import {
  LookupIconButton,
  LookupModal,
  LookupTextField,
  type LookupFetchFn,
  type LookupRow,
} from "@dk-oasis/shared/lookup";
import { Tabs } from "@dk-oasis/shared/tabs";
import { Tree, type TreeNode } from "@dk-oasis/shared/tree";

const COMBO_OPTIONS = [
  { code: "SLT", name: "Slitting" },
  { code: "ANN", name: "Annealing" },
  { code: "INS", name: "Inspection" },
  { code: "PKG", name: "Packaging" },
];

const LOOKUP_ROWS: Array<LookupRow & { plant: string }> = [
  { code: "FG-AL-1250", name: "알루미늄 코일 1,250mm", plant: "GMP" },
  { code: "FG-AL-980", name: "알루미늄 코일 980mm", plant: "GMP" },
  { code: "SF-CU-600", name: "동박 반제품 600mm", plant: "PH" },
  { code: "RM-AL-INGOT", name: "알루미늄 잉곳", plant: "GMP" },
  { code: "RM-CU-COIL", name: "동 코일 원자재", plant: "PH" },
];

const TREE_ITEMS: TreeNode[] = [
  {
    id: "plant-gmp",
    label: "김포공장",
    children: [
      {
        id: "line-gmp-a",
        label: "압연 A라인",
        children: [
          { id: "res-101", label: "SLT-101  1호 슬리터" },
          { id: "res-102", label: "ANN-201  소둔로 1호기" },
        ],
      },
      { id: "line-gmp-b", label: "검사·포장 라인" },
    ],
  },
  {
    id: "plant-ph",
    label: "포항공장",
    children: [{ id: "line-ph-a", label: "동박 생산라인" }],
  },
];

const fetchLookupRows: LookupFetchFn = async ({
  keyword,
  page,
  size,
  filters,
  signal,
}) => {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 180);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("조회 취소", "AbortError"));
    });
  });
  const query = keyword.trim().toLowerCase();
  const filtered = LOOKUP_ROWS.filter(
    (row) =>
      (!filters.plant || row.plant === filters.plant) &&
      (!query || `${row.code} ${row.name}`.toLowerCase().includes(query)),
  );
  return {
    rows: filtered.slice(page * size, page * size + size),
    totalElements: filtered.length,
  };
};

export function FormFeedbackCatalogScreen() {
  const { showMessage } = useMessage();
  const [activeTab, setActiveTab] = useState("basic");
  const [treeExpanded, setTreeExpanded] = useState<(string | number)[]>([
    "plant-gmp",
    "line-gmp-a",
  ]);
  const [treeSelected, setTreeSelected] = useState("res-101");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupValue, setLookupValue] = useState("FG-AL-1250");
  const [form, setForm] = useState({
    itemName: "알루미늄 코일 1,250mm",
    plant: "GMP",
    date: "2026-07-30",
    operation: "SLT",
    operations: ["SLT"],
    priority: "NORMAL",
    enabled: true,
    memo: "디자인 검토 중인 로컬 샘플입니다.",
  });

  const runLoadingSample = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 850);
  };

  return (
    <PageLayout
      title="폼·피드백 컴포넌트"
      breadcrumb="디자인 검토 > 컴포넌트 카탈로그 > 폼·피드백"
      screenId="DSN-CAT-001"
      buttons={[
        {
          id: "save",
          label: "로컬 저장",
          type: "save",
          action: "save",
          onClick: () =>
            showMessage({
              message: "입력 상태를 브라우저 메모리에 저장했습니다.",
              alertType: "success",
              toast: true,
            }),
        },
        {
          id: "reset",
          label: "초기화",
          onClick: () =>
            showMessage({
              title: "입력값 초기화",
              message: "현재 입력값을 초기 상태로 되돌리시겠습니까?",
              alertType: "confirm",
              onConfirm: () =>
                setForm((current) => ({
                  ...current,
                  itemName: "",
                  memo: "",
                })),
            }),
        },
      ]}
    >
      <div className="catalog-scroll">
        <section className="catalog-intro">
          <strong>shared 폼·피드백 전체 구성</strong>
          <span>
            입력, 선택, 검색, 트리, 탭, 모달, 메시지, 오류, 로딩과 진행 상태를
            한 화면에서 비교합니다.
          </span>
        </section>

        <div className="catalog-two-column">
          <section className="catalog-panel">
            <header>
              <strong>입력 및 선택</strong>
            </header>
            <div className="catalog-panel__body catalog-form-grid">
              <FormGroup label="품목코드" required>
                <LookupTextField
                  value={lookupValue}
                  onChange={setLookupValue}
                  onSearch={() => setLookupOpen(true)}
                  onOpenPopup={() => setLookupOpen(true)}
                  placeholder="품목코드 입력"
                />
              </FormGroup>
              <FormGroup label="품목명">
                <Input
                  value={form.itemName}
                  onChange={(itemName) =>
                    setForm((current) => ({ ...current, itemName }))
                  }
                />
              </FormGroup>
              <FormGroup label="공장">
                <Select
                  value={form.plant}
                  onChange={(plant) =>
                    setForm((current) => ({ ...current, plant }))
                  }
                  options={[
                    { value: "GMP", label: "김포공장" },
                    { value: "PH", label: "포항공장" },
                  ]}
                />
              </FormGroup>
              <FormGroup label="기준일">
                <DatePicker
                  value={form.date}
                  onChange={(date) =>
                    setForm((current) => ({ ...current, date }))
                  }
                />
              </FormGroup>
              <FormGroup label="주 공정">
                <ComboBox
                  data={COMBO_OPTIONS}
                  valueField="code"
                  labelField="name"
                  value={form.operation}
                  onChange={(operation) =>
                    setForm((current) => ({ ...current, operation }))
                  }
                />
              </FormGroup>
              <FormGroup label="대상 공정">
                <MultiSelectComboBox
                  data={COMBO_OPTIONS}
                  valueField="code"
                  labelField="name"
                  value={form.operations}
                  onChange={(operations) =>
                    setForm((current) => ({ ...current, operations }))
                  }
                />
              </FormGroup>
              <FormGroup label="우선순위">
                <Radio
                  name="priority"
                  value={form.priority}
                  onChange={(priority) =>
                    setForm((current) => ({ ...current, priority }))
                  }
                  options={[
                    { value: "NORMAL", label: "일반" },
                    { value: "URGENT", label: "긴급" },
                  ]}
                />
              </FormGroup>
              <FormGroup label="사용여부">
                <Checkbox
                  checked={form.enabled}
                  onChange={(enabled) =>
                    setForm((current) => ({ ...current, enabled }))
                  }
                  label={form.enabled ? "사용" : "미사용"}
                />
              </FormGroup>
              <FormGroup
                label="비활성 입력"
                tip="비활성·읽기 전용 상태도 함께 비교합니다."
              >
                <Input value="시스템 자동 생성" disabled />
              </FormGroup>
              <FormGroup label="검증 오류" className="catalog-form-grid__error">
                <Input value="" error="필수 입력 항목입니다." />
              </FormGroup>
              <FormGroup label="메모" className="catalog-form-grid__wide">
                <Textarea
                  rows={3}
                  value={form.memo}
                  onChange={(memo) =>
                    setForm((current) => ({ ...current, memo }))
                  }
                />
              </FormGroup>
            </div>
          </section>

          <section className="catalog-panel">
            <header>
              <strong>트리 및 탭</strong>
            </header>
            <Tabs
              items={[
                { key: "basic", label: "조직·자원" },
                { key: "setting", label: "탭 상태" },
                { key: "disabled", label: "비활성", disabled: true },
              ]}
              activeKey={activeTab}
              onChange={setActiveTab}
            />
            <div className="catalog-tree-area">
              {activeTab === "basic" ? (
                <>
                  <Tree
                    items={TREE_ITEMS}
                    expandedItems={treeExpanded}
                    selectedItems={treeSelected}
                    onExpandedItemsChange={(_, values) =>
                      setTreeExpanded(values)
                    }
                    onSelectedItemsChange={(_, value) => setTreeSelected(value)}
                  />
                  <div className="catalog-selection">
                    <span>선택 노드</span>
                    <strong>{treeSelected}</strong>
                  </div>
                </>
              ) : (
                <div className="catalog-empty-note">
                  Tabs의 활성·비활성 상태와 키보드 포커스를 확인하는 영역입니다.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="catalog-two-column">
          <section className="catalog-panel">
            <header>
              <strong>메시지 및 모달</strong>
            </header>
            <div className="catalog-action-grid">
              <Button
                variant="primary"
                onClick={() =>
                  showMessage({
                    message: "정상 처리되었습니다.",
                    alertType: "success",
                    toast: true,
                  })
                }
              >
                성공 Toast
              </Button>
              <Button
                onClick={() =>
                  showMessage({
                    title: "확인 메시지",
                    message: "MessageModal의 확인·취소 구성을 검토합니다.",
                    alertType: "confirm",
                  })
                }
              >
                MessageModal
              </Button>
              <Button onClick={() => setModalOpen(true)}>Modal</Button>
              <Button
                variant="danger"
                onClick={() =>
                  setErrorMessage(
                    "샘플 오류입니다. 실제 백엔드 요청은 발생하지 않았습니다.",
                  )
                }
              >
                ErrorModal
              </Button>
              <Button onClick={() => setLookupOpen(true)}>LookupModal</Button>
              <span className="catalog-icon-sample">
                <LookupIconButton
                  onClick={() => setLookupOpen(true)}
                  ariaLabel="품목 상세 검색"
                />
                <small>LookupIconButton</small>
              </span>
            </div>
            <ErrorBoundary fallback={<div>오류 경계 대체 화면</div>}>
              <div className="error-boundary-sample">
                <strong>ErrorBoundary</strong>
                <span>정상 렌더링 상태 · 하위 오류 발생 시 대체 UI 제공</span>
              </div>
            </ErrorBoundary>
          </section>

          <section className="catalog-panel">
            <header>
              <strong>로딩 및 진행 상태</strong>
            </header>
            <div className="catalog-loading-stage">
              <LoadingOverlay
                visible={loading}
                label="로컬 샘플 처리 중..."
                size={36}
              />
              <div className="spinner-row">
                <Spinner size={24} label="기본" />
                <Spinner size={34} color="#2f7d66" label="강조" />
                <Button size="sm" onClick={runLoadingSample}>
                  Overlay 실행
                </Button>
              </div>
              <div className="progress-samples">
                <ProgressBar
                  status="running"
                  value={64}
                  label="계획 계산 64 / 100"
                  showPercent
                />
                <ProgressBar
                  status="completed"
                  value={100}
                  label="데이터 검증 완료"
                  showPercent
                />
                <ProgressBar
                  status="error"
                  value={38}
                  label="가용능력 검증 중단"
                  showPercent
                />
                <ProgressBar status="running" label="결과 취합 중" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title="공통 Modal 샘플"
        size="sm"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              확인
            </Button>
          </>
        }
      >
        <div className="catalog-modal-copy">
          본문, 제목, 닫기 버튼, Footer 액션의 간격과 정렬을 검토합니다.
        </div>
      </Modal>

      <LookupModal
        open={lookupOpen}
        title="품목 선택"
        initialKeyword={lookupValue}
        placeholder="품목코드 또는 품목명"
        filters={[
          {
            key: "plant",
            label: "공장",
            options: [
              { value: "", label: "전체" },
              { value: "GMP", label: "김포공장" },
              { value: "PH", label: "포항공장" },
            ],
          },
        ]}
        fetchFn={fetchLookupRows}
        onSelect={(row) => {
          setLookupValue(row.code);
          setForm((current) => ({ ...current, itemName: row.name }));
        }}
        onClose={() => setLookupOpen(false)}
      />
      <ErrorModal
        message={errorMessage}
        onClose={() => setErrorMessage(null)}
      />
    </PageLayout>
  );
}
