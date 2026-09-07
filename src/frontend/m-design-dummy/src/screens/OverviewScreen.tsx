import { useState } from "react";
import { PageLayout } from "@dk-oasis/shared/layout";
import {
  Button,
  Checkbox,
  DatePicker,
  FormGroup,
  Input,
  Select,
  Textarea,
} from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { StatusBadge } from "../components/StatusBadge";

const TOKEN_ROWS = [
  {
    token: "--color-primary",
    value: "#337ab7",
    usage: "조회 버튼, 선택 상태",
    color: "var(--color-primary)",
  },
  {
    token: "--color-danger",
    value: "#d9534f",
    usage: "삭제, 오류 상태",
    color: "var(--color-danger)",
  },
  {
    token: "--color-selection",
    value: "#e3f2fd",
    usage: "그리드 선택 행",
    color: "var(--color-selection)",
  },
  {
    token: "--color-bg-header",
    value: "#f5f6f7",
    usage: "패널 및 그리드 헤더",
    color: "var(--color-bg-header)",
  },
  {
    token: "--color-border-grid",
    value: "#d0d0d0",
    usage: "업무 화면 경계선",
    color: "var(--color-border-grid)",
  },
  {
    token: "--form-height",
    value: "26px",
    usage: "입력 요소 기본 높이",
    color: "transparent",
  },
];

const PATTERN_ROWS = [
  {
    screen: "폼·피드백 컴포넌트",
    components: "Form 전체 / Lookup / Tree / Tabs / Modal / Progress",
    behavior: "입력, 선택, 조회, 메시지, 오류, 로딩 상태",
  },
  {
    screen: "데이터 표시 컴포넌트",
    components: "AG·MUI·Custom Grid / Badge / Pagination / Matrix",
    behavior: "Grid 전환, 다중 선택, 도움말, 페이지 전환",
  },
  {
    screen: "레이아웃·스플리터",
    components: "ContentBody / ResizableFormPanel / MaxHandle",
    behavior: "좌우 크기 조절, 패널 최대화, 상세 편집",
  },
  {
    screen: "품목 기준정보 관리",
    components: "PageLayout / SearchArea / GridPanel / AgDataGrid",
    behavior: "조회, 행 추가·복사·삭제, 인라인 편집, CSV",
  },
  {
    screen: "작업장·자원 관리",
    components: "상하 연동 Grid / ResizableFormPanel / FormGroup / Modal",
    behavior: "워크센터 선택, 소속 자원 조회·할당, 상세 편집",
  },
  {
    screen: "스케줄 현황(대시보드)",
    components: "KPI / LineChart / DonutChart / 예외 Grid",
    behavior: "조회 조건 변경, 예외 선택 및 확인",
  },
  {
    screen: "KPI·차트 종합 대시보드",
    components: "Pie / HBar / Donut / Line / StackedBar",
    behavior: "공장·교대·기간 조건별 전체 차트 비교",
  },
  {
    screen: "스케줄 현황(간트차트)",
    components: "스케줄 목록 / 시간축 / 자원 / 공정 상세",
    behavior: "목록 조회, 보기 전환, 확대·축소, 공정 상세",
  },
  {
    screen: "작업지시 현황(간트차트)",
    components: "공정·자원 Lane / 작업지시 Bar / Anchor / 상세",
    behavior: "공정 필터, 그룹 전환, 시간·일·주 Zoom",
  },
  {
    screen: "부적합가공검토",
    components: "조회 Grid / 검토 SET / FormGroup / Modal",
    behavior: "부적합 선택, 가공검토내역 입력 및 저장",
  },
];

const COVERAGE_ROWS = [
  {
    screen: "Portal",
    components:
      "PortalShell · Sidebar · Header · TabsBar · 메뉴검색 · 즐겨찾기",
    behavior: "실제 shared PortalShell이 자동 구성",
  },
  {
    screen: "Layout",
    components:
      "PageLayout · SearchArea/Field/History · ContentBody/Panel · ResizableFormPanel · MaxHandle · ErrorModal",
    behavior: "레이아웃·스플리터 화면",
  },
  {
    screen: "Form",
    components:
      "Button · Input · Select · Checkbox · DatePicker · Radio · Textarea · FormGroup · ComboBox · MultiSelect · Spinner · LoadingOverlay · ProgressBar",
    behavior: "폼·피드백 화면",
  },
  {
    screen: "Grid",
    components:
      "AgDataGrid(DataGrid) · CustomDataGrid · GridPanel/Help · GridBadge/Cell/Group · Pagination",
    behavior: "데이터 표시 화면",
  },
  {
    screen: "Navigation / Lookup",
    components:
      "Tree · Tabs · LookupTextField · LookupIconButton · LookupModal",
    behavior: "폼·피드백 화면",
  },
  {
    screen: "Feedback / Matrix",
    components: "Modal · MessageModal · ErrorBoundary · MatrixTable",
    behavior: "폼·피드백 및 데이터 표시 화면",
  },
  {
    screen: "Charts",
    components:
      "PieChart · HBarChart · DonutChart · LineChart · StackedBarChart",
    behavior: "KPI·차트 종합 대시보드",
  },
];

export function OverviewScreen({
  onOpenRepresentative,
}: {
  onOpenRepresentative: () => void;
}) {
  const { showMessage } = useMessage();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    itemCode: "FG-AL-1250",
    plant: "GMP",
    date: "2026-07-30",
    useYn: true,
    memo: "공통 폼의 라벨, 입력 높이, 간격을 확인합니다.",
  });

  const showToast = () =>
    showMessage({
      message: "공통 메시지 컴포넌트가 정상적으로 동작합니다.",
      toast: true,
      alertType: "success",
    });

  return (
    <PageLayout
      title="UI 디자인 기준"
      breadcrumb="디자인 검토 > UI 디자인 기준"
      screenId="DSN-UI-001"
      buttons={[
        {
          id: "open-pattern",
          label: "대표 화면 열기",
          type: "primary",
          onClick: onOpenRepresentative,
        },
        {
          id: "open-modal",
          label: "모달 확인",
          onClick: () => setModalOpen(true),
        },
      ]}
    >
      <div className="overview-scroll">
        <section className="overview-notice">
          <strong>디자인 검토 범위</strong>
          <p>
            이 프로젝트는 운영 포털과 동일한 PortalShell 및 shared 컴포넌트를
            사용합니다. 화면 데이터는 로컬에 있으며 백엔드를 호출하지 않습니다.
          </p>
          <dl>
            <div>
              <dt>공통 스타일</dt>
              <dd>shared/src</dd>
            </div>
            <div>
              <dt>화면 조합</dt>
              <dd>m-design-dummy/src/screens</dd>
            </div>
            <div>
              <dt>실행 데이터</dt>
              <dd>m-design-dummy/src/data/mock-data.ts</dd>
            </div>
          </dl>
        </section>

        <div className="overview-columns">
          <section className="overview-panel">
            <header>공통 디자인 토큰</header>
            <div className="overview-panel__body">
              <div className="token-table">
                <div className="token-table__head">
                  <span>토큰</span>
                  <span>기본값</span>
                  <span>적용 영역</span>
                </div>
                {TOKEN_ROWS.map((row) => (
                  <div className="token-table__row" key={row.token}>
                    <span>
                      <i
                        className="token-swatch"
                        style={{
                          background: row.color,
                          borderStyle:
                            row.color === "transparent" ? "dashed" : "solid",
                        }}
                      />
                      <code>{row.token}</code>
                    </span>
                    <strong>{row.value}</strong>
                    <span>{row.usage}</span>
                  </div>
                ))}
              </div>
              <p className="overview-path">
                수정 위치: <code>shared/src/styles/variables.css</code>
              </p>
            </div>
          </section>

          <section className="overview-panel">
            <header>폼 및 상태 컴포넌트</header>
            <div className="overview-panel__body">
              <div className="sample-form">
                <FormGroup
                  label="품목코드"
                  required
                  tip="FormGroup의 라벨과 도움말 표시를 확인합니다."
                >
                  <Input
                    value={form.itemCode}
                    onChange={(itemCode) =>
                      setForm((prev) => ({ ...prev, itemCode }))
                    }
                  />
                </FormGroup>
                <FormGroup label="공장">
                  <Select
                    value={form.plant}
                    onChange={(plant) =>
                      setForm((prev) => ({ ...prev, plant }))
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
                    onChange={(date) => setForm((prev) => ({ ...prev, date }))}
                  />
                </FormGroup>
                <FormGroup label="사용여부">
                  <Checkbox
                    checked={form.useYn}
                    onChange={(useYn) =>
                      setForm((prev) => ({ ...prev, useYn }))
                    }
                    label={form.useYn ? "사용" : "미사용"}
                  />
                </FormGroup>
                <FormGroup label="검토 메모" className="form-group--textarea">
                  <Textarea
                    value={form.memo}
                    onChange={(memo) => setForm((prev) => ({ ...prev, memo }))}
                  />
                </FormGroup>
              </div>
              <div className="status-sample-row">
                <StatusBadge value="가동" />
                <StatusBadge value="점검" />
                <StatusBadge value="Critical" />
                <StatusBadge value="완료" />
                <Button size="sm" onClick={() => setModalOpen(true)}>
                  모달
                </Button>
                <Button size="sm" variant="primary" onClick={showToast}>
                  메시지
                </Button>
              </div>
            </div>
          </section>
        </div>

        <section className="overview-panel">
          <header>대표 화면 구성</header>
          <div className="overview-panel__body overview-panel__body--table">
            <div
              className="pattern-map-table"
              role="table"
              aria-label="대표 화면 구성표"
            >
              <div className="pattern-map-table__head" role="row">
                <span>화면</span>
                <span>사용 컴포넌트</span>
                <span>로컬 동작</span>
              </div>
              {PATTERN_ROWS.map((row) => (
                <div
                  className="pattern-map-table__row"
                  role="row"
                  key={row.screen}
                >
                  <strong>{row.screen}</strong>
                  <span>{row.components}</span>
                  <span>{row.behavior}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overview-panel">
          <header>shared 시각 컴포넌트 사용 범위</header>
          <div className="overview-panel__body overview-panel__body--table">
            <div
              className="pattern-map-table"
              role="table"
              aria-label="shared 시각 컴포넌트 사용 범위"
            >
              <div className="pattern-map-table__head" role="row">
                <span>분류</span>
                <span>포함 컴포넌트</span>
                <span>확인 화면</span>
              </div>
              {COVERAGE_ROWS.map((row) => (
                <div
                  className="pattern-map-table__row"
                  role="row"
                  key={row.screen}
                >
                  <strong>{row.screen}</strong>
                  <span>{row.components}</span>
                  <span>{row.behavior}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={modalOpen}
        title="공통 모달 확인"
        size="md"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>취소</Button>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                showToast();
              }}
            >
              적용
            </Button>
          </>
        }
      >
        <div className="modal-sample-copy">
          <strong>공통 모달 구성</strong>
          <p>제목, 본문, 하단 버튼, ESC 닫기와 포커스 이동을 확인합니다.</p>
        </div>
      </Modal>
    </PageLayout>
  );
}
