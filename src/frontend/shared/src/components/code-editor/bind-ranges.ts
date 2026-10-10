/**
 * DMES SQL 편집기 공용 — SQL 안의 바인드 변수(`:이름`) 위치 찾기(순수 함수).
 * 주석·작은따옴표 문자열 안의 `:이름` 과 `::`·`:=` 는 바인드가 아니다. 편집기가 이 범위에 강조 장식을 건다.
 */
import { maskCommentsAndStrings } from "./sql-text";

export interface BindRange {
  /** `:` 를 포함한 시작 오프셋. */
  start: number;
  /** 이름 끝 다음 오프셋(`:` 포함 길이 = end - start). */
  end: number;
  /** `:` 를 뺀 이름(쓴 그대로). */
  name: string;
}

/** `:` 앞이 단어 문자·`:` 가 아니고, 뒤가 영문자로 시작하는 이름. 숫자 바인드(`:1`)는 쓰지 않는다. */
const BIND_RE = /(?<![\w$#:]):([A-Za-z][A-Za-z0-9_]*)/g;

export function findBindRanges(sql: string): BindRange[] {
  const masked = maskCommentsAndStrings(sql);
  const out: BindRange[] = [];
  let m: RegExpExecArray | null;
  BIND_RE.lastIndex = 0;
  while ((m = BIND_RE.exec(masked)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, name: m[1] });
  }
  return out;
}
