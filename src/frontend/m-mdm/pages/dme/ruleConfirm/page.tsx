"use client";

/**
 * ruleConfirm — 룰 버전 확정(확정 검사·적용시점·diff)(TSK-08-05).
 *
 * 정본: docs/mdm/screens/ruleConfirm/ruleConfirm_기능설계서.md, TSK-08-05 design.md §6.8. dmc/codeConfirm 화면 구조를
 * 룰 모양으로 복제했다. 왼쪽은 확정 대기 DRAFT 목록, 오른쪽은 확정 폼·검사 결과 표(항목 4 + 적용 순서)·입력 계약 변경·
 * row_id diff 다. 진입 룰·버전은 handoff(openMdmPage) > snapshot 순서로 정하고 받은 값은 snapshot 에 남긴다.
 * 검사(`validate`)는 쓰기가 없고, 확정 버튼은 검사한 apply_from 이 지금 입력값과 같을 때만 켜진다(I34). 경고 확인과
 * 미래 적용 경고는 대화상자에서 한다(D4·D9). 서버 거부 message 는 오류 영역에 그대로 보인다(I39).
 * 시안 「상신」의 긴급·사유·결재 영역과 적용시점 하한은 만들지 않는다(spec 제약). OBJECT_ID = screenId = 'ruleConfirm'.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { Button, Checkbox, DateTimePicker, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { DraftLockBadge, MdmPageLayout, VersionStatusBadge, fmtVer, normVer, useMdmPageParams } from "@/shell";

import { confirmDraft, searchDrafts, validateDraft, viewDraft } from "./api";
import {
  APPLY_FROM_ITEM, canConfirm, checkStatusLabel, checkTitle, contractState, splitWarnings, toServerDateTime,
} from "./checks";
import { ConfirmModal } from "./ConfirmModal";
import type {
  ApplyFromCheck, CaseSummary, CheckIssue, CheckItem, DiffCounts, DiffRow, PendingDraft, VarLabel, ViewResult,
} from "./types";

export interface RuleConfirmPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const SCREEN_ID = "ruleConfirm";
const COMPONENT_PATH = "dme/ruleConfirm";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;
const section = { padding: "0 var(--spacing-md) var(--spacing-sm)" } as const;
const rowFlex = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" as const };
const strongWarn = { color: "var(--color-danger, #b91c1c)", fontWeight: 600 } as const;

const DIFF_KIND_LABELS: Record<string, string> = { ADDED: "추가", REMOVED: "삭제", CHANGED: "수정", SAME: "같음" };

const DIFF_GRID_HEIGHT = 320;

// 확정 대기 목록. 행 클릭은 PendingDraft 원본 행을 그대로 넘긴다. 룰 ID 칸의 rc-row-* 는 E2E 가 행을 찾아 누르는 표지다.
// fit 모드의 width 는 비율 가중치다. 30% 패널(1280 폭에서 약 300px)에 들어오게 minWidth 를 따로 작게 준다 — 열 합이 패널보다
// 넓으면 ag-grid 가 가로로 보이지 않는 오른쪽 열을 그리지 않는다(RuleListGrid 선례).
const DRAFT_COLUMNS: GridColumn[] = [
  {
    key: "maruRuleId", header: "룰 ID", width: 130, minWidth: 80,
    render: (v, row) => <span data-testid={`rc-row-${String(row.rowId)}`}>{String(v)}</span>,
  },
  { key: "maruRuleName", header: "이름", width: 130, minWidth: 60 },
  { key: "ruleKind", header: "종류", width: 90, minWidth: 50 },
  { key: "ver", header: "버전", width: 60, minWidth: 40, render: (v) => fmtVer(v as string | null) },
  { key: "ownerId", header: "소유자", width: 90, minWidth: 50, render: (v) => (v as string | null | undefined) ?? "—" },
];

interface CheckRow {
  item: string;
  status: string;
  details: string[];
  detailText: string;
}

// 검사 결과 한 행의 높이: 검사명 + 항목 코드(2줄) 또는 상세 줄 수 중 큰 쪽에 맞춘다.
const CHECK_LINE_HEIGHT = 20;
function checkRowHeight(r: CheckRow): number {
  return Math.max(2, r.details.length) * CHECK_LINE_HEIGHT + 8;
}

const CHECK_COLUMNS: GridColumn[] = [
  {
    key: "item", header: "검사", width: 200, tooltip: false,
    render: (_v, row) => {
      const r = row as unknown as CheckRow;
      return (
        <div style={{ lineHeight: `${CHECK_LINE_HEIGHT}px` }}>
          <div>{checkTitle(r.item)}</div>
          <div style={mutedText}>{r.item}</div>
        </div>
      );
    },
  },
  {
    key: "status", header: "결과", width: 80, tooltip: false,
    render: (_v, row) => {
      const r = row as unknown as CheckRow;
      const rejected = r.status === "REJECTED";
      return (
        <span data-testid={`rc-check-status-${r.item}`} data-rejected={rejected ? "true" : "false"} style={rejected ? strongWarn : undefined}>
          {checkStatusLabel(r.status)}
        </span>
      );
    },
  },
  {
    // 칸 값은 줄을 이은 글자(detailText)다 — 배열을 칸 값으로 두면 ag-grid 가 object 형 칸으로 보고 오류(#48)를 낸다.
    key: "detailText", header: "상세", width: 320, tooltip: false,
    render: (_v, row) => (
      <div style={{ lineHeight: `${CHECK_LINE_HEIGHT}px` }}>
        {(row as unknown as CheckRow).details.map((d, idx) => <div key={idx}>{d}</div>)}
      </div>
    ),
  },
];

// 직전 RELEASED 대비 변경 행. 표시 칸은 행 데이터에 글자로 넣는다(셀 툴팁도 같은 글자를 보인다).
const DIFF_COLUMNS: GridColumn[] = [
  { key: "rowId", header: "행 번호", width: 70 },
  { key: "kindLabel", header: "변경", width: 60 },
  { key: "seqText", header: "순서", width: 70 },
  { key: "changedText", header: "바뀐 칸", width: 140, minWidth: 80 },
  { key: "oldCells", header: "이전 셀", width: 220, minWidth: 120 },
  { key: "newCells", header: "이후 셀", width: 220, minWidth: 120 },
];

export const CONTRACT_BLOCKED_TEXT = "저장 시 검사 오류가 있어 계약 변경을 보지 못했습니다";
const CONTRACT_NOTICE = "적용 시점부터 이 키를 보내지 않거나 NULL 을 보내는 호출은 판정 오류가 됩니다";

interface Target {
  maruRuleId: string;
  /** `"1.001"` 형식(D-144). null 이면 서버가 그 룰의 DRAFT 를 고른다. */
  ver: string | null;
}

/** handoff·snapshot 의 버전을 `"1.001"` 로 맞춘다(옛 snapshot 의 숫자도 받는다). 읽을 수 없으면 null(서버가 DRAFT 를 고른다). */
function toVer(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? normVer(value) : null;
}

function snapshotTarget(snapshot: unknown): Target | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.maruRuleId !== "string" || !s.maruRuleId) return null;
  return { maruRuleId: s.maruRuleId, ver: toVer(s.ver) };
}

interface Checked {
  items: CheckItem[];
  applyFromCheck: ApplyFromCheck | null;
  contractWarnings: CheckIssue[];
  caseSummary: CaseSummary | null;
  futureApplyFrom: boolean;
}

export default function RuleConfirmPage({ tabId, snapshot, onSnapshotChange }: RuleConfirmPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const confirmPermitted = canDoButton(rbac, SCREEN_ID, "confirm");

  const [keyword, setKeyword] = useState("");
  const [drafts, setDrafts] = useState<PendingDraft[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [view, setView] = useState<ViewResult | null>(null);
  const [applyInput, setApplyInput] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checkedApplyFrom, setCheckedApplyFrom] = useState<string | null>(null);
  const [closedPreviousVer, setClosedPreviousVer] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handedOff = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

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
    setBusy(true);
    try {
      const out = await viewDraft(t.maruRuleId, t.ver);
      setView(out);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [fail]);

  const choose = useCallback((t: Target) => {
    setTarget(t);
    setView(null);
    setApplyInput("");
    setChecked(null);
    setCheckedApplyFrom(null);
    setClosedPreviousVer(null);
    setError(null);
    const base = (snapshotRef.current as Record<string, unknown> | null) ?? {};
    onSnapshotChange?.({ ...base, maruRuleId: t.maruRuleId, ...(t.ver !== null ? { ver: t.ver } : {}) });
    void load(t);
  }, [load, onSnapshotChange]);

  // 진입 값: handoff(한 번만) > snapshot. handoff 의 ver 문자열은 `normVer` 로 맞춘다(소수부를 버리지 않는다, D-144).
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruRuleId) {
      handedOff.current = true;
      choose({ maruRuleId: params.maruRuleId, ver: toVer(params.ver) });
    }
  });

  useEffect(() => {
    const fromSnapshot = snapshotTarget(snapshotRef.current);
    if (!handedOff.current && fromSnapshot) {
      setTarget(fromSnapshot);
      void load(fromSnapshot);
    }
    void refreshList("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const version = view?.version ?? null;
  const isDraft = version?.status === "DRAFT";
  const applyFrom = toServerDateTime(applyInput);
  const warnings = useMemo(
    () => splitWarnings(checked?.items ?? null, checked?.contractWarnings ?? []),
    [checked],
  );
  const confirmEnabled = !busy && canConfirm({
    status: version?.status, ownerId: version?.ownerId, me: rbac.userId, permitted: confirmPermitted,
    items: checked?.items ?? null, applyFromCheck: checked?.applyFromCheck, checkedApplyFrom, applyFrom,
  });

  const handleValidate = async () => {
    if (!view || !version) return;
    if (!applyFrom) {
      setError("적용 시작 일시를 입력하세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await validateDraft(view.rule.maruRuleId, version.ver, applyFrom);
      setChecked({
        items: out.items ?? [],
        applyFromCheck: out.applyFromCheck ?? null,
        contractWarnings: out.contractWarnings ?? [],
        caseSummary: out.caseSummary ?? null,
        futureApplyFrom: out.futureApplyFrom === true,
      });
      setCheckedApplyFrom(applyFrom);
    } catch (e) {
      setChecked(null);
      setCheckedApplyFrom(null);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (warningsAcknowledged: boolean) => {
    if (!view || !version || !checkedApplyFrom) return;
    setBusy(true);
    setError(null);
    try {
      const out = await confirmDraft(view.rule.maruRuleId, version.ver, version.rowVersion, checkedApplyFrom, warningsAcknowledged);
      setModalOpen(false);
      setChecked(null);
      setCheckedApplyFrom(null);
      setClosedPreviousVer(out.closedPreviousVer ?? null);
      showMessage({ message: "확정했습니다", alertType: "info", toast: true });
      await load({ maruRuleId: view.rule.maruRuleId, ver: version.ver });
      await refreshList(keyword);
    } catch (e) {
      setModalOpen(false);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const contract = view ? contractState(view.firstVersion, checked?.items ?? null, checked?.contractWarnings ?? []) : null;

  return (
    <MdmPageLayout group="dme" screenId={SCREEN_ID} title="버전 확정">
      <ContentBody root resizable storageKey="mdm.dme.ruleConfirm">
        <ContentPanel width="30%">
          <DraftList
            drafts={drafts} keyword={keyword} selected={target} onKeyword={setKeyword}
            onSearch={() => void refreshList(keyword)} onSelect={(d) => choose({ maruRuleId: d.maruRuleId, ver: d.ver })}
          />
        </ContentPanel>

        <ContentPanel>
          <div style={{ overflow: "auto", height: "100%" }}>
            {error && (
              <div data-testid="rc-error" role="alert" style={{ ...section, ...strongWarn, paddingTop: "var(--spacing-sm)", whiteSpace: "pre-line" }}>
                {error}
              </div>
            )}
            {!view && <p style={{ ...mutedText, padding: "var(--spacing-md)" }}>확정할 DRAFT 를 고르세요</p>}
            {view && version && (
              <>
                <div data-testid="rc-form">
                  <div style={cardTitle}>확정 폼</div>
                  <div style={{ ...section, ...rowFlex }}>
                    <strong data-testid="rc-target">{`${view.rule.maruRuleId} 버전 ${fmtVer(version.ver)} · ${view.rule.ruleKind}`}</strong>
                    <span style={mutedText}>{view.rule.maruRuleName}</span>
                    <VersionStatusBadge status={version.status} applyFrom={version.applyFrom} />
                    <DraftLockBadge status={version.status} ownerId={version.ownerId} currentUserId={rbac.userId} />
                  </div>
                  <div style={section} data-testid="rc-previous">
                    {view.previous
                      ? `직전 RELEASED 버전 ${fmtVer(view.previous.ver)} · ${view.previous.applyFrom ?? ""}`
                      : "최초 버전 — 적용 순서 검사를 하지 않습니다"}
                  </div>
                  {isDraft ? (
                    <div style={{ ...section, ...rowFlex }}>
                      <span>희망 적용 시작 일시</span>
                      <DateTimePicker
                        data-testid="rc-apply-from" value={applyInput}
                        onChange={setApplyInput} disabled={busy}
                      />
                      <Button data-testid="rc-validate" disabled={busy || !canValidate} onClick={() => void handleValidate()}>
                        검사
                      </Button>
                      <Button
                        data-testid="rc-confirm" variant="primary" disabled={!confirmEnabled}
                        onClick={() => setModalOpen(true)}
                      >
                        확정
                      </Button>
                    </div>
                  ) : (
                    <div style={{ ...section, ...rowFlex }} data-testid="rc-released">
                      <span>{`적용 구간 ${version.applyFrom ?? ""} ~ ${version.applyTo ?? ""}`}</span>
                      <span>{`확정자 ${version.requestedBy ?? "—"}`}</span>
                      <span>{`확정 일시 ${version.releasedAt ?? "—"}`}</span>
                      {closedPreviousVer !== null && (
                        <span data-testid="rc-closed-previous">{`직전 버전 ${fmtVer(closedPreviousVer)} 의 적용을 닫았습니다`}</span>
                      )}
                      <Button data-testid="rc-validate" disabled>검사</Button>
                      <Button data-testid="rc-confirm" variant="primary" disabled>확정</Button>
                    </div>
                  )}
                </div>

                {checked && (
                  <CheckTable items={checked.items} applyFromCheck={checked.applyFromCheck} caseSummary={checked.caseSummary} />
                )}
                {contract && <ContractArea state={contract} warnings={warnings.contract.map((w) => w.issue)} />}
                <DiffTable entries={view.diff ?? []} counts={view.diffCounts} vars={view.vars ?? []} />
              </>
            )}
          </div>
        </ContentPanel>
      </ContentBody>

      <ConfirmModal
        open={modalOpen}
        target={view && version ? `${view.rule.maruRuleId} 버전 ${fmtVer(version.ver)}` : ""}
        applyFrom={checkedApplyFrom ?? ""}
        warnings={warnings.general}
        contractWarnings={warnings.contract}
        futureApplyFrom={checked?.futureApplyFrom === true}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onSubmit={(ack) => void handleConfirm(ack)}
      />
    </MdmPageLayout>
  );
}

/** 목록 행 키 — 버전을 정규화해 `"1"`·`"1.000"` 이 다른 행으로 갈리지 않게 한다. */
function draftKey(maruRuleId: string, ver: string | null): string {
  return `${maruRuleId}-${normVer(ver) ?? ""}`;
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
    () => (drafts ?? []).map((d) => ({ ...d, rowId: draftKey(d.maruRuleId, d.ver) }) as unknown as Record<string, unknown>),
    [drafts],
  );
  return (
    <div data-testid="rc-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={cardTitle}>확정 대기 목록</div>
      <div style={{ ...section, ...rowFlex, paddingTop: "var(--spacing-sm)" }}>
        <Input data-testid="rc-keyword" value={keyword} placeholder="룰 ID·이름" onChange={onKeyword} />
        <Button data-testid="rc-search" onClick={onSearch}>조회</Button>
      </div>
      <div style={{ ...section, flex: 1, minHeight: 0 }}>
        <AgDataGrid
          columnSizing="fit"
          columns={DRAFT_COLUMNS}
          data={draftRows}
          rowKey="rowId"
          highlightedRowKey={selected ? draftKey(selected.maruRuleId, selected.ver) : null}
          onRowClick={(r) => onSelect(r as unknown as PendingDraft)}
          emptyMessage="확정할 DRAFT 가 없습니다"
          emptyTestId="rc-list-empty"
          ariaLabel="확정 대기 목록"
        />
      </div>
    </div>
  );
}

function issueText(i: CheckIssue): string {
  return i.itemKey ? `${i.message} (${i.itemKey})` : i.message;
}

interface CheckTableProps {
  items: CheckItem[];
  applyFromCheck: ApplyFromCheck | null;
  caseSummary: CaseSummary | null;
}

/** 항목 4행 + 적용 순서 1행(행 키 `APPLY_FROM`). */
function CheckTable({ items, applyFromCheck, caseSummary }: CheckTableProps) {
  const rows = useMemo(() => {
    const out: Omit<CheckRow, "detailText">[] = items.map((r) => ({
      item: r.item,
      status: r.status,
      details: [
        ...(r.item === "TEST_CASES" && caseSummary
          ? [`전체 ${caseSummary.total} · 기대값 있음 ${caseSummary.withExpected} · 통과 ${caseSummary.passed} · 실패 ${caseSummary.failed}`]
          : []),
        ...(r.issues ?? []).map(issueText),
      ],
    }));
    if (applyFromCheck) {
      out.push({
        item: APPLY_FROM_ITEM,
        status: applyFromCheck.status,
        details: [
          ...(applyFromCheck.previousApplyFrom ? [`직전 RELEASED 적용 시작 ${applyFromCheck.previousApplyFrom}`] : []),
          ...(applyFromCheck.message ? [applyFromCheck.message] : []),
        ],
      });
    }
    return out.map((r): CheckRow => ({ ...r, detailText: r.details.join("\n") }));
  }, [items, applyFromCheck, caseSummary]);
  return (
    <div data-testid="rc-checks">
      <div style={cardTitle}>검사 결과</div>
      <div style={section}>
        <AgDataGrid
          height="auto"
          columnSizing="fit"
          sortable={false}
          columns={CHECK_COLUMNS}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="item"
          getRowClassExtra={(r) => (r.status === "REJECTED" ? "ag-row-error" : undefined)}
          getRowHeight={(r) => checkRowHeight(r as unknown as CheckRow)}
          ariaLabel="검사 결과"
        />
      </div>
    </div>
  );
}

/** 입력 계약 변경 영역(I41) — 저장 시 검사 거부·검사 전에는 "변경 없음" 으로 단정하지 않는다. */
function ContractArea({ state, warnings }: { state: ReturnType<typeof contractState>; warnings: CheckIssue[] }) {
  return (
    <div data-testid="rc-contract" data-state={state}>
      <div style={cardTitle}>입력 계약 변경</div>
      <div style={section}>
        {state === "FIRST" && <p style={mutedText}>최초 버전 — 비교할 직전 RELEASED 가 없습니다</p>}
        {state === "NOT_CHECKED" && <p style={mutedText}>검사를 하면 직전 RELEASED 대비 입력 계약 변경을 보입니다</p>}
        {state === "BLOCKED" && <p style={strongWarn}>{CONTRACT_BLOCKED_TEXT}</p>}
        {state === "NONE" && <p style={mutedText}>직전 RELEASED 대비 입력 계약 변경 없음</p>}
        {state === "CHANGED" && (
          <>
            <ul style={strongWarn}>
              {warnings.map((w, i) => <li key={i}>{issueText(w)}</li>)}
            </ul>
            <p>{CONTRACT_NOTICE}</p>
          </>
        )}
      </div>
    </div>
  );
}

function varLabel(vars: VarLabel[], varId: number): string {
  const v = vars.find((x) => x.varId === varId);
  return v?.label || v?.varName || `#${varId}`;
}

function seqText(d: DiffRow): string {
  if (d.oldSeq === null || d.newSeq === null || d.oldSeq === d.newSeq) return String(d.newSeq ?? d.oldSeq ?? "");
  return `${d.oldSeq} → ${d.newSeq}`;
}

function DiffTable({ entries, counts, vars }: { entries: DiffRow[]; counts?: DiffCounts; vars: VarLabel[] }) {
  const [showSame, setShowSame] = useState(false);
  const count = (k: keyof DiffCounts) => counts?.[k] ?? entries.filter((e) => e.kind === k).length;
  const changed = entries.filter((e) => e.kind !== "SAME");
  const diffRows = useMemo(
    () =>
      entries
        .filter((d) => showSame || d.kind !== "SAME")
        .map((d) => ({
          rowId: d.rowId,
          kindLabel: DIFF_KIND_LABELS[d.kind] ?? d.kind,
          seqText: seqText(d),
          changedText: (d.changedVarIds ?? []).map((id) => varLabel(vars, id)).join(", "),
          oldCells: d.oldCells ?? "",
          newCells: d.newCells ?? "",
        })),
    [entries, showSame, vars],
  );
  return (
    <div data-testid="rc-diff">
      <div style={cardTitle}>직전 RELEASED 대비 변경(row_id)</div>
      <div style={{ ...section, ...rowFlex }}>
        <span data-testid="rc-diff-counts">
          {`추가 ${count("ADDED")} · 삭제 ${count("REMOVED")} · 수정 ${count("CHANGED")} · 같음 ${count("SAME")}`}
        </span>
        <span data-testid="rc-diff-show-same">
          <Checkbox checked={showSame} label="같은 행 보기" onChange={setShowSame} />
        </span>
      </div>
      <div style={section}>
        {changed.length === 0 && diffRows.length > 0 && <p style={mutedText}>바뀐 행이 없습니다</p>}
        <div style={{ height: DIFF_GRID_HEIGHT }}>
          <AgDataGrid
            columnSizing="fit"
            columns={DIFF_COLUMNS}
            data={diffRows}
            rowKey="rowId"
            ariaLabel="직전 RELEASED 대비 변경"
            emptyMessage="바뀐 행이 없습니다"
            emptyTestId="rc-diff-empty"
          />
        </div>
      </div>
    </div>
  );
}
