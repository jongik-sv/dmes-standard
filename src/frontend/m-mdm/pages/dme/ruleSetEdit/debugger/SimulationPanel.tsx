"use client";

/**
 * 시뮬레이션 탭 내용(2단계 계획 Task 11) — 입력 폼(세트 입력 변수 가운데 컬럼 사전·프로그램 변수 이름, P-D8)·JSON 붙여 넣기·판정 시각,
 * [실행](`execute` 권한이 있을 때만, P-D3), 따라가기, 값 표, 경고. 상태는 page 의 `useSimulation` 에 있고 이 컴포넌트는 그리기만 한다.
 * ←→ 키는 이 패널 안에 포커스가 있을 때 단계를 넘긴다(글자 입력 칸 안에서는 커서 이동이므로 넘기지 않는다).
 */
import type { KeyboardEvent } from "react";

import { Button, Checkbox, Input, Textarea } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { SOURCE_LABEL, SOURCE_TONE, typeText } from "../cards/SetIoTables";
import { CLEARED_BY_EDIT_MESSAGE, type Simulation } from "./useSimulation";
import { TraceStepper } from "./TraceStepper";
import { ValueTable } from "./ValueTable";

import "./debugger.css";

export const RUN_DENIED_TITLE = "디버거는 편집 권한이 있어야 쓸 수 있다";
const IDLE_MESSAGE = "아직 실행하지 않았다. 입력값을 넣고 [실행]을 누른다";
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export interface SimulationPanelProps {
  sim: Simulation;
  /** `canDoButton("execute")`. */
  canRun: boolean;
}

export function SimulationPanel({ sim, canRun }: SimulationPanelProps) {
  const { result } = sim;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!result || EDITABLE_TAGS.has((e.target as HTMLElement).tagName)) return;
    e.preventDefault();
    sim.setStep(sim.step + (e.key === "ArrowRight" ? 1 : -1));
  };

  const idleMessage = sim.running ? "실행 중이다" : sim.clearedByEdit ? CLEARED_BY_EDIT_MESSAGE : IDLE_MESSAGE;
  const runDisabled = !canRun || sim.running || !!sim.jsonError || !!sim.evalTsError;

  return (
    <div className="rsim" data-testid="sim-panel" tabIndex={0} onKeyDown={onKeyDown}>
      <section className="rsim-input" aria-label="입력">
        <p className="rsim-title">입력 — 저장하지 않은 흐름을 레코드 하나로 돌린다</p>
        {sim.fields.length === 0 ? (
          <p className="rsf-panel-note">흐름이 읽는 컬럼 사전·프로그램 변수가 없다. 아래 JSON 으로 넣을 수도 있다</p>
        ) : (
          <ul className="rsim-fields" data-testid="sim-fields">
            {sim.fields.map(({ row, meta }) => (
              <li key={row.key} className="rsim-field">
                <span className="rsim-field-name">
                  <code>{row.key}</code>
                  {meta?.label && <span className="rsim-field-label">{meta.label}</span>}
                  {meta && <span className="rsim-field-type">{typeText(meta)}</span>}
                  {meta?.source && <span style={badgeStyle(SOURCE_TONE[meta.source])}>{SOURCE_LABEL[meta.source]}</span>}
                  {!meta && <span style={badgeStyle("neutral")}>흐름 밖 이름</span>}
                </span>
                <span className="rsim-field-edit">
                  <span data-testid={`sim-send-${row.key}`} className="rsim-send">
                    <Checkbox aria-label={`${row.key} 키 보냄`} checked={row.on} onChange={(on) => sim.setInput(row.key, { on })} />
                  </span>
                  <Input
                    data-testid={`sim-input-${row.key}`}
                    aria-label={`${row.key} 값`}
                    value={row.value}
                    disabled={!row.on}
                    placeholder={row.on ? "비우면 null" : "키를 보내지 않음"}
                    onChange={(value) => sim.setInput(row.key, { value })}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          data-testid="sim-json"
          aria-label="레코드 JSON"
          rows={2}
          value={sim.json}
          placeholder={'JSON 을 붙여 넣으면 폼 대신 이것을 보낸다  예) {"GT_THK":"12"}'}
          error={sim.jsonError ?? undefined}
          onChange={sim.setJson}
        />
        <div className="rsim-row">
          <Button size="sm" data-testid="sim-json-import" disabled={sim.json.trim() === "" || !!sim.jsonError} onClick={sim.importJson}>
            폼으로 가져오기
          </Button>
          <span className="rsim-evalts">
            <span className="rsim-evalts-label">판정 시각</span>
            <Input
              data-testid="sim-evalts"
              aria-label="판정 시각"
              value={sim.evalTs}
              placeholder="yyyy-MM-dd HH:mm:ss (비우면 지금)"
              error={sim.evalTsError ?? undefined}
              onChange={sim.setEvalTs}
            />
          </span>
        </div>
        <div className="rsim-row">
          <Button variant="primary" data-testid="sim-run" disabled={runDisabled} title={canRun ? undefined : RUN_DENIED_TITLE} onClick={() => void sim.run()}>
            실행
          </Button>
          <Button data-testid="sim-clear" disabled={!result && !sim.clearedByEdit && !sim.error} onClick={sim.clear}>
            표시 지우기
          </Button>
        </div>
      </section>

      <section className="rsim-main" aria-label="실행 결과">
        <TraceStepper trace={result?.trace ?? null} step={sim.step} onStep={sim.setStep} message={idleMessage} />
        {sim.error && (
          <p className="rsim-error" data-testid="sim-error" role="alert">
            실행하지 못했다. {sim.error}
          </p>
        )}
        {result && <ValueTable trace={result.trace} flow={result.flow} step={sim.step} />}
        {result && result.warnings.length > 0 && (
          <ul className="rsim-list" data-testid="sim-warnings">
            {result.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>
                <span style={badgeStyle("warning")}>{w.code}</span> {w.ruleId && <code>{w.ruleId}</code>} {w.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
