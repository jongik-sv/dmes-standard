"use client";

/**
 * equipMng — 설비 마스터. 화면 유형 B(조회 + 상세) 표준 예제.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §B
 */
import { useCallback, useEffect, useState } from "react";

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
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DatePicker, Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { deleteEquip, saveEquip, searchEquips } from "./api";
import {
  LINE_OPTIONS,
  USE_YN_OPTIONS,
  emptyFilters,
  emptyForm,
  type EquipFilters,
  type EquipForm,
  type EquipRow,
} from "./types";

const SCREEN_ID = "equipMng";

const COLUMNS: GridColumn[] = [
  { key: "equipCd", header: "설비코드", width: 120, align: "left" },
  { key: "equipNm", header: "설비명", width: 180, align: "left" },
  { key: "lineCd", header: "라인", width: 80, align: "center" },
  { key: "installDt", header: "설치일자", width: 100, align: "center" },
  {
    key: "useYn",
    header: "사용",
    width: 80,
    align: "center",
    render: (v) =>
      v === "Y" ? (
        <GridBadge label="사용" bg="var(--color-success-soft)" color="var(--color-success)" />
      ) : (
        <GridBadge label="미사용" muted />
      ),
  },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function EquipMngPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<EquipFilters>(emptyFilters);
  const [rows, setRows] = useState<EquipRow[]>([]);
  const [selectedCd, setSelectedCd] = useState("");
  const [form, setForm] = useState<EquipForm | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isNew = form !== null && selectedCd === "";

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      setRows(await searchEquips(filters));
      setSelectedCd("");
      setForm(null);
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [filters, showMessage]);

  useEffect(() => {
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const r = row as EquipRow;
    setSelectedCd(r.equipCd);
    setForm({ equipCd: r.equipCd, equipNm: r.equipNm, lineCd: r.lineCd, installDt: r.installDt, useYn: r.useYn, remark: r.remark });
  }, []);

  const handleNew = useCallback(() => {
    setSelectedCd("");
    setForm(emptyForm());
  }, []);

  const setField = (key: keyof EquipForm, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = useCallback(async () => {
    if (!form) return;
    if (!form.equipCd.trim() || !form.equipNm.trim()) {
      showMessage({ message: "설비코드와 설비명을 입력하세요.", alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      await saveEquip(form, isNew);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      await handleSearch();
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [form, isNew, handleSearch, showMessage]);

  const handleDelete = useCallback(() => {
    if (!selectedCd) return;
    showMessage({
      title: "확인",
      message: "선택한 행을 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: async () => {
        setIsBusy(true);
        try {
          await deleteEquip(selectedCd);
          showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          await handleSearch();
        } catch (e) {
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        } finally {
          setIsBusy(false);
        }
      },
    });
  }, [selectedCd, handleSearch, showMessage]);

  const setFilter = (key: keyof EquipFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const formDisabled = !form || isBusy;

  return (
    <PageLayout
      title="설비 마스터"
      breadcrumb="기준정보 > 설비 마스터"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: isBusy, action: "search" },
        { id: "btn_new", label: "신규", onClick: handleNew, disabled: isBusy, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save", disabled: isBusy || !form, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: handleDelete, disabled: isBusy || !selectedCd, action: "delete" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="라인" type="select" options={LINE_OPTIONS} value={filters.lineCd} onChange={(v) => setFilter("lineCd", v)} />
        <SearchField label="검색어" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} />
        <SearchField label="설치일자">
          <DatePicker value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        </SearchField>
        <SearchField label="~">
          <DatePicker value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mpp.pem.equipMng">
        <ContentPanel>
          <GridPanel title="설비 목록" count={rows.length}>
            <AgDataGrid
              rowKey="equipCd"
              columns={COLUMNS}
              data={rows}
              columnSizing="fit"
              highlightedRowKey={selectedCd}
              onRowClick={handleRowClick}
              loading={isBusy}
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel width={460}>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>설비코드 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input
                    value={form?.equipCd ?? ""}
                    maxLength={20}
                    readOnly={!isNew}
                    disabled={formDisabled || !isNew}
                    onChange={(v) => setField("equipCd", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>설비명 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.equipNm ?? ""} disabled={formDisabled} onChange={(v) => setField("equipNm", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>라인</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Select
                    options={LINE_OPTIONS.filter((o) => o.value !== "")}
                    placeholder="선택"
                    value={form?.lineCd ?? ""}
                    disabled={formDisabled}
                    onChange={(v) => setField("lineCd", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>설치일자</th>
                <td style={DETAIL_VALUE_CELL}>
                  <DatePicker value={form?.installDt ?? ""} disabled={formDisabled} onChange={(v) => setField("installDt", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>사용</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Radio
                    name="useYn"
                    options={USE_YN_OPTIONS}
                    value={form?.useYn ?? "Y"}
                    disabled={formDisabled}
                    onChange={(v) => setField("useYn", v)}
                  />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>비고</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Textarea rows={3} value={form?.remark ?? ""} disabled={formDisabled} onChange={(v) => setField("remark", v)} />
                </td>
              </tr>
            </tbody>
          </table>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
