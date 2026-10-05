"use client";

/**
 * codeConfirm — 마루 코드 버전 확정(검사 8항·적용시점·diff)(TSK-06-05).
 *
 * 정본: docs/mdm/screens/codeConfirm/codeConfirm_기능설계서.md, TSK-06-05 design.md §6.7.
 * 왼쪽은 확정 대기 DRAFT 목록, 오른쪽은 확정 폼·검사 결과 표·diff·바뀐 카테고리 요약이다. 진입 코드·버전은
 * handoff(openMdmPage)로 정하고 snapshot 에 담지 않는다(R8, 2026-10-05).
 * 검사(`validate`)는 쓰기가 없고, 확정 버튼은 검사한 apply_from 이 지금 입력값과 같을 때만 켜진다(I30). 경고 확인과
 * 미래 적용 경고는 대화상자에서 한다(D6·D7). 서버 거부 message 는 오류 영역에 그대로 보인다(I35).
 * 시안 탭7 의 상신·긴급·사유·결재 영역은 만들지 않는다(spec 제약). OBJECT_ID = screenId = BPMN process id = 'codeConfirm'.
 * 다른 DRAFT 를 고르면 이전 상세를 비우지 않고 새 view 가 올 때까지 잠근 채(`stale`) 두었다가 같은 DOM 위에 바꿔 그린다
 * (2026-09-29, 고를 때마다 상세 전체를 지웠다 다시 그려 깜빡이던 문제). view 응답은 요청 순번이 지금 것과 다르면 버린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody, ContentPanel, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, DateTimePicker, Input } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { DraftLockBadge, MdmPageLayout, VEIL_FRESH, VEIL_STALE, VersionStatusBadge, useMdmPageParams } from "@/shell";

import { confirmDraft, searchDrafts, validateDraft, viewDraft } from "./api";
import { canConfirm, checkStatusLabel, checkTitle, toServerDateTime, warningLines } from "./checks";
import { ConfirmModal } from "./ConfirmModal";
import type { CategoryChange, CheckRow, DiffEntry, PendingDraft, ViewResult } from "./types";
import { uiCols } from "@/ui-meta";

export interface CodeConfirmPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const SCREEN_ID = "codeConfirm";
const COMPONENT_PATH = "dmc/codeConfirm";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;
const section = { padding: "0 var(--spacing-md) var(--spacing-sm)" } as const;
const rowFlex = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" as const };
const strongWarn = { color: "var(--color-danger, #b91c1c)", fontWeight: 600 } as const;

// 이전 DRAFT 상세를 잠근 채 두는 동안의 모습은 `@/shell` 의 VEIL_FRESH·VEIL_STALE(흐림은 늦게 건다).

const DIFF_KIND_LABELS: Record<string, string> = { ADDED: "추가", REMOVED: "삭제", CHANGED: "수정" };

const DIFF_GRID_HEIGHT = 320;

// 확정 대기 목록. 행 클릭은 PendingDraft 원본 행을 그대로 넘긴다.
const DRAFT_COLUMNS: GridColumn[] = [
  { key: "maruCodeId", header: "ID", width: 130 },
  { key: "maruCodeName", header: "이름", width: 130 },
  { key: "verLabel", header: "버전", meta: false, width: 80 },
  { key: "verKind", header: "종류", width: 80 },
  { key: "ownerId", header: "소유자", width: 90, render: (v) => (v as string | null | undefined) ?? "—" },
];

const CHECK_COLUMNS: GridColumn[] = uiCols([
  { key: "no", header: "번호", width: 60 },
  {
    key: "item", header: "검사", width: 240,
    render: (_v, row) => {
      const r = row as unknown as CheckRow;
      return (
        <>
          {checkTitle(r.no, r.item)} <span style={mutedText}>{r.item}</span>
        </>
      );
    },
  },
  {
    key: "status", header: "결과", width: 80,
    render: (_v, row) => {
      const r = row as unknown as CheckRow;
      const rejected = r.status === "REJECTED";
      return (
        <span data-testid={`cf-check-status-${r.no}`} data-rejected={rejected ? "true" : "false"} style={rejected ? strongWarn : undefined}>
          {checkStatusLabel(r.status)}
        </span>
      );
    },
  },
  {
    // 한 줄 행 높이에 맞춰 상세 메시지를 이어 붙이고, 전체 문구는 마우스오버(title)로 본다.
    key: "issues", header: "상세", width: 300,
    render: (_v, row) => {
      const text = ((row as unknown as CheckRow).issues ?? [])
        .map((i) => (i.itemKey ? `${i.message} (${i.itemKey})` : i.message)).join(" / ");
      return <span title={text}>{text}</span>;
    },
  },
]);

const DIFF_COLUMNS: GridColumn[] = uiCols([
  { key: "table", header: "테이블", width: 110 },
  { key: "key", header: "키", width: 130 },
  { key: "kind", header: "변경", width: 70, render: (v) => DIFF_KIND_LABELS[String(v)] ?? String(v) },
  {
    key: "oldValues", header: "이전", width: 200,
    render: (_v, row) => {
      const d = row as unknown as DiffEntry;
      return valuesText(d.oldValues, d.kind === "CHANGED" ? d.newValues : null);
    },
  },
  {
    key: "newValues", header: "이후", width: 200,
    render: (_v, row) => {
      const d = row as unknown as DiffEntry;
      return valuesText(d.newValues, d.kind === "CHANGED" ? d.oldValues : null);
    },
  },
]);

interface Target {
  maruCodeId: string;
  ver: string | null;
}

/** diff 값 맵을 "칼럼=값" 목록으로. CHANGED 면 값이 다른 칼럼만 보인다. */
function valuesText(values: Record<string, unknown> | null, other: Record<string, unknown> | null): string {
  if (!values) return "";
  return Object.entries(values)
    .filter(([k, v]) => (other ? other[k] !== v : v !== null && v !== undefined && v !== ""))
    .map(([k, v]) => `${k}=${v ?? "(없음)"}`)
    .join(", ");
}

function countText(n: number | null): string {
  return n === null || n === undefined ? "없음" : `${n}건`;
}

export default function CodeConfirmPage({ tabId }: CodeConfirmPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const confirmPermitted = canDoButton(rbac, SCREEN_ID, "confirm");

  const [keyword, setKeyword] = useState("");
  const [drafts, setDrafts] = useState<PendingDraft[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [view, setView] = useState<ViewResult | null>(null);
  const [applyInput, setApplyInput] = useState("");
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [checkedApplyFrom, setCheckedApplyFrom] = useState<string | null>(null);
  const [futureApplyFrom, setFutureApplyFrom] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 고른 횟수(choice)와 지금 view 가 어느 선택의 것인지(viewChoice) — 다르면 이전 선택의 view 를 잠근 채 보이는 중이다.
  // viewSeq 는 view 요청 순번 — 늦게 온 이전 요청의 응답을 버린다.
  const choiceRef = useRef(0);
  const [choice, setChoice] = useState(0);
  const [viewChoice, setViewChoice] = useState(0);
  const viewChoiceRef = useRef(0);
  const viewSeq = useRef(0);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  const refreshList = useCallback(async (kw: string) => {
    try {
      const out = await searchDrafts(kw);
      setDrafts(out.rows ?? []);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const load = useCallback(async (t: Target) => {
    const seq = ++viewSeq.current;
    const forChoice = choiceRef.current;
    setBusy(true);
    try {
      const out = await viewDraft(t.maruCodeId, t.ver);
      if (seq !== viewSeq.current) return;
      // 새로 고른 DRAFT 의 view 가 왔을 때 비로소 이전 선택의 입력·검사 결과를 비운다 — 고르자마자 비우면 잠근 채
      // 보이는 이전 상세에서 검사 표만 먼저 사라져 화면이 들썩인다. 확정 뒤 같은 선택을 다시 부를 때는 두지 않는다.
      if (forChoice !== viewChoiceRef.current) {
        setApplyInput("");
        setChecks(null);
        setCheckedApplyFrom(null);
      }
      viewChoiceRef.current = forChoice;
      setView(out);
      setViewChoice(forChoice);
    } catch (e) {
      if (seq !== viewSeq.current) return;
      setView(null);
      fail(e);
    } finally {
      if (seq === viewSeq.current) setBusy(false);
    }
  }, [fail]);

  const choose = useCallback((t: Target) => {
    choiceRef.current += 1;
    setChoice(choiceRef.current);
    setTarget(t);
    setError(null);
    void load(t);
  }, [load]);

  // 진입 값: handoff(한 번만). 선택 행은 snapshot 에 담지 않는다(R8)
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruCodeId) {
      choose({ maruCodeId: params.maruCodeId, ver: params.ver || null });
    }
  });

  useEffect(() => {
    void refreshList("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = !!view && viewChoice !== choice;
  const locked = busy || stale;
  const version = view?.version ?? null;
  const isDraft = version?.status === "DRAFT";
  const applyFrom = toServerDateTime(applyInput);
  const warnings = useMemo(() => warningLines(checks), [checks]);
  const confirmEnabled = !locked && canConfirm({
    status: version?.status, ownerId: version?.ownerId, me: rbac.userId, permitted: confirmPermitted,
    checks, checkedApplyFrom, applyFrom,
  });

  const handleValidate = async () => {
    if (!view || !version || stale) return;
    if (!applyFrom) {
      setError("적용 시작 일시를 입력하세요");
      return;
    }
    const forChoice = choiceRef.current;
    setBusy(true);
    setError(null);
    try {
      const out = await validateDraft(view.header.maruCodeId, version.ver, applyFrom);
      if (forChoice !== choiceRef.current) return; // 그사이 다른 DRAFT 를 골랐다 — 그 화면에 붙이지 않는다
      setChecks(out.rows ?? []);
      setCheckedApplyFrom(applyFrom);
      setFutureApplyFrom(out.futureApplyFrom === true);
    } catch (e) {
      if (forChoice !== choiceRef.current) return;
      setChecks(null);
      setCheckedApplyFrom(null);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (warningsAcknowledged: boolean) => {
    if (!view || !version || !checkedApplyFrom || stale) return;
    setBusy(true);
    setError(null);
    try {
      await confirmDraft(view.header.maruCodeId, version.ver, version.rowVersion, checkedApplyFrom, warningsAcknowledged);
      setModalOpen(false);
      setChecks(null);
      setCheckedApplyFrom(null);
      showMessage({ message: "확정했습니다", alertType: "info", toast: true });
      await load({ maruCodeId: view.header.maruCodeId, ver: version.ver });
      await refreshList(keyword);
    } catch (e) {
      setModalOpen(false);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MdmPageLayout group="dmc" screenId={SCREEN_ID} title="버전 확정">
      <ContentBody root resizable storageKey="mdm.dmc.codeConfirm">
        <ContentPanel width="30%">
          <DraftList
            drafts={drafts} keyword={keyword} selected={target} onKeyword={setKeyword}
            onSearch={() => void refreshList(keyword)} onSelect={(d) => choose({ maruCodeId: d.maruCodeId, ver: d.ver })}
          />
        </ContentPanel>

        <ContentPanel>
          <div style={{ overflow: "auto", height: "100%" }}>
            {error && (
              <div data-testid="cf-error" role="alert" style={{ ...section, ...strongWarn, paddingTop: "var(--spacing-sm)", whiteSpace: "pre-line" }}>
                {error}
              </div>
            )}
            {!view && <p style={{ ...mutedText, padding: "var(--spacing-md)" }}>확정할 DRAFT 를 고르세요</p>}
            {view && version && (
              <div data-testid={stale ? "cf-stale" : undefined} aria-busy={stale || undefined} style={stale ? VEIL_STALE : VEIL_FRESH}>
                <div data-testid="cf-form">
                  <div style={cardTitle}>확정 폼</div>
                  <div style={{ ...section, ...rowFlex }}>
                    <strong data-testid="cf-target">{`${view.header.maruCodeId} ${version.verLabel} ${version.verKind}`}</strong>
                    <span style={mutedText}>{view.header.maruCodeName}</span>
                    <VersionStatusBadge status={version.status} applyFrom={version.applyFrom} />
                    <DraftLockBadge status={version.status} ownerId={version.ownerId} currentUserId={rbac.userId} />
                  </div>
                  <div style={section} data-testid="cf-previous">
                    {view.previous
                      ? `직전 RELEASED ${view.previous.verLabel} · ${view.previous.applyFrom ?? ""}`
                      : "최초 버전 — 적용 순서 검사를 하지 않습니다"}
                  </div>
                  {isDraft ? (
                    <div style={{ ...section, ...rowFlex }}>
                      <span>희망 적용 시작 일시</span>
                      <DateTimePicker
                        data-testid="cf-apply-from" value={applyInput}
                        onChange={setApplyInput} disabled={locked}
                      />
                      <Button data-testid="cf-validate" disabled={locked || !canValidate} onClick={() => void handleValidate()}>
                        검사
                      </Button>
                      <Button
                        data-testid="cf-confirm" variant="primary" disabled={!confirmEnabled}
                        onClick={() => setModalOpen(true)}
                      >
                        확정
                      </Button>
                    </div>
                  ) : (
                    <div style={{ ...section, ...rowFlex }} data-testid="cf-released">
                      <span>{`적용 구간 ${version.applyFrom ?? ""} ~ ${version.applyTo ?? ""}`}</span>
                      <span>{`확정자 ${version.requestedBy ?? "—"}`}</span>
                      <span>{`확정 일시 ${version.releasedAt ?? "—"}`}</span>
                      <Button data-testid="cf-validate" disabled>검사</Button>
                      <Button data-testid="cf-confirm" variant="primary" disabled>확정</Button>
                    </div>
                  )}
                </div>

                {checks && <CheckTable rows={checks} />}
                <DiffTable entries={view.diff ?? []} />
                <CategorySummary changes={view.categoryChanges ?? []} unchanged={view.unchangedCategories ?? []} />
              </div>
            )}
          </div>
        </ContentPanel>
      </ContentBody>

      <ConfirmModal
        open={modalOpen}
        target={view && version ? `${view.header.maruCodeId} ${version.verLabel}` : ""}
        applyFrom={checkedApplyFrom ?? ""}
        warnings={warnings}
        futureApplyFrom={futureApplyFrom}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onSubmit={(ack) => void handleConfirm(ack)}
      />
    </MdmPageLayout>
  );
}

interface DraftListProps {
  drafts: PendingDraft[] | null;
  keyword: string;
  selected: Target | null;
  onKeyword: (v: string) => void;
  onSearch: () => void;
  onSelect: (d: PendingDraft) => void;
}

function DraftList({ drafts, keyword, selected, onKeyword, onSearch, onSelect }: DraftListProps) {
  const draftRows = useMemo(
    () => (drafts ?? []).map((d) => ({ ...d, rowId: `${d.maruCodeId}-${d.ver}` }) as unknown as Record<string, unknown>),
    [drafts],
  );
  return (
    <div data-testid="cf-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={cardTitle}>확정 대기 목록</div>
      <div style={{ ...section, ...rowFlex, paddingTop: "var(--spacing-sm)" }}>
        <Input data-testid="cf-keyword" value={keyword} placeholder="마루 코드 ID·이름" onChange={onKeyword} />
        <Button data-testid="cf-search" onClick={onSearch}>조회</Button>
      </div>
      <div style={{ ...section, flex: 1, minHeight: 0 }}>
        <AgDataGrid
          columnSizing="fit"
          columns={DRAFT_COLUMNS}
          data={draftRows}
          rowKey="rowId"
          highlightedRowKey={selected ? `${selected.maruCodeId}-${selected.ver}` : null}
          onRowClick={(r) => onSelect(r as unknown as PendingDraft)}
          emptyMessage="확정할 DRAFT 가 없습니다"
          emptyTestId="cf-list-empty"
        />
      </div>
    </div>
  );
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  return (
    <div data-testid="cf-checks">
      <div style={cardTitle}>검사 결과</div>
      <div style={section}>
        <AgDataGrid
          height="auto"
          columnSizing="fit"
          columns={CHECK_COLUMNS}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="no"
          getRowClassExtra={(r) => (r.status === "REJECTED" ? "ag-row-error" : undefined)}
        />
      </div>
    </div>
  );
}

function DiffTable({ entries }: { entries: DiffEntry[] }) {
  const diffRows = useMemo(
    () => entries.map((d) => ({ ...d, rowId: `${d.table}-${d.key}` }) as unknown as Record<string, unknown>),
    [entries],
  );
  return (
    <div data-testid="cf-diff">
      <div style={cardTitle}>직전 RELEASED 대비 변경</div>
      <div style={section}>
        <div style={{ height: DIFF_GRID_HEIGHT }}>
          <AgDataGrid
            columnSizing="fit"
            columns={DIFF_COLUMNS}
            data={diffRows}
            rowKey="rowId"
            emptyMessage="변경된 행이 없습니다"
            emptyTestId="cf-diff-empty"
          />
        </div>
      </div>
    </div>
  );
}

function CategorySummary({ changes, unchanged }: { changes: CategoryChange[]; unchanged: string[] }) {
  return (
    <div data-testid="cf-cate-summary">
      <div style={cardTitle}>바뀐 카테고리 요약</div>
      <div style={section}>
        {changes.length === 0 && <p style={mutedText}>해석 결과가 바뀐 카테고리가 없습니다</p>}
        {changes.map((c) => (
          <div key={c.cateId} data-testid={`cf-cate-${c.cateId}`} data-reduced={c.reduced ? "true" : "false"}
            style={c.reduced ? strongWarn : undefined}>
            {`${c.cateName ?? c.cateId} (${c.cateId}) · 이전 ${countText(c.beforeCount)} → 이후 ${countText(c.afterCount)}`}
            {c.kind === "NEW" ? " · 새 카테고리" : ""}
            {c.kind === "CLOSED" ? " · 닫힘" : ""}
            {c.addedCodes.length > 0 ? ` · 추가 ${c.addedCodes.join(", ")}` : ""}
            {c.removedCodes.length > 0 ? ` · 빠짐 ${c.removedCodes.join(", ")}` : ""}
            {c.reduced ? " · 줄어듦" : ""}
          </div>
        ))}
        {unchanged.length > 0 && <p style={mutedText}>{`그대로: ${unchanged.join(", ")}`}</p>}
      </div>
    </div>
  );
}
