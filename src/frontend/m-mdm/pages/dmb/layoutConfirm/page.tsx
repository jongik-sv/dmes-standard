"use client";

/**
 * layoutConfirm — 전문·헤더 공용 레이아웃 버전 확정(D-144 3단계). ruleConfirm 화면 구성을 본보기로 한다.
 * 왼쪽은 확정 대기 DRAFT 목록, 오른쪽은 대상·적용 시각·검사 표·동시 전환 강조·헤더 영향도·EAI·경고 확인이다.
 * 진입 레이아웃·버전은 handoff(openMdmPage)로 정하고 snapshot 에 담지 않는다(R8). 버전은 `normVer` 로만 다룬다(`"1.001"` 을 숫자로 바꾸지 않는다).
 * 검사(`validate`)는 쓰기가 없고, 확정 버튼은 검사한 apply_from 이 지금 입력값과 같을 때만 켜진다. OBJECT_ID = screenId = 'layoutConfirm'.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentBody, ContentPanel, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { Button, Checkbox, DateTimePicker, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, GridLimitNotice, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { FIRST_SEARCH_LIMIT } from "@/oasis-screen";
import { DraftLockBadge, MdmPageLayout, VersionStatusBadge, fmtVer, normVer, useMdmPageParams } from "@/shell";

import { confirmDraft, searchDrafts, validateDraft, viewDraft } from "./api";
import { canConfirmLayout, toServerDateTime } from "./checks";
import type { CheckRow, DraftRow, ImpactRow, ValidateResult, ViewResult } from "./types";
import { uiCols } from "@/ui-meta";

export interface LayoutConfirmPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

const SCREEN_ID = "layoutConfirm";
const COMPONENT_PATH = "dmb/layoutConfirm";
const mutedText = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const cardTitle = { padding: "var(--spacing-sm) var(--spacing-md) 0", fontWeight: 600 } as const;
const section = { padding: "0 var(--spacing-md) var(--spacing-sm)" } as const;
const rowFlex = { display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" as const };
const errorText = { color: "var(--color-danger, #b91c1c)", fontWeight: 600 } as const;
const warnText = { color: "var(--color-warning, #a16207)", fontWeight: 600 } as const;
const simultaneousBand = {
  margin: "0 var(--spacing-md) var(--spacing-sm)", padding: "var(--spacing-sm) var(--spacing-md)",
  border: "1px solid var(--color-warning, #a16207)", background: "var(--color-warning-bg, #fef9c3)", fontWeight: 600,
} as const;
const IMPACT_GRID_HEIGHT = 240;

const KIND_LABELS: Record<string, string> = { MESSAGE: "전문", HEADER: "헤더" };
const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

// 목록 칸 폭은 비율 가중치다. 30% 패널에 들어오게 minWidth 를 따로 작게 준다(ruleConfirm 선례).
const DRAFT_COLUMNS: GridColumn[] = uiCols([
  { key: "LAYOUT_NAME", header: "이름", width: 150, minWidth: 70 },
  { key: "kindText", header: "종류", width: 60, minWidth: 40 },
  { key: "verText", header: "버전", width: 70, minWidth: 50 },
  { key: "ownerText", header: "소유자", width: 90, minWidth: 50 },
], ["LAYOUT_NAME"]);

const IMPACT_COLUMNS: GridColumn[] = uiCols([
  { key: "LAYOUT_NAME", header: "전문", width: 160, minWidth: 80 },
  { key: "SND_RCV", header: "송수신", width: 90, minWidth: 60 },
  { key: "verText", header: "버전", width: 70, minWidth: 50 },
  { key: "STATE", header: "상태", width: 80, minWidth: 50 },
  { key: "EVALUATED_AT", header: "평가 시각", width: 150, minWidth: 100 },
  { key: "lengthText", header: "총 길이(전 → 후)", width: 110, minWidth: 80 },
  { key: "ISSUES", header: "문제", width: 200, minWidth: 80 },
], ["LAYOUT_NAME"]);

interface Target {
  layoutId: number;
  /** `"1.001"` 형식. null 이면 서버가 그 레이아웃의 DRAFT 를 고른다. */
  ver: string | null;
}

function toVer(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? normVer(value) : null;
}

const draftKey = (layoutId: number, ver: string | null) => `${layoutId}-${normVer(ver) ?? ""}`;

interface Checked {
  result: ValidateResult;
  applyFrom: string;
}

export default function LayoutConfirmPage({ tabId }: LayoutConfirmPageProps) {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac();
  const canValidate = canDoButton(rbac, SCREEN_ID, "validate");
  const confirmPermitted = canDoButton(rbac, SCREEN_ID, "confirm");

  const [keyword, setKeyword] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  /** 목록이 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  const [draftsTotal, setDraftsTotal] = useState<number | null>(null);
  /** 마지막 조회가 [전체 보기](상한 없음)였는지. */
  const [showAll, setShowAll] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [view, setView] = useState<ViewResult | null>(null);
  const [applyInput, setApplyInput] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [done, setDone] = useState<{ closedPreviousVer: string | null; applyFrom: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  // 진입 자동 조회·[조회] 는 첫 조회 상한(R1)을 걸고, [전체 보기] 는 상한 없이 받는다. 확정 뒤 재조회는 지금 모드를 따른다.
  const refreshList = useCallback(async (kw: string, all = false) => {
    try {
      const out = await searchDrafts(kw, all ? undefined : FIRST_SEARCH_LIMIT);
      setDrafts(out.rows ?? []);
      setDraftsTotal(out.truncated ? (out.totalCount ?? null) : null);
      setShowAll(all);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const load = useCallback(async (t: Target) => {
    setBusy(true);
    try {
      setView(await viewDraft(t.layoutId, t.ver));
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
    setAcknowledged(false);
    setDone(null);
    setError(null);
    void load(t);
  }, [load]);

  // 진입 값: handoff(한 번만). 선택 행은 snapshot 에 담지 않는다(R8). handoff 의 ver 문자열은 `normVer` 로 맞춘다(소수부를 버리지 않는다).
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    const id = Number(params.layoutId);
    if (Number.isFinite(id) && id > 0) {
      choose({ layoutId: id, ver: toVer(params.ver) });
    }
  });

  useEffect(() => {
    void refreshList("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const version = view?.version ?? null;
  const isDraft = version?.STATUS === "DRAFT";
  const applyFrom = toServerDateTime(applyInput);
  const checks = checked?.result.checks ?? [];
  const errorCount = checks.filter((c) => c.severity === "ERROR").length;
  const warningCount = checks.filter((c) => c.severity === "WARNING").length;
  const confirmEnabled = !busy && isDraft && canConfirmLayout({
    validated: checked !== null, applyFrom, checkedApplyFrom: checked?.applyFrom ?? null,
    errors: errorCount + (checked?.result.applyFromCheck?.ok === false ? 1 : 0), warnings: warningCount, acknowledged,
    isOwner: !!rbac.userId && version?.OWNER_ID === rbac.userId, canConfirm: confirmPermitted,
  });

  const handleValidate = async () => {
    if (!view || !version) return;
    if (!applyFrom) {
      setError("적용 시작 일시를 입력하세요");
      return;
    }
    setBusy(true);
    setError(null);
    setAcknowledged(false);
    try {
      const result = await validateDraft(view.layout.LAYOUT_ID, version.VER, applyFrom);
      setChecked({ result, applyFrom });
    } catch (e) {
      setChecked(null);
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!view || !version || !checked) return;
    setBusy(true);
    setError(null);
    try {
      const out = await confirmDraft(
        view.layout.LAYOUT_ID, version.VER, version.ROW_VERSION, checked.applyFrom, acknowledged,
      );
      setDone({ closedPreviousVer: out.closedPreviousVer ?? null, applyFrom: checked.applyFrom });
      setChecked(null);
      setAcknowledged(false);
      showMessage({ message: "확정했습니다", alertType: "info", toast: true });
      await load({ layoutId: view.layout.LAYOUT_ID, ver: version.VER });
      await refreshList(keyword, showAll);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MdmPageLayout group="dmb" screenId={SCREEN_ID} title="레이아웃 확정">
      <ContentBody root resizable storageKey="mdm.dmb.layoutConfirm">
        <ContentPanel width="30%">
          <DraftList
            drafts={drafts} keyword={keyword} selected={target} onKeyword={setKeyword}
            onSearch={() => void refreshList(keyword)} onShowAll={() => void refreshList(keyword, true)} totalCount={draftsTotal}
            onSelect={(d) => choose({ layoutId: d.LAYOUT_ID, ver: normVer(d.VER) })}
          />
        </ContentPanel>

        <ContentPanel>
          <div style={{ overflow: "auto", height: "100%" }}>
            {error && (
              <div data-testid="lc-error" role="alert" style={{ ...section, ...errorText, paddingTop: "var(--spacing-sm)", whiteSpace: "pre-line" }}>
                {error}
              </div>
            )}
            {!view && <p style={{ ...mutedText, padding: "var(--spacing-md)" }}>확정할 DRAFT 를 고르세요</p>}
            {view && version && (
              <>
                <div style={cardTitle}>확정 폼</div>
                <div style={{ ...section, ...rowFlex }}>
                  <strong data-testid="lc-target">
                    {`${view.layout.LAYOUT_NAME} · ${kindLabel(view.layout.LAYOUT_KIND)} · ${fmtVer(version.VER)}`}
                  </strong>
                  <VersionStatusBadge status={version.STATUS} applyFrom={version.APPLY_FROM ?? null} />
                  <DraftLockBadge status={version.STATUS} ownerId={version.OWNER_ID} currentUserId={rbac.userId} />
                </div>
                <div style={section} data-testid="lc-previous">
                  {view.previous
                    ? `직전 RELEASED 버전 ${fmtVer(view.previous.VER)} · ${view.previous.APPLY_FROM ?? ""} ~ ${view.previous.APPLY_TO ?? ""}`
                    : "최초 버전 — 적용 순서 검사를 하지 않습니다"}
                </div>
                {isDraft ? (
                  <div style={{ ...section, ...rowFlex }}>
                    <span>희망 적용 시작 일시</span>
                    <DateTimePicker data-testid="lc-apply-from" value={applyInput} onChange={setApplyInput} disabled={busy} />
                    <Button data-testid="lc-validate" disabled={busy || !canValidate} onClick={() => void handleValidate()}>
                      검사
                    </Button>
                    {checked && warningCount > 0 && errorCount === 0 && (
                      <span data-testid="lc-ack">
                        <Checkbox checked={acknowledged} label="경고를 확인했습니다" onChange={setAcknowledged} />
                      </span>
                    )}
                    <Button data-testid="lc-confirm" variant="primary" disabled={!confirmEnabled} onClick={() => void handleConfirm()}>
                      확정
                    </Button>
                  </div>
                ) : (
                  <div style={{ ...section, ...rowFlex }} data-testid="lc-released">
                    <span>{`적용 구간 ${version.APPLY_FROM ?? ""} ~ ${version.APPLY_TO ?? ""}`}</span>
                    <Button data-testid="lc-validate" disabled>검사</Button>
                    <Button data-testid="lc-confirm" variant="primary" disabled>확정</Button>
                  </div>
                )}
                {done && (
                  <div data-testid="lc-done" style={section}>
                    {done.closedPreviousVer
                      ? `확정했습니다 — 직전 ${fmtVer(done.closedPreviousVer)} 는 ${done.applyFrom} 에 닫힙니다`
                      : "확정했습니다"}
                  </div>
                )}

                {checked && checked.applyFrom !== applyFrom && (
                  <p data-testid="lc-stale" style={warnText}>적용 시작 일시가 바뀌었습니다 — 아래 결과는 이전 시각 기준입니다. 다시 검사하세요</p>
                )}
                {checked && <ValidateArea view={view} checked={checked} />}
              </>
            )}
          </div>
        </ContentPanel>
      </ContentBody>
    </MdmPageLayout>
  );
}

interface DraftListProps {
  drafts: DraftRow[] | null;
  keyword: string;
  selected: Target | null;
  onKeyword: (v: string) => void;
  onSearch: () => void;
  /** [전체 보기] — 상한 없이 다시 받는다. */
  onShowAll: () => void;
  /** 상한으로 잘렸을 때의 전체 건수(안 잘렸으면 null). */
  totalCount: number | null;
  onSelect: (d: DraftRow) => void;
}

function DraftList({ drafts, keyword, selected, onKeyword, onSearch, onShowAll, totalCount, onSelect }: DraftListProps) {
  const rows = useMemo(
    () => (drafts ?? []).map((d) => ({
      ...d, rowId: draftKey(d.LAYOUT_ID, d.VER), kindText: kindLabel(d.LAYOUT_KIND), verText: fmtVer(d.VER), ownerText: d.OWNER_ID ?? "—",
    }) as unknown as Record<string, unknown>),
    [drafts],
  );
  const byId = useMemo(() => new Map((drafts ?? []).map((d) => [draftKey(d.LAYOUT_ID, d.VER), d])), [drafts]);
  return (
    <div data-testid="lc-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={cardTitle}>확정 대기 목록</div>
      {totalCount !== null && (
        <div style={{ ...section, paddingTop: "var(--spacing-xs)" }}>
          <GridLimitNotice shownCount={drafts?.length ?? 0} totalCount={totalCount} onShowAll={onShowAll} testId="lc-list-limit" />
        </div>
      )}
      <div style={{ ...section, ...rowFlex, paddingTop: "var(--spacing-sm)" }}>
        <Input data-testid="lc-keyword" value={keyword} placeholder="이름" onChange={onKeyword} />
        <Button data-testid="lc-search" onClick={onSearch}>조회</Button>
      </div>
      <div style={{ ...section, flex: 1, minHeight: 0 }}>
        <AgDataGrid gridId="draftList"
          columnSizing="fit"
          columns={DRAFT_COLUMNS}
          data={rows}
          rowKey="rowId"
          highlightedRowKey={selected ? draftKey(selected.layoutId, selected.ver) : null}
          emptyMessage="확정할 DRAFT 가 없습니다"
          emptyTestId="lc-list-empty"
          onRowClick={(r) => {
            const d = byId.get(String(r.rowId));
            if (d) onSelect(d);
          }}
          ariaLabel="확정 대기 목록"
        />
      </div>
    </div>
  );
}

/** 검사 지적은 가변 길이 목록(code·message·itemKey)이라 고정 항목 표(ruleConfirm)가 아니라 목록으로 둔다. 색과 함께 "오류/경고" 글자로도 구분한다. */
function ValidateArea({ view, checked }: { view: ViewResult; checked: Checked }) {
  const { result, applyFrom } = checked;
  const checks = result.checks ?? [];
  const isHeader = view.layout.LAYOUT_KIND === "HEADER";
  return (
    <>
      <div data-testid="lc-checks">
        <div style={cardTitle}>검사 결과</div>
        <div style={section}>
          {result.applyFromCheck && result.applyFromCheck.ok === false && (
            <p data-testid="lc-apply-order" style={errorText}>{result.applyFromCheck.message ?? "적용 시각이 직전 버전보다 늦어야 합니다"}</p>
          )}
          {checks.length === 0 && (!result.applyFromCheck || result.applyFromCheck.ok) && (
            <p style={mutedText}>검사 결과가 모두 통과했습니다</p>
          )}
          <ul style={{ margin: 0, paddingLeft: "var(--spacing-lg, 20px)" }}>
            {checks.map((c: CheckRow, i) => (
              <li key={i} data-severity={c.severity} style={c.severity === "ERROR" ? errorText : warnText}>
                {`${c.severity === "ERROR" ? "오류" : "경고"} [${c.code}] ${c.message}${c.itemKey ? ` (${c.itemKey})` : ""}`}
              </li>
            ))}
          </ul>
          {result.change?.summary && <p style={mutedText}>{`변경 요약: ${result.change.summary}`}</p>}
          {result.futureApplyFrom && <p style={mutedText}>적용 시각이 미래입니다 — 그때까지 직전 버전이 계속 적용됩니다</p>}
        </div>
      </div>
      {result.simultaneous && (
        <div data-testid="lc-simultaneous" role="alert" style={simultaneousBand}>
          {`동시 전환 — 송신·수신 양쪽이 ${applyFrom} 에 맞춰 함께 전환해야 합니다`}
          {result.change?.summary ? ` (${result.change.summary})` : ""}
        </div>
      )}
      {isHeader && <ImpactArea impact={result.impact ?? []} eais={result.eais ?? []} />}
    </>
  );
}

function ImpactArea({ impact, eais }: { impact: ImpactRow[]; eais: string[] }) {
  const rows = useMemo(
    () => impact.map((r, i) => ({
      ...r,
      rowId: `${r.LAYOUT_ID}-${i}`,
      verText: fmtVer(r.VER),
      lengthText: `${r.TOTAL_LENGTH_BEFORE ?? "—"} → ${r.TOTAL_LENGTH_AFTER ?? "—"}`,
    }) as unknown as Record<string, unknown>),
    [impact],
  );
  return (
    <>
      <div data-testid="lc-impact">
        <div style={cardTitle}>영향받는 전문</div>
        <div style={section}>
          <div style={{ height: IMPACT_GRID_HEIGHT }}>
            <AgDataGrid gridId="affectedLayouts" columnSizing="fit" columns={IMPACT_COLUMNS} data={rows} rowKey="rowId" ariaLabel="영향받는 전문"
              emptyMessage="이 헤더를 쓰는 전문이 없습니다" />
          </div>
        </div>
      </div>
      <div data-testid="lc-eais" style={section}>
        <strong>적용 시작 시각에 이 헤더가 표준 헤더인 EAI</strong>
        {` ${eais.length > 0 ? eais.join(", ") : "없음"}`}
      </div>
    </>
  );
}
