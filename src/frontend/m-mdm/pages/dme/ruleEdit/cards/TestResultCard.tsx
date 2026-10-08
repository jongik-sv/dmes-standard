"use client";

/**
 * 카드 ⑤ 테스트 결과(TSK-08-04 design §6.7, 시안 H7). 값 테스트 카드(④)·테스트 케이스 카드(⑥)가 카드 공유 상태에 올린 서버 결과(`testRun`)를
 * 그린다: 결과 변수 값(결과 열 그룹이면 고른 열), 적중 행, 판정 오류(단계·코드·메시지), 경고·깨진 셀·판정에서 뺀 행.
 *
 * 결과를 위 의사결정표에 칠했으면(`runShownOnTable` — 편집본은 같은 rev, 버전은 보이는 버전·row_version·변경 없음) 그렇다고만 알린다.
 * 아니면(다른 버전, 또는 표에 저장 안 한 변경이 있는 같은 버전) 그 버전의 표를 읽기 전용 shared 그리드로 따로 그리고 같은 셀 클래스로
 * 적중 행·첫 거짓 칸을 칠한다(06:731 — 칠하기는 서버 판정 결과로만).
 */
import { useMemo } from "react";

import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { AgDataGrid, GRID_HEADER_HEIGHT } from "@dk-oasis/shared/grid";
import { badgeStyle, sameVer } from "@/shell";

import type { RuleEditCardProps } from "../cards";
import { splitIssues } from "../decision-table/analysis";
import { TEST_HIT_ROW_CLASS, buildTableColumns, displayRows } from "../decision-table/columns";
import { diffTable } from "../decision-table/diff";
import { gridRowsFromStored } from "../decision-table/grid-model";
import { useRuleWorkbench } from "../state/workbench-context";
import type { ResolvedVar, RuleEditView, StoredRow, ValueTestError, ValueTestResult, ValueTestValue, VarMeta } from "../types";
import { bodyTable, defaultRowIdOf, targetLabel, useTargetView } from "../value-test/run-request";
import { runShownOnTable, testMarksOf } from "../value-test/test-marks";

const th = { textAlign: "left", padding: "2px 6px", whiteSpace: "nowrap", verticalAlign: "top", width: 200 } as const;
const td = { padding: "2px 6px", verticalAlign: "top" } as const;
const NOOP = () => {};

/** 결과 값 한 칸 — null 은 NULL, 목록(COLLECT)은 쉼표로. 숫자는 서버 `toPlainString` 글자 그대로. */
export function formatValue(v: ValueTestValue | undefined): string {
  if (v === undefined) return "-";
  if (v === null) return "NULL";
  if (Array.isArray(v)) return `[${v.map((x) => formatValue(x)).join(", ")}]`;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}

interface ResultSlot {
  key: string;
  /** 결과 이름(결과 변수 이름, 그룹이면 res_grp). */
  name: string;
  label: string | null;
  group: ResolvedVar[] | null;
}

/** 결과 변수 → 결과 칸(seq 순). 결과 열 그룹은 그룹 이름 한 칸으로 모은다(06:306). */
function resultSlots(vars: readonly ResolvedVar[], meta: readonly VarMeta[] | undefined): ResultSlot[] {
  const grpOf = new Map((meta ?? []).map((m) => [m.varId, m.resGrp?.trim() || null] as const));
  const results = vars.filter((v) => v.varKind === "RESULT").sort((a, b) => a.seq - b.seq);
  const out: ResultSlot[] = [];
  for (const v of results) {
    const grp = grpOf.get(v.varId) ?? null;
    if (grp) {
      if (out.some((s) => s.group && s.name === grp)) continue;
      out.push({ key: `g:${grp}`, name: grp, label: null, group: results.filter((x) => grpOf.get(x.varId) === grp) });
    } else if (v.varName) {
      out.push({ key: `v:${v.varId}`, name: v.varName, label: v.label ?? null, group: null });
    }
  }
  return out;
}

/** 판정 오류 툴팁 — 본문은 사용자 문장이고, 단계·코드·이름·row_id 는 문의·추적용으로 여기에만 둔다. */
function errorTip(e: ValueTestError): string {
  return [e.stage, e.code, e.name, e.rowId != null ? `row_id ${e.rowId}` : null].filter(Boolean).join(" · ");
}

function rowLabel(rows: readonly StoredRow[], rowId: number, seq?: number): string {
  const r = rows.find((x) => x.rowId === rowId);
  if (r?.rowKind === "DEFAULT") return `기본 행 (row_id ${rowId})`;
  return `${seq ?? r?.seq ?? "?"}행 (row_id ${rowId})`;
}

function ResultValues({ result, vars, meta }: { result: ValueTestResult; vars: readonly ResolvedVar[]; meta: readonly VarMeta[] | undefined }) {
  const slots = resultSlots(vars, meta);
  const known = new Set(slots.map((s) => s.name.toUpperCase()));
  const extra = Object.keys(result.results ?? {}).filter((k) => !known.has(k.toUpperCase()));
  const valueOf = (name: string) => {
    const hit = Object.entries(result.results ?? {}).find(([k]) => k.toUpperCase() === name.toUpperCase());
    return formatValue(hit ? hit[1] : undefined);
  };
  const choices = (grp: string) => [
    ...new Set((result.hits ?? []).map((h) => Object.entries(h.groupChoices ?? {}).find(([g]) => g.trim() === grp)?.[1]).filter((x): x is number => x != null)),
  ];
  return (
    <table data-testid="vt-result-values" style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
      <tbody>
        {slots.map((s) => (
          <tr key={s.key}>
            <th style={th}>
              {s.group ? (
                <>
                  그룹 <code>{s.name}</code>
                </>
              ) : (
                <>
                  {s.label ? `${s.label} ` : ""}
                  <code>{s.name}</code>
                </>
              )}
            </th>
            <td style={td}>
              {valueOf(s.name)}
              {s.group && (
                <MutedText>
                  {" "}
                  · 그룹 열 {s.group.length}개 가운데{" "}
                  {choices(s.name).length === 0
                    ? "없음"
                    : choices(s.name).map((id) => {
                        const v = s.group!.find((x) => x.varId === id);
                        return (
                          <span key={id}>
                            <b>{v?.label ?? v?.varName ?? `var ${id}`}</b> <code>{v?.varName ?? id}</code>{" "}
                          </span>
                        );
                      })}
                </MutedText>
              )}
            </td>
          </tr>
        ))}
        {extra.map((k) => (
          <tr key={`x:${k}`}>
            <th style={th}>
              <code>{k}</code>
            </th>
            <td style={td}>{valueOf(k)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function rowClassOf(row: Record<string, unknown>): string[] | undefined {
  return row.__hit === true ? [TEST_HIT_ROW_CLASS] : undefined;
}

/** 다른 버전 결과 — 그 버전의 표(읽기 전용)에 서버 결과를 칠한다. */
function VersionTable({ def, result }: { def: RuleEditView; result: ValueTestResult }) {
  const vars = def.vars;
  const columns = useMemo(
    () =>
      buildTableColumns({ vars: [...vars], varMeta: def.varMeta, candidates: def.varCandidates, editable: false, onEdit: NOOP, onSelectRow: NOOP, onDeleteRow: NOOP }),
    [vars, def.varMeta, def.varCandidates],
  );
  const data = useMemo(() => {
    const rows = gridRowsFromStored(vars, def.rows);
    const test = testMarksOf(result, vars, def.varMeta, defaultRowIdOf(def.rows));
    return displayRows(rows, vars, { diff: diffTable(null, rows), split: splitIssues([]), serverShown: true, test });
  }, [vars, def.rows, def.varMeta, result]);
  const markToken = useMemo(() => JSON.stringify(data.map((r) => [r.rowKey, r.__mk, r.__hit])), [data]);
  const height = Math.min(420, 3 * 28 + Math.max(def.rows.length, 2) * 26 + 24);
  return (
    <div data-testid="vt-result-table" style={{ paddingTop: "var(--spacing-sm)" }}>
      <MutedText>테스트한 버전이 위 의사결정표와 달라 그 버전의 표를 따로 보인다. 초록 행이 적중 행이고 붉은 칸이 떨어진 행의 첫 거짓 조건이다.</MutedText>
      {/* 바깥 상자는 높이를 고정하지 않는다 — 머리줄이 표 위에 더해지고, 칸별 필터 입력 줄을 펴면 그리드가 숫자 height 에 그 줄 높이를 더해 내용만큼 늘어난다. */}
      <div style={{ paddingTop: "var(--spacing-xs)" }}>
        <AgDataGrid gridId="testResultTable"
          key={`${def.rule.maruRuleId}:${def.selectedVer}`}
          columns={columns}
          data={data}
          rowKey="rowKey"
          height={height - GRID_HEADER_HEIGHT}
          columnSizing="fixed"
          sortable={false}
          getRowClassExtra={rowClassOf}
          rowClassRefreshToken={markToken}
          emptyMessage="행이 없습니다."
          ariaLabel="테스트한 버전의 의사결정표"
        />
      </div>
    </div>
  );
}

export function TestResultCard({ view }: RuleEditCardProps) {
  const { testRun, tableDraft } = useRuleWorkbench();
  const run = testRun && testRun.ruleId === view.rule.maruRuleId ? testRun : null;
  const choice = useMemo(() => (run ? { target: run.target, ver: run.ver } : null), [run?.target, run?.ver]);
  const { def } = useTargetView(view, choice);

  if (!run) {
    return (
      <CardFrame title="⑤ 테스트 결과" testId="rule-card-test-result">
        <p data-testid="vt-result-empty" style={{ margin: 0, color: "var(--color-text-muted)" }}>
          실행을 누르면 결과 변수 값과 적중 행을 보인다.
        </p>
      </CardFrame>
    );
  }

  const r = run.result;
  if (run.casesOnly) {
    // ⑥ "모두 실행" — 요청에 실린 ④ 입력의 판정은 케이스 결과가 아니므로 보이지 않는다. 케이스별 결과는 ⑥ 표에 있다.
    const cases = r.cases ?? [];
    const count = (p: boolean | null) => cases.filter((c) => c.pass === p).length;
    return (
      <CardFrame
        title="⑤ 테스트 결과"
        testId="rule-card-test-result"
        right={<span data-testid="vt-result-target" style={badgeStyle("neutral")}>{targetLabel(run)} · 케이스 실행 · {r.evalTs}</span>}
      >
        <p data-testid="vt-result-cases" style={{ margin: 0 }}>
          테스트 케이스 {cases.length}건을 실행했습니다 — 통과 {count(true)} · 실패 {count(false)} · 실행만 {count(null)}. 케이스별 결과는 ⑥ 표에서
          봅니다.
        </p>
        <MutedText>값 테스트(④) 입력의 결과를 보려면 ④ 에서 [실행]을 누르세요.</MutedText>
      </CardFrame>
    );
  }
  const selected = view.versions.find((v) => sameVer(v.ver, view.selectedVer));
  const table = run.target === "BODY" && run.ver != null ? bodyTable(view, run.ver, tableDraft) : null;
  const rows = table ? table.rows : (def?.rows ?? []);
  const vars = def?.vars ?? view.vars;
  const meta = def?.varMeta ?? view.varMeta;
  const onTable = runShownOnTable(run, {
    ruleId: view.rule.maruRuleId,
    ver: view.selectedVer,
    rowVersion: selected?.rowVersion ?? null,
    rev: tableDraft?.rev ?? null,
    dirty: tableDraft?.dirty ?? false,
  });
  const hits = r.hits ?? [];
  const defaultRowId = defaultRowIdOf(rows);

  return (
    <CardFrame
      title="⑤ 테스트 결과"
      testId="rule-card-test-result"
      right={
        <span data-testid="vt-result-target" style={badgeStyle(r.outcome === "OK" ? "success" : "warning")}>
          {targetLabel(run)} · {r.outcome === "OK" ? "판정함" : "판정 오류"} · {r.evalTs}
        </span>
      }
    >
      {(r.errors ?? []).length > 0 && (
        <ul data-testid="vt-result-errors" style={{ margin: "0 0 var(--spacing-xs)", paddingLeft: "var(--spacing-lg)", color: "var(--color-danger)" }}>
          {(r.errors ?? []).map((e, i) => (
            <li key={`${e.code}-${i}`} title={errorTip(e)}>
              {e.message || e.code}
              {e.detail && e.detail !== e.message && (
                <details data-testid="vt-result-error-detail" style={{ color: "var(--color-text-secondary)" }}>
                  <summary>자세히(개발자용)</summary>
                  <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{e.detail}</code>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {r.outcome !== "OK" && (r.trace ?? []).some((t) => t.hit) && (
        <p data-testid="vt-result-error-hits" style={{ margin: "var(--spacing-xs) 0 0" }}>
          <strong>맞은 행</strong>{" "}
          {(r.trace ?? [])
            .filter((t) => t.hit)
            .map((t) => rowLabel(rows, t.rowId, t.seq))
            .join(", ")}
        </p>
      )}

      {r.outcome === "OK" && (
        <>
          <ResultValues result={r} vars={vars} meta={meta} />
          <p data-testid="vt-result-hits" style={{ margin: "var(--spacing-xs) 0 0" }}>
            <strong>적중 행</strong>{" "}
            {hits.length > 0
              ? hits.map((h) => rowLabel(rows, h.rowId, h.seq)).join(", ")
              : r.defaultApplied
                ? `어느 행도 참이 아니어서 기본 행${defaultRowId != null ? ` (row_id ${defaultRowId})` : ""}`
                : "없음"}
          </p>
        </>
      )}

      {(r.warnings ?? []).length > 0 && (
        <ul data-testid="vt-result-warnings" style={{ margin: "var(--spacing-xs) 0", paddingLeft: "var(--spacing-lg)", color: "var(--color-text-secondary)" }}>
          {(r.warnings ?? []).map((w, i) => (
            <li key={`${w.code}-${i}`}>
              경고 · {w.code}
              {w.rowId != null ? ` · row_id ${w.rowId}` : ""} — {w.message}
            </li>
          ))}
        </ul>
      )}
      {((r.cellErrors ?? []).length > 0 || (r.skippedRows ?? []).length > 0) && (
        <div data-testid="vt-result-cell-errors" style={{ color: "var(--color-danger)" }}>
          {(r.skippedRows ?? []).length > 0 && <p style={{ margin: "var(--spacing-xs) 0" }}>깨진 셀이 있어 판정에서 뺀 행: row_id {(r.skippedRows ?? []).join(", ")}</p>}
          <ul style={{ margin: 0, paddingLeft: "var(--spacing-lg)" }}>
            {(r.cellErrors ?? []).map((c, i) => (
              <li key={`${c.rowId}-${c.varId}-${i}`}>
                row_id {c.rowId}
                {c.varId != null ? ` · 열 ${c.varId}` : ""} · {c.code} — {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onTable ? (
        <p data-testid="vt-result-on-table" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)" }}>
          적중 행은 위 의사결정표에 칠했다. 초록 행이 적중 행이고 붉은 칸이 떨어진 행의 첫 거짓 셀이다.
        </p>
      ) : run.target === "BODY" ? (
        <p data-testid="vt-result-stale" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-text-secondary)" }}>
          실행한 뒤 표가 바뀌어 위 의사결정표에 칠하지 않았다. 다시 실행하세요.
        </p>
      ) : def && r.outcome === "OK" ? (
        <VersionTable def={def} result={r} />
      ) : null}
    </CardFrame>
  );
}
