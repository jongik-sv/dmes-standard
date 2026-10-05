"use client";

/**
 * 경계값 후보 팝업(카드 ⑥ [경계값 생성]). 후보는 카드가 버튼을 누른 순간 `planBoundaryCases` 로 만든 것(서버를 부르지 않음)을 받는다.
 *
 * [선택 실행] 은 고른 후보만 "모두 실행" 과 같은 대상·행·적중 정책으로 값 테스트를 돌린다(runCases·judge 없음, 동시 4건). 결과로 기대 JSON 을
 * 만들고(`expectedFromResult`), 판정 오류면 기대값 없이 둔다. [선택 저장] 은 실행을 마친 고른 후보만 한 건씩 차례로 새 케이스로 저장하고,
 * 실패한 건은 그 행에 사유를 남긴 채 나머지를 계속 저장한다. 저장 묶음은 카드의 쓰기 한 번으로 감싸 끝난 뒤 view 를 한 번만 다시 불러온다.
 * 팝업을 닫으면(언마운트) 진행 중 실행·저장의 다음 요청을 보내지 않고, 이미 보낸 요청의 응답은 버린다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { MutedText } from "@dk-oasis/shared/card";
import { Button, Checkbox } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import { runValueTest, saveTestCase, type ValueTestRequest } from "../api";
import type { ResolvedVar } from "../types";
import { BOUNDARY_CASE_LIMIT, type BoundaryCandidate, type BoundaryPlan } from "../value-test/boundary-cases";
import { BOUNDARY_RUN_CONCURRENCY, errorMessage, runOutcome, runPool, saveSequential } from "../value-test/boundary-run";

/** 카드가 [경계값 생성] 을 누른 순간 고정한 후보와 실행 조건 — 저장 뒤 view 가 다시 와도 팝업의 후보·상태가 바뀌지 않게 한다. */
export interface BoundarySession {
  id: number;
  /** 후보를 만든 룰 — 실행·저장은 이 룰로만 한다(열린 채 룰이 바뀌면 카드가 팝업을 닫는다). */
  ruleId: string;
  plan: BoundaryPlan;
  /** 대상 정의의 변수(기대 JSON 의 숫자 결과 판별). */
  vars: readonly ResolvedVar[];
  /** 대상 표의 DEFAULT 행 rowId — 기본 행이 적용되면 hit 이 된다. */
  defaultRowId: number | null;
  /** "모두 실행" 과 같은 대상·행·적중 정책·버전. inputJson 만 후보 입력으로 바꿔 보낸다. */
  baseRequest: ValueTestRequest;
  /** 대상 이름(편집본 · 버전 2.000). */
  targetLabel: string;
  /** 결과 계산에 쓰는데 ④ 입력에서 비어 있는 이름(`emptyResultInputs`) — 표 위에 경고한다. 실행은 막지 않는다. */
  emptyInputs: readonly string[];
}

export interface BoundaryCaseModalProps {
  session: BoundarySession;
  busy: boolean;
  /** 값 테스트 실행 권한(RBAC execute) — 없으면 [선택 실행] 을 끈다. */
  canExecute: boolean;
  /** 저장 묶음을 카드의 쓰기 한 번으로 감싼다 — 끝나면 view 를 한 번 다시 불러온다. */
  commit: (save: () => Promise<number>) => Promise<unknown>;
  onClose: () => void;
}

type Phase = "idle" | "running" | "ran" | "judgeError" | "runFailed";

interface CandidateState {
  phase: Phase;
  /** 결과 값 요약 또는 판정 오류·실행 실패 사유. */
  summary: string;
  expectedJson: string | null;
  saved: boolean;
  saveError: string | null;
}

const IDLE: CandidateState = { phase: "idle", summary: "", expectedJson: null, saved: false, saveError: null };

/** 실행을 마쳐 저장할 수 있는 상태(판정 오류도 기대값 없이 저장한다). */
function saveable(s: CandidateState): boolean {
  return !s.saved && (s.phase === "ran" || s.phase === "judgeError");
}

function statusText(s: CandidateState): string {
  if (s.saved) return "저장됨";
  if (s.saveError) return `저장 실패(${s.saveError})`;
  switch (s.phase) {
    case "running":
      return "실행 중";
    case "ran":
      return "실행됨";
    case "judgeError":
      return "판정 오류";
    case "runFailed":
      return `실행 실패(${s.summary})`;
    default:
      return "대기";
  }
}

function statusColor(text: string): string | undefined {
  if (text === "저장됨") return "var(--color-success)";
  if (text === "판정 오류" || text.startsWith("저장 실패") || text.startsWith("실행 실패")) return "var(--color-danger)";
  if (text === "대기") return "var(--color-text-muted)";
  return undefined;
}

/** 표 한 행. ag-grid 는 칸 값이 바뀐 셀만 다시 그리므로 고름·결과·상태는 보이는 값 그대로 칸 값에 담는다. */
interface CandidateRow {
  key: string;
  checked: boolean;
  caseName: string;
  inputJson: string;
  result: string;
  status: string;
}

/**
 * 고름 칸은 shared `Checkbox` 로 그린다. `AgDataGrid` 의 제어형 `selectedRows` 는 그리드 준비 전 첫 렌더에 반영되지 않아
 * (데이터가 한 번 바뀐 뒤에야 체크가 보임) "처음엔 모두 고름" 을 보일 수 없다 — shared 를 고치기 전까지 이렇게 둔다.
 */
function candidateColumns(toggle: { current: (key: string, on: boolean) => void }): GridColumn[] {
  return [
    {
      key: "checked", meta: false, header: "고름", width: 56, minWidth: 56, tooltip: false,
      render: (v, row) => {
        const key = String((row as Record<string, unknown>).key);
        return <Checkbox aria-label={`${key} 고름`} checked={v === true} onChange={(on) => toggle.current(key, on)} />;
      },
    },
    ...COLUMNS,
  ];
}

const COLUMNS: GridColumn[] = [
  { key: "caseName", header: "이름", width: 180, minWidth: 120 },
  { key: "inputJson", header: "입력", width: 260, minWidth: 140, render: (v) => <code>{String(v)}</code> },
  { key: "result", meta: false, header: "실행 결과", width: 240, minWidth: 140, render: (v) => (v ? <code>{String(v)}</code> : <MutedText>-</MutedText>) },
  {
    key: "status", header: "상태", width: 140, minWidth: 100,
    render: (v) => <span style={{ color: statusColor(String(v)) }}>{String(v)}</span>,
  },
];

const note = { flex: "none", margin: "var(--spacing-xs) 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" } as const;
/**
 * 팝업 본문 배치 — shared `.cm-modal`(flex column)·`.cm-modal-body`(flex:1, flex column) 높이 사슬을 이어 받아 표 칸이 남는 세로 공간을
 * 채운다. xl 은 최소 높이(80vh)가 있으므로 빈 곳을 줄이지 않고 표로 채운다. 표 칸 밖의 줄(경고·건수·안내)은 flex:none.
 */
const body = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } as const;
const gridBox = { flex: 1, minHeight: 200, position: "relative" } as const;
// flex 로 늘어난 칸의 높이는 자식의 height:100% 기준이 되지 못해(모달에 고정 높이가 없다) 그리드가 0px 로 접힌다.
// 절대 위치 칸은 표 칸의 실제 높이를 기준으로 삼으므로 그리드가 그 높이를 채운다.
const gridFill = { position: "absolute", inset: 0 } as const;

export function BoundaryCaseModal({ session, busy, canExecute, commit, onClose }: BoundaryCaseModalProps) {
  const { plan } = session;
  const candidates = plan.candidates;
  const [selected, setSelected] = useState<string[]>(() => candidates.map((c) => c.key));
  const [states, setStates] = useState<Record<string, CandidateState>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [saving, setSaving] = useState(false);

  // 닫힘(언마운트) 뒤에는 상태를 바꾸지 않고 다음 요청을 보내지 않는다.
  const mounted = useRef(true);
  const runCtl = useRef<AbortController | null>(null);
  const saveCtl = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runCtl.current?.abort();
      saveCtl.current?.abort();
    };
  }, []);

  const stateOf = (key: string): CandidateState => states[key] ?? IDLE;
  const patch = (key: string, next: Partial<CandidateState>) => {
    if (!mounted.current) return;
    setStates((prev) => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), ...next } }));
  };

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = useRef<(key: string, on: boolean) => void>(() => {});
  toggle.current = (key, on) => setSelected((prev) => (on ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)));
  const columns = useMemo(() => candidateColumns(toggle), []);
  const allChecked = candidates.length > 0 && selected.length === candidates.length;
  const chosen = candidates.filter((c) => selectedSet.has(c.key));
  const runTargets = chosen.filter((c) => !stateOf(c.key).saved);
  const saveTargets = chosen.filter((c) => saveable(stateOf(c.key)));
  const unrun = chosen.filter((c) => !stateOf(c.key).saved && !saveable(stateOf(c.key))).length;

  const runSelected = async () => {
    if (runCtl.current || runTargets.length === 0) return;
    const ctl = new AbortController();
    runCtl.current = ctl;
    const total = runTargets.length;
    let done = 0;
    setRunning(true);
    setStopping(false);
    setProgress({ done, total });
    const tick = () => {
      done += 1;
      if (mounted.current) setProgress({ done, total });
    };
    await runPool<BoundaryCandidate, Awaited<ReturnType<typeof runValueTest>>>(
      runTargets,
      BOUNDARY_RUN_CONCURRENCY,
      (c) => runValueTest({ ...session.baseRequest, inputJson: c.inputJson }),
      {
        onStart: (c) => patch(c.key, { phase: "running", saveError: null }),
        onDone: (c, result) => {
          const o = runOutcome(result, session.vars, session.defaultRowId);
          patch(c.key, { phase: o.error ? "judgeError" : "ran", summary: o.summary, expectedJson: o.expectedJson });
          tick();
        },
        onError: (c, e) => {
          patch(c.key, { phase: "runFailed", summary: errorMessage(e), expectedJson: null });
          tick();
        },
      },
      ctl.signal,
    );
    runCtl.current = null;
    if (!mounted.current) return;
    setRunning(false);
    setStopping(false);
  };

  const stop = () => {
    runCtl.current?.abort();
    setStopping(true);
  };

  const saveSelected = async () => {
    if (saveCtl.current || saveTargets.length === 0) return;
    // 저장할 기대 JSON 은 누른 순간의 실행 결과로 고정한다.
    const items = saveTargets.map((c) => ({ c, expectedJson: stateOf(c.key).expectedJson }));
    const ctl = new AbortController();
    saveCtl.current = ctl;
    setSaving(true);
    await commit(() =>
      saveSequential(
        items,
        ({ c, expectedJson }) =>
          saveTestCase(session.ruleId, { caseName: c.caseName, description: c.description, inputJson: c.inputJson, expectedJson }),
        ({ c }, error) => patch(c.key, error ? { saveError: error } : { saved: true, saveError: null }),
        ctl.signal,
      ),
    );
    saveCtl.current = null;
    if (mounted.current) setSaving(false);
  };

  const rows: CandidateRow[] = candidates.map((c) => {
    const s = stateOf(c.key);
    return {
      key: c.key,
      checked: selectedSet.has(c.key),
      caseName: c.caseName,
      inputJson: c.inputJson,
      result: s.phase === "ran" || s.phase === "judgeError" ? s.summary : "",
      status: statusText(s),
    };
  });

  const blocked = plan.blocked;
  const working = running || saving;
  const runDisabled = blocked != null || !canExecute || working || busy || runTargets.length === 0;
  const saveDisabled = blocked != null || working || busy || saveTargets.length === 0;

  return (
    <Modal
      open
      title={`경계값 후보 · ${session.targetLabel}`}
      // xl(폭 1024px) — 이름·입력 칸이 잘리지 않는 폭. 최소 높이(80vh)로 남는 세로 공간은 표가 채운다(`body`·`gridBox`).
      size="xl"
      onClose={onClose}
      footer={
        <>
          {progress && (
            <span data-testid="bc-progress" style={{ marginRight: "auto", alignSelf: "center", color: "var(--color-text-secondary)" }}>
              실행 {progress.done} / {progress.total}
              {stopping && running ? " · 중단하는 중" : ""}
            </span>
          )}
          {running && (
            <Button data-testid="bc-stop" disabled={stopping} onClick={stop}>
              중단
            </Button>
          )}
          <Button onClick={onClose}>닫기</Button>
          <Button data-testid="bc-run" disabled={runDisabled} onClick={() => void runSelected()}>
            {running ? "실행 중…" : "선택 실행"}
          </Button>
          {!blocked && unrun > 0 && (
            <span data-testid="bc-unrun" style={{ alignSelf: "center", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
              실행하지 않은 {unrun}건은 저장하지 않습니다
            </span>
          )}
          <Button variant="primary" data-testid="bc-save" disabled={saveDisabled} onClick={() => void saveSelected()}>
            {saving ? "저장 중…" : "선택 저장"}
          </Button>
        </>
      }
    >
      <div data-testid="bc-modal" style={body}>
        {blocked ? (
          <p data-testid="bc-blocked" role="alert" style={{ margin: 0, color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
            {blocked}
          </p>
        ) : (
          <>
            {session.emptyInputs.length > 0 && (
              <p data-testid="bc-empty-inputs" role="status" style={{ flex: "none", margin: "0 0 var(--spacing-sm)", color: "var(--color-warning)" }}>
                결과 계산에 쓰는 입력 {session.emptyInputs.join(", ")} 이(가) 비어 있습니다. 값 테스트 카드에 값을 넣고 다시 [경계값 생성] 을 누르면 판정
                오류가 줄어듭니다.
              </p>
            )}
            <div data-testid="bc-grid" style={gridBox}>
              <div style={gridFill}>
                {/* height 를 주지 않으면 AgDataGrid 는 부모 높이 100% 를 쓴다 — 절대 위치 칸을 채운다. */}
                <AgDataGrid
                  columns={columns}
                  data={rows as unknown as Record<string, unknown>[]}
                  rowKey="key"
                  columnSizing="fit"
                  sortable={false}
                  emptyMessage="만들 후보가 없습니다"
                  emptyTestId="bc-empty"
                  ariaLabel="경계값 후보 목록"
                />
              </div>
            </div>
            <div data-testid="bc-count" style={{ ...note, display: "flex", alignItems: "center", gap: "var(--spacing-md)" }}>
              <span>
                후보 {candidates.length}건 · 고른 후보 {chosen.length}건
              </span>
              {candidates.length > 0 && (
                <Checkbox
                  label="모두 고르기"
                  checked={allChecked}
                  onChange={(on) => setSelected(on ? candidates.map((c) => c.key) : [])}
                />
              )}
            </div>
            {plan.truncated > 0 && (
              <p data-testid="bc-truncated" style={note}>
                상한 {BOUNDARY_CASE_LIMIT}건을 넘어 {plan.truncated}건을 뺐습니다
              </p>
            )}
            {plan.skipped.length > 0 && (
              <div data-testid="bc-skipped" style={note}>
                후보를 만들지 못한 행
                <ul style={{ margin: "2px 0 0", paddingLeft: "var(--spacing-lg)" }}>
                  {plan.skipped.map((s, i) => (
                    <li key={`${s.rowId}-${i}`}>
                      {s.seq}행 · {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.groupNotes && plan.groupNotes.length > 0 && (
              <div data-testid="bc-group-notes" style={note}>
                열 조건을 반영하지 못한 열
                <ul style={{ margin: "2px 0 0", paddingLeft: "var(--spacing-lg)" }}>
                  {plan.groupNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <p style={note}>실행 결과로 기대값을 채워 새 케이스로 저장합니다. 판정 오류인 후보는 기대값 없이(실행만) 저장합니다.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
