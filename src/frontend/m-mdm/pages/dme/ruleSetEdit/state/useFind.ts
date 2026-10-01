"use client";

/**
 * 노드 찾기(3단계 계획 B11, 2026-10-01 찾기 위젯) — 캔버스 오른쪽 위 찾기 위젯(`canvas/FindWidget`)의 글자로 룰 ID·룰 이름·노드 라벨을 찾고
 * 다음(Enter)·이전(Shift+Enter)으로 돌며 그 노드로 옮긴다(`onReveal`).
 * 옵션 셋(VS Code 찾기 위젯과 같다): 대소문자 구분 · 단어 단위 · 정규식. 끄면 예전처럼 대소문자를 무시한 부분 일치다.
 * 글자나 옵션을 바꾸면 순번만 0 으로 돌리고(옮기지 않는다), 첫 다음은 첫 결과로, 첫 이전은 마지막 결과로 간다. 그다음부터는 한 칸씩 돌아 끝에서 처음으로(이전은 처음에서 끝으로) 간다.
 * 잘못된 정규식은 예외를 내지 않고 결과 0건과 `invalid` 로 알린다. 빈 글자 일치(`x*` 등)는 결과로 치지 않는다.
 * 접힌 블록 안의 노드를 펴는 것은 `onReveal` 의 몫이다. 위젯을 닫아도 글자·옵션은 이 훅(page)에 남는다.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { EditFlow } from "../flow-edit";
import type { RuleIoMap } from "../types";

export interface FindOptions {
  /** 대소문자 구분(Aa). */
  caseSensitive: boolean;
  /** 단어 단위(ab) — 일치 앞뒤가 글자·숫자·밑줄이 아니어야 한다. */
  wholeWord: boolean;
  /** 정규식(.*). */
  regex: boolean;
}

export const DEFAULT_FIND_OPTIONS: Readonly<FindOptions> = { caseSensitive: false, wholeWord: false, regex: false };

export interface FindState {
  query: string;
  setQuery(q: string): void;
  options: FindOptions;
  toggleOption(key: keyof FindOptions): void;
  /** 정규식 옵션이 켜져 있고 글자가 정규식으로 잘못됐다(결과 0건). */
  invalid: boolean;
  /** 찾은 흐름 노드 ID(흐름 순서). */
  hits: string[];
  /** 지금 가리키는 hits 순번(없으면 -1). */
  index: number;
  /** 다음 결과로 옮기고 onReveal 을 부른다. */
  next(): void;
  /** 이전 결과로 옮기고 onReveal 을 부른다. */
  prev(): void;
}

const NO_HITS: string[] = [];

/** 글자 하나가 단어 글자(글자·숫자·밑줄 — 한글 포함)인가. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;
function isWordChar(ch: string | undefined): boolean {
  return !!ch && WORD_CHAR.test(ch);
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 잘못된 정규식 표시. */
export const INVALID_FIND = "invalid" as const;
export type FindMatcher = (text: string) => boolean;

/**
 * 질의·옵션으로 일치 판정 함수를 만든다. 빈 질의(공백만 포함)면 null, 정규식이 잘못됐으면 `INVALID_FIND`.
 * 정규식이 아니면 앞뒤 공백을 뺀 글자를 그대로 찾는다. 단어 단위는 JS `\b`(ASCII 만 안다) 대신 일치 앞뒤 글자를 유니코드로 본다.
 */
export function compileFind(query: string, opts: FindOptions = DEFAULT_FIND_OPTIONS): FindMatcher | typeof INVALID_FIND | null {
  if (query.trim() === "") return null;
  let re: RegExp;
  try {
    re = new RegExp(opts.regex ? query : escapeRegExp(query.trim()), opts.caseSensitive ? "g" : "gi");
  } catch {
    return INVALID_FIND;
  }
  return (text: string) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = m.index + m[0].length;
      if (m[0] !== "" && (!opts.wholeWord || (!isWordChar(text[m.index - 1]) && !isWordChar(text[end])))) return true;
      re.lastIndex = m.index + 1; // 빈 일치·단어 경계 실패 — 한 글자 뒤에서 다시 찾는다(무한 반복 방지)
    }
    return false;
  };
}

/** 룰 ID·룰 이름·노드 라벨이 질의와 맞는 흐름 노드 ID(흐름 노드 순서). 빈 질의·잘못된 정규식이면 빈 목록. 옵션을 빼면 대소문자 무시 부분 일치. */
export function findNodes(flow: EditFlow | null, rules: RuleIoMap, query: string, opts: FindOptions = DEFAULT_FIND_OPTIONS): string[] {
  const match = compileFind(query, opts);
  if (!flow || !match || match === INVALID_FIND) return NO_HITS;
  const out: string[] = [];
  for (const n of flow.nodes) {
    const rule = n.ruleId ? rules[n.ruleId] : undefined;
    const fields = [n.ruleId, rule?.ruleName, n.label];
    if (fields.some((x) => !!x && match(x))) out.push(n.id);
  }
  return out.length > 0 ? out : NO_HITS;
}

export function useFind(flow: EditFlow | null, rules: RuleIoMap, onReveal: (nodeId: string) => void): FindState {
  const [query, setQueryState] = useState("");
  const [options, setOptions] = useState<FindOptions>(DEFAULT_FIND_OPTIONS);
  const [cursor, setCursor] = useState(0);
  /** 글자·옵션을 바꾼 뒤 아직 한 번도 옮기지 않았는가 — 첫 다음은 첫 결과, 첫 이전은 마지막 결과로 간다. */
  const [moved, setMoved] = useState(false);
  const invalid = useMemo(() => options.regex && compileFind(query, options) === INVALID_FIND, [query, options]);
  const hits = useMemo(() => findNodes(flow, rules, query, options), [flow, rules, query, options]);
  // 흐름이 바뀌어 결과가 줄었으면 순번을 끝으로 당긴다.
  const index = hits.length === 0 ? -1 : Math.min(cursor, hits.length - 1);

  const ref = useRef({ onReveal, hits, index, moved });
  ref.current = { onReveal, hits, index, moved };

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setCursor(0);
    setMoved(false);
  }, []);

  const toggleOption = useCallback((key: keyof FindOptions) => {
    setOptions((o) => ({ ...o, [key]: !o[key] }));
    setCursor(0);
    setMoved(false);
  }, []);

  const go = useCallback((step: 1 | -1) => {
    const { hits: h, index: i, moved: was, onReveal: reveal } = ref.current;
    if (h.length === 0) return;
    const to = was ? (i + step + h.length) % h.length : step === 1 ? i : h.length - 1;
    setCursor(to);
    setMoved(true);
    reveal(h[to]);
  }, []);
  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  return { query, setQuery, options, toggleOption, invalid, hits, index, next, prev };
}
