"use client";

/**
 * termMng — 용어 관리 화면.
 *
 * 정본: docs/mdm/screens/termMng/termMng_기능설계서.md. mls `noticeMgmt` 패턴 + 새 유사어 추천 패널
 * (A-RECO, 리포에 선례가 없어 새로 만든다 — 순수 `setTimeout`+`AbortController`).
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
import { Input, ProgressBar, Textarea } from "@dk-oasis/shared/form";
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
  { key: "senseNo", header: "의미", width: 70, align: "center" },
  { key: "engAbbr", header: "영문 약어", width: 100, align: "left" },
  { key: "context", header: "맥락", width: 120, align: "left" },
  { key: "systemsText", header: "사용 시스템", width: 140, align: "left" },
  { key: "synonymsText", header: "동의어", width: 220, align: "left" },
];

/** D-002(표기)가 2자 이상이어야 1차 추천을 실행한다(I18). */
const MIN_RECOMMEND_LENGTH = 2;

export default function TermMngPage() {
  const [filters, setFilters] = useState<TermMngFilters>(emptyFilters);
  const [rows, setRows] = useState<TermRow[]>([]);
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

  const handleSearch = useCallback(async () => {
    setIsBusy(true);
    try {
      const payload = await searchTerms(filters.keyword, filters.systems, filters.context);
      setRows(payload.list ?? []);
      setSelectedTermId(null);
      setForm(null);
      setCandidates([]);
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
    setSelectedTermId(termId);
    const original = rows.find((r) => r.termId === termId);
    if (original) {
      setForm(termFormFromRow(original));
    }
  }, [rows]);

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
      await handleSearch();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [form, validate, handleSearch]);

  /** B-004 삭제. */
  const handleDelete = useCallback(async () => {
    if (!selectedTermId) {
      setErrorMessage("삭제할 용어를 선택하세요.");
      return;
    }
    setIsBusy(true);
    try {
      await deleteTerm(selectedTermId);
      await handleSearch();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedTermId, handleSearch]);

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

  const stage1Candidates = candidates.filter((c) => c.stage === "1");
  const stage2Candidates = candidates.filter((c) => c.stage === "2");

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
          <GridPanel title="용어 목록" count={rows.length}>
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

        <ContentPanel width={460}>
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

          <p style={{ padding: "0 var(--spacing-md)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            유사어 추천{!stage2Enabled && " (1차 문자열만 — 임베딩 인코더 비활성)"}
          </p>
          <div data-testid="reco-stage1">
            {stage1Candidates.map((c) => (
              <div key={`s1-${c.termId}`} data-testid={`reco-candidate-1-${c.termId}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px var(--spacing-md)" }}>
                <span>{c.termName} ({c.score.toFixed(2)})</span>
                <button type="button" onClick={() => handleConfirmSynonym(c)}>동의어로 확정</button>
              </div>
            ))}
          </div>
          {stage2Enabled && (
            <div data-testid="reco-stage2">
              {stage2Candidates.map((c) => (
                <div key={`s2-${c.termId}`} data-testid={`reco-candidate-2-${c.termId}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px var(--spacing-md)" }}>
                  <span>{c.termName} ({c.score.toFixed(2)})</span>
                  <button type="button" onClick={() => handleConfirmSynonym(c)}>동의어로 확정</button>
                </div>
              ))}
            </div>
          )}
        </ContentPanel>
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
