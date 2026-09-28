"use client";

/**
 * 계약 계산용 식 AST 모음 — 식 변수·열 조건 텍스트마다 서버 `parseExpr` 를 한 번씩 불러 `{텍스트: AST}` 로 모은다(불변 9).
 * 식 텍스트의 AST 는 언제 받아도 유효하므로 응답은 화면이 사라졌을 때만 버린다 — 요청 목록(`wanted`)이 바뀌었다고 버리면
 * 이미 요청한 식은 다시 부르지 않아 영영 pending 으로 남는다. 실패한 식은 다음에 목록이 바뀔 때 다시 부른다.
 * `enabled` 가 거짓(읽기 전용·validate 권한 없음)이면 서버를 부르지 않는다.
 */
import { useEffect, useRef, useState } from "react";

import type { AstNode } from "@/contract/engine-contract.generated";

import type { ExprSlot } from "../api";
import { serverParse } from "./parse-expr";

export interface ExprSlotText {
  text: string;
  slot: ExprSlot;
}

export function useServerAsts(wanted: readonly ExprSlotText[], enabled: boolean): Record<string, AstNode> {
  const [asts, setAsts] = useState<Record<string, AstNode>>({});
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    for (const w of wanted) {
      if (requested.current.has(w.text)) continue;
      requested.current.add(w.text);
      serverParse(w.text, w.slot).then(
        (r) => {
          if (mounted.current && r.ast) setAsts((prev) => ({ ...prev, [w.text]: r.ast as unknown as AstNode }));
        },
        () => {
          requested.current.delete(w.text);
        },
      );
    }
  }, [wanted, enabled]);

  return asts;
}
