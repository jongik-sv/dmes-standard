"use client";

/**
 * unitMng — 단위 마스터 화면.
 *
 * 정본: docs/mdm/screens/unitMng/unitMng_기능설계서.md. 페이지 유형 B(조회+상세).
 * mls `noticeMgmt` 패턴(좌측 read-only 그리드 + 우측 상세 폼)을 그대로 이식하고 `MdmPageLayout`(TSK-01-03)
 * 을 얹는다. 환산 계산기(A-PREVIEW)는 ConvertCalculator 가 맡는다(서버 응답 그대로 표시, 불변 규칙 I2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { MdmPageLayout } from "@/shell";

import { deleteUnit, saveUnit, searchUnits, loadUnitOptions } from "./api";
import { ConvertCalculator } from "./ConvertCalculator";
import { UnitDetailForm, type UnitDetailHandle } from "./UnitDetailForm";
import {
  dimensionLabel,
  emptyFilters,
  emptyUnitForm,
  type DimensionOption,
  type UnitForm,
  type UnitMngFilters,
  type UnitOption,
  type UnitRow,
} from "./types";

const UNIT_COLUMNS: GridColumn[] = [
  { key: "unitCode", header: "단위 코드", width: 140, align: "left" },
  { key: "dimensionLabel", header: "차원", meta: "DIM", width: 120, align: "left" },
  { key: "baseUnit", header: "기준 단위", width: 120, align: "left" },
  { key: "factor", header: "환산 계수", width: 140, align: "right" },
  { key: "baseUnitBadge", header: "기준 단위 여부", meta: false, width: 120, align: "center" },
];

export default function UnitMngPage() {
  const [filters, setFilters] = useState<UnitMngFilters>(emptyFilters);
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [dimensionOptions, setDimensionOptions] = useState<DimensionOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>("");
  /** 상세 폼 — 입력 값은 UnitDetailForm 이 갖고, 루트는 "폼이 있는지"만 안다(R12: 한 글자마다 루트가 다시 그려지지 않게). */
  const detailRef = useRef<UnitDetailHandle>(null);
  const [hasForm, setHasForm] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        dimensionLabel: dimensionLabel(r.dimension),
        baseUnitBadge: r.unitCode === r.baseUnit ? "기준 단위" : "",
      })),
    [rows],
  );

  const loadForm = useCallback((next: UnitForm | null) => {
    detailRef.current?.load(next);
    setHasForm(next != null);
  }, []);

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const payload = await searchUnits(filters.unitCode, filters.dimension);
      setRows(payload.list ?? []);
      setDimensionOptions(payload.dimensionOptions ?? []);
      setUnitOptions(payload.unitOptions ?? []);
      setSelectedUnitCode("");
      loadForm(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [filters, loadForm]);

  // 첫 진입 자동 목록 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청).
  // 진입 때 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음). 목록(rows)은 채우지 않는다.
  useEffect(() => {
    let alive = true;
    loadUnitOptions()
      .then((payload) => {
        if (!alive) return;
        setDimensionOptions(payload.dimensionOptions ?? []);
        setUnitOptions(payload.unitOptions ?? []);
      })
      .catch((e) => {
        if (alive) setErrorMessage(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleFilterChange = useCallback((key: keyof UnitMngFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** B-002 단위 등록 — 그리드에 빈 행 추가 + A-DETAIL 초기화. 서버 호출 없음. */
  const handleNew = useCallback(() => {
    setSelectedUnitCode("");
    loadForm(emptyUnitForm());
  }, [loadForm]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const unitCode = String(row.unitCode ?? "");
    // 같은 행을 다시 누르면 폼을 목록 값으로 되돌리지 않는다 — 목록은 [조회]·저장 때만 새로 받고 그때 선택도 비우므로, 다시 채우면
    // 고친 입력만 말없이 사라진다(2026-10-03).
    if (unitCode === selectedUnitCode) return;
    setSelectedUnitCode(unitCode);
    loadForm({
      unitCode,
      dimension: String(row.dimension ?? ""),
      baseUnit: String(row.baseUnit ?? ""),
      factor: String(row.factor ?? ""),
    });
  }, [selectedUnitCode, loadForm]);

  const validate = useCallback((f: UnitForm): string | null => {
    if (!f.unitCode.trim()) return "단위 코드는 영문·숫자·밑줄 20자 이내여야 합니다."; // V-001
    if (!f.dimension.trim()) return "차원은 영문·숫자·밑줄 50자 이내여야 합니다."; // V-002
    if (!f.baseUnit.trim()) return "기준 단위 값이 올바르지 않습니다."; // V-003
    if (!f.factor.trim() || Number.isNaN(Number(f.factor)) || Number(f.factor) <= 0) {
      return "환산 계수는 0보다 큰 숫자여야 합니다."; // V-004
    }
    return null;
  }, []);

  /** B-003 저장. */
  const handleSave = useCallback(async () => {
    const form = detailRef.current?.getForm() ?? null;
    if (!form) {
      setErrorMessage("저장할 내용이 없습니다. 행을 선택하거나 [단위 등록] 을 누르세요.");
      return;
    }
    const invalid = validate(form);
    if (invalid) {
      setErrorMessage(invalid);
      return;
    }
    setIsBusy(true);
    try {
      await saveUnit(form);
      await handleSearch();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [validate, handleSearch]);

  /** B-004 삭제 — I5(FK 참조·형제 단위 존재 시 서버가 거부). */
  const handleDelete = useCallback(async () => {
    if (!selectedUnitCode) {
      setErrorMessage("삭제할 단위를 선택하세요.");
      return;
    }
    setIsBusy(true);
    try {
      await deleteUnit(selectedUnitCode);
      await handleSearch();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedUnitCode, handleSearch]);

  return (
    <MdmPageLayout
      group="dma"
      screenId="unitMng"
      title="단위 마스터"
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary" as const, disabled: isBusy, action: "search" },
        { id: "btn_new", label: "단위 등록", onClick: handleNew, disabled: isBusy, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save" as const, disabled: isBusy || !hasForm, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: () => void handleDelete(), disabled: isBusy || !selectedUnitCode, action: "delete" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="검색어" value={filters.unitCode} onChange={(v) => handleFilterChange("unitCode", v)} />
        <SearchField
          label="차원"
          type="select"
          value={filters.dimension}
          options={[{ value: "", label: "전체" }, ...dimensionOptions.map((o) => ({ value: o.dimension, label: dimensionLabel(o.dimension) }))]}
          onChange={(v) => handleFilterChange("dimension", v)}
        />
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dma.unitMng">
        <ContentPanel>
          <GridPanel title="단위 목록" count={rows.length}>
            <AgDataGrid
              columnSizing="fit"
              columns={UNIT_COLUMNS}
              data={gridRows}
              rowKey="unitCode"
              sortable
              highlightedRowKey={selectedUnitCode}
              onRowClick={(row) => handleRowClick(row as Record<string, unknown>)}
              loading={isBusy}
              loadingMessage="조회 중..."
              emptyMessage="조회된 단위가 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel width={440}>
          <UnitDetailForm
            ref={detailRef}
            busy={isBusy}
            selectedUnitCode={selectedUnitCode}
            dimensionOptions={dimensionOptions}
          />

          <ConvertCalculator unitOptions={unitOptions} selectedUnitCode={selectedUnitCode} onError={setErrorMessage} />
        </ContentPanel>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
