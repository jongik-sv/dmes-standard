"use client";

/**
 * equipMng — 설비 마스터. 화면 유형 B(조회 + 상세) 표준 예제.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §B
 * 성능 구조(화면 성능 가이드 R1·R12): 상세 폼 state 는 EquipDetailPane 에만 있고 루트는 ref 핸들로 대화한다.
 * 첫 조회는 상한(FIRST_SEARCH_LIMIT)을 걸고, 잘리면 GridLimitNotice 로 [전체 보기] 를 보인다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridLimitNotice, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { DatePicker } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { deleteEquip, saveEquip, searchEquips } from "./api";
import { EquipDetailPane, type EquipDetailHandle } from "./EquipDetailPane";
import {
  FIRST_SEARCH_LIMIT,
  LINE_OPTIONS,
  emptyFilters,
  emptyForm,
  type EquipFilters,
  type EquipForm,
  type EquipRow,
} from "./types";

const SCREEN_ID = "equipMng";

/** 열 정의는 모듈 상수: 렌더마다 새 참조를 만들지 않는다(R12). 폼 값에 의존하는 열은 만들지 않는다. */
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
  const [totalCount, setTotalCount] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기]였는지 — 저장·삭제 뒤 재조회는 지금 모드를 따른다. */
  const [showAll, setShowAll] = useState(false);
  const [selectedCd, setSelectedCd] = useState("");
  // 폼 값은 루트에 두지 않는다. 루트는 단추 활성 판단용 불리언·모드만 안다.
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [isBusy, setIsBusy] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // 목록 그리드 loading 전용
  const detailRef = useRef<EquipDetailHandle>(null);

  const hasForm = mode !== "none";
  const isNew = mode === "new";

  /** all=true 는 [전체 보기]: 상한 없이 다시 받는다. */
  const handleSearch = useCallback(
    async (all = false) => {
      setIsSearching(true);
      try {
        const result = await searchEquips(filters, all ? undefined : FIRST_SEARCH_LIMIT);
        setRows(result.rows);
        setTotalCount(result.totalCount);
        setShowAll(all);
        setSelectedCd("");
        setMode("none");
        detailRef.current?.load(null);
      } catch (e) {
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsSearching(false);
      }
    },
    [filters, showMessage],
  );

  useEffect(() => {
    void handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const r = row as EquipRow;
    setSelectedCd(r.equipCd);
    setMode("edit");
    detailRef.current?.load({
      equipCd: r.equipCd,
      equipNm: r.equipNm,
      lineCd: r.lineCd,
      installDt: r.installDt,
      useYn: r.useYn,
      remark: r.remark,
    });
  }, []);

  const handleNew = useCallback(() => {
    setSelectedCd("");
    setMode("new");
    detailRef.current?.load(emptyForm());
  }, []);

  const handleSave = useCallback(async () => {
    const form = detailRef.current?.getForm();
    if (!form) return;
    if (!form.equipCd.trim() || !form.equipNm.trim()) {
      showMessage({ message: "설비코드와 설비명을 입력하세요.", alertType: "warning" });
      return;
    }
    setIsBusy(true);
    try {
      await saveEquip(form, isNew);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      await handleSearch(showAll);
    } catch (e) {
      showMessage({ title: "오류", message: errorText(e), alertType: "error" });
    } finally {
      setIsBusy(false);
    }
  }, [isNew, handleSearch, showAll, showMessage]);

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
          await handleSearch(showAll);
        } catch (e) {
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        } finally {
          setIsBusy(false);
        }
      },
    });
  }, [selectedCd, handleSearch, showAll, showMessage]);

  const setFilter = (key: keyof EquipFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const disabledAll = isBusy || isSearching;

  return (
    <PageLayout
      title="설비 마스터"
      breadcrumb="기준정보 > 설비 마스터"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: disabledAll, action: "search" },
        { id: "btn_new", label: "신규", onClick: handleNew, disabled: disabledAll, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save", disabled: disabledAll || !hasForm, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: handleDelete, disabled: disabledAll || !selectedCd, action: "delete" },
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
          <GridPanel
            title="설비 목록"
            count={rows.length}
            titleExtra={
              <GridLimitNotice
                shownCount={rows.length}
                totalCount={totalCount}
                onShowAll={() => void handleSearch(true)}
                disabled={disabledAll}
              />
            }
          >
            <AgDataGrid
              rowKey="equipCd"
              columns={COLUMNS}
              data={rows}
              columnSizing="fit"
              highlightedRowKey={selectedCd}
              onRowClick={handleRowClick}
              loading={isSearching}
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel width={460}>
          <EquipDetailPane ref={detailRef} busy={isBusy} isNew={isNew} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
