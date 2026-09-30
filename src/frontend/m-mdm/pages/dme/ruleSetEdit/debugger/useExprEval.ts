"use client";

/**
 * 식 즉석 평가 상태(3단계 계획 E5·P-D1) — 식 글자를 서버 `validate`(`exprText`)로 파싱하고, 평가는 화면 `evalExpr` 가 커서 시점 ctx 로 한다.
 * 파싱 결과를 두고 결과는 ctx·선언 타입에서 매 렌더 다시 계산한다 — 커서를 옮기면 같은 식이 그 자리 값으로 다시 평가된다(서버를 다시 부르지 않는다).
 * `supported=false`·평가기 폴백이면 `FALLBACK_TEXT` 만 보이고 서버 평가(`execute`)를 부르지 않는다. 파싱 오류는 오류 결과로 보인다.
 * 늦게 온 파싱 응답은 요청 순번으로 버린다(Local-Rules §11). 최근 식 5개는 세트별 localStorage(`rsf:expr:<setId>`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DataType, TypedValue } from "@/contract/engine-contract.generated";

import { parseExprText } from "../api";
import type { ExprParse } from "../types";
import { evalExpr, type ExprResult } from "./expr-eval";
import { loadStrings, pushRecent, saveStrings, storeKeys } from "./local-store";

/** 최근 식 개수(세트별). */
export const RECENT_EXPRS = 5;
const NO_RECENT: string[] = [];

export interface ExprEval {
  text: string;
  setText(v: string): void;
  /** 마지막으로 평가한 식의 결과(없으면 null). */
  result: ExprResult | null;
  /** 결과를 낸 식 글자. */
  evaluated: string | null;
  running: boolean;
  recent: string[];
  /** 식을 파싱해 평가한다. 빈 글자는 무시한다. */
  run(text: string): Promise<void>;
}

type Parsed = { text: string; parse: ExprParse } | { text: string; error: string };

/**
 * @param setId 지금 세트(최근 식 저장소 키)
 * @param ctx 커서 시점 변수(이름 → 값). null 이면 기록이 없다
 * @param types 흐름 입력·결과 이름(대문자) → 선언 타입(`declaredTypes`)
 */
export function useExprEval(setId: string | null, ctx: Readonly<Record<string, TypedValue>> | null, types: Readonly<Record<string, DataType>>): ExprEval {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [running, setRunning] = useState(false);
  const [recent, setRecent] = useState<string[]>(NO_RECENT);
  const recentRef = useRef(recent);
  const seq = useRef(0);
  const setIdRef = useRef(setId);
  setIdRef.current = setId;

  // 세트가 바뀌면 그 세트의 최근 식을 읽고 결과를 비운다.
  useEffect(() => {
    seq.current += 1;
    const list = setId == null ? NO_RECENT : loadStrings(storeKeys.recentExprs(setId)).slice(0, RECENT_EXPRS);
    recentRef.current = list;
    setRecent(list);
    setParsed(null);
    setRunning(false);
  }, [setId]);

  const run = useCallback(async (raw: string) => {
    const expr = raw.trim();
    if (expr === "") return;
    const mine = ++seq.current;
    const forSet = setIdRef.current;
    setRunning(true);
    let next: Parsed;
    try {
      const res = await parseExprText(expr);
      next = { text: expr, parse: res.expr };
    } catch (e) {
      next = { text: expr, error: e instanceof Error ? e.message : String(e) };
    }
    if (mine !== seq.current || setIdRef.current !== forSet) return;
    setParsed(next);
    setRunning(false);
    const list = pushRecent(recentRef.current, expr, (a, b) => a === b, RECENT_EXPRS);
    recentRef.current = list;
    setRecent(list);
    if (forSet != null) saveStrings(storeKeys.recentExprs(forSet), list);
  }, []);

  const result = useMemo<ExprResult | null>(() => {
    if (!parsed || !ctx) return null;
    if ("error" in parsed) return { kind: "error", text: parsed.error };
    try {
      return evalExpr(parsed.parse, ctx, types);
    } catch (e) {
      return { kind: "error", text: e instanceof Error ? e.message : String(e) };
    }
  }, [parsed, ctx, types]);

  return { text, setText, result, evaluated: parsed?.text ?? null, running, recent, run };
}
