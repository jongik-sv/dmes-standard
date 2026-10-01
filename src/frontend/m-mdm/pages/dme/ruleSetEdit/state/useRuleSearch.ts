"use client";

/**
 * 룰 목록 찾기 상태(4단계 계획 Task 8) — 3단계 `RulePanel` 안에 있던 검색어·결과·요청 순번을 page 로 올렸다.
 * 섹션을 접거나 자리가 바뀌거나(「룰 목록」 ↔ 「룰 지정」) 모드를 바꿔도 찾은 줄이 남는다. 늦은 응답은 요청 순번으로 버린다(Local-Rules §11).
 * 확정 버전(releasedVer)이 있는 룰만 남기고, 찾은 룰의 입출력은 `onRules` 로 page 의 룰 맵에 먼저 넣는다(끌어 놓기·두 번 누르기·[지정] 이 IO 를 쓴다).
 */
import { useCallback, useRef, useState } from "react";

import { searchRules } from "../api";
import type { RuleIo } from "../types";

export interface RuleSearch {
  keyword: string;
  setKeyword(v: string): void;
  /** null = 아직 찾지 않음. */
  rows: RuleIo[] | null;
  find(): Promise<void>;
}

export function useRuleSearch(onRules: (ios: RuleIo[]) => void, onError: (e: unknown) => void): RuleSearch {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<RuleIo[] | null>(null);
  const seq = useRef(0);
  const latest = useRef({ keyword, onRules, onError });
  latest.current = { keyword, onRules, onError };
  const find = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await searchRules(latest.current.keyword);
      if (mine !== seq.current) return; // 늦게 온 앞 응답은 버린다
      const found = (res.rules ?? []).filter((r) => r.releasedVer != null);
      latest.current.onRules(found);
      setRows(found);
    } catch (e) {
      if (mine !== seq.current) return;
      latest.current.onError(e);
    }
  }, []);
  return { keyword, setKeyword, rows, find };
}
