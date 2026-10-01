"use client";

/**
 * 디버그 툴바(3단계 계획 §4.3·P-D22) — 흐름 툴바 아래 둘째 줄. [계속 F5] [한 단계 F10] [이전] [여기까지] [처음부터] [끝내기]·상태 문구·낡은 기록 배지·알림.
 * 단추는 아이콘만 있고(`ToolButton`) 이름·단축키·꺼진 이유는 툴팁(`data-tip`)으로 보인다(2026-10-01 한 줄 툴바와 같은 방식).
 * 실행을 부를 수 있는 단추(계속·한 단계·여기까지·처음부터·끝내기)는 `execute` 권한이 없으면 꺼지고 툴팁으로 이유를 보인다. 실행 중에는 모두 꺼진다.
 * [여기까지]는 고른 흐름 노드 기준이다(page 가 흐름 노드일 때만 selectedId 를 넘긴다). 상태 문구는 `debugStatus`(커서 k = "노드 k 실행 전", P-D13).
 * 4단계 E4: 고침 대기가 있으면 [계속]·[한 단계]·[여기까지]·[끝내기]가 고친 값으로 처음부터 다시 실행한다(훅이 판정한다). 상태 문구 끝에 고친 값·고침 대기 수.
 * 낡은 기록(흐름 구조가 실행 뒤 바뀜)이면 "지난 흐름 기준" 배지를 보이고, 다음 동작이 새로 실행한다(P-D9 — 훅이 판정한다).
 * 받는 노드(spec §9): 끝냄이면 상태 문구가 "예외로 끝남", 받은 예외가 있으면 [받은 예외 N건] 이 목록을 연다(기록의 CATCH 노드에서 만든다 — 편차 F9).
 */
import { IconArrowBackUp, IconArrowForwardUp, IconBolt, IconPlayerPlay, IconPlayerStop, IconPlayerTrackNext, IconRotate } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

import { Button } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { ToolButton } from "../canvas/ToolButton";
import { CATCH_KIND_LABEL, catchTitle } from "../catch-text";
import { RUN_DENIED_TITLE, debugStatus } from "./debug-model";
import type { Simulation } from "./useSimulation";

export interface DebugToolbarProps {
  sim: Simulation;
  /** canDo("execute"). */
  canRun: boolean;
  /** [여기까지] 는 고른 노드 기준이다. */
  selectedId: string | null;
}

export const PENDING_RUN_PREFIX = "고친 값으로 처음부터 다시 실행한 뒤 ";
const RUN_TO_NEEDS_NODE = "캔버스에서 흐름 노드를 먼저 고른다";

export function DebugToolbar({ sim, canRun, selectedId }: DebugToolbarProps) {
  const busy = sim.running;
  const runOff = !canRun || busy;
  const runTitle = (tip: string) => (canRun ? tip : RUN_DENIED_TITLE);
  const n = sim.last?.trace.nodes.length ?? 0;
  const pendingCount = Object.keys(sim.pendingEdit?.values ?? {}).length;
  const status = debugStatus(sim.last?.trace ?? null, sim.cursor, pendingCount, sim.last?.flow);
  const caught = (sim.last?.trace.nodes ?? []).filter((x) => x.kind === "CATCH" && x.status === "OK");
  const [caughtOpen, setCaughtOpen] = useState(false);
  const redo = pendingCount > 0 ? PENDING_RUN_PREFIX : "";
  const hasEdits = pendingCount > 0 || sim.appliedEdits.length > 0;
  const alert = sim.notice ?? sim.error;
  const end = !sim.last ? "idle" : n === 0 || (sim.cursor >= n && sim.last.trace.nodes[n - 1]?.status === "ERROR") ? "error" : sim.cursor >= n ? "done" : "running";

  const btn = (testId: string, label: string, icon: ReactNode, onClick: () => void, off: boolean, tip: string) => (
    <ToolButton size="sm" data-testid={testId} label={label} tip={tip} icon={icon} disabled={off} onClick={onClick} />
  );

  return (
    <div className="rsf-dbg-toolbar" data-testid="dbg-toolbar" role="toolbar" aria-label="디버그">
      <span className="rsf-dbg-buttons">
        {btn("dbg-continue", "계속", <IconPlayerPlay size={14} aria-hidden="true" />, () => void sim.resume(), runOff, runTitle(`${redo}계속 — 다음 중단점까지 (F5)`))}
        {btn("dbg-step", "한 단계", <IconArrowForwardUp size={14} aria-hidden="true" />, () => void sim.next(), runOff, runTitle(`${redo}한 단계 (F10)`))}
        {btn("dbg-step-back", "이전", <IconArrowBackUp size={14} aria-hidden="true" />, sim.prev, busy || sim.cursor <= 0, pendingCount > 0 ? "이전 단계 — 고침 대기를 버린다 (Shift+F10)" : "이전 단계 (Shift+F10)")}
        {btn(
          "dbg-run-to",
          "여기까지",
          <IconPlayerTrackNext size={14} aria-hidden="true" />,
          () => selectedId && void sim.runTo(selectedId),
          runOff || !selectedId,
          !canRun ? RUN_DENIED_TITLE : selectedId ? `${redo}여기까지 실행 — ${selectedId}` : RUN_TO_NEEDS_NODE,
        )}
        {btn("dbg-restart", "처음부터", <IconRotate size={14} aria-hidden="true" />, () => void sim.restart(), runOff, runTitle(hasEdits ? "처음부터 — 고친 값을 모두 지운다" : "처음부터"))}
        {btn("dbg-finish", "끝내기", <IconPlayerStop size={14} aria-hidden="true" />, () => void sim.finish(), runOff, runTitle(`${redo}끝내기 — 마지막 단계로`))}
      </span>
      <span aria-hidden className="rsf-dbg-sep" />
      <span className="rsf-dbg-status" data-testid="dbg-status" data-end={end} role="status">
        {busy ? `${status} · 실행 중` : status}
      </span>
      {caught.length > 0 && (
        <span className="rsf-dbg-caught">
          <Button size="sm" data-testid="dbg-caught-toggle" ariaLabel="받은 예외 목록" aria-expanded={caughtOpen} onClick={() => setCaughtOpen((v) => !v)}>
            <IconBolt size={14} aria-hidden="true" />
            {`받은 예외 ${caught.length}건`}
          </Button>
          {caughtOpen && (
            <ul className="rsf-dbg-caught-list" data-testid="dbg-caught-list">
              {caught.map((c) => {
                const fnode = sim.last?.flow.nodes.find((x) => x.id === c.nodeId);
                const title = fnode ? catchTitle(fnode) || c.nodeId : c.nodeId;
                return (
                  <li key={`${c.seq}`} data-testid={`dbg-caught-${c.nodeId}`} title={c.message ?? ""}>
                    {`${c.ruleId ?? "-"} → ${title} · ${c.catchKind ? CATCH_KIND_LABEL[c.catchKind] : "-"} · ${c.code ?? ""}`}
                  </li>
                );
              })}
            </ul>
          )}
        </span>
      )}
      {sim.stale && (
        <span data-testid="dbg-stale" style={badgeStyle("warning")} title="흐름 구조가 이 실행 뒤 바뀌었다. 다음 동작에서 새로 실행한다">
          지난 흐름 기준
        </span>
      )}
      {alert && (
        <span className="rsf-dbg-notice" data-testid="dbg-notice" data-kind={sim.notice ? "notice" : "error"} role="alert">
          {alert}
        </span>
      )}
    </div>
  );
}
