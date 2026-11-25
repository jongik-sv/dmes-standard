"use client";

/**
 * 칼라부재료관리(colorSubmaterial) — 칼라강판 도장 부재료(QC_COLOR_SUBMAT: 프라이머·상도·백코트·보호필름)를 구분별로 본다.
 *
 * 왼쪽은 부재료 목록(구분 막대 + 수지계·제조사·검색어), 오른쪽은 고른 부재료의 색 견본과 속성(수지계·제조사·RAL·도막·광택·PMT),
 * 그리고 그 부재료를 쓰는 칼라 BOM 층이다. 읽기 전용이다. 편집은 [Maru에서 편집] 으로 MDM 코드 편집 화면에 넘긴다.
 * 데이터: qcdRule/codes(QC_COLOR_SUBMAT, 사용처용 QC_COLOR_BOM). 진입 때 SearchArea autoSearch 가 한 번 조회하고, 거르기는 화면 안에서 한다.
 */
import { memo, useCallback, useMemo } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  PageLayout,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { SegmentedControl } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryState } from "@dk-oasis/shared/portal-shell";

import { useCodes } from "@/common/rule";
import { screenMeta } from "@/common/screens";

import { bomsOf, umText, usagesOf, type Bom } from "../common/bom";
import { NA } from "../common/codes";
import {
  EMPTY_SUBMAT_FILTER,
  SUBMAT_CODE_ID,
  SUBMAT_KINDS,
  colorText,
  distinctOptions,
  filterSubmats,
  kindCounts,
  submatsOf,
  swatchOf,
  type Submat,
  type SubmatFilter,
} from "../common/color";
import { ColorSwatch } from "../common/ColorSwatch";
import { openCodeEdit } from "../common/open-code-edit";

export const SCREEN_ID = "colorSubmaterial";

/** 부재료 + 사용처를 보려고 칼라BOM 도 읽는다. */
const CODE_IDS = [SUBMAT_CODE_ID, "QC_COLOR_BOM"];

const numOrNa = (v: unknown) => (v == null ? NA : String(v));

const COLUMNS: GridColumn[] = [
  { key: "kind", header: "구분", width: 80, align: "center", meta: false },
  { key: "code", header: "코드", width: 120, align: "left", meta: false },
  {
    key: "name",
    header: "이름",
    width: 200,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "resin",
    header: "수지계",
    width: 160,
    align: "left",
    meta: false,
    tooltip: true,
  },
  { key: "maker", header: "제조사", width: 90, align: "left", meta: false },
  {
    key: "color",
    header: "색상",
    width: 190,
    align: "left",
    meta: false,
    render: (_v, row) => {
      const c = String(row.colorCode ?? "");
      const n = String(row.colorName ?? "");
      const s = swatchOf(c, n);
      return (
        <ColorSwatch
          color={s.color}
          translucent={s.translucent}
          label={colorText(c, n)}
        />
      );
    },
  },
  {
    key: "thicknessUm",
    header: "도막(㎛)",
    width: 80,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "gloss",
    header: "광택(GU)",
    width: 80,
    align: "right",
    type: "number",
    meta: false,
    render: (v) => numOrNa(v),
  },
  {
    key: "pmt",
    header: "PMT(℃)",
    width: 90,
    align: "center",
    meta: false,
    render: (v) => (v ? String(v) : NA),
  },
];

const USAGE_COLUMNS: GridColumn[] = [
  {
    key: "bomNo",
    header: "BOM 번호",
    width: 1,
    minWidth: 90,
    align: "left",
    meta: false,
  },
  {
    key: "bomName",
    header: "BOM 이름",
    width: 3,
    minWidth: 140,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "layerName",
    header: "층",
    width: 1,
    minWidth: 90,
    align: "left",
    meta: false,
  },
];

export function ColorSubmaterialPage(_props: PageProps) {
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

  const [filters, setFilters] = useCarryState<SubmatFilter>(
    "filters",
    EMPTY_SUBMAT_FILTER,
  );
  const [applied, setApplied] = useCarryState<SubmatFilter>(
    "applied",
    EMPTY_SUBMAT_FILTER,
  );
  // 구분 막대 — 조회 없이 바로 거른다.
  const [kind, setKind] = useCarryState<string>("kind", "");
  const [selectedCode, setSelectedCode] = useCarryState<string | null>(
    "selectedCode",
    null,
  );
  const setFilter = useCallback(
    (key: keyof SubmatFilter, value: string) =>
      setFilters((p) => ({ ...p, [key]: value })),
    [setFilters],
  );
  const handleSearch = useCallback(() => {
    setApplied(filters);
    void reload();
  }, [filters, reload, setApplied]);

  const submats = useMemo(() => submatsOf(codes), [codes]);
  const boms = useMemo(() => bomsOf(codes), [codes]);
  const resinOptions = useMemo(
    () => distinctOptions(submats.map((s) => s.resin)),
    [submats],
  );
  const makerOptions = useMemo(
    () => distinctOptions(submats.map((s) => s.maker)),
    [submats],
  );
  const view = useMemo(() => ({ ...applied, kind }), [applied, kind]);
  const visible = useMemo(() => filterSubmats(submats, view), [submats, view]);
  const counts = useMemo(() => kindCounts(submats, view), [submats, view]);
  const kindOptions = useMemo(
    () => [
      { value: "", label: `전체 ${counts[""] ?? 0}` },
      ...SUBMAT_KINDS.map((k) => ({
        value: k,
        label: `${k} ${counts[k] ?? 0}`,
      })),
    ],
    [counts],
  );
  // 고른 부재료가 거르기로 빠지면 첫 행을 보인다.
  const selected =
    visible.find((s) => s.code === selectedCode) ?? visible[0] ?? null;
  const ver = codes.find((c) => c.codeId === SUBMAT_CODE_ID)?.ver ?? null;

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedCode(String(row.code)),
    [setSelectedCode],
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
          onClick: () => openCodeEdit(SUBMAT_CODE_ID, ver),
          action: "search",
          emitSearch: false,
        },
      ]}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="수지계"
          type="select"
          defaultKey="resin"
          options={resinOptions}
          value={filters.resin}
          onChange={(v) => setFilter("resin", v)}
        />
        <SearchField
          label="제조사"
          type="select"
          defaultKey="maker"
          options={makerOptions}
          value={filters.maker}
          onChange={(v) => setFilter("maker", v)}
        />
        <SearchField
          label="검색어"
          defaultKey="keyword"
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="코드·이름·색상코드·색상명"
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mqc.qdb.colorSubmaterial">
        <ContentPanel>
          <SubmatListPanel
            rows={visible}
            selectedCode={selected?.code ?? null}
            kind={kind}
            kindOptions={kindOptions}
            onKind={setKind}
            loading={loading}
            loaded={loaded}
            onRowClick={handleRowClick}
          />
        </ContentPanel>
        <ContentPanel width={460} scrollY>
          <SubmatDetail submat={selected} boms={boms} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}

const SubmatListPanel = memo(function SubmatListPanel({
  rows,
  selectedCode,
  kind,
  kindOptions,
  onKind,
  loading,
  loaded,
  onRowClick,
}: {
  rows: Submat[];
  selectedCode: string | null;
  kind: string;
  kindOptions: { value: string; label: string }[];
  onKind: (kind: string) => void;
  loading: boolean;
  loaded: boolean;
  onRowClick: (row: Record<string, unknown>) => void;
}) {
  const data = rows as unknown as Record<string, unknown>[];
  return (
    <GridPanel
      title="부재료 목록"
      count={rows.length}
      titleExtra={
        <SegmentedControl
          ariaLabel="구분"
          testId="colorSubmaterial-kind"
          value={kind}
          onChange={onKind}
          options={kindOptions}
        />
      }
    >
      <AgDataGrid
        gridId="submats"
        rowKey="code"
        columns={COLUMNS}
        data={data}
        columnSizing="fixed"
        highlightedRowKey={selectedCode}
        onRowClick={onRowClick}
        loading={loading}
        emptyMessage={
          loaded
            ? "조건에 맞는 부재료가 없습니다. 조건을 바꿔 보세요."
            : undefined
        }
      />
    </GridPanel>
  );
});

/** 상세 — 색 견본 + 속성 표 + 사용 BOM. 고른 부재료가 없으면 값 칸은 「—」. */
const SubmatDetail = memo(function SubmatDetail({
  submat,
  boms,
}: {
  submat: Submat | null;
  boms: Bom[];
}) {
  const usages = useMemo(
    () =>
      submat
        ? usagesOf(boms, submat.code).map((u) => ({
            ...u,
            key: `${u.bomNo}-${u.layerName}`,
          }))
        : [],
    [boms, submat],
  );
  const swatch = submat ? swatchOf(submat.colorCode, submat.colorName) : null;
  const row = (label: string, value: string, testId?: string) => (
    <tr key={label}>
      <th style={DETAIL_LABEL_CELL}>{label}</th>
      <td style={DETAIL_VALUE_CELL} data-testid={testId}>
        {value}
      </td>
    </tr>
  );
  return (
    <>
      <table style={DETAIL_TABLE_STYLE} data-testid="colorSubmaterial-detail">
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>색 견본</th>
            <td style={DETAIL_VALUE_CELL}>
              {submat && swatch ? (
                <ColorSwatch
                  color={swatch.color}
                  translucent={swatch.translucent}
                  size={40}
                  label={`${colorText(submat.colorCode, submat.colorName)}${swatch.source === "none" ? "" : " (화면 근사색)"}`}
                  testId="colorSubmaterial-swatch"
                />
              ) : (
                NA
              )}
            </td>
          </tr>
          {row("코드", submat?.code ?? NA, "colorSubmaterial-detail-code")}
          {row("이름", submat?.name ?? NA)}
          {row("구분", submat?.kind || NA)}
          {row("수지계", submat?.resin || NA)}
          {row("제조사", submat?.maker || NA)}
          {row("색상코드(RAL)", submat?.colorCode || NA)}
          {row("색상명", submat?.colorName || NA)}
          {row(
            "건조도막두께",
            submat ? umText(submat.thicknessUm) : NA,
            "colorSubmaterial-detail-thk",
          )}
          {row("광택", submat?.gloss != null ? `${submat.gloss} GU` : NA)}
          {row(
            "PMT(도장 소부 온도)",
            submat?.pmtRange
              ? `${submat.pmtRange.min} ~ ${submat.pmtRange.max} ℃`
              : submat?.pmt || NA,
          )}
        </tbody>
      </table>
      <AgDataGrid
        gridId="usages"
        title="사용 BOM"
        rowKey="key"
        columns={USAGE_COLUMNS}
        data={usages}
        columnSizing="fit"
        height="auto"
        settingsMenu={false}
        personalize={false}
        emptyMessage={submat ? "이 부재료를 쓰는 BOM 이 없습니다." : NA}
      />
    </>
  );
});
