"use client";

/**
 * 열 설정 섹션(TSK-08-03 design §2.1) — 의사결정표 아래에서 모든 열을 한 번에 고치는 **초안 → 전체 검사 → 원자 적용/초안 버리기** 흐름.
 * 초안은 `column-draft.ts`(순수 함수)가 검사·적용 계산을 하고, 이 컴포넌트는 그리기·서버 호출만 한다. 적용은 part COLUMNS 한 번의 요청이며
 * 거부가 하나라도 있으면 요청을 만들지 않는다(불변 2). 초안이 dirty 면 표 저장·열 머리 드래그를 막는다(불변 13, `DecisionTableCard`).
 * 초안은 sessionStorage 키 `mdm-ruleEdit-colDraft:{ruleId}:{ver}` 에 둔다(시안 ST.cd 관례). 식 칸(변수 식·열 조건·산출 결과 식)은 `ExprField`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button, Input, Select } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { saveColumnDraft } from "../../api";
import type { RuleEditCardProps } from "../../cards";
import { ExprField } from "../../expr/ExprField";
import { datalistOptions, type ParseOutcome } from "../../expr/parse-expr";
import { parsePreviewInput } from "../../expr/preview-input";
import type { DomainRow, ResolvedVar, VarCandidate } from "../../types";
import { useColumnDraftShared } from "../column-draft-context";
import {
  addColumn,
  applyColumnDraft,
  checkColumnDraft,
  columnDraftStorageKey,
  draftFromView,
  isColumnDraftDirty,
  moveColumn,
  parsedKey,
  type ColumnCheck,
  type ColumnDraftContext,
  type ColumnDraftRow,
  type ColumnNotice,
  type ParsedRef,
} from "./column-draft";
import { DomainSearchBox } from "./DomainSearchBox";

const COND_DISPS = ["Equal", "1", "2", "Expression"];
const RESULT_DISPS = ["Value", "Expression"];
const DATA_TYPES = ["", "BOOLEAN", "NUMBER", "STRING", "DATE"];
const AGGS = ["LIST", "SUM", "MIN", "MAX", "COUNT"];
const AXES = ["NONE", "ROW", "COL"];
const NO_CANDIDATES: VarCandidate[] = [];
const LIST_ID = "rule-col-candidates";

const th: CSSProperties = { textAlign: "left", padding: "2px 6px", whiteSpace: "nowrap", borderBottom: "1px solid var(--color-border-light)" };
const td: CSSProperties = { padding: "2px 6px", verticalAlign: "top", borderBottom: "1px solid var(--color-border-light)" };

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
      return `새 열 ${n.varName}: 적용하면 var_id 가 발급되고 표에 빈 칸이 생깁니다.`;
    case "CELLS_CLEARED":
      return `${n.varName}: 표시 타입·변수가 바뀌어 표의 ${n.count}개 행 셀을 비웁니다(자동 변환 없음).`;
    case "COL_DELETED":
      return `${n.varName}: 열을 지우면 표의 ${n.count}개 행 셀도 함께 지워집니다.`;
  }
}

function typeLabel(v: ResolvedVar | undefined): string {
  if (!v) return "";
  if (v.typeSource === "COLUMN") return `사전 ${v.dataType}`;
  if (v.typeSource === "RULE_RESULT") return `앞 룰 결과 ${v.dataType}`;
  if (v.typeSource === "EXPRESSION_COLUMN") return "자유식";
  return v.typeSource === "UNRESOLVED" ? "타입 없음" : "";
}

export function ColumnSettingsSection({ view, editable, runWrite, notify, setDirty, canDo, busy }: RuleEditCardProps) {
  const shared = useColumnDraftShared();
  const selected = view.versions.find((v) => v.ver === view.selectedVer) ?? null;
  const external = view.rule.sourceKind !== "MDM";
  const canEdit = editable && !external && selected != null;
  const candidates = view.varCandidates ?? NO_CANDIDATES;
  const derive = view.rule.ruleKind === "DERIVE";

  const baseline = useMemo(() => draftFromView(view), [view]);
  const storageKey = selected ? columnDraftStorageKey(view.rule.maruRuleId, selected.ver) : "";
  const [rows, setRows] = useState<ColumnDraftRow[]>(baseline);
  const [parsed, setParsed] = useState<Record<string, ParsedRef>>({});
  const [applyRejects, setApplyRejects] = useState<ColumnCheck[] | null>(null);
  const [domainKey, setDomainKey] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("");
  const counter = useRef(0);

  // view 가 바뀌면(룰·버전 전환·적용 뒤 다시 불러오기) 초안을 다시 잡는다 — 같은 row_version 의 저장 초안이 있으면 되살린다.
  useEffect(() => {
    const restored = storageKey && canEdit ? readStored(storageKey, selected?.rowVersion ?? -1) : null;
    setRows(restored ?? baseline);
    setApplyRejects(null);
    setDomainKey(null);
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
      hitPolicy: selected?.hitPolicy ?? null,
      candidates,
      baseline,
      storedRows: view.rows,
      parsed,
    }),
    [view.rule.ruleKind, selected?.hitPolicy, candidates, baseline, view.rows, parsed],
  );
  const checked = useMemo(() => checkColumnDraft(rows, ctx), [rows, ctx]);
  const preview = useMemo(() => (dirty ? applyColumnDraft(rows, ctx) : null), [dirty, rows, ctx]);
  const previewRecord = useMemo(() => (previewText.trim() ? parsePreviewInput(previewText) : null), [previewText]);
  const parseEnabled = canEdit && canDo("validate");
  const varById = useMemo(() => new Map(view.vars.map((v) => [v.varId, v])), [view.vars]);

  // 열 머리를 누르면 대응하는 줄로 스크롤한다(하이라이트는 줄 배경).
  const { highlightVarId } = shared;
  useEffect(() => {
    if (highlightVarId == null) return;
    const row = rows.find((r) => r.varId === highlightVarId);
    if (row) document.querySelector(`[data-testid="col-row-${row.key}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlightVarId, rows]);

  const onParsed = useCallback((o: ParseOutcome) => {
    if (!o.text) return;
    setParsed((prev) => ({ ...prev, [parsedKey(o.slot, o.text)]: o.error != null ? { error: o.error } : { refVars: o.result?.refVars ?? [] } }));
  }, []);

  const patch = useCallback((key: string, change: Partial<ColumnDraftRow>) => {
    setApplyRejects(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }, []);
  const add = (kind: "COND" | "RESULT") => {
    counter.current += 1;
    setRows((prev) => addColumn(prev, kind, `n${counter.current}`));
  };
  const move = (key: string, dir: -1 | 1) => setRows((prev) => moveColumn(prev, key, dir).rows);
  const remove = (row: ColumnDraftRow) =>
    setRows((prev) => (row.varId == null ? prev.filter((r) => r.key !== row.key) : prev.map((r) => (r.key === row.key ? { ...r, deleted: !r.deleted } : r))));
  const pickDomain = (key: string, d: DomainRow) => {
    patch(key, { domainId: d.domainId, domainType: d.dataType, dataType: null });
    setDomainKey(null);
  };
  const discard = () => {
    setRows(baseline);
    setApplyRejects(null);
    setDomainKey(null);
  };

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

  const disabled = !canEdit || busy;
  const rejectCount = checked.rejects.length;
  const shownRejects = applyRejects ?? [];

  const cell = (row: ColumnDraftRow) => {
    const key = row.key;
    const cond = row.varKind === "COND";
    const rowChecks = checked.byKey[key] ?? [];
    const v = row.varId != null ? varById.get(row.varId) : undefined;
    const exprCond = cond && row.dispType === "Expression";
    const grouped = !cond && row.resGrp.trim() !== "";
    return (
      <tr
        key={key}
        data-testid={`col-row-${key}`}
        data-highlight={row.varId != null && shared.highlightVarId === row.varId ? "true" : undefined}
        style={{
          background: row.varId != null && shared.highlightVarId === row.varId ? "var(--color-bg-header)" : undefined,
          opacity: row.deleted ? 0.5 : 1,
          textDecoration: row.deleted ? "line-through" : undefined,
        }}
      >
        <td style={td}>{row.varId ?? "신규"}</td>
        <td style={td}>{cond ? "조건" : "결과"}</td>
        <td style={td}>
          <Button disabled={disabled} onClick={() => move(key, -1)} aria-label={`${row.varName || "새 열"} 위로`}>
            ▲
          </Button>
          <Button disabled={disabled} onClick={() => move(key, 1)} aria-label={`${row.varName || "새 열"} 아래로`}>
            ▼
          </Button>
        </td>
        <td style={td}>
          <Select
            data-testid={`col-disp-${key}`}
            value={row.dispType}
            options={cond ? COND_DISPS : RESULT_DISPS}
            disabled={disabled}
            onChange={(val) => patch(key, { dispType: val as ColumnDraftRow["dispType"] })}
          />
        </td>
        <td style={{ ...td, minWidth: 200 }}>
          {exprCond ? (
            <ExprField
              testId={`col-name-${key}`}
              value={row.varName}
              slot="RULE_COND_EXPR"
              candidates={candidates}
              parseEnabled={parseEnabled}
              disabled={disabled}
              listId={LIST_ID}
              onParsed={onParsed}
              onChange={(val) => patch(key, { varName: val })}
              previewRecord={previewRecord}
              placeholder="조건 식"
            />
          ) : (
            <Input data-testid={`col-name-${key}`} value={row.varName} disabled={disabled} list={cond ? LIST_ID : undefined} onChange={(val) => patch(key, { varName: val })} />
          )}
          {!cond && derive && (
            <ExprField
              testId={`col-expr-${key}`}
              value={row.expr}
              slot="RULE_RESULT_EXPR"
              candidates={candidates}
              parseEnabled={parseEnabled}
              disabled={disabled}
              listId={LIST_ID}
              onParsed={onParsed}
              onChange={(val) => patch(key, { expr: val })}
              previewRecord={previewRecord}
              placeholder="결과 식"
            />
          )}
        </td>
        <td style={td}>
          <Input data-testid={`col-label-${key}`} value={row.label} disabled={disabled} onChange={(val) => patch(key, { label: val })} />
        </td>
        <td style={{ ...td, minWidth: 150 }}>
          {exprCond ? (
            <span style={{ color: "var(--color-text-muted)" }}>자유식</span>
          ) : (
            <>
              <div style={{ display: "flex", gap: 4 }}>
                <Select
                  data-testid={`col-type-${key}`}
                  value={row.dataType ?? ""}
                  options={DATA_TYPES.map((t) => ({ value: t, label: t === "" ? (row.domainId != null ? `도메인 ${row.domainType ?? ""}` : "타입 없음") : t }))}
                  disabled={disabled || row.domainId != null}
                  onChange={(val) => patch(key, { dataType: (val || null) as ColumnDraftRow["dataType"], domainId: null, domainType: null })}
                />
                <Button disabled={disabled} data-testid={`col-domain-open-${key}`} onClick={() => setDomainKey(domainKey === key ? null : key)}>
                  {row.domainId != null ? `도메인 #${row.domainId}` : "도메인"}
                </Button>
                {row.domainId != null && (
                  <Button disabled={disabled} onClick={() => patch(key, { domainId: null, domainType: null })} aria-label="도메인 해제">
                    ✕
                  </Button>
                )}
              </div>
              {row.domainId == null && row.dataType == null && typeLabel(v) && <span style={{ color: "var(--color-text-muted)" }}>{typeLabel(v)}</span>}
              {domainKey === key && <DomainSearchBox testId={`col-domain-${key}`} onPick={(d) => pickDomain(key, d)} onClose={() => setDomainKey(null)} />}
            </>
          )}
        </td>
        <td style={td}>
          {cond ? (
            <Select data-testid={`col-axis-${key}`} value={row.axis ?? "NONE"} options={AXES} disabled={disabled} onChange={(val) => patch(key, { axis: val as ColumnDraftRow["axis"] })} />
          ) : (
            <span style={{ color: "var(--color-text-muted)" }}>-</span>
          )}
        </td>
        <td style={td}>
          {cond ? (
            <span style={{ color: "var(--color-text-muted)" }}>-</span>
          ) : (
            <Input data-testid={`col-grp-${key}`} value={row.resGrp} placeholder="그룹 = 결과 변수" disabled={disabled} onChange={(val) => patch(key, { resGrp: val })} />
          )}
        </td>
        <td style={{ ...td, minWidth: 180 }}>
          {!cond && grouped ? (
            <ExprField
              testId={`col-grpcond-${key}`}
              value={row.grpCond}
              slot="RULE_GRP_COND"
              candidates={candidates}
              parseEnabled={parseEnabled}
              disabled={disabled}
              listId={LIST_ID}
              onParsed={onParsed}
              onChange={(val) => patch(key, { grpCond: val })}
              previewRecord={null}
              placeholder="비우면 기본 열"
            />
          ) : (
            <span style={{ color: "var(--color-text-muted)" }}>-</span>
          )}
        </td>
        <td style={td}>
          {!cond && ctx.hitPolicy === "COLLECT" ? (
            <Select data-testid={`col-agg-${key}`} value={row.collectAgg} placeholder="집계" options={AGGS} disabled={disabled} onChange={(val) => patch(key, { collectAgg: val })} />
          ) : !cond && ctx.hitPolicy === "PRIORITY" ? (
            <Input
              data-testid={`col-prio-${key}`}
              value={row.prioList.join(", ")}
              placeholder="순위(쉼표)"
              disabled={disabled}
              onChange={(val) => patch(key, { prioList: val.split(",").map((s) => s.trim()).filter((s) => s !== "") })}
            />
          ) : (
            <span style={{ color: "var(--color-text-muted)" }}>-</span>
          )}
        </td>
        <td style={td}>
          <Input data-testid={`col-desc-${key}`} value={row.description} disabled={disabled} onChange={(val) => patch(key, { description: val })} />
        </td>
        <td style={td} data-testid={`col-check-${key}`}>
          {rowChecks.length === 0 ? (
            <span style={badgeStyle("success")}>통과</span>
          ) : (
            rowChecks.map((c, i) => (
              <div key={`${c.code}-${i}`} data-code={c.code} style={{ color: c.severity === "REJECT" ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                {c.message}
              </div>
            ))
          )}
        </td>
        <td style={td}>
          <Button disabled={disabled} data-testid={`col-del-${key}`} onClick={() => remove(row)} aria-label={`${row.varName || "새 열"} ${row.deleted ? "삭제 취소" : "삭제"}`}>
            {row.deleted ? "취소" : "✕"}
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <div data-testid="rule-section-columns" style={{ paddingTop: "var(--spacing-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
        <strong>열 설정</strong>
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
      </div>
      <datalist id={LIST_ID}>
        {datalistOptions(candidates).map((o) => (
          <option key={o.value} value={o.value} label={o.label} />
        ))}
      </datalist>
      <div style={{ overflowX: "auto", paddingTop: "var(--spacing-xs)" }}>
        <table data-testid="col-table" style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr>
              {["var_id", "구분", "순서", "표시 타입", "변수(식)", "표시명", "값 타입", "축", "그룹", "열 조건", "집계·순위", "설명", "검사", "삭제"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(cell)}</tbody>
        </table>
      </div>
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
    </div>
  );
}
