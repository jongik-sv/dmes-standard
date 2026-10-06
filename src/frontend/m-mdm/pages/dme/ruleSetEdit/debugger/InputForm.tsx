"use client";

/**
 * 디버그 입력 폼(3단계 계획 §4.1) — 판정 시각(`dbg-evalts`)·룰 버전(`dbg-rule-versions`)과 세트 입력 변수 칸(`dbg-fields`, 줄마다 키 보냄 `dbg-send-{name}`·값 `dbg-input-{name}`).
 * 칸은 컬럼 사전·프로그램 변수 이름만(2단계 P-D8)이다. 상태는 page 의 `useSimulation` 에 있다.
 */
import { Checkbox, Input, Select } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { SOURCE_LABEL, SOURCE_TONE, typeText } from "../cards/SetIoTables";
import type { RuleVersionMode } from "../types";
import type { DebugInput, Simulation } from "./useSimulation";

/** 룰 버전 선택 항목(spec 2026-10-06 §7.1). */
export const RULE_VERSION_OPTIONS: { value: RuleVersionMode; label: string }[] = [
  { value: "RELEASED", label: "적용 중(기본)" },
  { value: "MY_DRAFT", label: "내 DRAFT 우선" },
];
/** 내 DRAFT 우선일 때 검사 기준 안내(spec §7.4) — 화면 검사는 이번에 DRAFT 를 읽지 않는다(후속 F1). */
export const DRAFT_CHECK_NOTE = "검사 결과(거부·경고)는 적용 중 버전 기준이다. 실행만 내 DRAFT 를 쓴다";

/** 값이 모두 글자·null 인 평평한 객체인가 — 폼 줄(글자 칸)로 풀어도 보내는 JSON 이 뜻을 잃지 않는다. */
function formSafe(recordJson: string): boolean {
  try {
    const v: unknown = JSON.parse(recordJson);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
    return Object.values(v as Record<string, unknown>).every((x) => x === null || typeof x === "string");
  } catch {
    return false;
  }
}

/**
 * 케이스·최근 입력을 폼에 넣는다. 폼 칸은 글자라 숫자·불린 값(`{"GT_THK":12}`)을 풀면 `"12"` 로 바뀐다. 엔진은 룰이 선언한 이름만
 * 선언 타입으로 바꾸므로(`ValueConverter.toDeclared`) IF 조건식만 읽는 이름은 뜻이 달라질 수 있다 — 그런 입력은 폼에 보이되
 * 보낼 글은 JSON 칸에 원문 그대로 둔다(JSON 칸이 있으면 폼 대신 그것을 보낸다). 모두 글자·null 이면 폼만 채운다.
 */
export function loadExactInput(sim: Simulation, input: DebugInput): void {
  sim.loadInput(input);
  if (!formSafe(input.recordJson)) sim.setJson(input.recordJson);
}

/** JSON 칸에 글이 있을 때 폼 위 안내 — 보내는 것은 JSON 칸이다. */
export const JSON_ACTIVE_NOTE = "JSON 입력을 보낸다. 폼을 쓰려면 JSON 칸을 비운다";

export function InputForm({ sim }: { sim: Simulation }) {
  // JSON 칸에 글이 있으면 폼 대신 그것을 보낸다(2단계 규칙) — 고쳐도 보내지 않는 폼 칸은 꺼 두고 이유를 보인다.
  // JSON 칸 글이 기록 입력과 다르면(비우거나 바꾸면) 다음 [한 단계]·[계속] 이 바뀐 입력으로 새로 실행한다(P-D9 — 훅이 판정한다).
  const jsonActive = sim.json.trim() !== "";
  return (
    <>
      <label className="rsf-dbg-evalts">
        <span className="rsf-dbg-label">판정 시각</span>
        <Input
          data-testid="dbg-evalts"
          aria-label="판정 시각"
          value={sim.evalTs}
          placeholder="yyyy-MM-dd HH:mm:ss (비우면 지금)"
          error={sim.evalTsError ?? undefined}
          onChange={sim.setEvalTs}
        />
      </label>
      <label className="rsf-dbg-evalts">
        <span className="rsf-dbg-label">룰 버전</span>
        <Select
          data-testid="dbg-rule-versions"
          aria-label="룰 버전"
          value={sim.ruleVersions}
          options={RULE_VERSION_OPTIONS}
          onChange={(v) => sim.setRuleVersions(v === "MY_DRAFT" ? "MY_DRAFT" : "RELEASED")}
        />
      </label>
      {sim.ruleVersions === "MY_DRAFT" && (
        <p className="rsf-panel-note" data-testid="dbg-draft-check-note" role="status">
          {DRAFT_CHECK_NOTE}
        </p>
      )}
      {jsonActive && sim.fields.length > 0 && (
        <p className="rsf-panel-note" data-testid="dbg-json-active" role="status">
          {JSON_ACTIVE_NOTE}
        </p>
      )}
      {sim.fields.length === 0 ? (
        <p className="rsf-panel-note">흐름이 읽는 컬럼 사전·프로그램 변수가 없다. 아래 JSON 으로 넣을 수도 있다</p>
      ) : (
        <ul className="rsf-dbg-fields" data-testid="dbg-fields">
          {sim.fields.map(({ row, meta }) => (
            <li key={row.key} className="rsf-dbg-field">
              <span className="rsf-dbg-field-name">
                <code>{row.key}</code>
                {meta?.label && <span className="rsf-dbg-field-sub">{meta.label}</span>}
                {meta && <span className="rsf-dbg-field-sub">{typeText(meta)}</span>}
                {meta?.source && <span style={badgeStyle(SOURCE_TONE[meta.source])}>{SOURCE_LABEL[meta.source]}</span>}
                {!meta && <span style={badgeStyle("neutral")}>흐름 밖 이름</span>}
              </span>
              <span className="rsf-dbg-field-edit">
                <span data-testid={`dbg-send-${row.key}`} className="rsf-dbg-send">
                  <Checkbox
                    aria-label={`${row.key} 키 보냄`}
                    checked={row.on}
                    disabled={jsonActive}
                    onChange={(on) => sim.setInput(row.key, { on })}
                  />
                </span>
                <Input
                  data-testid={`dbg-input-${row.key}`}
                  aria-label={`${row.key} 값`}
                  value={row.value}
                  disabled={!row.on || jsonActive}
                  title={jsonActive ? JSON_ACTIVE_NOTE : undefined}
                  placeholder={row.on ? "비우면 null" : "키를 보내지 않음"}
                  onChange={(value) => sim.setInput(row.key, { value })}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
