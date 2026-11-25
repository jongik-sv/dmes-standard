"use client";

/**
 * 마스터코드(masterCode) — 품질설계 화면이 쓰는 Maru 코드 묶음(catalog SCREEN_CODES.masterCode)을 한곳에서 본다.
 *
 * 왼쪽은 코드 묶음 목록(분류·통합 검색), 오른쪽은 고른 묶음의 머리 정보와 항목(코드·이름·계층·속성·순번)이다.
 * 읽기 전용이다. 편집은 [Maru에서 편집] 으로 MDM 코드 편집 화면(mdm:dmc/codeItemEdit)에 넘긴다.
 * 데이터: 공용 서비스 qcdRule/codes(현재 RELEASED 항목). 조회는 진입 때 SearchArea autoSearch 가 한 번 하고, 거르기는 화면 안에서 한다.
 */
import { memo, useCallback, useMemo } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import {
  ContentBody,
  ContentPanel,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryState } from "@dk-oasis/shared/portal-shell";

import { screenCodeIds, useCodes, type CodeSet } from "@/common/rule";
import { screenMeta } from "@/common/screens";

import { openCodeEdit } from "../common/open-code-edit";
import { MasterCodeDetail } from "./MasterCodeDetail";
import {
  categoryOptions,
  EMPTY_GROUP_FILTER,
  groupRows,
  SCREEN_ID,
  type GroupFilter,
  type GroupRow,
} from "./groups";

export { SCREEN_ID };

const CODE_IDS = screenCodeIds(SCREEN_ID);
const CATEGORY_OPTIONS = categoryOptions(CODE_IDS);

const COLUMNS: GridColumn[] = [
  {
    key: "category",
    header: "분류",
    width: 1,
    minWidth: 120,
    align: "left",
    meta: false,
  },
  {
    key: "codeId",
    header: "코드 ID",
    width: 1,
    minWidth: 150,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "title",
    header: "이름",
    width: 3,
    minWidth: 120,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "itemCount",
    header: "항목",
    width: 1,
    minWidth: 64,
    align: "right",
    type: "number",
    meta: false,
    // 검색어가 있으면 「맞은 수/전체」.
    render: (_v, row) =>
      row.matchCount == null
        ? String(row.itemCount)
        : `${String(row.matchCount)}/${String(row.itemCount)}`,
  },
  {
    key: "ver",
    header: "버전",
    width: 1,
    minWidth: 64,
    align: "center",
    meta: false,
    render: (v) =>
      v ? (
        String(v)
      ) : (
        <GridBadge
          muted
          label="없음"
          title="Maru 에 적용 중인 버전이 없습니다"
        />
      ),
  },
];

export function MasterCodePage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const onError = useCallback(
    (message: string) =>
      showMessage({ title: "오류", message, alertType: "error" }),
    [showMessage],
  );
  const { codes, loading, loaded, reload } = useCodes(CODE_IDS, {
    auto: false,
    onError,
  });

  const [filters, setFilters] = useCarryState<GroupFilter>(
    "filters",
    EMPTY_GROUP_FILTER,
  );
  const [applied, setApplied] = useCarryState<GroupFilter>(
    "applied",
    EMPTY_GROUP_FILTER,
  );
  const [selectedId, setSelectedId] = useCarryState<string | null>(
    "selectedCodeId",
    null,
  );
  const setFilter = useCallback(
    (key: keyof GroupFilter, value: string) =>
      setFilters((p) => ({ ...p, [key]: value })),
    [setFilters],
  );

  const handleSearch = useCallback(() => {
    setApplied(filters);
    void reload();
  }, [filters, reload, setApplied]);

  const rows = useMemo(
    () => groupRows(CODE_IDS, codes, applied),
    [codes, applied],
  );
  // 고른 묶음이 거르기로 빠지면 첫 행을 보인다(상세가 비지 않게).
  const selected: GroupRow | null =
    rows.find((r) => r.codeId === selectedId) ?? rows[0] ?? null;
  const selectedSet: CodeSet | undefined = selected
    ? codes.find((c) => c.codeId === selected.codeId)
    : undefined;

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedId(String(row.codeId)),
    [setSelectedId],
  );

  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary",
          disabled: loading,
          action: "search",
        },
        // 이동만 하므로 조회 권한으로 건다. 편집 권한은 Maru 화면이 본다.
        {
          id: "btn_open_maru",
          label: "Maru에서 편집",
          onClick: () =>
            selected && openCodeEdit(selected.codeId, selected.ver),
          disabled: !selected,
          action: "search",
          emitSearch: false,
        },
      ]}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="분류"
          type="select"
          defaultKey="category"
          options={CATEGORY_OPTIONS}
          value={filters.category}
          onChange={(v) => setFilter("category", v)}
        />
        <SearchField
          label="통합 검색"
          defaultKey="keyword"
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="코드 ID·이름·설명, 항목 코드·이름·속성"
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mqc.qdb.masterCode">
        <ContentPanel width={560}>
          <GroupListPanel
            rows={rows}
            selectedId={selected?.codeId ?? null}
            loading={loading}
            loaded={loaded}
            onRowClick={handleRowClick}
          />
        </ContentPanel>
        <MasterCodeDetail
          row={selected}
          set={selectedSet}
          keyword={applied.keyword}
          loading={loading}
        />
      </ContentBody>
    </PageLayout>
  );
}

const GroupListPanel = memo(function GroupListPanel({
  rows,
  selectedId,
  loading,
  loaded,
  onRowClick,
}: {
  rows: GroupRow[];
  selectedId: string | null;
  loading: boolean;
  loaded: boolean;
  onRowClick: (row: Record<string, unknown>) => void;
}) {
  const data = rows as unknown as Record<string, unknown>[];
  return (
    <GridPanel title="코드 묶음" count={rows.length}>
      <AgDataGrid
        gridId="groups"
        rowKey="codeId"
        columns={COLUMNS}
        data={data}
        columnSizing="fit"
        highlightedRowKey={selectedId}
        onRowClick={onRowClick}
        loading={loading}
        emptyMessage={
          loaded
            ? "조건에 맞는 코드 묶음이 없습니다. 검색어를 바꿔 보세요."
            : undefined
        }
      />
    </GridPanel>
  );
});
