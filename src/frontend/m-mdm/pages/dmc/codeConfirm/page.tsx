"use client";

/**
 * codeConfirm — 마루 코드 버전 확정(검사 8항·적용시점·diff)(TSK-06-05).
 *
 * 정본: docs/mdm/screens/codeConfirm/codeConfirm_기능설계서.md, TSK-06-05 design.md §6.7.
 * 왼쪽은 확정 대기 DRAFT 목록, 오른쪽은 확정 폼·검사 결과 표·diff·바뀐 카테고리 요약이다. 진입 코드·버전은
 * handoff(openMdmPage) > snapshot 순서로 정하고 받은 값은 snapshot 에 남긴다(06-02 §6.10).
 * 검사(`validate`)는 쓰기가 없고, 확정 버튼은 검사한 apply_from 이 지금 입력값과 같을 때만 켜진다(I30). 경고 확인과
 * 미래 적용 경고는 대화상자에서 한다(D6·D7). 서버 거부 message 는 오류 영역에 그대로 보인다(I35).
 * 시안 탭7 의 상신·긴급·사유·결재 영역은 만들지 않는다(spec 제약). OBJECT_ID = screenId = BPMN process id = 'codeConfirm'.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { Button, Input } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { DraftLockBadge, MdmPageLayout, VersionStatusBadge, useMdmPageParams } from "@/shell";

import { confirmDraft, searchDrafts, validateDraft, viewDraft } from "./api";
import { canConfirm, checkStatusLabel, toServerDateTime, warningLines } from "./checks";
import { ConfirmModal } from "./ConfirmModal";
import type { CategoryChange, CheckRow, DiffEntry, PendingDraft, ViewResult } from "./types";

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
const cellStyle = { ...DETAIL_VALUE_CELL, padding: "4px 8px" } as const;
const headStyle = { ...DETAIL_LABEL_CELL, padding: "4px 8px", textAlign: "left" as const };
const strongWarn = { color: "var(--color-danger, #b91c1c)", fontWeight: 600 } as const;

const DIFF_KIND_LABELS: Record<string, string> = { ADDED: "추가", REMOVED: "삭제", CHANGED: "수정" };

interface Target {
  maruCodeId: string;
  ver: string | null;
}

function snapshotTarget(snapshot: unknown): Target | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.maruCodeId !== "string" || !s.maruCodeId) return null;
  return { maruCodeId: s.maruCodeId, ver: typeof s.ver === "string" && s.ver ? s.ver : null };
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

export default function CodeConfirmPage({ tabId, snapshot, onSnapshotChange }: CodeConfirmPageProps) {
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
      const out = await viewDraft(t.maruCodeId, t.ver);
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
    setChecks(null);
    setCheckedApplyFrom(null);
    setError(null);
    const base = (snapshotRef.current as Record<string, unknown> | null) ?? {};
    onSnapshotChange?.({ ...base, maruCodeId: t.maruCodeId, ...(t.ver ? { ver: t.ver } : {}) });
    void load(t);
  }, [load, onSnapshotChange]);

  // 진입 값: handoff(한 번만) > snapshot
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.maruCodeId) {
      handedOff.current = true;
      choose({ maruCodeId: params.maruCodeId, ver: params.ver || null });
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
  const warnings = useMemo(() => warningLines(checks), [checks]);
  const confirmEnabled = !busy && canConfirm({
    status: version?.status, ownerId: version?.ownerId, me: rbac.userId, permitted: confirmPermitted,
    checks, checkedApplyFrom, applyFrom,
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
      const out = await validateDraft(view.header.maruCodeId, version.ver, applyFrom);
      setChecks(out.rows ?? []);
      setCheckedApplyFrom(applyFrom);
      setFutureApplyFrom(out.futureApplyFrom === true);
    } catch (e) {
      setChecks(null);
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
      <ContentBody root>
        <ContentPanel width="30%">
          <DraftList
            drafts={drafts} keyword={keyword} selected={target} onKeyword={setKeyword}
            onSearch={() => void refreshList(keyword)} onSelect={(d) => choose({ maruCodeId: d.maruCodeId, ver: d.ver })}
          />
        </ContentPanel>

        <ContentPanel>
          <div style={{ overflow: "auto", height: "100%" }}>
            {error && (
              <div data-testid="cf-error" role="alert" style={{ ...section, ...strongWarn, paddingTop: "var(--spacing-sm)" }}>
                {error}
              </div>
            )}
            {!view && <p style={{ ...mutedText, padding: "var(--spacing-md)" }}>확정할 DRAFT 를 고르세요</p>}
            {view && version && (
              <>
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
                      <Input
                        data-testid="cf-apply-from" type="datetime-local" step={1} value={applyInput}
                        onChange={setApplyInput} disabled={busy}
                      />
                      <Button data-testid="cf-validate" disabled={busy || !canValidate} onClick={() => void handleValidate()}>
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
              </>
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
  return (
    <div data-testid="cf-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={cardTitle}>확정 대기 목록</div>
      <div style={{ ...section, ...rowFlex, paddingTop: "var(--spacing-sm)" }}>
        <Input data-testid="cf-keyword" value={keyword} placeholder="마루 코드 ID·이름" onChange={onKeyword} />
        <Button data-testid="cf-search" onClick={onSearch}>조회</Button>
      </div>
      {drafts && drafts.length === 0 ? (
        <p data-testid="cf-list-empty" style={{ ...mutedText, padding: "0 var(--spacing-md)" }}>확정할 DRAFT 가 없습니다</p>
      ) : (
        <div style={{ ...section, overflow: "auto" }}>
          <table style={{ ...DETAIL_TABLE_STYLE, width: "100%" }}>
            <thead>
              <tr>
                <th style={headStyle}>ID</th>
                <th style={headStyle}>이름</th>
                <th style={headStyle}>버전</th>
                <th style={headStyle}>종류</th>
                <th style={headStyle}>소유자</th>
              </tr>
            </thead>
            <tbody>
              {(drafts ?? []).map((d) => {
                const on = selected?.maruCodeId === d.maruCodeId && selected?.ver === d.ver;
                return (
                  <tr
                    key={`${d.maruCodeId}-${d.ver}`} data-testid={`cf-row-${d.maruCodeId}-${d.ver}`} aria-selected={on}
                    onClick={() => onSelect(d)}
                    style={{ cursor: "pointer", background: on ? "var(--color-primary-soft)" : undefined }}
                  >
                    <td style={cellStyle}>{d.maruCodeId}</td>
                    <td style={cellStyle}>{d.maruCodeName}</td>
                    <td style={cellStyle}>{d.verLabel}</td>
                    <td style={cellStyle}>{d.verKind}</td>
                    <td style={cellStyle}>{d.ownerId ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  return (
    <div data-testid="cf-checks">
      <div style={cardTitle}>검사 결과</div>
      <div style={section}>
        <table style={{ ...DETAIL_TABLE_STYLE, width: "100%" }}>
          <thead>
            <tr>
              <th style={headStyle}>번호</th>
              <th style={headStyle}>검사</th>
              <th style={headStyle}>결과</th>
              <th style={headStyle}>상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rejected = r.status === "REJECTED";
              return (
                <tr key={r.no} data-testid={`cf-check-${r.no}`} data-rejected={rejected ? "true" : "false"}
                  style={rejected ? { background: "var(--color-danger-soft, #fee2e2)" } : undefined}>
                  <td style={cellStyle}>{r.no}</td>
                  <td style={cellStyle}>{r.item}</td>
                  <td style={cellStyle}>
                    <span data-testid={`cf-check-status-${r.no}`} style={rejected ? strongWarn : undefined}>
                      {checkStatusLabel(r.status)}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {(r.issues ?? []).map((i, idx) => (
                      <div key={idx}>{i.itemKey ? `${i.message} (${i.itemKey})` : i.message}</div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffTable({ entries }: { entries: DiffEntry[] }) {
  return (
    <div data-testid="cf-diff">
      <div style={cardTitle}>직전 RELEASED 대비 변경</div>
      <div style={section}>
        {entries.length === 0 ? (
          <p data-testid="cf-diff-empty" style={mutedText}>변경된 행이 없습니다</p>
        ) : (
          <table style={{ ...DETAIL_TABLE_STYLE, width: "100%" }}>
            <thead>
              <tr>
                <th style={headStyle}>테이블</th>
                <th style={headStyle}>키</th>
                <th style={headStyle}>변경</th>
                <th style={headStyle}>이전</th>
                <th style={headStyle}>이후</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((d) => (
                <tr key={`${d.table}-${d.key}`} data-testid={`cf-diff-${d.key}`}>
                  <td style={cellStyle}>{d.table}</td>
                  <td style={cellStyle}>{d.key}</td>
                  <td style={cellStyle}>{DIFF_KIND_LABELS[d.kind] ?? d.kind}</td>
                  <td style={cellStyle}>{valuesText(d.oldValues, d.kind === "CHANGED" ? d.newValues : null)}</td>
                  <td style={cellStyle}>{valuesText(d.newValues, d.kind === "CHANGED" ? d.oldValues : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
