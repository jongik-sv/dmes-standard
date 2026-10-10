/**
 * DMES SQL 편집기 공용 — SQL 글 보조 순수 함수 모음(Monaco·React 의존 없음).
 * DB 뷰어(m-analog) 편집기에서 올렸다. 주석·문자열 가리기, 커서가 든 문장 범위, 칸 이름·값을 끼울 때 붙일 공백·쉼표를 정한다.
 */

/** 별칭으로 볼 수 없는 단어 — 표 이름 바로 뒤에 오는 절·조인 키워드. */
export const NON_ALIAS_WORDS: ReadonlySet<string> = new Set([
  "WHERE",
  "ON",
  "USING",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "CROSS",
  "NATURAL",
  "OUTER",
  "GROUP",
  "ORDER",
  "HAVING",
  "UNION",
  "MINUS",
  "INTERSECT",
  "CONNECT",
  "START",
  "FETCH",
  "OFFSET",
  "FOR",
  "SET",
  "WITH",
  "AS",
  "SELECT",
  "FROM",
  "AND",
  "OR",
  "PARTITION",
  "SAMPLE",
  "PIVOT",
  "UNPIVOT",
]);

/** 칸 목록 절에서 이 단어 뒤는 이미 한 항목이 끝난 자리다(그래서 다음 항목 앞에 쉼표). */
const ITEM_END_WORDS = new Set(["ASC", "DESC", "END", "NULL"]);

/** 앞 단어가 이 중 하나면 그 뒤는 새 항목 자리다(쉼표 없이 공백만). */
const OPENING_WORDS = new Set([
  "SELECT",
  "DISTINCT",
  "UNIQUE",
  "ALL",
  "BY",
  "ASC",
  "DESC",
  "AS",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "ON",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "BETWEEN",
  "FROM",
  "JOIN",
  "SET",
  "HAVING",
  "WHEN",
  "THEN",
  "ELSE",
  "CASE",
  "END",
  "USING",
  "PRIOR",
  "FIRST",
  "LAST",
  "NULLS",
]);

/** 주석과 문자열 리터럴을 같은 길이의 공백으로 바꾼다 — 위치(오프셋)를 유지해 커서와 맞추기 위함. */
export function maskCommentsAndStrings(sql: string): string {
  const out = sql.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      let end = sql.indexOf("\n", i);
      if (end < 0) end = sql.length;
      blank(i, end);
      i = end;
    } else if (c === "/" && next === "*") {
      let end = sql.indexOf("*/", i + 2);
      end = end < 0 ? sql.length : end + 2;
      blank(i, end);
      i = end;
    } else if (c === '"') {
      // 큰따옴표 식별자는 내용을 그대로 두고 건너뛴다(안의 따옴표·주석 기호가 뒤를 가리지 않게).
      const end = sql.indexOf('"', i + 1);
      i = end < 0 ? sql.length : end + 1;
    } else if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2;
          else break;
        } else j += 1;
      }
      blank(i, j + 1);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

/** 커서(offset)가 속한 문장 범위 [start, end) — `;` 기준(주석·문자열 안의 `;` 는 무시). */
export function statementRange(sql: string, offset: number): [number, number] {
  const masked = maskCommentsAndStrings(sql);
  const start = masked.lastIndexOf(";", Math.max(0, offset - 1)) + 1;
  let end = masked.indexOf(";", offset);
  if (end < 0) end = sql.length;
  return [offset > 0 && masked[offset - 1] === ";" ? offset : start, end];
}

/** 커서 앞 글에서 마지막으로 나온 의미 있는 단어(대문자). 없으면 null. */
export function previousWord(before: string): string | null {
  const masked = maskCommentsAndStrings(before);
  const m = /([A-Za-z_][\w$#]*)\s*$/.exec(masked);
  return m ? m[1].toUpperCase() : null;
}

/** 마지막으로 열린 절 이름(SELECT·FROM·WHERE·GROUP BY·ORDER BY·HAVING·ON·SET). 없으면 null. */
function currentClause(before: string): string | null {
  const masked = maskCommentsAndStrings(before).toUpperCase();
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|ON|SET)\b/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) last = m[1].replace(/\s+/g, " ");
  return last;
}

const LIST_CLAUSES = new Set(["SELECT", "GROUP BY", "ORDER BY"]);

/**
 * 칸 이름을 커서 위치에 끼울 때 앞뒤에 붙일 글.
 *  - 앞 글자가 단어·따옴표·`)` 에 붙어 있으면 공백
 *  - SELECT·GROUP BY·ORDER BY 목록에서 앞이 이미 항목이면 `, `
 *  - 바로 뒤에 항목이 이어지면 목록 안에서는 `, `, 그 밖에는 공백
 */
export function columnAffixes(
  before: string,
  after: string,
): { prefix: string; suffix: string } {
  const clause = currentClause(before);
  const inList = clause !== null && LIST_CLAUSES.has(clause);
  const beforeTrim = before.replace(/\s+$/, "");
  const lastChar = beforeTrim.slice(-1);
  const touching = !/\s$/.test(before);
  const prevWord = previousWord(beforeTrim);
  const endsWithItem =
    /[)'"]/.test(lastChar) ||
    (/[\w$#]/.test(lastChar) &&
      !(
        prevWord !== null &&
        OPENING_WORDS.has(prevWord) &&
        !ITEM_END_WORDS.has(prevWord)
      ));

  let prefix = "";
  if (beforeTrim === "") prefix = "";
  else if (inList && endsWithItem) prefix = ", ";
  else if (touching && /[\w$#"')]|,/.test(lastChar)) prefix = " ";

  let suffix = "";
  const nextWord = /^\s*([A-Za-z_][\w$#]*)/.exec(after)?.[1]?.toUpperCase();
  const nextIsPlainItem =
    nextWord !== undefined &&
    !OPENING_WORDS.has(nextWord) &&
    !NON_ALIAS_WORDS.has(nextWord);
  if (inList && nextIsPlainItem) suffix = /^\s/.test(after) ? "," : ", ";
  else if (/^[\w$#"']/.test(after)) suffix = " ";
  return { prefix, suffix };
}

/** 값(SQL 리터럴 등)을 끼울 때 앞뒤에 붙일 공백 — 단어에 붙어 있을 때만. */
export function valueAffixes(
  before: string,
  after: string,
): { prefix: string; suffix: string } {
  return {
    prefix: /[\w$#"')]$/.test(before) ? " " : "",
    suffix: /^[\w$#"'(]/.test(after) ? " " : "",
  };
}

