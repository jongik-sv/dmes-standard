"use client";

/**
 * 칼라BOM관리(colorBom) — 칼라강판 도장 BOM(QC_COLOR_BOM)을 BOM 번호별로 보고, 고른 BOM 의 층 구성을 단면 그림으로 그린다.
 *
 * 왼쪽은 BOM 목록(적용 품명·보호필름·검색어), 오른쪽 위는 도장 단면(보호필름·전면 상도·전면 프라이머·강판·후면 백코트)과 도막 합계,
 * 오른쪽 아래는 층마다 붙은 칼라부재료(QC_COLOR_SUBMAT) 속성이다. 읽기 전용이다. 편집은 [Maru에서 편집] 으로 MDM 코드 편집 화면에 넘긴다.
 * 데이터: qcdRule/codes(QC_COLOR_BOM·QC_COLOR_SUBMAT·QC_PRD_NM_CD). 진입 때 SearchArea autoSearch 가 한 번 조회하고, 거르기는 화면 안에서 한다.
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
import { Badge } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryState } from "@dk-oasis/shared/portal-shell";

import { screenCodeIds, useCodes } from "@/common/rule";
import { screenMeta } from "@/common/screens";

import {
  BOM_CODE_ID,
  EMPTY_BOM_FILTER,
  FILM_OPTIONS,
  bomsOf,
  filterBoms,
  prdLabel,
  prdNamesOf,
  prdOptions,
  umText,
  type Bom,
  type BomFilter,
  type BomLayer,
} from "../common/bom";
import { colorText, swatchOf } from "../common/color";
import { ColorSwatch } from "../common/ColorSwatch";
import { openCodeEdit } from "../common/open-code-edit";
import { CoatingStack } from "./CoatingStack";

export const SCREEN_ID = "colorBom";

const CODE_IDS = screenCodeIds(SCREEN_ID);

const swatchCell = (code: unknown, name: unknown) => {
  const c = String(code ?? "");
  const n = String(name ?? "");
  const s = swatchOf(c, n);
  return (
    <ColorSwatch
      color={s.color}
      translucent={s.translucent}
      label={colorText(c, n)}
    />
  );
};

const BOM_COLUMNS: GridColumn[] = [
  {
    key: "bomNo",
    header: "BOM 번호",
    width: 1,
    minWidth: 96,
    align: "left",
    meta: false,
  },
  {
    key: "bomName",
    header: "BOM 이름",
    width: 3,
    minWidth: 150,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "prd",
    header: "적용 품명",
    width: 1,
    minWidth: 84,
    align: "left",
    meta: false,
  },
  {
    key: "topColor",
    header: "상도 색",
    width: 1,
    minWidth: 104,
    align: "left",
    meta: false,
    render: (_v, row) => swatchCell(row.topColorCode, row.topColorName),
  },
  {
    key: "coatUm",
    header: "도막(㎛)",
    width: 1,
    minWidth: 66,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "hasFilm",
    header: "필름",
    width: 1,
    minWidth: 52,
    align: "center",
    meta: false,
    render: (v) =>
      v ? (
        <GridBadge
          label="있음"
          bg="var(--color-primary-soft)"
          color="var(--color-primary)"
        />
      ) : (
        <GridBadge muted label="없음" />
      ),
  },
];

const LAYER_COLUMNS: GridColumn[] = [
  {
    key: "layerCode",
    header: "층코드",
    width: 70,
    align: "center",
    meta: false,
  },
  { key: "layerName", header: "층", width: 110, align: "left", meta: false },
  {
    key: "submatCode",
    header: "부재료코드",
    width: 120,
    align: "left",
    meta: false,
  },
  {
    key: "submatName",
    header: "부재료명",
    width: 200,
    align: "left",
    meta: false,
    tooltip: true,
  },
  {
    key: "resin",
    header: "수지계",
    width: 150,
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
    render: (_v, row) => swatchCell(row.colorCode, row.colorName),
  },
  {
    key: "thicknessUm",
    header: "도막(㎛)",
    width: 80,
    align: "right",
    type: "number",
    meta: false,
    cellClassRules: { "cell-warning": (row) => row.thicknessDiffers === true },
  },
  {
    key: "stdThicknessUm",
    header: "기준 도막(㎛)",
    width: 100,
    align: "right",
    type: "number",
    meta: false,
    cellClassRules: { "cell-warning": (row) => row.thicknessDiffers === true },
  },
  { key: "pmt", header: "PMT(℃)", width: 90, align: "center", meta: false },
];

function bomRow(
  b: Bom,
  prdNames: Map<string, string>,
): Record<string, unknown> {
  return {
    bomNo: b.bomNo,
    bomName: b.bomName,
    prd: prdLabel(b.prdCode, prdNames),
    topColorCode: b.topCoat?.colorCode ?? "",
    topColorName: b.topCoat?.colorName ?? "",
    coatUm: b.coatUm,
    hasFilm: b.hasFilm,
  };
}

function layerRow(l: BomLayer): Record<string, unknown> {
  return {
    itemCode: l.itemCode,
    layerCode: l.layerCode,
    layerName: l.layerName,
    submatCode: l.submatCode || "—",
    submatName: l.submat
      ? l.submatName
      : `${l.submatName || "—"} (부재료 기준에 없음)`,
    resin: l.submat?.resin || "—",
    maker: l.submat?.maker || "—",
    colorCode: l.colorCode,
    colorName: l.colorName,
    thicknessUm: l.thicknessUm,
    stdThicknessUm: l.stdThicknessUm,
    thicknessDiffers: l.thicknessDiffers,
    pmt: l.submat?.pmt || "—",
  };
}

export function ColorBomPage(_props: PageProps) {
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

  const [filters, setFilters] = useCarryState<BomFilter>(
    "filters",
    EMPTY_BOM_FILTER,
  );
  const [applied, setApplied] = useCarryState<BomFilter>(
    "applied",
    EMPTY_BOM_FILTER,
  );
  const [selectedNo, setSelectedNo] = useCarryState<string | null>(
    "selectedBomNo",
    null,
  );
  const setFilter = useCallback(
    (key: keyof BomFilter, value: string) =>
      setFilters((p) => ({ ...p, [key]: value })),
    [setFilters],
  );
  const handleSearch = useCallback(() => {
    setApplied(filters);
    void reload();
  }, [filters, reload, setApplied]);

  const boms = useMemo(() => bomsOf(codes), [codes]);
  const prdNames = useMemo(() => prdNamesOf(codes), [codes]);
  const prdOpts = useMemo(() => prdOptions(boms, prdNames), [boms, prdNames]);
  const visible = useMemo(() => filterBoms(boms, applied), [boms, applied]);
  const rows = useMemo(
    () => visible.map((b) => bomRow(b, prdNames)),
    [visible, prdNames],
  );
  // 고른 BOM 이 거르기로 빠지면 첫 BOM 을 보인다.
  const selected =
    visible.find((b) => b.bomNo === selectedNo) ?? visible[0] ?? null;
  const bomVer = codes.find((c) => c.codeId === BOM_CODE_ID)?.ver ?? null;

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedNo(String(row.bomNo)),
    [setSelectedNo],
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
          onClick: () => openCodeEdit(BOM_CODE_ID, bomVer),
          action: "search",
          emitSearch: false,
        },
      ]}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="적용 품명"
          type="select"
          defaultKey="prd"
          options={prdOpts}
          value={filters.prd}
          onChange={(v) => setFilter("prd", v)}
        />
        <SearchField
          label="보호필름"
          type="select"
          defaultKey="film"
          options={FILM_OPTIONS}
          value={filters.film}
          onChange={(v) => setFilter("film", v)}
        />
        <SearchField
          label="검색어"
          defaultKey="keyword"
          value={filters.keyword}
          onChange={(v) => setFilter("keyword", v)}
          placeholder="BOM 번호·이름, 부재료, 색상"
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mqc.qdb.colorBom">
        <ContentPanel width={560}>
          <BomListPanel
            rows={rows}
            selectedNo={selected?.bomNo ?? null}
            loading={loading}
            loaded={loaded}
            onRowClick={handleRowClick}
          />
        </ContentPanel>
        <BomDetail bom={selected} loading={loading} />
      </ContentBody>
    </PageLayout>
  );
}

const BomListPanel = memo(function BomListPanel({
  rows,
  selectedNo,
  loading,
  loaded,
  onRowClick,
}: {
  rows: Record<string, unknown>[];
  selectedNo: string | null;
  loading: boolean;
  loaded: boolean;
  onRowClick: (row: Record<string, unknown>) => void;
}) {
  return (
    <GridPanel title="칼라 BOM" count={rows.length}>
      <AgDataGrid
        gridId="boms"
        rowKey="bomNo"
        columns={BOM_COLUMNS}
        data={rows}
        columnSizing="fit"
        highlightedRowKey={selectedNo}
        onRowClick={onRowClick}
        loading={loading}
        emptyMessage={
          loaded
            ? "조건에 맞는 BOM 이 없습니다. 조건을 바꿔 보세요."
            : undefined
        }
      />
    </GridPanel>
  );
});

const BomDetail = memo(function BomDetail({
  bom,
  loading,
}: {
  bom: Bom | null;
  loading: boolean;
}) {
  const layerRows = useMemo(() => (bom ? bom.layers.map(layerRow) : []), [bom]);
  const differs = bom ? bom.layers.filter((l) => l.thicknessDiffers).length : 0;
  return (
    <ContentBody
      direction="column"
      resizable
      storageKey="mqc.qdb.colorBom.detail"
    >
      <ContentPanel height={360} scrollY>
        <CardFrame
          title={bom ? `도장 단면 — ${bom.bomNo} ${bom.bomName}` : "도장 단면"}
          testId="colorBom-stack"
          right={
            bom ? (
              <>
                <Badge
                  tone="primary"
                  label={`도막 합계 ${umText(bom.coatUm)}`}
                  testId="colorBom-coat-total"
                />
                {bom.hasFilm ? (
                  <Badge label={`보호필름 ${umText(bom.filmUm)} 별도`} />
                ) : null}
                {bom.missingSubmats.length > 0 ? (
                  <Badge
                    tone="warning"
                    label={`부재료 기준에 없음 ${bom.missingSubmats.length}`}
                    title={bom.missingSubmats.join(", ")}
                  />
                ) : null}
                {differs > 0 ? (
                  <Badge
                    tone="warning"
                    label={`기준 도막과 다름 ${differs}`}
                    title="BOM 도막두께가 부재료 기준 건조도막두께와 다릅니다"
                  />
                ) : null}
              </>
            ) : null
          }
        >
          {bom ? (
            <CoatingStack bom={bom} testId="colorBom-diagram" />
          ) : (
            <MutedText>왼쪽에서 BOM 을 고르세요.</MutedText>
          )}
        </CardFrame>
      </ContentPanel>
      <ContentPanel>
        <GridPanel title="층 구성" count={layerRows.length}>
          <AgDataGrid
            gridId="layers"
            rowKey="itemCode"
            columns={LAYER_COLUMNS}
            data={layerRows}
            columnSizing="fixed"
            loading={loading}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});
