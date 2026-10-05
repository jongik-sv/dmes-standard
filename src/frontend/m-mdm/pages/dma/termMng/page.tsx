"use client";

/**
 * termMng — 용어 관리 화면.
 *
 * 정본: docs/mdm/screens/termMng/termMng_기능설계서.md. mls `noticeMgmt` 패턴 + 새 유사어 추천 패널
 * (A-RECO, 리포에 선례가 없어 새로 만든다 — 순수 `setTimeout`+`AbortController`).
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridLimitNotice, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { ProgressBar } from "@dk-oasis/shared/form";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { MdmPageLayout } from "@/shell";

import { deleteTerm, reencodeBatch, saveTerm, searchTerms } from "./api";
import { TermDetailPane, type TermDetailHandle } from "./TermDetailPane";
import {
  emptyFilters,
  emptyTermForm,
  termFormFromRow,
  type TermForm,
  type TermMngFilters,
  type TermRow,
} from "./types";

const TERM_COLUMNS: GridColumn[] = [
  { key: "termName", header: "표기", width: 140, align: "left" },
  { key: "engName", header: "영문명", width: 180, align: "left" },
  { key: "engAbbr", header: "영문 약어", width: 100, align: "left" },
  { key: "context", header: "맥락", width: 120, align: "left" },
  { key: "systemsText", header: "사용 시스템", meta: "SYS_LIST", width: 140, align: "left" },
  { key: "synonymsText", header: "동의어", meta: "SYNONYMOUS_LIST", width: 220, align: "left" },
];

export default function TermMngPage() {
  const [filters, setFilters] = useState<TermMngFilters>(emptyFilters);
  const [rows, setRows] = useState<TermRow[]>([]);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [rowsTotal, setRowsTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  /** 상세 폼 — 입력 값은 TermDetailPane 이 갖고, 루트는 "폼이 있는지"만 안다(R12: 한 글자마다 루트가 다시 그려지지 않게). */
  const detailRef = useRef<TermDetailHandle>(null);
  const [hasForm, setHasForm] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);

  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        systemsText: (r.systems ?? []).join(", "),
        synonymsText: (r.synonyms ?? []).join(", "),
      })),
    [rows],
  );

  const loadForm = useCallback((next: TermForm | null, clearCandidates = true) => {
    detailRef.current?.load(next, { clearCandidates });
    setHasForm(next != null);
  }, []);

  // [조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 저장·삭제 뒤 재조회는 지금 모드를 따른다.
  const handleSearch = useCallback(async (all = false) => {
    setIsBusy(true);
    try {
      const payload = await searchTerms(filters.keyword, filters.systems, filters.context, all ? undefined : FIRST_SEARCH_LIMIT);
      setRows(payload.list ?? []);
      setRowsTotal(payload.truncated ? (payload.totalCount ?? null) : null);
      setShowAll(all);
      setSelectedTermId(null);
      loadForm(null);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [filters, loadForm]);

  // 첫 진입 자동 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청)

  const handleFilterChange = useCallback((key: keyof TermMngFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** B-002 등록 — A-DETAIL·A-RECO 초기화. */
  const handleNew = useCallback(() => {
    setSelectedTermId(null);
    loadForm(emptyTermForm());
  }, [loadForm]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const termId = Number(row.termId);
    // 같은 행을 다시 누르면 폼을 목록 값으로 되돌리지 않는다 — 목록은 [조회]·저장 때만 새로 받고 그때 선택도 비우므로, 다시 채우면
    // 고친 입력만 말없이 사라진다(2026-10-03).
    if (termId === selectedTermId) return;
    setSelectedTermId(termId);
    const original = rows.find((r) => r.termId === termId);
    if (original) {
      loadForm(termFormFromRow(original), false);
    }
  }, [rows, selectedTermId, loadForm]);

  const validate = useCallback((f: TermForm): string | null => {
    if (!f.termName.trim()) return "표기(한글)는 필수입니다."; // V-001
    if (!f.senseNo.trim() || Number.isNaN(Number(f.senseNo))) return "의미 번호는 숫자여야 합니다."; // V-002
    if (!f.definition.trim()) return "정의는 필수입니다."; // V-003
    return null;
  }, []);

  /** B-003 저장. */
  const handleSave = useCallback(async () => {
    const form = detailRef.current?.getForm() ?? null;
    if (!form) {
      setErrorMessage("저장할 내용이 없습니다. 행을 선택하거나 [등록] 을 누르세요.");
      return;
    }
    const invalid = validate(form);
    if (invalid) {
      setErrorMessage(invalid);
      return;
    }
    setIsBusy(true);
    setWarningMessage(null);
    try {
      const result = await saveTerm(form);
      if (result.warnings && result.warnings.length > 0) {
        setWarningMessage(
          result.warnings.includes("ENG_ABBR_DUP")
            ? `영문 약어 \`${form.engAbbr}\` 이 이미 다른 용어에서 쓰이고 있습니다.`
            : result.warnings.join(", "),
        );
      }
      await handleSearch(showAll);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [validate, handleSearch, showAll]);

  /** B-004 삭제. */
  const handleDelete = useCallback(async () => {
    if (!selectedTermId) {
      setErrorMessage("삭제할 용어를 선택하세요.");
      return;
    }
    setIsBusy(true);
    try {
      await deleteTerm(selectedTermId);
      await handleSearch(showAll);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedTermId, handleSearch, showAll]);

  /** B-006 재인코딩 배치 — 청크 단위 폴링(D6), done=true 까지 반복 호출. */
  const handleReencodeBatch = useCallback(async () => {
    setBatchRunning(true);
    setBatchStatus("실행 중...");
    try {
      let done = false;
      let totalProcessed = 0;
      while (!done) {
        const result = await reencodeBatch(500);
        if (!result.enabled) {
          setBatchStatus("임베딩 인코더가 비활성 상태입니다.");
          break;
        }
        totalProcessed += result.processed ?? 0;
        done = !!result.done;
        setBatchStatus(`처리 ${totalProcessed}건, 남은 ${result.remaining ?? 0}건`);
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchRunning(false);
    }
  }, []);

  return (
    <MdmPageLayout
      group="dma"
      screenId="termMng"
      title="용어 관리"
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary" as const, disabled: isBusy, action: "search" },
        { id: "btn_new", label: "등록", onClick: handleNew, disabled: isBusy, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save" as const, disabled: isBusy || !hasForm, action: "save" },
        { id: "btn_delete", label: "삭제", onClick: () => void handleDelete(), disabled: isBusy || !selectedTermId, action: "delete" },
        { id: "btn_reencode", label: "재인코딩 배치 실행", onClick: () => void handleReencodeBatch(), disabled: isBusy || batchRunning, action: "execute" },
      ]}
    >
      <SearchArea onSearch={() => void handleSearch()}>
        <SearchField label="검색어" value={filters.keyword} onChange={(v) => handleFilterChange("keyword", v)} />
        <SearchField label="사용 시스템" value={filters.systems} onChange={(v) => handleFilterChange("systems", v)} />
        <SearchField label="맥락" value={filters.context} onChange={(v) => handleFilterChange("context", v)} />
      </SearchArea>

      {batchStatus && (
        <div style={{ padding: "0 var(--spacing-md)" }}>
          <ProgressBar status={batchRunning ? "running" : "idle"} label={batchStatus} hideWhenIdle={false} />
        </div>
      )}

      <ContentBody root resizable storageKey="mdm.dma.termMng">
        <ContentPanel>
          <GridPanel
            title="용어 목록"
            count={rows.length}
            titleExtra={
              <GridLimitNotice
                shownCount={rows.length}
                totalCount={rowsTotal}
                onShowAll={() => void handleSearch(true)}
                disabled={isBusy}
                testId="term-list-limit"
              />
            }
          >
            <AgDataGrid
              columnSizing="fit"
              columns={TERM_COLUMNS}
              data={gridRows}
              rowKey="termId"
              sortable
              highlightedRowKey={selectedTermId ?? ""}
              onRowClick={(row) => handleRowClick(row as Record<string, unknown>)}
              loading={isBusy}
              loadingMessage="조회 중..."
              emptyMessage="조회된 용어가 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        <ContentBody direction="column" width={560} resizable storageKey="mdm.dma.termMng.detail">
          <TermDetailPane ref={detailRef} busy={isBusy} />
        </ContentBody>
      </ContentBody>

      {warningMessage && (
        <div role="alert" style={{ padding: "var(--spacing-sm) var(--spacing-md)", color: "var(--color-warning, #b45309)" }}>
          {warningMessage}
        </div>
      )}
      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
