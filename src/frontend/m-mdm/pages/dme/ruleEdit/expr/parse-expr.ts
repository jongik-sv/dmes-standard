/**
 * 식 입력 칸의 로직(TSK-08-03 design §2.1 `ExprField`) — 디바운스 서버 파싱·파싱 결과 설명·자동완성 소스·평가 미리보기.
 *
 * 파싱은 서버 EvalEx 만 한다(불변 9): 이 폴더에는 식 텍스트를 읽는 코드가 없다. 서버가 준 AST 를 화면 evalex 로 평가하는 것(미리보기)만
 * 한다. `@/evalex` 에서 compile·usedVariables 같은 식 해석 함수를 가져오지 않는다 — 테스트가 지킨다.
 */
import { evaluate, NUMBER_TEXT, type EvalValue } from "@/evalex";
import type { AstNode } from "@/contract/engine-contract.generated";

import { parseExpr, type ExprSlot } from "../api";
import type { ParseExprResult, VarCandidate } from "../types";

export const PARSE_DEBOUNCE_MS = 500;

/** 디바운스 파서가 화면에 알리는 한 번의 결과. 식이 비면 result=null, 서버 오류면 error. */
export interface ParseOutcome {
  text: string;
  slot: ExprSlot;
  result?: ParseExprResult | null;
  error?: string;
}

/**
 * 마지막 입력이 멈춘 지 `delay` ms 뒤에 서버를 한 번 부르는 디바운스. 나중에 요청한 식이 있으면 앞 응답은 버린다(순서 뒤바뀜 방지).
 * 빈 식은 서버를 부르지 않고 대기 중인 호출도 취소한다.
 */
export function createDebouncedParser(
  parse: (text: string, slot: ExprSlot) => Promise<ParseExprResult>,
  onOutcome: (outcome: ParseOutcome) => void,
  delay: number = PARSE_DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    seq++;
  };

  const request = (raw: string, slot: ExprSlot) => {
    const text = raw.trim();
    cancel();
    if (text === "") {
      onOutcome({ text: "", slot, result: null });
      return;
    }
    const mine = seq;
    timer = setTimeout(() => {
      timer = null;
      parse(text, slot).then(
        (result) => {
          if (mine === seq) onOutcome({ text, slot, result });
        },
        (e: unknown) => {
          if (mine === seq) onOutcome({ text, slot, error: e instanceof Error ? e.message : String(e) });
        },
      );
    }, delay);
  };

  return { request, cancel };
}

/** 서버 파서를 부르는 실제 함수(테스트는 대체한다). */
export const serverParse = parseExpr;

/** parseExpr 는 EDIT 세트 action(validate)이다 — 편집 가능하고 validate 권한이 있을 때만 부른다(READ 사용자는 403). */
export function canParseOnServer(p: { editable: boolean; canValidate: boolean }): boolean {
  return p.editable && p.canValidate;
}

export interface ParseStatus {
  kind: "idle" | "ok" | "unsupported" | "error";
  message: string;
  refVars: string[];
  /** 컬럼 사전·앞 룰 결과에 없는 참조 이름 — 프로그램 변수라 값 타입을 선언해야 한다. */
  programVars: string[];
}

/** 컬럼 사전·앞 룰 결과 후보에 없는 이름. */
export function programVariables(names: readonly string[], candidates: readonly VarCandidate[]): string[] {
  const known = new Set(candidates.map((c) => c.name));
  return names.filter((n) => !known.has(n));
}

const KIND_LABEL: Record<VarCandidate["kind"], string> = { COLUMN: "컬럼 사전", RULE_RESULT: "앞 룰 결과" };

/** datalist(자동완성) 옵션 — 컬럼 사전 물리명과 앞 룰 결과 변수. */
export function datalistOptions(candidates: readonly VarCandidate[]): Array<{ value: string; label: string }> {
  return candidates.map((c) => ({ value: c.name, label: c.label ? `${c.label} · ${KIND_LABEL[c.kind]}` : KIND_LABEL[c.kind] }));
}

/** 서버 파싱 결과를 화면 표시로 옮긴다. 화이트리스트 밖(`supported=false`)은 서버 평가로 넘긴다는 표시다. */
export function describeParse(outcome: ParseOutcome | null, candidates: readonly VarCandidate[]): ParseStatus {
  if (!outcome || (outcome.result == null && outcome.error == null)) return { kind: "idle", message: "", refVars: [], programVars: [] };
  if (outcome.error != null) return { kind: "error", message: outcome.error, refVars: [], programVars: [] };
  const r = outcome.result!;
  const refVars = r.refVars ?? [];
  const programVars = programVariables(refVars, candidates);
  if (r.problems && r.problems.length > 0) {
    return { kind: "error", message: r.problems.map((p) => p.detail).join(" / "), refVars, programVars };
  }
  if (!r.supported) {
    return { kind: "unsupported", message: "화면이 평가하지 못하는 함수가 있어 서버 평가로 넘긴다", refVars, programVars };
  }
  return { kind: "ok", message: "", refVars, programVars };
}

export type PreviewOutcome =
  | { kind: "value"; text: string }
  | { kind: "fallback"; text: string }
  | { kind: "error"; text: string };

/** 서버가 준 AST 를 화면 evalex 로 평가한다(미리보기). 식 텍스트는 다시 파싱하지 않는다. */
export function previewValue(result: ParseExprResult, record: Readonly<Record<string, EvalValue | number>>): PreviewOutcome {
  if (!result.supported) return { kind: "fallback", text: "서버 평가로 넘긴다" };
  const out = evaluate(result.ast as unknown as AstNode, record);
  if (out.kind === "error") return { kind: "error", text: out.message };
  if (out.kind === "fallback") return { kind: "fallback", text: out.reason };
  const v = out.value;
  if (v === null) return { kind: "value", text: "null" };
  if (typeof v === "string" || typeof v === "boolean") return { kind: "value", text: String(v) };
  return { kind: "value", text: NUMBER_TEXT.get(v) ?? v.toString() };
}
