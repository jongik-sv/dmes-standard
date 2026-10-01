"use client";

/**
 * 열 설정 섹션(TSK-08-03 design §2.1) — 의사결정표 아래에서 모든 열을 한 번에 고치는 **초안 → 전체 검사 → 원자 적용/초안 버리기** 흐름.
 * 초안은 `column-draft.ts`(순수 함수)가 검사·적용 계산을 하고, 이 컴포넌트는 그리기·서버 호출만 한다. 적용은 part COLUMNS 한 번의 요청이며
 * 거부가 하나라도 있으면 요청을 만들지 않는다(불변 2). 초안이 dirty 면 표 저장·열 머리 드래그를 막는다(불변 13, `DecisionTableCard`).
 * 초안은 sessionStorage 키 `mdm-ruleEdit-colDraft:{ruleId}:{ver}` 에 둔다(시안 ST.cd 관례). 섹션은 처음에 접혀 있다(2026-10-01).
 * 표는 의사결정표와 같은 shared `AgDataGrid`(`column-grid.tsx`)다. 식 칸(변수 식·열 조건·산출 결과 식)의 서버 파싱은 보이지 않는
 * `ExprProbe` 가 맡고, 참조 변수·오류·미리보기는 "식 결과" 칸에 보인다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgDataGrid } from "@dk-oasis/shared/grid";
import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { badgeStyle } from "@/shell";

import { saveColumnDraft, searchDomains, type ExprSlot } from "../../api";
import type { RuleEditCardProps } from "../../cards";
import { describeParse, previewValue, type ParseOutcome } from "../../expr/parse-expr";
import { parsePreviewInput } from "../../expr/preview-input";
import { useParseExpr } from "../../expr/useParseExpr";
import type { DomainRow, VarCandidate } from "../../types";
import { useColumnDraftShared } from "../column-draft-context";
import { SectionFrame } from "../SectionFrame";
import {
  addColumn,
  applyColumnDraft,
  checkColumnDraft,
  columnDraftStorageKey,
  draftFromView,
  exprsOf,
  isColumnDraftDirty,
  moveColumn,
  parsedKey,
  patchColumn,
  type ColumnCheck,
  type ColumnDraftContext,
  type ColumnDraftRow,
  type ColumnNotice,
  type ParsedRef,
} from "./column-draft";
import { buildColumnGridColumns, cellPatch, toGridRow, type ColumnGridHandlers, type ExprInfo } from "./column-grid";
import { DomainSearchBox, matchDomain } from "./DomainSearchBox";

const NO_CANDIDATES: VarCandidate[] = [];

/** 식 자리 → 칸 testid 접두어·"식 결과" 칸 라벨. */
const SLOT_FIELD: Record<string, { prefix: string; label: string }> = {
  RULE_GRP_COND: { prefix: "col-grpcond", label: "열 조건" },
  RULE_RESULT_EXPR: { prefix: "col-expr", label: "결과 식" },
};

interface StoredDraft {
  rowVersion: number;
  rows: ColumnDraftRow[];
}

function readStored(key: string, rowVersion: number): ColumnDraftRow[] | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return parsed.rowVersion === rowVersion ? parsed.rows : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: StoredDraft | null): void {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등)이면 초안은 화면 메모리에만 둔다.
  }
}

function noticeText(n: ColumnNotice): string {
  switch (n.kind) {
    case "NEW_COL":
      return n.naFill
        ? `새 열 ${n.varName}: 적용하면 var_id 가 발급되고 표의 모든 행이 무관으로 채워집니다. 식을 적은 행만 조건이 걸립니다.`
        : `새 열 ${n.varName}: 적용하면 var_id 가 발급되고 표에 빈 칸이 생깁니다.`;
    case "CELLS_CLEARED":
      return n.naFill
        ? `${n.varName}: 표시 타입이 바뀌어 표의 ${n.count}개 행 셀을 무관으로 바꿉니다(자동 변환 없음).`
        : `${n.varName}: 표시 타입·변수가 바뀌어 표의 ${n.count}개 행 셀을 비웁니다(자동 변환 없음).`;
    case "COL_DELETED":
      return `${n.varName}: 열을 지우면 표의 ${n.count}개 행 셀도 함께 지워집니다.`;
  }
}

/** 식 칸 하나의 서버 파싱(500ms 디바운스). 그리지 않고 결과만 부모에 알린다. */
function ExprProbe(p: { text: string; slot: ExprSlot; enabled: boolean; candidates: readonly VarCandidate[]; onParsed: (o: ParseOutcome) => void }) {
  useParseExpr(p.text, p.slot, p.enabled, p.candidates, p.onParsed);
  return null;
}

export function ColumnSettingsSection({ view, editable, runWrite, notify, setDirty, canDo, busy }: RuleEditCardProps) {
  const shared = useColumnDraftShared();
  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const external = view.rule.sourceKind !== "MDM";
  const canEdit = editable && !external && selected != null;
  const candidates = view.varCandidates ?? NO_CANDIDATES;
  const derive = view.rule.ruleKind === "DERIVE";
  const hitPolicy = selected?.hitPolicy ?? null;

  const baseline = useMemo(() => draftFromView(view), [view]);
  const storageKey = selected ? columnDraftStorageKey(view.rule.maruRuleId, selected.ver) : "";
  const [rows, setRows] = useState<ColumnDraftRow[]>(baseline);
  const [parsed, setParsed] = useState<Record<string, ParsedRef>>({});
  const [outcomes, setOutcomes] = useState<Record<string, ParseOutcome>>({});
  const [applyRejects, setApplyRejects] = useState<ColumnCheck[] | null>(null);
  /** 도메인 찾기 팝업 — 줄 key 와 처음 검색어(칸에 직접 넣은 글자). */
  const [domainPopup, setDomainPopup] = useState<{ key: string; keyword: string } | null>(null);
  /** 도메인 칸 직접 입력 횟수 — 칸이 넣은 글자를 초안 값으로 되돌려 그리게 표시 행을 새로 만든다. */
  const [domainEdits, setDomainEdits] = useState(0);
  const domainSeq = useRef(0);
  const [previewText, setPreviewText] = useState("");
  // 처음에는 접어 둔다(2026-10-01 — 표를 먼저 보이게). 열 머리를 누르거나(highlightVarId), 표 카드의 [열 설정 보기]
  // (적중 정책을 바꿔 열 설정과 어긋날 때), 저장 안 한 초안을 되살렸을 때 펼친다. 접혀도 제목 줄의 초안·읽기 전용 배지는 보인다.
  const [open, setOpen] = useState(false);
  const counter = useRef(0);

  // view 가 바뀌면(룰·버전 전환·적용 뒤 다시 불러오기) 초안을 다시 잡는다 — 같은 row_version 의 저장 초안이 있으면 되살린다.
  useEffect(() => {
    const restored = storageKey && canEdit ? readStored(storageKey, selected?.rowVersion ?? -1) : null;
    setRows(restored ?? baseline);
    // 되살린 초안은 표 저장을 막으므로(불변 13) 무엇이 남았는지 보이게 펼친다.
    if (restored) setOpen(true);
    setApplyRejects(null);
    setDomainPopup(null);
  }, [baseline, storageKey, canEdit, selected?.rowVersion]);

  const dirty = canEdit && isColumnDraftDirty(rows, baseline);
  const { setColDirty } = shared;
  useEffect(() => {
    setColDirty(dirty);
    setDirty("columns", dirty);
    if (storageKey && canEdit) writeStored(storageKey, dirty ? { rowVersion: selected?.rowVersion ?? -1, rows } : null);
  }, [dirty, rows, setColDirty, setDirty, storageKey, canEdit, selected?.rowVersion]);
  useEffect(() => () => setColDirty(false), [setColDirty]);

  const ctx: ColumnDraftContext = useMemo(
    () => ({
      ruleKind: view.rule.ruleKind,
      hitPolicy,
      candidates,
      baseline,
      storedRows: view.rows,
      parsed,
    }),
    [view.rule.ruleKind, hitPolicy, candidates, baseline, view.rows, parsed],
  );
  const checked = useMemo(() => checkColumnDraft(rows, ctx), [rows, ctx]);
  const preview = useMemo(() => (dirty ? applyColumnDraft(rows, ctx) : null), [dirty, rows, ctx]);
  const previewRecord = useMemo(() => (previewText.trim() ? parsePreviewInput(previewText) : null), [previewText]);
  const parseEnabled = canEdit && canDo("validate");
  const varById = useMemo(() => new Map(view.vars.map((v) => [v.varId, v])), [view.vars]);
  const baseByKey = useMemo(() => new Map(baseline.map((r) => [r.key, r])), [baseline]);

  // 열 머리를 누르면 그 줄을 하이라이트·스크롤한다. 접혀 있으면 먼저 펼친다.
  const { highlightVarId } = shared;
  useEffect(() => {
    if (highlightVarId != null) setOpen(true);
  }, [highlightVarId]);
  const highlightKey = highlightVarId == null ? null : (rows.find((r) => r.varId === highlightVarId)?.key ?? null);
  // 그리드는 안에서만 스크롤하므로(scrollToRow) 페이지도 그 줄이 보이게 옮긴다. 펼친 뒤 행이 그려진 다음 프레임에 한다.
  useEffect(() => {
    if (highlightKey == null || !open) return;
    const id = requestAnimationFrame(() => {
      const el =
        document.querySelector(`[data-testid="col-table"] .ag-center-cols-container .ag-row[row-id="${highlightKey}"]`) ??
        document.querySelector('[data-testid="col-table"]');
      el?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [highlightKey, open]);

  const onParsed = useCallback((o: ParseOutcome) => {
    if (!o.text) return;
    const k = parsedKey(o.slot, o.text);
    setParsed((prev) => ({ ...prev, [k]: o.error != null ? { error: o.error } : { refVars: o.result?.refVars ?? [] } }));
    setOutcomes((prev) => ({ ...prev, [k]: o }));
  }, []);

  const patch = useCallback((key: string, change: Partial<ColumnDraftRow>) => {
    setApplyRejects(null);
    setRows((prev) => prev.map((r) => (r.key === key ? patchColumn(r, change) : r)));
  }, []);
  const add = (kind: "COND" | "RESULT") => {
    counter.current += 1;
    setRows((prev) => addColumn(prev, kind, `n${counter.current}`));
  };
  const pickDomain = (key: string, d: DomainRow) => {
    patch(key, { domainId: d.domainId, domainType: d.dataType, domainName: d.domainName || d.stdName, dataType: null });
    setDomainPopup(null);
  };
  // 도메인 칸 직접 입력 — 도메인명·표준명으로 서버를 찾아 하나로 정해지면 바로 적용하고, 아니면 그 글자로 찾기 팝업을 연다. 비우면 해제한다.
  const typeDomain = async (key: string, text: string) => {
    const t = text.trim();
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    if (t === "") {
      if (row.domainId != null) patch(key, { domainId: null, domainType: null, domainName: null });
      return;
    }
    if (row.domainId != null && t === (row.domainName ?? "").trim()) return;
    const seq = ++domainSeq.current;
    let found: DomainRow[] = [];
    try {
      found = await searchDomains(t);
    } catch {
      // 검색 오류는 팝업이 다시 검색하며 보인다.
    }
    if (seq !== domainSeq.current) return;
    const hit = matchDomain(found, t);
    if (hit) pickDomain(key, hit);
    else setDomainPopup({ key, keyword: t });
  };
  const typeDomainRef = useRef(typeDomain);
  typeDomainRef.current = typeDomain;

  const discard = () => {
    setRows(baseline);
    setApplyRejects(null);
    setDomainPopup(null);
  };

  // 그리드 열은 구조가 바뀔 때만 다시 만든다(편집 중 리셋 방지) — 동작은 ref 로 늘 최신을 부른다.
  const handlers = useRef<ColumnGridHandlers>({ move: () => {}, remove: () => {}, openDomain: () => {}, clearDomain: () => {} });
  handlers.current = {
    move: (key, dir) => setRows((prev) => moveColumn(prev, key, dir).rows),
    remove: (row) =>
      setRows((prev) => (row.varId == null ? prev.filter((r) => r.key !== row.key) : prev.map((r) => (r.key === row.key ? { ...r, deleted: !r.deleted } : r)))),
    openDomain: (key) => setDomainPopup({ key, keyword: "" }),
    clearDomain: (key) => patch(key, { domainId: null, domainType: null, domainName: null }),
  };
  const columns = useMemo(() => buildColumnGridColumns({ derive, hitPolicy, handlers }), [derive, hitPolicy]);
  const gridKey = `${view.rule.maruRuleId}:${selected?.ver ?? "-"}:${derive}:${hitPolicy ?? "-"}`;

  const disabled = !canEdit || busy;
  const data = useMemo(
    () =>
      rows.map((r) => {
        const exprs: ExprInfo[] = exprsOf(r).map(([slot, text]) => {
          const outcome = outcomes[parsedKey(slot, text)] ?? null;
          const status = describeParse(outcome, candidates);
          const f = SLOT_FIELD[slot];
          const prev =
            previewRecord && slot !== "RULE_GRP_COND" && outcome?.result && status.kind !== "error" ? previewValue(outcome.result, previewRecord) : null;
          return { testId: `${f.prefix}-${r.key}`, label: f.label, status, preview: prev };
        });
        return toGridRow(r, {
          editable: !disabled,
          checks: checked.byKey[r.key] ?? [],
          exprs,
          resolved: r.varId != null ? varById.get(r.varId) : undefined,
          base: baseByKey.get(r.key),
        });
      }),
    // domainEdits: 도메인 칸에 넣은 글자가 칸에 남지 않게(적용 못 했으면 초안 값으로) 행을 새로 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, outcomes, candidates, previewRecord, disabled, checked, varById, baseByKey, domainEdits],
  );
  // 도메인 번호도 싣는다 — 도메인 칸에 넣은 글자와 적용된 도메인 이름이 같으면 칸 값이 그대로라 ag-grid 가 칸을 다시 그리지 않는다.
  const rowClassToken = useMemo(() => JSON.stringify(rows.map((r) => [r.key, r.deleted, r.domainId])), [rows]);
  const probes = useMemo(() => {
    const seen = new Map<string, { slot: ExprSlot; text: string }>();
    for (const r of rows) for (const [slot, text] of exprsOf(r)) seen.set(parsedKey(slot, text), { slot, text });
    return [...seen.entries()];
  }, [rows]);

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      if (p.field === "domain") {
        setDomainEdits((n) => n + 1);
        void typeDomainRef.current(String(p.rowKey), p.newValue == null ? "" : String(p.newValue));
        return;
      }
      const change = cellPatch(p.field, p.newValue);
      if (change) patch(String(p.rowKey), change);
    },
    [patch],
  );

  const apply = async () => {
    if (!selected) return;
    const res = applyColumnDraft(rows, ctx);
    if (!res.ok) {
      setApplyRejects(res.rejects); // 거부가 있으면 요청을 만들지 않는다 — 아무 것도 반영되지 않는다(불변 2).
      return;
    }
    const saved = await runWrite(() => saveColumnDraft(view.rule.maruRuleId, selected.ver, selected.rowVersion, res.request));
    if (saved) {
      writeStored(storageKey, null);
      notify({ kind: "info", text: res.notices.length > 0 ? res.notices.map(noticeText).join(" ") : "열 설정을 적용했습니다." });
    }
  };

  const rejectCount = checked.rejects.length;
  const shownRejects = applyRejects ?? [];
  const gridHeight = Math.min(420, 28 + Math.max(rows.length, 2) * 26 + 18);
  const domainRow = domainPopup ? rows.find((r) => r.key === domainPopup.key) : undefined;

  return (
    <SectionFrame
      testId="rule-section-columns"
      title="열 설정"
      open={open}
      onOpenChange={setOpen}
      headerExtra={
        <>
          {dirty && (
            <span data-testid="col-dirty" style={badgeStyle("warning")}>
              열 설정 초안(저장 안 함)
            </span>
          )}
          {!canEdit && (
            <span data-testid="col-readonly" style={badgeStyle("muted")}>
              읽기 전용
            </span>
          )}
        </>
      }
    >
      {probes.map(([k, x]) => (
        <ExprProbe key={k} text={x.text} slot={x.slot} enabled={parseEnabled} candidates={candidates} onParsed={onParsed} />
      ))}
      <div data-testid="col-table" style={{ height: gridHeight, paddingTop: "var(--spacing-xs)" }}>
        <AgDataGrid
          key={gridKey}
          columns={columns}
          data={data}
          rowKey="rowKey"
          height={gridHeight}
          columnSizing="fixed"
          sortable={false}
          singleClickEdit
          onCellValueChanged={handleCellChange}
          highlightedRowKey={highlightKey}
          scrollToRow={highlightKey}
          getRowClassExtra={(row) => {
            const r = row.__row as ColumnDraftRow;
            return r.deleted ? "ag-row-deleted" : r.varId == null ? "ag-row-inserted" : undefined;
          }}
          rowClassRefreshToken={rowClassToken}
          emptyMessage="열이 없습니다."
          ariaLabel="열 설정"
        />
      </div>
      <Modal open={!!domainRow} title={`값 타입 도메인 찾기 · ${domainRow?.varName || "새 열"}`} size="md" onClose={() => setDomainPopup(null)}>
        {domainRow && (
          <DomainSearchBox
            key={`${domainRow.key}:${domainPopup?.keyword ?? ""}`}
            testId={`col-domain-${domainRow.key}`}
            initialKeyword={domainPopup?.keyword}
            onPick={(d) => pickDomain(domainRow.key, d)} onClose={() => setDomainPopup(null)} />
        )}
      </Modal>
      {canEdit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", paddingTop: "var(--spacing-sm)", alignItems: "center" }}>
          {!derive && (
            <Button disabled={disabled} data-testid="col-add-cond" onClick={() => add("COND")}>
              조건 열 추가
            </Button>
          )}
          <Button disabled={disabled} data-testid="col-add-result" onClick={() => add("RESULT")}>
            결과 열 추가
          </Button>
          <Button variant="primary" disabled={!dirty || disabled || !canDo("save")} data-testid="col-apply" onClick={() => void apply()}>
            열 설정 적용
          </Button>
          <Button disabled={!dirty || busy} data-testid="col-discard" onClick={discard}>
            초안 버리기
          </Button>
          <span style={{ color: "var(--color-text-secondary)" }}>미리보기 입력</span>
          <Input data-testid="col-preview-input" value={previewText} placeholder="COIL_THK=1.8, COIL_WID=1200" onChange={setPreviewText} style={{ width: 260 }} />
        </div>
      )}
      {dirty && (
        <div data-testid="col-summary" style={{ paddingTop: "var(--spacing-xs)" }}>
          <span data-testid="col-reject-count" style={{ color: rejectCount > 0 ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
            거부 {rejectCount}건
          </span>
          {preview?.ok && preview.notices.length > 0 && (
            <ul data-testid="col-notices" style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)" }}>
              {preview.notices.map((n, i) => (
                <li key={`${n.kind}-${n.varName}-${i}`} data-notice={n.kind}>
                  {noticeText(n)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {shownRejects.length > 0 && (
        <div data-testid="col-apply-rejects" role="alert" style={{ color: "var(--color-danger)", paddingTop: "var(--spacing-xs)" }}>
          적용하지 않았습니다(거부 {shownRejects.length}건 — 아무 것도 반영되지 않음):
          <ul style={{ margin: 0, paddingLeft: "var(--spacing-lg)" }}>
            {shownRejects.map((c, i) => (
              <li key={`${c.code}-${i}`}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionFrame>
  );
}
