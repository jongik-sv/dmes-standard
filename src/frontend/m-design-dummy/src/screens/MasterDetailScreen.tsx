import { useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  MaxHandle,
  PageLayout,
  ResizableFormPanel,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Button,
  Checkbox,
  FormGroup,
  Input,
  Select,
} from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  INITIAL_RESOURCES,
  RESOURCE_POOL,
  WORKCENTERS,
  type ResourceRow,
  type WorkcenterRow,
} from "../data/mock-data";
import { StatusBadge } from "../components/StatusBadge";

const WORKCENTER_COLUMNS: GridColumn[] = [
  { key: "workcenterCode", header: "워크센터코드", width: 135 },
  { key: "workcenterName", header: "워크센터명", width: 170 },
  { key: "plant", header: "공장", width: 80, align: "center" },
  { key: "line", header: "라인", width: 100, align: "center" },
];

const RESOURCE_COLUMNS: GridColumn[] = [
  { key: "resourceCode", header: "자원코드", width: 120 },
  { key: "resourceName", header: "자원명", width: 150 },
  {
    key: "resourceType",
    header: "유형",
    width: 70,
    align: "center",
    render: (value) => <StatusBadge value={String(value)} />,
  },
  { key: "capacity", header: "능력(h)", width: 74, align: "right" },
  { key: "calendar", header: "캘린더", width: 105 },
  {
    key: "useYn",
    header: "사용",
    width: 58,
    align: "center",
    render: (value) => <StatusBadge value={String(value)} />,
  },
];

const RESOURCE_LOOKUP_COLUMNS: GridColumn[] = [
  { key: "resourceCode", header: "자원코드", width: 125 },
  { key: "resourceName", header: "자원명", width: 190 },
  { key: "resourceType", header: "유형", width: 80, align: "center" },
  { key: "calendar", header: "캘린더", width: 130 },
  { key: "capacity", header: "능력(h)", width: 80, align: "right" },
];

function gridRows<T extends object>(rows: T[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }) as Record<string, unknown>);
}

export function MasterDetailScreen() {
  const { showMessage } = useMessage();
  const [workcenters, setWorkcenters] = useState<WorkcenterRow[]>(WORKCENTERS);
  const [resources, setResources] = useState<ResourceRow[]>(INITIAL_RESOURCES);
  const [codeFilter, setCodeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [plantFilter, setPlantFilter] = useState("");
  const [selectedWorkcenterId, setSelectedWorkcenterId] = useState(
    WORKCENTERS[0].id,
  );
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [lookupOpen, setLookupOpen] = useState(false);
  const [poolSelection, setPoolSelection] = useState<(string | number)[]>([]);
  const [dirty, setDirty] = useState(false);

  const visibleWorkcenters = useMemo(() => {
    const code = codeFilter.trim().toLowerCase();
    const name = nameFilter.trim().toLowerCase();
    return workcenters.filter(
      (row) =>
        (!code || row.workcenterCode.toLowerCase().includes(code)) &&
        (!name || row.workcenterName.toLowerCase().includes(name)) &&
        (!plantFilter || row.plant === plantFilter),
    );
  }, [codeFilter, nameFilter, plantFilter, workcenters]);

  const selectedWorkcenter =
    workcenters.find((row) => row.id === selectedWorkcenterId) ??
    visibleWorkcenters[0] ??
    null;
  const selectedResources = selectedWorkcenter
    ? resources.filter(
        (resource) => resource.workcenterId === selectedWorkcenter.id,
      )
    : [];
  const selectedResource =
    resources.find((resource) => resource.id === selectedResourceId) ?? null;
  const availableResources = RESOURCE_POOL.filter(
    (candidate) =>
      !resources.some(
        (resource) => resource.resourceCode === candidate.resourceCode,
      ),
  );

  const updateWorkcenter = <K extends keyof WorkcenterRow>(
    key: K,
    value: WorkcenterRow[K],
  ) => {
    if (!selectedWorkcenter) return;
    setWorkcenters((current) =>
      current.map((row) =>
        row.id === selectedWorkcenter.id ? { ...row, [key]: value } : row,
      ),
    );
    setDirty(true);
  };

  const updateResource = <K extends keyof ResourceRow>(
    key: K,
    value: ResourceRow[K],
  ) => {
    if (!selectedResource) return;
    setResources((current) =>
      current.map((row) =>
        row.id === selectedResource.id ? { ...row, [key]: value } : row,
      ),
    );
    setDirty(true);
  };

  const addWorkcenter = () => {
    const id = `wc-local-${Date.now()}`;
    setWorkcenters((current) => [
      ...current,
      {
        id,
        plant: "김포",
        workcenterCode: "",
        workcenterName: "",
        line: "SLITTING",
        resourceCount: 0,
        efficiency: 100,
        status: "가동",
      },
    ]);
    setSelectedWorkcenterId(id);
    setSelectedResourceId(null);
    setDirty(true);
  };

  const copyWorkcenter = () => {
    if (!selectedWorkcenter) return;
    const id = `wc-copy-${Date.now()}`;
    setWorkcenters((current) => [
      ...current,
      {
        ...selectedWorkcenter,
        id,
        workcenterCode: "",
        workcenterName: `${selectedWorkcenter.workcenterName} 복사본`,
        resourceCount: 0,
      },
    ]);
    setSelectedWorkcenterId(id);
    setSelectedResourceId(null);
    setDirty(true);
  };

  const deleteWorkcenter = () => {
    if (!selectedWorkcenter) return;
    showMessage({
      title: "워크센터 행삭제",
      alertType: "confirm",
      message: `${selectedWorkcenter.workcenterName || "(신규)"} 행을 삭제 상태로 변경합니다.`,
      onConfirm: () => {
        setWorkcenters((current) =>
          current.filter((row) => row.id !== selectedWorkcenter.id),
        );
        setResources((current) =>
          current.filter(
            (resource) => resource.workcenterId !== selectedWorkcenter.id,
          ),
        );
        const next = workcenters.find(
          (row) => row.id !== selectedWorkcenter.id,
        );
        setSelectedWorkcenterId(next?.id ?? "");
        setSelectedResourceId(null);
        setDirty(true);
      },
    });
  };

  const removeResource = () => {
    if (!selectedResource) return;
    showMessage({
      title: "자원 행삭제",
      alertType: "confirm",
      message: `${selectedResource.resourceName}의 워크센터 할당을 해제합니다.`,
      onConfirm: () => {
        setResources((current) =>
          current.filter((resource) => resource.id !== selectedResource.id),
        );
        setSelectedResourceId(null);
        setDirty(true);
      },
    });
  };

  const assignResources = () => {
    if (!selectedWorkcenter || poolSelection.length === 0) return;
    const selectedIds = new Set(poolSelection.map(String));
    const additions: ResourceRow[] = availableResources
      .filter((candidate) => selectedIds.has(candidate.id))
      .map((candidate, index) => ({
        ...candidate,
        id: `${candidate.id}-${selectedWorkcenter.id}-${Date.now()}-${index}`,
        workcenterId: selectedWorkcenter.id,
      }));
    setResources((current) => [...current, ...additions]);
    setPoolSelection([]);
    setLookupOpen(false);
    setDirty(true);
    showMessage({
      message: `${additions.length}개 자원을 ${selectedWorkcenter.workcenterCode || "신규 워크센터"}에 할당했습니다.`,
      toast: true,
    });
  };

  const save = () => {
    setDirty(false);
    showMessage({
      message: "워크센터와 소속 자원 변경사항을 로컬 상태에 저장했습니다.",
      alertType: "success",
      toast: true,
    });
  };

  return (
    <PageLayout
      title="워크센터 관리"
      breadcrumb="공정계획 > 제조 마스터 데이터 관리 > 워크센터 관리"
      screenId="MPA-WC-001"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: () =>
            showMessage({
              message: `${visibleWorkcenters.length}개 워크센터를 조회했습니다.`,
              toast: true,
            }),
        },
        {
          id: "save",
          label: `저장${dirty ? " *" : ""}`,
          type: "save",
          action: "save",
          onClick: save,
        },
      ]}
    >
      <SearchArea>
        <SearchField
          label="워크센터코드"
          value={codeFilter}
          onChange={setCodeFilter}
        />
        <SearchField
          label="워크센터명"
          value={nameFilter}
          onChange={setNameFilter}
        />
        <SearchField
          label="공장"
          type="select"
          value={plantFilter}
          options={[
            { value: "", label: "전체" },
            { value: "김포", label: "김포공장" },
            { value: "포항", label: "포항공장" },
          ]}
          onChange={setPlantFilter}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel panelId="workcenter-list">
          <div className="workcenter-grid-stack">
            <div className="workcenter-grid-stack__primary">
              <GridPanel
                headerExtra={<MaxHandle panelId="workcenter-list" />}
                title="워크센터 목록"
                count={visibleWorkcenters.length}
                buttons={[
                  {
                    id: "wc_add",
                    label: "행추가",
                    onClick: addWorkcenter,
                  },
                  {
                    id: "wc_copy",
                    label: "행복사",
                    onClick: copyWorkcenter,
                    disabled: !selectedWorkcenter,
                  },
                  {
                    id: "wc_cancel",
                    label: "행취소",
                    onClick: () => {
                      setWorkcenters(WORKCENTERS);
                      setResources(INITIAL_RESOURCES);
                      setSelectedWorkcenterId(WORKCENTERS[0].id);
                      setSelectedResourceId(null);
                      setDirty(false);
                    },
                    disabled: !dirty,
                  },
                  {
                    id: "wc_delete",
                    label: "행삭제",
                    onClick: deleteWorkcenter,
                    disabled: !selectedWorkcenter,
                  },
                ]}
              >
                <AgDataGrid
                  columns={WORKCENTER_COLUMNS}
                  data={gridRows(visibleWorkcenters)}
                  rowKey="id"
                  highlightedRowKey={selectedWorkcenter?.id ?? null}
                  onRowClick={(row) => {
                    setSelectedWorkcenterId(String(row.id));
                    setSelectedResourceId(null);
                  }}
                  columnSizing="fit"
                />
              </GridPanel>
            </div>

            <div className="workcenter-grid-stack__secondary">
              <GridPanel
                title="소속 자원"
                count={selectedResources.length}
                buttons={[
                  {
                    id: "res_add",
                    label: "행추가",
                    onClick: () => {
                      setPoolSelection([]);
                      setLookupOpen(true);
                    },
                    disabled: !selectedWorkcenter,
                  },
                  {
                    id: "res_delete",
                    label: "행삭제",
                    onClick: removeResource,
                    disabled: !selectedResource,
                  },
                ]}
              >
                <AgDataGrid
                  columns={RESOURCE_COLUMNS}
                  data={gridRows(selectedResources)}
                  rowKey="id"
                  highlightedRowKey={selectedResourceId}
                  onRowClick={(row) =>
                    setSelectedResourceId(String(row.id))
                  }
                  columnSizing="fit"
                  emptyMessage="소속 자원이 없습니다."
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>

        <ResizableFormPanel
          panelId="workcenter-detail"
          defaultWidth={400}
          minWidth={320}
          maxWidth={620}
        >
          {selectedResource ? (
            <div className="form-panel">
              <div className="grid-panel-header">
                <div className="grid-panel-title">
                  <span>자원: {selectedResource.resourceCode}</span>
                </div>
              </div>
              <div className="form-panel-content">
                <FormGroup label="자원코드" required labelWidth={120}>
                  <Input value={selectedResource.resourceCode} readOnly />
                </FormGroup>
                <FormGroup label="자원명" required labelWidth={120}>
                  <Input
                    value={selectedResource.resourceName}
                    onChange={(value) => updateResource("resourceName", value)}
                  />
                </FormGroup>
                <FormGroup label="자원유형" required labelWidth={120}>
                  <Select
                    value={selectedResource.resourceType}
                    options={[
                      { value: "설비", label: "설비" },
                      { value: "작업조", label: "작업조" },
                    ]}
                    onChange={(value) =>
                      updateResource(
                        "resourceType",
                        value as ResourceRow["resourceType"],
                      )
                    }
                  />
                </FormGroup>
                <FormGroup label="능력(h)" labelWidth={120}>
                  <Input
                    type="number"
                    value={selectedResource.capacity}
                    onChange={(value) =>
                      updateResource("capacity", Number(value))
                    }
                  />
                </FormGroup>
                <FormGroup label="캘린더" labelWidth={120}>
                  <Select
                    value={selectedResource.calendar}
                    options={[
                      "GMP-2SHIFT",
                      "GMP-DAY",
                      "GMP-NIGHT",
                      "PH-3SHIFT",
                      "COMMON-DAY",
                    ]}
                    onChange={(value) => updateResource("calendar", value)}
                  />
                </FormGroup>
                <FormGroup label="우선순위" labelWidth={120}>
                  <Input
                    type="number"
                    value={selectedResource.priority}
                    onChange={(value) =>
                      updateResource("priority", Number(value))
                    }
                  />
                </FormGroup>
                <FormGroup label="사용여부" labelWidth={120}>
                  <Checkbox
                    checked={selectedResource.useYn === "Y"}
                    label={
                      selectedResource.useYn === "Y" ? "사용" : "미사용"
                    }
                    onChange={(checked) =>
                      updateResource("useYn", checked ? "Y" : "N")
                    }
                  />
                </FormGroup>
              </div>
            </div>
          ) : selectedWorkcenter ? (
            <div className="form-panel">
              <div className="grid-panel-header">
                <div className="grid-panel-title">
                  <span>{selectedWorkcenter.workcenterCode || "(신규)"}</span>
                </div>
              </div>
              <div className="form-panel-content">
                <FormGroup label="작업장 코드" required labelWidth={120}>
                  <Input
                    value={selectedWorkcenter.workcenterCode}
                    onChange={(value) =>
                      updateWorkcenter("workcenterCode", value)
                    }
                  />
                </FormGroup>
                <FormGroup label="작업장명" required labelWidth={120}>
                  <Input
                    value={selectedWorkcenter.workcenterName}
                    onChange={(value) =>
                      updateWorkcenter("workcenterName", value)
                    }
                  />
                </FormGroup>
                <FormGroup label="소속 공장" required labelWidth={120}>
                  <Select
                    value={selectedWorkcenter.plant}
                    options={[
                      { value: "김포", label: "김포공장" },
                      { value: "포항", label: "포항공장" },
                    ]}
                    onChange={(value) =>
                      updateWorkcenter(
                        "plant",
                        value as WorkcenterRow["plant"],
                      )
                    }
                  />
                </FormGroup>
                <FormGroup label="라인" labelWidth={120}>
                  <Select
                    value={selectedWorkcenter.line}
                    options={[
                      "SLITTING",
                      "SHEARING",
                      "ROLLING",
                      "PACKING",
                    ]}
                    onChange={(value) => updateWorkcenter("line", value)}
                  />
                </FormGroup>
                <FormGroup label="기본 효율(%)" labelWidth={120}>
                  <Input
                    type="number"
                    value={selectedWorkcenter.efficiency}
                    onChange={(value) =>
                      updateWorkcenter("efficiency", Number(value))
                    }
                  />
                </FormGroup>
                <FormGroup label="상태" labelWidth={120}>
                  <Select
                    value={selectedWorkcenter.status}
                    options={[
                      { value: "가동", label: "가동" },
                      { value: "점검", label: "점검" },
                      { value: "비가동", label: "비가동" },
                    ]}
                    onChange={(value) =>
                      updateWorkcenter(
                        "status",
                        value as WorkcenterRow["status"],
                      )
                    }
                  />
                </FormGroup>
              </div>
            </div>
          ) : (
            <div className="form-panel">
              <div className="grid-panel-header">
                <div className="grid-panel-title">
                  <span>상세</span>
                </div>
              </div>
              <div className="form-panel-content">
                <div className="data-table-empty">항목을 선택하세요.</div>
              </div>
            </div>
          )}
        </ResizableFormPanel>
      </ContentBody>

      <Modal
        open={lookupOpen}
        title="자원 검색"
        size="lg"
        onClose={() => setLookupOpen(false)}
        footer={
          <>
            <span className="modal-selection-count">
              {poolSelection.length}개 선택
            </span>
            <Button onClick={() => setLookupOpen(false)}>취소</Button>
            <Button
              variant="primary"
              disabled={poolSelection.length === 0}
              onClick={assignResources}
            >
              선택
            </Button>
          </>
        }
      >
        <GridPanel title="미할당·공용 자원" count={availableResources.length}>
          <AgDataGrid
            columns={RESOURCE_LOOKUP_COLUMNS}
            data={gridRows(availableResources)}
            rowKey="id"
            selectable
            multiSelect
            selectedRows={poolSelection}
            onRowSelect={(ids) => setPoolSelection(ids)}
            columnSizing="fit"
            height={320}
            emptyMessage="할당 가능한 자원이 없습니다."
          />
        </GridPanel>
      </Modal>
    </PageLayout>
  );
}
