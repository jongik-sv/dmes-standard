"use client";

/**
 * 룰 계산기 렌더러 — 정의 설정의 룰·룰 세트로 입력 칸을 자동으로 만들고 [계산] 으로 결과를 보인다.
 * - 입력 칸: io 의 inputs(라벨·dataType·scale·unit·required). 숫자는 소수 키패드, 불린은 선택, 일자는 날짜 입력.
 *   Enter 로도 계산한다(form submit). 필수 누락·숫자 모양 오류·소수 자리 초과는 보내기 전에 칸 아래에 알린다.
 * - 결과: io 의 outputs 순서·라벨·소수 자리(scale)·단위로 보인다. 소수 자리는 서버가 준 글자를 HALF_UP 으로 맞춘다(글자 연산).
 * - 중간값: 설정 showSteps 가 켜져 있고 세트일 때만 단계별(앞 룰 결과) 값을 보인다.
 * - 안내: messages(NO_RELEASED·INPUT_MISSING 등)를 문구로 보인다. 확정 버전이 없거나 대상이 없으면 입력 칸 없이 문구만 보인다.
 * 보드와 도크(업무 화면 도구 창) 양쪽에서 같은 렌더러를 쓰며, 입력 칸이 칸 너비에 맞춰 열 수를 바꾼다.
 */
import { useId, useState } from "react";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import {
  applyValues,
  blocksInput,
  displayValue,
  isNumericType,
  messageText,
  messageTone,
  NO_TARGET_MESSAGE,
  readRuleCalcConfig,
  stepOutputDataType,
  stepOutputLabel,
  stepOutputScale,
  type RuleCalcInput,
  type RuleCalcIo,
  type RuleCalcMessage,
  type RuleCalcRun,
} from "./rule-calc-model";
import { readScreenApply, type ScreenApply, type ScreenApplyResult } from "./screen-apply";
import { RULE_CALC_CSS, RULE_CALC_STYLE_HREF } from "./rule-calc-styles";
import { useRuleCalc } from "./use-rule-calc";

const RUN_FAIL_MESSAGE = "계산하지 못했습니다";

const BOOLEAN_OPTIONS = [
  { value: "true", label: "예" },
  { value: "false", label: "아니오" },
];

export function RuleCalcStyle() {
  return (
    <style href={RULE_CALC_STYLE_HREF} precedence="default">
      {RULE_CALC_CSS}
    </style>
  );
}

function Messages({ messages }: { messages: readonly RuleCalcMessage[] }) {
  if (messages.length === 0) return null;
  // 계산을 못 한 사유(error)는 낭독이 끊기지 않게 alert, 그 밖은 status 로 알린다.
  const role = messages.some((m) => messageTone(m.code) === "error") ? "alert" : "status";
  return (
    <ul className="mcm-rc__msgs" role={role} data-testid="rc-messages">
      {messages.map((m, i) => (
        <li key={`${m.code}-${i}`} className={`mcm-rc__msg mcm-rc__msg--${messageTone(m.code)}`} data-code={m.code}>
          {messageText(m)}
        </li>
      ))}
    </ul>
  );
}

interface FieldProps {
  input: RuleCalcInput;
  value: string;
  error?: string;
  /** 업무 화면 값으로 채운 칸인지(그 뒤 사용자가 고치면 false). */
  filled?: boolean;
  onChange: (value: string) => void;
}

function InputField({ input, value, error, filled, onChange }: FieldProps) {
  const id = `${useId()}-${input.name}`;
  const common = { id, value, error, onChange, "data-testid": `rc-input-${input.name}` };
  let control;
  if (input.dataType.toUpperCase().startsWith("BOOL")) {
    control = <Select {...common} options={BOOLEAN_OPTIONS} placeholder="선택" />;
  } else if (input.dataType.toUpperCase().startsWith("DATE")) {
    control = <Input {...common} type="date" />;
  } else if (isNumericType(input.dataType)) {
    control = <Input {...common} inputMode="decimal" autoComplete="off" />;
  } else {
    control = <Input {...common} autoComplete="off" />;
  }
  return (
    <div className="mcm-rc__field">
      <label className="mcm-rc__label" htmlFor={id}>
        <span title={input.label}>{input.label}</span>
        {input.required && (
          <span className="mcm-rc__req" aria-label="필수">
            *
          </span>
        )}
        {input.unit && <span className="mcm-rc__unit">{input.unit}</span>}
        {filled && (
          <span className="mcm-rc__filled" data-testid={`rc-filled-${input.name}`} title="업무 화면에서 선택한 값으로 채웠습니다">
            화면
          </span>
        )}
      </label>
      {control}
    </div>
  );
}

function Results({ io, run }: { io: RuleCalcIo; run: RuleCalcRun }) {
  const known = new Set(io.outputs.map((o) => o.name));
  const extra = Object.keys(run.result).filter((k) => !known.has(k));
  const rows = [
    ...io.outputs.map((o) => ({ name: o.name, label: o.label, scale: o.scale, unit: o.unit, dataType: o.dataType })),
    ...extra.map((name) => ({ name, label: name, scale: null as number | null, unit: null as string | null, dataType: "" })),
  ].filter((r) => r.name in run.result);
  if (rows.length === 0) return null;
  return (
    <dl className="mcm-rc__results" data-testid="rc-results">
      {rows.map((r) => (
        <ResultRow key={r.name} label={r.label} unit={r.unit} testId={`rc-result-${r.name}`} text={displayValue(run.result[r.name], r.scale, r.dataType)} />
      ))}
    </dl>
  );
}

/** [화면에 넣기] — 결과 원값을 활성 업무 화면 칸에 넣고 넣은 칸·건너뛴 칸을 짧게 알린다. 결과가 바뀌면(다른 run 객체) 이전 안내는 보이지 않는다. */
function ApplyBar({ io, run, screenApply, label }: { io: RuleCalcIo; run: RuleCalcRun; screenApply: ScreenApply; label: string }) {
  const [state, setState] = useState<{ run: RuleCalcRun; pending: boolean; result?: ScreenApplyResult; error?: string } | null>(null);
  const mine = state && state.run === run ? state : null;
  const nameOf = (n: string) => io.outputs.find((o) => o.name === n)?.label ?? n;
  const values = applyValues(run, io);
  const onClick = () => {
    setState({ run, pending: true });
    screenApply.apply(values, { label }).then(
      (result) => setState((prev) => (prev && prev.run === run ? { run, pending: false, result } : prev)),
      (e: unknown) =>
        setState((prev) =>
          prev && prev.run === run ? { run, pending: false, error: e instanceof Error && e.message ? e.message : "화면에 넣지 못했습니다." } : prev
        )
    );
  };
  return (
    <div className="mcm-rc__apply" data-testid="rc-apply">
      <Button onClick={onClick} disabled={mine?.pending === true || Object.keys(values).length === 0} data-testid="rc-apply-btn">
        화면에 넣기
      </Button>
      <span aria-live="polite" className="mcm-rc__fill-note" data-testid="rc-apply-note">
        {mine?.error ??
          (mine?.result
            ? `${mine.result.applied.length}칸에 넣었습니다${
                mine.result.skipped.length > 0 ? ` · 넣지 못함: ${mine.result.skipped.map(nameOf).join(", ")}` : ""
              }`
            : "")}
      </span>
    </div>
  );
}

function ResultRow({ label, unit, text, testId }: { label: string; unit: string | null; text: string; testId: string }) {
  return (
    <>
      <dt title={label}>{label}</dt>
      <dd data-testid={testId}>
        <span>{text === "" ? "-" : text}</span>
        {unit && text !== "" && <span className="mcm-rc__unit">{unit}</span>}
      </dd>
    </>
  );
}

function Steps({ io, run }: { io: RuleCalcIo; run: RuleCalcRun }) {
  if (run.steps.length === 0) return null;
  return (
    <section className="mcm-rc__steps" aria-label="단계별 중간값" data-testid="rc-steps">
      <span className="mcm-rc__steps-title">단계별 중간값</span>
      {run.steps.map((s, i) => {
        const stepName = io.steps.find((x) => x.ruleId === s.ruleId)?.name || s.ruleId;
        return (
          <div key={`${s.ruleId}-${i}`} className="mcm-rc__step" data-testid={`rc-step-${s.ruleId}`}>
            <div className="mcm-rc__step-head">
              <span>
                {i + 1}. {stepName}
              </span>
              {!s.hit && !s.defaultApplied && <span className="mcm-rc__step-note">적중 없음</span>}
              {s.defaultApplied && <span className="mcm-rc__step-note">기본값 적용</span>}
            </div>
            {Object.entries(s.outputs).map(([name, value]) => (
              <div key={name} className="mcm-rc__step-row">
                <span>{stepOutputLabel(io, s.ruleId, name)}</span>
                <span>{displayValue(value, stepOutputScale(io, s.ruleId, name), stepOutputDataType(io, s.ruleId, name))}</span>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

export default function RuleCalcRenderer(props: WidgetProps) {
  const { definition, refreshKey, screenContext } = props;
  const screenApply = readScreenApply(props);
  const cfg = readRuleCalcConfig(definition);
  const { ioState, draft, errors, runState, setValue, run, available, filled, fillFromScreen } = useRuleCalc(
    cfg.targetTp,
    cfg.targetId,
    refreshKey,
    { fillMode: cfg.fillMode, screenContext }
  );

  if (!cfg.targetId) {
    return (
      <>
        <RuleCalcStyle />
        <div className="mcm-rc__state" data-testid="rc-empty">
          {NO_TARGET_MESSAGE}
        </div>
      </>
    );
  }
  if (ioState.status === "idle" || ioState.status === "loading") {
    return (
      <>
        <RuleCalcStyle />
        <div className="mcm-rc__state" role="status" data-testid="rc-loading">
          불러오는 중…
        </div>
      </>
    );
  }
  if (ioState.status === "error") {
    return (
      <>
        <RuleCalcStyle />
        <div className="mcm-rc__state mcm-rc__state--error" role="alert" data-testid="rc-error">
          {ioState.message}
        </div>
      </>
    );
  }

  const { io } = ioState;
  if (blocksInput(io.messages)) {
    return (
      <>
        <RuleCalcStyle />
        <div className="mcm-rc" data-testid="rc-blocked">
          <Messages messages={io.messages} />
        </div>
      </>
    );
  }

  const running = runState.status === "running";
  const done = runState.status === "done" ? runState.run : null;
  const showSteps = cfg.showSteps && cfg.targetTp === "SET";

  return (
    <>
      <RuleCalcStyle />
      <form
        className="mcm-rc"
        data-testid="rc-root"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="mcm-rc__head">
          <span className="mcm-rc__name">{io.target.name || cfg.targetId}</span>
          <span>{cfg.targetId}</span>
        </div>
        <Messages messages={io.messages} />
        {io.inputs.length > 0 && (
          <div className="mcm-rc__inputs">
            {io.inputs.map((input) => (
              <InputField key={input.name} input={input} value={draft[input.name] ?? ""} error={errors[input.name]} filled={filled.includes(input.name)} onChange={(v) => setValue(input.name, v)} />
            ))}
          </div>
        )}
        <div className="mcm-rc__actions">
          <Button type="submit" variant="primary" disabled={running} data-testid="rc-run">
            {running ? "계산 중…" : "계산"}
          </Button>
          {cfg.fillMode === "button" && (
            <Button onClick={fillFromScreen} disabled={!available} data-testid="rc-fill">
              화면 값 넣기
            </Button>
          )}
          {filled.length > 0 && (
            <span className="mcm-rc__fill-note" data-testid="rc-fill-note">
              화면 값 {filled.length}개를 채웠습니다
            </span>
          )}
        </div>
        {runState.status === "error" && (
          <div className="mcm-rc__msg mcm-rc__msg--error" role="alert" data-testid="rc-run-error">
            {runState.message}
          </div>
        )}
        {done && (
          <div aria-live="polite" data-testid="rc-done">
            <Messages messages={done.messages} />
            {!done.ok && done.messages.length === 0 && (
              <div className="mcm-rc__msg mcm-rc__msg--error" role="alert" data-testid="rc-run-fail">
                {RUN_FAIL_MESSAGE}
              </div>
            )}
            {done.ok && <Results io={io} run={done} />}
            {done.ok && screenApply && <ApplyBar io={io} run={done} screenApply={screenApply} label={io.target.name || cfg.targetId} />}
            {done.ok && showSteps && <Steps io={io} run={done} />}
          </div>
        )}
      </form>
    </>
  );
}
