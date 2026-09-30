"use client";

/**
 * 디버그 모드 왼쪽 입력 패널(3단계 계획 §4.1·E6·E7) — 위에서 아래로 판정 시각·입력 폼(`InputForm`), [JSON 붙여넣기 ▾] 접이 영역,
 * [최근 입력 ▾](세트별 최근 10, 고르면 폼에 채운다), 실행 오류, 테스트 케이스(`TestCasePanel`). 상태는 page 의 `useSimulation`·`useTestCases` 에 있다.
 * 폼을 바꾸면 다음 [한 단계]·[계속] 이 바뀐 입력으로 새로 실행한다(P-D9 — 훅이 판정한다).
 */
import { useEffect, useState } from "react";

import { Button, Select, Textarea } from "@dk-oasis/shared/form";

import { InputForm, loadExactInput } from "./InputForm";
import { TestCasePanel } from "./TestCasePanel";
import type { Simulation } from "./useSimulation";
import type { TestCases } from "./useTestCases";

export interface DebugInputsProps {
  sim: Simulation;
  tests: TestCases;
  setId: string | null;
  /** 케이스 저장·삭제 — 담당자·INUSE·저장 권한. */
  canEditCases: boolean;
  /** canDo("execute"). */
  canRun: boolean;
  onError(e: unknown): void;
}

/** 최근 입력 한 줄 라벨 — 판정 시각(없으면 "지금") + 레코드 JSON 앞 40자. */
export function recentLabel(evalTs: string, recordJson: string): string {
  const head = recordJson.length > 40 ? `${recordJson.slice(0, 40)}…` : recordJson;
  return `${evalTs || "지금"} · ${head}`;
}

export function DebugInputs({ sim, tests, canEditCases, canRun }: DebugInputsProps) {
  // JSON 칸에 글이 있으면(붙여 넣었거나 숫자 값 케이스를 불러왔으면) 접이 영역을 연다 — 폼 대신 이것을 보낸다는 것이 보이게.
  const [jsonOpen, setJsonOpen] = useState(sim.json.trim() !== "");
  const hasJson = sim.json.trim() !== "";
  useEffect(() => {
    if (hasJson) setJsonOpen(true);
  }, [hasJson]);

  const recentOptions = sim.recent.map((r, i) => ({ value: String(i), label: recentLabel(r.evalTs, r.recordJson) }));
  const pickRecent = (v: string) => {
    const r = sim.recent[Number(v)];
    if (v !== "" && r) loadExactInput(sim, r);
  };

  return (
    <div className="rsf-dbg-inputs" data-testid="dbg-inputs">
      <section className="rsf-dbg-section" aria-label="입력">
        <p className="rsf-dbg-title">입력 — 저장하지 않은 흐름을 레코드 하나로 돌린다</p>
        <InputForm sim={sim} />
        <details className="rsf-dbg-fold" open={jsonOpen} onToggle={(e) => setJsonOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>JSON 붙여넣기</summary>
          <Textarea
            data-testid="dbg-json"
            aria-label="레코드 JSON"
            rows={3}
            value={sim.json}
            placeholder={'JSON 을 붙여 넣으면 폼 대신 이것을 보낸다  예) {"GT_THK":"12"}'}
            error={sim.jsonError ?? undefined}
            onChange={sim.setJson}
          />
          <Button size="sm" data-testid="dbg-json-import" disabled={!hasJson || !!sim.jsonError} onClick={sim.importJson}>
            폼으로 가져오기
          </Button>
        </details>
        <label className="rsf-dbg-recent">
          <span className="rsf-dbg-label">최근 입력</span>
          <Select
            data-testid="dbg-recent"
            aria-label="최근 입력"
            value=""
            options={recentOptions}
            placeholder={recentOptions.length === 0 ? "실행한 입력이 없다" : "골라 폼에 채운다"}
            disabled={recentOptions.length === 0}
            onChange={pickRecent}
          />
        </label>
        {sim.error && (
          <p className="rsf-dbg-error" data-testid="dbg-error" role="alert">
            실행하지 못했다. {sim.error}
          </p>
        )}
      </section>
      <TestCasePanel sim={sim} tests={tests} canEditCases={canEditCases} canRun={canRun} />
    </div>
  );
}
