"use client";

/**
 * termMng — 용어 관리 화면.
 *
 * 정본: docs/mdm/screens/termMng/termMng_기능설계서.md. mls `noticeMgmt` 패턴 + 새 유사어 추천 패널
 * (A-RECO, 리포에 선례가 없어 새로 만든다 — 순수 `setTimeout`+`AbortController`).
 */
import { useCallback, useMemo, useState } from "react";

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
import { AgDataGrid, GridLimitNotice, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, ProgressBar, Textarea } from "@dk-oasis/shared/form";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { MdmPageLayout } from "@/shell";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";

import { deleteTerm, reencodeBatch, recommend, saveTerm, searchTerms } from "./api";
import {
  emptyFilters,
  emptyTermForm,
  termFormFromRow,
  type RecommendCandidate,
  type TermForm,
  type TermMngFilters,
  type TermRow,
} from "./types";

const TERM_COLUMNS: GridColumn[] = [
  { key: "termName", header: "표기", width: 140, align: "left" },
  { key: "engName", header: "영문명", width: 180, align: "left" },
  { key: "engAbbr", header: "영문 약어", width: 100, align: "left" },
  { key: "context", header: "맥락", width: 120, align: "left" },
  { key: "systemsText", header: "사용 시스템", width: 140, align: "left" },
  { key: "synonymsText", header: "동의어", width: 220, align: "left" },
];

/** A-RECO 유사어 추천 그리드 열. 행 키는 `{stage}-{termId}`(같은 용어가 1차·2차에 함께 나올 수 있다). */
const RECO_COLUMNS_BASE: GridColumn[] = [
  { key: "stageText", header: "구분", width: 70, align: "center" },
  { key: "termName", header: "표기", width: 120, align: "left" },
  { key: "engName", header: "영문명", width: 150, align: "left" },
  { key: "systemsText", header: "사용 시스템", width: 110, align: "left" },
  { key: "scoreText", header: "유사도", width: 70, align: "right" },
];

/** D-002(표기)가 2자 이상이어야 1차 추천을 실행한다(I18). */
const MIN_RECOMMEND_LENGTH = 2;

export default function TermMngPage() {
  const [filters, setFilters] = useState<TermMngFilters>(emptyFilters);
  const [rows, setRows] = useState<TermRow[]>([]);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [rowsTotal, setRowsTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [form, setForm] = useState<TermForm | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<RecommendCandidate[]>([]);
  const [stage2Enabled, setStage2Enabled] = useState(false);

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

  // [조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 저장·삭제 뒤 재조회는 지금 모드를 따른다.
  const handleSearch = useCallback(async (all = false) => {
    setIsBusy(true);
    try {
      const payload = await searchTerms(filters.keyword, filters.systems, filters.context, all ? undefined : FIRST_SEARCH_LIMIT);
      setRows(payload.list ?? []);
      setRowsTotal(payload.truncated ? (payload.totalCount ?? null) : null);
      setShowAll(all);
      setSelectedTermId(null);
      setForm(null);
      setCandidates([]);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [filters]);

  // 첫 진입 자동 조회 없음 — [조회] 버튼으로만 조회(2026-10-02 사용자 요청)

  const handleFilterChange = useCallback((key: keyof TermMngFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** B-002 등록 — A-DETAIL·A-RECO 초기화. */
  const handleNew = useCallback(() => {
    setSelectedTermId(null);
    setForm(emptyTermForm());
    setCandidates([]);
  }, []);

  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    const termId = Number(row.termId);
    // 같은 행을 다시 누르면 폼을 목록 값으로 되돌리지 않는다 — 목록은 [조회]·저장 때만 새로 받고 그때 선택도 비우므로, 다시 채우면
    // 고친 입력만 말없이 사라진다(2026-10-03).
    if (termId === selectedTermId) return;
    setSelectedTermId(termId);
    const original = rows.find((r) => r.termId === termId);
    if (original) {
      setForm(termFormFromRow(original));
    }
  }, [rows, selectedTermId]);

  const handleFormChange = useCallback((key: keyof TermForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const validate = useCallback((f: TermForm): string | null => {
    if (!f.termName.trim()) return "표기(한글)는 필수입니다."; // V-001
    if (!f.senseNo.trim() || Number.isNaN(Number(f.senseNo))) return "의미 번호는 숫자여야 합니다."; // V-002
    if (!f.definition.trim()) return "정의는 필수입니다."; // V-003
    return null;
  }, []);

  /** B-003 저장. */
  const handleSave = useCallback(async () => {
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
  }, [form, validate, handleSearch, showAll]);

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

  /** A-RECO — D-002·D-004·D-007 중 하나라도 바뀌고 표기가 2자 이상이면 디바운스 후 compare 1회. */
  useDebouncedEffect(
    async (signal) => {
      if (!form || form.termName.trim().length < MIN_RECOMMEND_LENGTH) {
        setCandidates([]);
        setStage2Enabled(false);
        return;
      }
      try {
        const payload = await recommend(form.termId, form.termName, form.definition, form.engName, signal);
        setCandidates(payload.candidates ?? []);
        setStage2Enabled(!!payload.stage2Enabled);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        // 추천 실패는 조용히 무시한다 — 화면 핵심 흐름(저장)을 막지 않는다.
      }
    },
    [form?.termName, form?.definition, form?.engName, form?.termId],
    300,
  );

  /** B-005/GB-001 동의어로 확정 — D12(a): 후보의 termName+후보의 systems 를 "{name}({systems})" 로 붙인다. */
  const handleConfirmSynonym = useCallback((candidate: RecommendCandidate) => {
    const systemsPart = candidate.systems && candidate.systems.length > 0 ? `(${candidate.systems.join(",")})` : "";
    const entry = `${candidate.termName}${systemsPart}`;
    setForm((prev) => {
      if (!prev) return prev;
      const existing = prev.synonyms.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing.includes(entry)) return prev;
      return { ...prev, synonyms: [...existing, entry].join(",") };
    });
  }, []);

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

  const recoRows = useMemo(
    () =>
      candidates
        .filter((c) => c.stage === "1" || stage2Enabled)
        .map((c) => ({
          ...c,
          recoKey: `${c.stage}-${c.termId}`,
          stageText: c.stage === "1" ? "1차 이름" : "2차 의미",
          systemsText: (c.systems ?? []).join(", "),
          scoreText: c.score.toFixed(2),
        })),
    [candidates, stage2Enabled],
  );
  const recoColumns = useMemo<GridColumn[]>(
    () => [
      ...RECO_COLUMNS_BASE.map((col) =>
        col.key === "termName"
          ? {
              ...col,
              render: (v: unknown, r: Record<string, unknown>) => (
                <span data-testid={`reco-candidate-${String(r.recoKey)}`}>{String(v ?? "")}</span>
              ),
            }
          : col,
      ),
      {
        key: "confirm",
        header: "",
        width: 110,
        align: "center",
        sortable: false,
        tooltip: false,
        render: (_v: unknown, r: Record<string, unknown>) => (
          <Button size="mini" data-testid={`reco-confirm-${String(r.recoKey)}`} disabled={!form} onClick={() => handleConfirmSynonym(r as unknown as RecommendCandidate)}>
            동의어로 확정
          </Button>
        ),
      },
    ],
    [form, handleConfirmSynonym],
  );

  return (
    <MdmPageLayout
      group="dma"
      screenId="termMng"
      title="용어 관리"
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary" as const, disabled: isBusy, action: "search" },
        { id: "btn_new", label: "등록", onClick: handleNew, disabled: isBusy, action: "save" },
        { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save" as const, disabled: isBusy || !form, action: "save" },
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
        <ContentPanel>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>표기 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.termName ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("termName", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>의미 번호 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.senseNo ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("senseNo", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>정의 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Textarea value={form?.definition ?? ""} rows={3} disabled={!form || isBusy} onChange={(v) => handleFormChange("definition", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>맥락</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.context ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("context", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>사용 시스템</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.systems ?? ""} placeholder="MES,ERP" disabled={!form || isBusy} onChange={(v) => handleFormChange("systems", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>영문명</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.engName ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("engName", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>영문 약어</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.engAbbr ?? ""} disabled={!form || isBusy} onChange={(v) => handleFormChange("engAbbr", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>동의어</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.synonyms ?? ""} placeholder="배치(ERP)" disabled={!form || isBusy} onChange={(v) => handleFormChange("synonyms", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>별칭</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Input value={form?.aliases ?? ""} placeholder="코일ID,COIL_ID" disabled={!form || isBusy} onChange={(v) => handleFormChange("aliases", v)} />
                </td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>표준 결정 근거</th>
                <td style={DETAIL_VALUE_CELL}>
                  <Textarea value={form?.stdBasis ?? ""} rows={2} disabled={!form || isBusy} onChange={(v) => handleFormChange("stdBasis", v)} />
                </td>
              </tr>
            </tbody>
          </table>
          {!form && (
            <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
              목록에서 행을 선택하거나 [등록] 을 눌러 작성하세요.
            </p>
          )}
        </ContentPanel>

        <ContentPanel height={300}>
          <GridPanel title={`유사어 추천${stage2Enabled ? "" : " (1차 이름 비교만, 임베딩 인코더 꺼짐)"}`} count={recoRows.length}>
            <AgDataGrid
              ariaLabel="유사어 추천"
              columnSizing="fit"
              columns={recoColumns}
              data={recoRows}
              rowKey="recoKey"
              emptyMessage="표기를 2자 이상 입력하면 비슷한 용어를 보여 줍니다."
            />
          </GridPanel>
        </ContentPanel>
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
