/**
 * 폭 룰 공정 합산 — 폭수축량(lineWidthShrinkage)·폭마진량(lineWidthMargin) 두 화면이 함께 쓴다. React 에 기대지 않는다.
 *
 * - chain(공정 흐름, width-reduction): PLTCM → CGL → EGL → 정전 → CCL 을 차례로 판정해 폭 수축량을 더한다.
 *   단계마다 폭 조건 변수에 「들어오는 폭」 을 넣고, 적중한 수축량만큼 줄인 폭을 다음 단계의 들어오는 폭으로 넘긴다.
 * - parallel(공정별 마진, width-margin): 공정마다 같은 주문 폭으로 따로 판정하고 마진을 더한다. 폭 조건이 없는 공정(정전)은 폭 없이 판정한다.
 *
 * 적중이 없으면 그 단계 양은 0 이다(프로토타입과 같다). 판정은 서버(qcdRule/judge)가 하고 여기서는 잇기만 한다.
 */
import {
  buildJudgeInput,
  CATALOG,
  rowKeyOf,
  tidyNumber,
  type RuleDisplay,
  judgeFields,
  orderedVarNames,
  varLabel,
  type Catalog,
  type JudgeField,
  type JudgeHit,
  type JudgeResult,
  type JudgeStatus,
  type RuleGroup,
  type RuleView,
} from "@/common/rule";

export interface FlowStep {
  key: string;
  label: string;
  ruleId: string;
}

/** 묶음 순서 = 공정 순서. 묶음마다 첫 룰. */
export function flowSteps(groups: readonly RuleGroup[]): FlowStep[] {
  return groups
    .filter((g) => g.ruleIds.length > 0)
    .map((g) => ({ key: g.key, label: g.label, ruleId: g.ruleIds[0] }));
}

/** 폭 조건 변수 — 이름이 WID 이거나 _WID 로 끝나거나 WID_ 로 시작하는 조건 변수, 없으면 라벨에 「폭」 이 든 조건 변수. */
export function widthVarOf(
  rule: RuleView | undefined,
  ruleId: string,
  catalog: Catalog = CATALOG,
): string | undefined {
  const names = orderedVarNames(rule, ruleId, "COND", catalog);
  return (
    names.find(
      (n) => n === "WID" || n.endsWith("_WID") || n.startsWith("WID_"),
    ) ?? names.find((n) => varLabel(ruleId, n, catalog).includes("폭"))
  );
}

/** 수축량(마진) 결과 변수 — display.primaryVars 중 룰에 있는 첫째, 없으면 결과 변수 중 첫째. */
export function amountVarOf(
  rule: RuleView | undefined,
  ruleId: string,
  catalog: Catalog = CATALOG,
  display?: RuleDisplay,
): string | undefined {
  const names = orderedVarNames(rule, ruleId, "RESULT", catalog);
  return display?.primaryVars?.find((n) => names.includes(n)) ?? names[0];
}

/** 흐름 입력 칸 — 단계들의 조건 변수 합집합(처음 나온 순서), 폭 조건 변수는 뺀다(들어오는 폭이 대신한다). 라벨은 처음 나온 룰의 것. */
export function flowFields(
  steps: readonly FlowStep[],
  rules: readonly RuleView[],
  catalog: Catalog = CATALOG,
): JudgeField[] {
  const out: JudgeField[] = [];
  for (const s of steps) {
    const rule = rules.find((r) => r.ruleId === s.ruleId);
    const widthVar = widthVarOf(rule, s.ruleId, catalog);
    for (const f of judgeFields(rule, s.ruleId, catalog)) {
      if (f.name === widthVar) continue;
      const prev = out.find((x) => x.name === f.name);
      if (prev) {
        prev.numeric ||= f.numeric;
        continue;
      }
      out.push({ ...f });
    }
  }
  return out;
}

/** chain: 앞 단계를 나간 폭이 다음 단계로. parallel: 모든 단계가 같은 시작 폭. */
export type FlowMode = "chain" | "parallel";

export interface FlowStepResult {
  step: FlowStep;
  /** 이 단계에 들어온 폭. */
  inWidth: number;
  /** 이 단계를 나간 폭 = inWidth − amount. */
  outWidth: number;
  /** 수축량(적중 없으면 0). */
  amount: number;
  status: JudgeStatus;
  ver: string | null;
  hits: JudgeHit[];
  widthVar: string | undefined;
  message: string | null;
  /** 판정 결과 값(변수명 → 값). */
  results: Record<string, unknown>;
  /** 적용 행의 룰 ID(display.keyVar). 없으면 null. */
  ruleKey: string | null;
}

export interface FlowResult {
  steps: FlowStepResult[];
  startWidth: number;
  /** 수축량(마진) 합. */
  total: number;
  /** 마지막 폭 — chain 은 마지막 단계를 나간 폭, parallel 은 시작 폭 − 합. */
  finalWidth: number;
  /** 적중한 단계 수. */
  matched: number;
}

export type JudgeFn = (
  ruleId: string,
  input: Record<string, string>,
  evalTs?: string,
) => Promise<JudgeResult>;

/** 부동소수 찌꺼기를 지운다(1000 − 0.1 − 0.2 가 999.6999… 가 되지 않게). */
const tidy = tidyNumber;

/** 결과 값 → 수. 숫자가 아니면 0. */
function amountOf(result: JudgeResult, amountVar: string | undefined): number {
  if (result.status !== "MATCHED" || !amountVar) return 0;
  const n = Number(result.results[amountVar]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 흐름 실행 — 단계를 차례로 판정한다. chain 은 앞 단계의 나간 폭이 다음 단계의 들어온 폭이고, parallel 은 모든 단계가 시작 폭이다.
 * 판정 호출이 실패하면 그 오류를 그대로 던진다. values 는 흐름 입력 칸 값(변수명 → 글), startWidth 는 원자재 폭(주문 폭).
 * display 를 주면 적용 행의 룰 ID(keyVar)를 단계 결과에 싣는다.
 */
export async function runFlow(
  steps: readonly FlowStep[],
  rules: readonly RuleView[],
  values: Readonly<Record<string, string>>,
  startWidth: number,
  judge: JudgeFn,
  evalTs?: string,
  catalog: Catalog = CATALOG,
  mode: FlowMode = "chain",
  display?: RuleDisplay,
): Promise<FlowResult> {
  const out: FlowStepResult[] = [];
  let width = startWidth;
  for (const step of steps) {
    const rule = rules.find((r) => r.ruleId === step.ruleId);
    const widthVar = widthVarOf(rule, step.ruleId, catalog);
    const fields = judgeFields(rule, step.ruleId, catalog).filter(
      (f) => f.name !== widthVar,
    );
    const input = buildJudgeInput(fields, values);
    if (widthVar) input[widthVar] = String(width);
    const result = await judge(step.ruleId, input, evalTs);
    const amount = amountOf(
      result,
      amountVarOf(rule, step.ruleId, catalog, display),
    );
    const outWidth = tidy(width - amount);
    const matchedResults =
      result.status === "MATCHED" ? (result.results ?? {}) : {};
    out.push({
      step,
      inWidth: width,
      outWidth,
      amount,
      status: result.status,
      ver: result.ver,
      hits: result.hits,
      widthVar,
      message: result.message,
      results: matchedResults,
      ruleKey: rowKeyOf(display, matchedResults),
    });
    if (mode === "chain") width = outWidth;
  }
  const total = tidy(out.reduce((sum, s) => sum + s.amount, 0));
  return {
    steps: out,
    startWidth,
    total,
    finalWidth: mode === "chain" ? width : tidy(startWidth - total),
    matched: out.filter((s) => s.status === "MATCHED").length,
  };
}
