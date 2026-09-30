// 룰 세트 기록 실행 골든(2단계 Task 4, mdm/api test resources)을 사본 없이 경로로 읽는 공용 도우미 — 3단계 계획 F11.
// `.test.ts` 가 아니라 수집되지 않는다(`render.ts` 선례). 골든의 trace 는 서버 execute 응답 그대로(엔진 RunTrace 스키마)이고,
// flowJson 은 P2 정규 JSON 문자열이다.
import fs from "node:fs";
import path from "node:path";

import type { RuleSetFlow, RunTrace } from "../../../src/contract/engine-contract.generated";
import { PACKAGE_ROOT } from "../../helpers/engine-paths";

export const GOLDEN_PATH = path.resolve(
  PACKAGE_ROOT,
  "../../backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json",
);

export interface GoldenCase {
  name: string;
  flowJson: string;
  recordJson: string;
  response: { trace: RunTrace; warnings: Array<{ code: string; ruleId: string | null; message: string }> };
}

/** 골든 사례 한 건 + 풀어 둔 흐름·기록·경고. */
export interface Golden extends GoldenCase {
  flow: RuleSetFlow;
  trace: RunTrace;
  warnings: GoldenCase["response"]["warnings"];
}

export const goldenCases: GoldenCase[] = (JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")) as { cases: GoldenCase[] }).cases;

/** 이름으로 골든 사례를 찾는다. 없으면 던진다. */
export function golden(name: string): Golden {
  const c = goldenCases.find((x) => x.name === name);
  if (!c) throw new Error(`골든 사례가 없다: ${name}`);
  return { ...c, flow: JSON.parse(c.flowJson) as RuleSetFlow, trace: c.response.trace, warnings: c.response.warnings };
}
