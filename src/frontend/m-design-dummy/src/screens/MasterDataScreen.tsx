import { useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { INITIAL_ITEMS, type ItemRow } from "../data/mock-data";
import { StatusBadge } from "../components/StatusBadge";

type Filters = {
  keyword: string;
  plant: string;
  itemType: string;
  useYn: string;
};

const EMPTY_FILTERS: Filters = {
  keyword: "",
  plant: "",
  itemType: "",
  useYn: "",
};

const COLUMNS: GridColumn[] = [
  {
    key: "itemCode",
    header: "품목코드 *",
    width: 145,
    pinned: "left",
    editable: true,
  },
  {
    key: "itemName",
    header: "품목명 *",
    width: 205,
    editable: true,
  },
  {
    key: "itemType",
    header: "품목유형",
    width: 95,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: ["제품", "반제품", "원자재"],
    render: (value) => <StatusBadge value={String(value)} />,
  },
  {
    key: "plant",
    header: "공장",
    width: 90,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: ["김포", "포항"],
  },
  {
    key: "specification",
    header: "규격",
    width: 150,
    editable: true,
  },
  {
    key: "unit",
    header: "단위",
    width: 70,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: ["EA", "KG", "M"],
  },
  {
    key: "safetyStock",
    header: "안전재고",
    width: 90,
    align: "right",
    type: "number",
    editable: true,
    cellEditor: "number",
    render: (value) => Number(value ?? 0).toLocaleString(),
  },
  {
    key: "leadTime",
    header: "조달 LT(일)",
    width: 85,
    align: "right",
    type: "number",
    editable: true,
    cellEditor: "number",
  },
  {
    key: "useYn",
    header: "사용",
    width: 70,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: ["Y", "N"],
    render: (value) => <StatusBadge value={String(value)} />,
  },
];

function toGridRows(rows: ItemRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

export function MasterDataScreen() {
  const { showMessage } = useMessage();
  const [items, setItems] = useState<ItemRow[]>(INITIAL_ITEMS);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(
    INITIAL_ITEMS[0].id,
  );
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const visibleItems = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.plant && item.plant !== filters.plant) return false;
      if (filters.itemType && item.itemType !== filters.itemType) return false;
      if (filters.useYn && item.useYn !== filters.useYn) return false;
      if (
        keyword &&
        !`${item.itemCode} ${item.itemName} ${item.specification}`
          .toLowerCase()
          .includes(keyword)
      ) {
        return false;
      }
      return true;
    });
  }, [filters, items]);

  const search = () => {
    setFilters(draftFilters);
    showMessage({
      message: "검색 조건을 로컬 데이터에 적용했습니다.",
      toast: true,
    });
  };

  const addRow = () => {
    const id = `item-new-${Date.now()}`;
    const next: ItemRow = {
      id,
      itemCode: "",
      itemName: "",
      itemType: "제품",
      plant: "김포",
      specification: "",
      unit: "EA",
      safetyStock: 0,
      leadTime: 1,
      useYn: "Y",
    };
    setItems((current) => [next, ...current]);
    setSelectedId(id);
    setDirtyIds((current) => new Set(current).add(id));
  };

  const copyRow = () => {
    const selected = items.find((item) => item.id === selectedId);
    if (!selected) return;
    const id = `item-copy-${Date.now()}`;
    const copy: ItemRow = {
      ...selected,
      id,
      itemCode: `${selected.itemCode}-COPY`,
      itemName: `${selected.itemName} 복사본`,
    };
    setItems((current) => [copy, ...current]);
    setSelectedId(id);
    setDirtyIds((current) => new Set(current).add(id));
  };

  const deleteRow = () => {
    if (!selectedId) return;
    const selected = items.find((item) => item.id === selectedId);
    if (!selected) return;
    showMessage({
      title: "품목 삭제 영향 확인",
      alertType: "confirm",
      message: `${selected.itemCode || "신규 품목"} 1건을 삭제합니다.\n이 디자인 더미에서는 현재 Grid 행만 제거되며 연관 데이터는 없습니다.`,
      onConfirm: () => {
        setItems((current) => current.filter((item) => item.id !== selectedId));
        setSelectedId(null);
      },
    });
  };

  const save = () => {
    const invalid = items.filter(
      (item) => !item.itemCode.trim() || !item.itemName.trim(),
    );
    const codes = items.map((item) => item.itemCode.trim()).filter(Boolean);
    const duplicateCode = codes.find(
      (code, index) => codes.indexOf(code) !== index,
    );
    if (invalid.length > 0 || duplicateCode) {
      showMessage({
        title: "저장할 수 없습니다",
        alertType: "warning",
        message: duplicateCode
          ? `중복된 품목코드가 있습니다: ${duplicateCode}`
          : "품목코드와 품목명은 필수입니다.",
      });
      return;
    }
    showMessage({
      message: `${dirtyIds.size}건의 변경사항을 브라우저 상태에 저장했습니다.`,
      alertType: "success",
      toast: true,
    });
    setDirtyIds(new Set());
  };

  const exportCsv = () => {
    const header = [
      "품목코드",
      "품목명",
      "품목유형",
      "공장",
      "규격",
      "단위",
      "안전재고",
      "조달LT",
      "사용",
    ];
    const lines = visibleItems.map((item) =>
      [
        item.itemCode,
        item.itemName,
        item.itemType,
        item.plant,
        item.specification,
        item.unit,
        item.safetyStock,
        item.leadTime,
        item.useYn,
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([`\uFEFF${header.join(",")}\n${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "design-dummy-items.csv";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const updateCell = ({
    rowKey,
    field,
    newValue,
  }: {
    rowKey: string | number;
    field: string;
    newValue: unknown;
  }) => {
    const id = String(rowKey);
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? ({
              ...item,
              [field]:
                field === "safetyStock" || field === "leadTime"
                  ? Number(newValue ?? 0)
                  : newValue,
            } as ItemRow)
          : item,
      ),
    );
    setDirtyIds((current) => new Set(current).add(id));
  };

  return (
    <PageLayout
      title="품목 기준정보 관리"
      breadcrumb="기준정보 > 품목/자재 > 품목 기준정보"
      screenId="MDA-ITEM-001"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          onClick: search,
          action: "search",
        },
        {
          id: "save",
          label: `저장${dirtyIds.size ? ` (${dirtyIds.size})` : ""}`,
          type: "save",
          onClick: save,
          action: "save",
        },
        { id: "export", label: "CSV", onClick: exportCsv, action: "export" },
      ]}
    >
      <SearchArea onSearch={search}>
        <SearchField
          label="공장"
          type="select"
          value={draftFilters.plant}
          options={[
            { value: "", label: "전체" },
            { value: "김포", label: "김포공장" },
            { value: "포항", label: "포항공장" },
          ]}
          onChange={(plant) =>
            setDraftFilters((current) => ({ ...current, plant }))
          }
        />
        <SearchField
          label="품목유형"
          type="select"
          value={draftFilters.itemType}
          options={[
            { value: "", label: "전체" },
            { value: "제품", label: "제품" },
            { value: "반제품", label: "반제품" },
            { value: "원자재", label: "원자재" },
          ]}
          onChange={(itemType) =>
            setDraftFilters((current) => ({ ...current, itemType }))
          }
        />
        <SearchField
          label="사용여부"
          type="radio"
          value={draftFilters.useYn}
          options={[
            { value: "", label: "전체" },
            { value: "Y", label: "사용" },
            { value: "N", label: "미사용" },
          ]}
          onChange={(useYn) =>
            setDraftFilters((current) => ({ ...current, useYn }))
          }
        />
        <SearchField
          label="품목"
          value={draftFilters.keyword}
          placeholder="코드 / 품목명 / 규격…"
          onChange={(keyword) =>
            setDraftFilters((current) => ({ ...current, keyword }))
          }
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="품목 목록"
            count={visibleItems.length}
            buttons={[
              { id: "add", label: "행추가", onClick: addRow },
              {
                id: "copy",
                label: "행복사",
                onClick: copyRow,
                disabled: !selectedId,
              },
              {
                id: "delete",
                label: "행삭제",
                onClick: deleteRow,
                disabled: !selectedId,
              },
            ]}
            help={{
              title: "품목 목록",
              summary: "가장 빈도가 높은 단일 조회·편집 Grid 패턴입니다.",
              columns: COLUMNS.map((column) => ({
                header: column.header,
                description: column.editable
                  ? "더블클릭하여 편집"
                  : "조회 전용",
              })),
            }}
          >
            <AgDataGrid
              columns={COLUMNS}
              data={toGridRows(visibleItems)}
              rowKey="id"
              selectable
              selectedRows={selectedId ? [selectedId] : []}
              highlightedRowKey={selectedId}
              onRowClick={(row) => setSelectedId(String(row.id))}
              onRowSelect={(ids) => {
                const next = Array.isArray(ids) ? ids[0] : ids;
                setSelectedId(next == null ? null : String(next));
              }}
              onCellValueChanged={updateCell}
              columnSizing="fit"
              emptyMessage="조건에 맞는 품목이 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
