"use client";

/**
 * 식 칸 하나의 서버 파싱 상태 — 500ms 디바운스로 `parseExpr`(BPMN action=validate)를 부르고 결과를 표시 상태로 옮긴다(불변 9).
 * `enabled` 가 거짓(읽기 전용·validate 권한 없음)이면 서버를 부르지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExprSlot } from "../api";
import type { VarCandidate } from "../types";
import { createDebouncedParser, describeParse, serverParse, type ParseOutcome, type ParseStatus } from "./parse-expr";

export function useParseExpr(
  text: string,
  slot: ExprSlot,
  enabled: boolean,
  candidates: readonly VarCandidate[],
  onOutcome?: (outcome: ParseOutcome) => void,
): { status: ParseStatus; outcome: ParseOutcome | null } {
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const report = useRef(onOutcome);
  report.current = onOutcome;

  const parser = useMemo(
    () =>
      createDebouncedParser(serverParse, (o) => {
        setOutcome(o);
        report.current?.(o);
      }),
    [],
  );

  useEffect(() => {
    if (enabled) parser.request(text, slot);
    else parser.cancel();
    return () => parser.cancel();
  }, [text, slot, enabled, parser]);

  const status = useMemo(() => describeParse(outcome && outcome.text === text.trim() ? outcome : null, candidates), [outcome, text, candidates]);
  return { status, outcome };
}
