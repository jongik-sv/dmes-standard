import { useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  INPUT_BASE,
  INPUT_DISABLED,
  INPUT_READONLY,
  MaxHandle,
  PageLayout,
  ResizableFormPanel,
  SearchArea,
  SearchField,
  SearchHistoryInput,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Checkbox, FormGroup, Input, Select } from "@dk-oasis/shared/form";
import { Tabs } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";

const PANEL_ID_LIST = "splitter-resource-list";
const PANEL_ID_DETAIL = "splitter-resource-detail";
const PAGE_ID = "design-dummy:catalog/resizable-layout";

const RESOURCE_ROWS: Record<string, unknown>[] = [
  {
    id: "SLT-101",
    name: "1호 슬리터",
    workCenter: "SLITTING-01",
    type: "설비",
    capacity: 16,
    efficiency: 94,
    calendar: "GMP-2SHIFT",
    status: "가동",
  },
  {
    id: "SLT-102",
    name: "2호 슬리터",
    workCenter: "SLITTING-01",
    type: "설비",
    capacity: 16,
    efficiency: 91,
    calendar: "GMP-2SHIFT",
    status: "점검",
  },
  {
    id: "ANN-201",
    name: "소둔로 1호기",
    workCenter: "ANNEALING-01",
    type: "설비",
    capacity: 24,
    efficiency: 88,
    calendar: "GMP-24H",
    status: "가동",
  },
  {
    id: "INS-301",
    name: "자동 검사기",
    workCenter: "INSPECTION-01",
    type: "검사",
    capacity: 20,
    efficiency: 97,
    calendar: "GMP-2SHIFT",
    status: "가동",
  },
  {
    id: "PKG-401",
    name: "포장 1호기",
    workCenter: "PACKING-01",
    type: "설비",
    capacity: 16,
    efficiency: 86,
    calendar: "GMP-DAY",
    status: "대기",
  },
];

const COLUMNS: GridColumn[] = [
  { key: "id", header: "자원코드", width: 105, pinned: "left" },
  { key: "name", header: "자원명", width: 150 },
  { key: "workCenter", header: "작업장", width: 145 },
  { key: "type", header: "유형", width: 70, align: "center" },
  { key: "capacity", header: "능력(h)", width: 75, align: "right" },
  { key: "efficiency", header: "효율(%)", width: 75, align: "right" },
  { key: "calendar", header: "Calendar", width: 120 },
  { key: "status", header: "상태", width: 70, align: "center" },
];

export function ResizableLayoutCatalogScreen() {
  const { showMessage } = useMessage();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(String(RESOURCE_ROWS[0].id));
  const [activeTab, setActiveTab] = useState("basic");
  const [detail, setDetail] = useState({
    name: String(RESOURCE_ROWS[0].name),
    calendar: String(RESOURCE_ROWS[0].calendar),
    capacity: String(RESOURCE_ROWS[0].capacity),
    finite: true,
  });

  const visibleRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return RESOURCE_ROWS.filter(
      (row) =>
        (!status || row.status === status) &&
        (!query ||
          `${row.id} ${row.name} ${row.workCenter}`
            .toLowerCase()
            .includes(query)),
    );
  }, [keyword, status]);

  const selectRow = (row: Record<string, unknown>) => {
    setSelectedId(String(row.id));
    setDetail({
      name: String(row.name),
      calendar: String(row.calendar),
      capacity: String(row.capacity),
      finite: true,
    });
  };

  return (
    <PageLayout
      title="레이아웃·스플리터"
      className="splitter-catalog-page"
      breadcrumb="디자인 검토 > 컴포넌트 카탈로그 > 레이아웃·스플리터"
      screenId="DSN-CAT-003"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: () =>
            showMessage({
              message: `${visibleRows.length}개 자원을 조회했습니다.`,
              toast: true,
            }),
        },
        {
          id: "save",
          label: "로컬 저장",
          type: "save",
          onClick: () =>
            showMessage({
              message: `${selectedId} 상세정보를 로컬 상태에 저장했습니다.`,
              toast: true,
              alertType: "success",
            }),
        },
      ]}
    >
      <SearchArea>
        <SearchField label="자원 검색">
          <SearchHistoryInput
            pageId={PAGE_ID}
            historyKey="resource-keyword"
            value={keyword}
            onChange={setKeyword}
            placeholder="자원코드 또는 자원명"
          />
        </SearchField>
        <SearchField
          label="상태"
          type="select"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "전체" },
            { value: "가동", label: "가동" },
            { value: "점검", label: "점검" },
            { value: "대기", label: "대기" },
          ]}
        />
      </SearchArea>

      <div className="splitter-instruction">
        <strong>크기 조정</strong>
        <span>
          좌우 패널 사이의 세로 핸들을 드래그하여 상세영역 너비를 변경합니다. 각
          패널의 우측 상단 버튼으로 최대화·복원할 수 있습니다.
        </span>
      </div>

      <ContentBody root>
        <ContentPanel panelId={PANEL_ID_LIST}>
          <GridPanel
            title="자원 목록"
            count={visibleRows.length}
            headerExtra={<MaxHandle panelId={PANEL_ID_LIST} />}
          >
            <AgDataGrid
              columns={COLUMNS}
              data={visibleRows}
              rowKey="id"
              height="100%"
              columnSizing="fit"
              highlightedRowKey={selectedId}
              onRowClick={selectRow}
              ariaLabel="크기 조정 레이아웃 자원 목록"
            />
          </GridPanel>
        </ContentPanel>

        <ResizableFormPanel
          panelId={PANEL_ID_DETAIL}
          defaultWidth={390}
          minWidth={300}
          maxWidth={650}
        >
          <section className="splitter-detail-panel">
            <header>
              <div>
                <strong>자원 상세</strong>
                <span>{selectedId}</span>
              </div>
              <MaxHandle panelId={PANEL_ID_DETAIL} />
            </header>
            <Tabs
              items={[
                { key: "basic", label: "기본정보" },
                { key: "capacity", label: "능력·Calendar" },
              ]}
              activeKey={activeTab}
              onChange={setActiveTab}
            />
            <div className="splitter-detail-panel__body">
              {activeTab === "basic" ? (
                <>
                  <FormGroup label="자원코드">
                    <Input value={selectedId} readOnly />
                  </FormGroup>
                  <FormGroup label="자원명" required>
                    <Input
                      value={detail.name}
                      onChange={(name) =>
                        setDetail((current) => ({ ...current, name }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Calendar">
                    <Select
                      value={detail.calendar}
                      onChange={(calendar) =>
                        setDetail((current) => ({ ...current, calendar }))
                      }
                      options={["GMP-2SHIFT", "GMP-24H", "GMP-DAY"]}
                    />
                  </FormGroup>
                  <FormGroup label="유한능력">
                    <Checkbox
                      checked={detail.finite}
                      onChange={(finite) =>
                        setDetail((current) => ({ ...current, finite }))
                      }
                      label="적용"
                    />
                  </FormGroup>
                </>
              ) : (
                <table style={DETAIL_TABLE_STYLE}>
                  <tbody>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>표준 능력</th>
                      <td style={DETAIL_VALUE_CELL}>
                        <input
                          value={detail.capacity}
                          onChange={(event) =>
                            setDetail((current) => ({
                              ...current,
                              capacity: event.target.value,
                            }))
                          }
                          style={INPUT_BASE}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>실적 효율</th>
                      <td style={DETAIL_VALUE_CELL}>
                        <input
                          value="94.0 %"
                          readOnly
                          style={{ ...INPUT_BASE, ...INPUT_READONLY }}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th style={DETAIL_LABEL_CELL}>자동 계산</th>
                      <td style={DETAIL_VALUE_CELL}>
                        <input
                          value="시스템 관리"
                          disabled
                          style={{ ...INPUT_BASE, ...INPUT_DISABLED }}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </ResizableFormPanel>
      </ContentBody>
    </PageLayout>
  );
}
