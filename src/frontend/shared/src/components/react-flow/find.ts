/**
 * 찾기 위젯 상태 형식과 일치 판정(룰 세트 편집기 state/useFind.ts 복사본, 업무 모델 검색 함수는 뺐다). React 의존이 없다.
 * 옵션 셋(VS Code 찾기 위젯과 같다): 대소문자 구분 · 단어 단위 · 정규식. 끄면 대소문자를 무시한 부분 일치다.
 * 잘못된 정규식은 예외를 내지 않고 INVALID_FIND 로 알린다. 빈 글자 일치(`x*` 등)는 결과로 치지 않는다.
 */
export interface FindOptions {
  /** 대소문자 구분(Aa). */
  caseSensitive: boolean;
  /** 단어 단위(ab) — 일치 앞뒤가 글자·숫자·밑줄이 아니어야 한다. */
  wholeWord: boolean;
  /** 정규식(.*). */
  regex: boolean;
}

export const DEFAULT_FIND_OPTIONS: Readonly<FindOptions> = { caseSensitive: false, wholeWord: false, regex: false };

/** 찾기 위젯이 읽는 상태 — 화면의 찾기 훅이 만든다. */
export interface FindState {
  query: string;
  setQuery(q: string): void;
  options: FindOptions;
  toggleOption(key: keyof FindOptions): void;
  /** 정규식 옵션이 켜져 있고 글자가 정규식으로 잘못됐다(결과 0건). */
  invalid: boolean;
  /** 찾은 대상 ID(화면이 정한 순서). */
  hits: string[];
  /** 지금 가리키는 hits 순번(없으면 -1). */
  index: number;
  next(): void;
  prev(): void;
}

/** 글자 하나가 단어 글자(글자·숫자·밑줄 — 한글 포함)인가. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const isWordChar = (ch: string | undefined): boolean => !!ch && WORD_CHAR.test(ch);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 잘못된 정규식 표시. */
export const INVALID_FIND = "invalid" as const;
export type FindMatcher = (text: string) => boolean;

/** 질의·옵션으로 일치 판정 함수를 만든다. 빈 질의면 null, 정규식이 잘못됐으면 INVALID_FIND. 단어 단위는 일치 앞뒤 글자를 유니코드로 본다. */
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
