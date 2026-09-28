"use client";

/**
 * unitMng — 단위 마스터 화면.
 *
 * 정본: docs/mdm/screens/unitMng/unitMng_기능설계서.md. 페이지 유형 B(조회+상세).
 * mls `noticeMgmt` 패턴(좌측 read-only 그리드 + 우측 상세 폼)을 그대로 이식하고 `MdmPageLayout`(TSK-01-03)
 * 을 얹는다. 환산 미리보기(A-PREVIEW)는 서버 응답을 그대로 표시한다(클라이언트 계산 없음, 불변 규칙 I2).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  ErrorModal,
  SearchArea,
  SearchField,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { ComboBox, Input } from "@dk-oasis/shared/form";
import { MdmPageLayout } from "@/shell";

import { convertPreview, deleteUnit, saveUnit, searchUnits } from "./api";
import {
  dimensionLabel,
  emptyConvertPreviewForm,
  emptyFilters,
  emptyUnitForm,
  type ConvertPreviewForm,
  type DimensionOption,
  type UnitForm,
  type UnitMngFilters,
  type UnitRow,
} from "./types";

const UNIT_COLUMNS: GridColumn[] = [
  { key: "unitCode", header: "단위 코드", width: 140, align: "left" },
  { key: "dimensionLabel", header: "차원", width: 120, align: "left" },
  { key: "baseUnit", header: "기준 단위", width: 120, align: "left" },
  { key: "factor", header: "환산 계수", width: 140, align: "right" },
  { key: "baseUnitBadge", header: "기준 단위 여부", width: 120, align: "center" },
];

export default function UnitMngPage() {
  const [filters, setFilters] = useState<UnitMngFilters>(emptyFilters);
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [dimensionOptions, setDimensionOptions] = useState<DimensionOption[]>([]);
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>("");
  const [form, setForm] = useState<UnitForm | null>(null);
  const [isNewDimension, setIsNewDimension] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [previewForm, setPreviewForm] = useState<ConvertPreviewForm>(emptyConvertPreviewForm);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        dimensionLabel: dimensionLabel(r.dimension),
        baseUnitBadge: r.unitCode === r.baseUnit ? "기준 단위" : "",
      })),
    [rows],
  );

  const dimensionComboData = useMemo(
    () => dimensionOptions.map((o) => ({ value: o.dimension, label: `${dimensionLabel(o.dimension)} (${o.dimension})` })),
    [dimensionOptions],
  );

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const payload = await searchUnits(filters.unitCode, filters.dimension);
      setRows(payload.list ?? []);
      setDimensionOptions(payload.dimensionOptions ?? []);
      setSelectedUnitCode("");
      setForm(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [filters]);

  useEffect(() => {
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = useCallback((key: keyof UnitMngFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** B-002 단위 등록 — 그리드에 빈 행 추가 + A-DETAIL 초기화. 서버 호출 없음. */
  const handleNew = useCallback(() => {
    setSelectedUnitCode("");
    setForm(emptyUnitForm());
    setIsNewDimension(false);
  }, []);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const unitCode = String(row.unitCode ?? "");
    setSelectedUnitCode(unitCode);
    setIsNewDimension(false);
    setForm({
      unitCode,
      dimension: String(row.dimension ?? ""),
      baseUnit: String(row.baseUnit ?? ""),
      factor: String(row.factor ?? ""),
    });
  }, []);

  const handleFormChange = useCallback((key: keyof UnitForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /** D-002 기존 차원 선택 — D-003 기준 단위를 그 차원의 확립된 값으로 자동 채운다(D2, 서버 재검증). */
  const handleDimensionSelect = useCallback(
    (value: string) => {
      const match = dimensionOptions.find((o) => o.dimension === value);
      setIsNewDimension(false);
      setForm((prev) =>
        prev ? { ...prev, dimension: value, baseUnit: match ? match.baseUnit : prev.baseUnit } : prev,
      );
    },
    [dimensionOptions],
  );

  /** D-002 새 차원 생성 — D-003 을 자기 자신(unitCode)으로, 계수는 1로 초기 제안한다(I3, D2). */
  const handleDimensionCreateNew = useCallback((text: string) => {
    setIsNewDimension(true);
    setForm((prev) => (prev ? { ...prev, dimension: text, baseUnit: prev.unitCode, factor: "1" } : prev));
  }, []);

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
  }, [form, validate, handleSearch]);

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

  /** B-005 환산 미리보기 — 서버 응답을 그대로 표시한다(I2, 클라이언트 재계산 없음). */
  const handlePreview = useCallback(async () => {
    if (!previewForm.value || !previewForm.fromUnitCode || !previewForm.toUnitCode) {
      setErrorMessage("환산할 값과 단위 두 개를 모두 입력하세요.");
      return;
    }
    setIsBusy(true);
    try {
      const result = await convertPreview(previewForm);
      setPreviewResult(result.value !== undefined ? String(result.value) : null);
    } catch (e) {
      setPreviewResult(null);
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [previewForm]);

  return (
    <MdmPageLayout
      group="dma"
      screenId="unitMng"
      title="단위 마스터"
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary" as const, disabled: isBusy, action: "search" },
        { id: "btn_new", label: "단위 등록", onClick: handleNew, disabled: isBusy, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save" as const, disabled: isBusy || !form, action: "save" },
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
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>단위 코드 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={form?.unitCode ?? ""}
                    maxLength={20}
                    disabled={!form || isBusy || !!selectedUnitCode}
                    onChange={(v) => handleFormChange("unitCode", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>차원 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <ComboBox
                    data={dimensionComboData}
                    value={form?.dimension ?? ""}
                    disabled={!form || isBusy}
                    onChange={(v) => handleDimensionSelect(v)}
                    onCreateNew={handleDimensionCreateNew}
                    placeholder="차원 선택 또는 새 차원 입력"
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>기준 단위</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.baseUnit ?? ""} disabled readOnly />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>환산 계수 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={form?.factor ?? ""}
                    disabled={!form || isBusy || (isNewDimension && form?.unitCode === form?.baseUnit)}
                    onChange={(v) => handleFormChange("factor", v)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          {!form && (
            <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
              목록에서 행을 선택하거나 [단위 등록] 을 눌러 작성하세요.
            </p>
          )}

          <p style={{ padding: "0 var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            환산 미리보기
          </p>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>값</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={previewForm.value}
                    onChange={(v) => setPreviewForm((p) => ({ ...p, value: v }))}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>입력 단위</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={previewForm.fromUnitCode}
                    onChange={(v) => setPreviewForm((p) => ({ ...p, fromUnitCode: v }))}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>표시 단위</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={previewForm.toUnitCode}
                    onChange={(v) => setPreviewForm((p) => ({ ...p, toUnitCode: v }))}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", padding: "0 var(--spacing-md) var(--spacing-md)" }}>
            <button type="button" onClick={() => void handlePreview()} disabled={isBusy}>
              계산
            </button>
            {previewResult !== null && <span data-testid="convert-preview-result">{previewResult}</span>}
          </div>
        </ContentPanel>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
