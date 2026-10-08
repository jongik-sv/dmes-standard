/**
 * DB 뷰어 — SQL 편집 보조용 순수 함수 모음 (Monaco·React 의존 없음).
 *  - 쿼리 문장에서 FROM/JOIN 의 표·별칭 뽑기
 *  - 커서 앞뒤 글을 보고 칸 이름·값을 끼워 넣을 때 붙일 공백·쉼표 정하기
 *  - 조회 결과 셀 값을 SQL 리터럴로 바꾸기
 */

/** Oracle 위주 SQL 키워드 — 자동 완성 후보. */
export const SQL_KEYWORDS: readonly string[] = [
  "SELECT",
  "DISTINCT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "IS NULL",
  "IS NOT NULL",
  "ORDER BY",
  "GROUP BY",
  "HAVING",
  "ASC",
  "DESC",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL OUTER JOIN",
  "CROSS JOIN",
  "ON",
  "AS",
  "UNION",
  "UNION ALL",
  "MINUS",
  "INTERSECT",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "WITH",
  "CONNECT BY",
  "START WITH",
  "PRIOR",
  "ROWNUM",
  "ROWID",
  "SYSDATE",
  "SYSTIMESTAMP",
  "DUAL",
  "FETCH FIRST",
  "ROWS ONLY",
  "OFFSET",
  "NULLS FIRST",
  "NULLS LAST",
  "NVL",
  "NVL2",
  "NULLIF",
  "COALESCE",
  "DECODE",
  "TO_CHAR",
  "TO_DATE",
  "TO_NUMBER",
  "TO_TIMESTAMP",
  "TRUNC",
  "ROUND",
  "SUBSTR",
  "INSTR",
  "LENGTH",
  "UPPER",
  "LOWER",
  "TRIM",
  "LTRIM",
  "RTRIM",
  "REPLACE",
  "LPAD",
  "RPAD",
  "CONCAT",
  "ADD_MONTHS",
  "MONTHS_BETWEEN",
  "LAST_DAY",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "LISTAGG",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
  "OVER",
  "PARTITION BY",
  "CAST",
];

/** 이 단어 뒤에는 표 이름이 온다. */
const TABLE_KEYWORDS = new Set(["FROM", "JOIN", "INTO", "UPDATE", "TABLE"]);

/** 별칭으로 볼 수 없는 단어 — 표 이름 바로 뒤에 오는 절·조인 키워드. */
const NON_ALIAS = new Set([
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
]);

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
]);

export interface TableRef {
  /** 쓴 그대로의 스키마(없으면 null) — 대문자. */
  schema: string | null;
  /** 대문자 표 이름. */
  table: string;
  /** 대문자 별칭(없으면 null). */
  alias: string | null;
}

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

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$#]*)`;
const REF_RE = new RegExp(
  String.raw`^\s*(${IDENT})(?:\s*\.\s*(${IDENT}))?(\s+(?:AS\s+)?(${IDENT}))?`,
  "i",
);

function unquote(id: string): string {
  return id.startsWith('"') ? id.slice(1, -1) : id.toUpperCase();
}

/**
 * 문장 안의 FROM/JOIN 에 나온 표(별칭 포함)를 뽑는다. 서브쿼리 `FROM (` 은 건너뛰고,
 * `FROM A a, B b` 처럼 쉼표로 이은 표도 읽는다. 문법 검사는 하지 않는 느슨한 해석이다.
 */
export function extractTableRefs(sql: string): TableRef[] {
  const masked = maskCommentsAndStrings(sql);
  const refs: TableRef[] = [];
  const kw = /\b(FROM|JOIN)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = kw.exec(masked)) !== null) {
    let pos = m.index + m[0].length;
    for (let guard = 0; guard < 20; guard++) {
      const rest = masked.slice(pos);
      if (/^\s*\(/.test(rest)) break;
      const r = REF_RE.exec(rest);
      if (!r) break;
      const [whole, first, second, aliasPart, aliasName] = r;
      if (!second && NON_ALIAS.has(unquote(first))) break;
      // 별칭 자리에 온 단어가 다음 절 키워드면 별칭이 아니므로 읽은 길이에서 뺀다.
      const isAlias = !!aliasName && !NON_ALIAS.has(unquote(aliasName));
      refs.push({
        schema: second ? unquote(first) : null,
        table: unquote(second ?? first),
        alias: isAlias ? unquote(aliasName) : null,
      });
      pos += isAlias || !aliasPart ? whole.length : whole.length - aliasPart.length;
      // FROM 절의 쉼표 목록을 이어서 읽는다.
      const comma = /^\s*,/.exec(masked.slice(pos));
      if (!comma) break;
      pos += comma[0].length;
    }
  }
  return refs;
}

/** 커서 바로 앞의 `단어.접두` 에서 `.` 앞 이름(별칭·표·스키마). 없으면 null. */
export function qualifierBefore(lineBeforeCursor: string): string | null {
  const m = new RegExp(String.raw`(${IDENT})\s*\.\s*[\w$#]*$`).exec(lineBeforeCursor);
  return m ? unquote(m[1]) : null;
}

/** 커서 앞 글에서 마지막으로 나온 의미 있는 단어(대문자). 없으면 null. */
export function previousWord(before: string): string | null {
  const masked = maskCommentsAndStrings(before);
  const m = /([A-Za-z_][\w$#]*)\s*$/.exec(masked);
  return m ? m[1].toUpperCase() : null;
}

/** 커서가 표 이름 자리(FROM·JOIN 직후, 혹은 FROM 목록의 쉼표 직후)인지. */
export function isTablePosition(before: string): boolean {
  const masked = maskCommentsAndStrings(before);
  // `FROM A.` 처럼 접두를 치는 중이면 그 접두 앞 단어로 판단한다.
  const stripped = masked.replace(/(?:[\w$#"]+\s*\.\s*[\w$#]*|[\w$#]+)$/, "");
  const prev = /([A-Za-z_][\w$#]*)\s*$/.exec(stripped);
  if (prev && TABLE_KEYWORDS.has(prev[1].toUpperCase())) return true;
  // FROM A a, | — 마지막 FROM 이후로 WHERE/GROUP/ORDER/HAVING/ON 이 없고 쉼표 직후.
  if (/,\s*$/.test(stripped)) {
    const lastFrom = stripped.toUpperCase().lastIndexOf("FROM");
    if (lastFrom >= 0) {
      const tail = stripped.slice(lastFrom);
      return !/\b(WHERE|GROUP|ORDER|HAVING|ON|SELECT|CONNECT|UNION)\b/i.test(tail);
    }
  }
  return false;
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
export function columnAffixes(before: string, after: string): { prefix: string; suffix: string } {
  const clause = currentClause(before);
  const inList = clause !== null && LIST_CLAUSES.has(clause);
  const beforeTrim = before.replace(/\s+$/, "");
  const lastChar = beforeTrim.slice(-1);
  const touching = !/\s$/.test(before);
  const prevWord = previousWord(beforeTrim);
  const endsWithItem =
    /[)'"]/.test(lastChar) ||
    (/[\w$#]/.test(lastChar) && !(prevWord !== null && OPENING_WORDS.has(prevWord)));

  let prefix = "";
  if (beforeTrim === "") prefix = "";
  else if (inList && endsWithItem) prefix = ", ";
  else if (touching && /[\w$#"')]|,/.test(lastChar)) prefix = " ";

  let suffix = "";
  const nextWord = /^\s*([A-Za-z_][\w$#]*)/.exec(after)?.[1]?.toUpperCase();
  const nextIsPlainItem =
    nextWord !== undefined && !OPENING_WORDS.has(nextWord) && !NON_ALIAS.has(nextWord);
  if (inList && nextIsPlainItem) suffix = /^\s/.test(after) ? "," : ", ";
  else if (/^[\w$#"']/.test(after)) suffix = " ";
  return { prefix, suffix };
}

/** 값(SQL 리터럴 등)을 끼울 때 앞뒤에 붙일 공백 — 단어에 붙어 있을 때만. */
export function valueAffixes(before: string, after: string): { prefix: string; suffix: string } {
  return {
    prefix: /[\w$#"')]$/.test(before) ? " " : "",
    suffix: /^[\w$#"'(]/.test(after) ? " " : "",
  };
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/;
const STRING_TYPES = /^(?:N?VARCHAR2?|N?CHAR|LONG|CLOB|NCLOB|ROWID|UROWID)/i;
const DATE_TYPES = /^(?:DATE|TIMESTAMP)/i;

export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 조회 결과 셀 값 → SQL 리터럴.
 * 서버가 모든 값을 문자열로 보내므로, 같은 표의 칸 정보가 있으면 `dataType` 으로 형식을 정하고
 * 없으면 값의 모양으로 짐작한다.
 *  - null → NULL
 *  - 숫자 → 그대로(앞에 0 이 붙은 글자 `007` 은 문자열)
 *  - 날짜(소수 초 없음) → TO_DATE('…','YYYY-MM-DD HH24:MI:SS'), 소수 초가 있으면 TO_TIMESTAMP(…FF)
 *  - 그 밖 → '값'(작은따옴표 두 번)
 */
export function toSqlLiteral(value: unknown, dataType?: string | null): string {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  if (dataType && STRING_TYPES.test(dataType)) return quoteString(text);
  const isDateType = !!dataType && DATE_TYPES.test(dataType);
  if (!isDateType && NUMBER_RE.test(text)) return text;
  if (isDateType || !dataType) {
    const d = DATE_RE.exec(text);
    if (d) {
      const stamp = `${d[1]} ${d[2]}`;
      if (d[3] && /[1-9]/.test(d[3])) {
        return `TO_TIMESTAMP('${stamp}.${d[3]}','YYYY-MM-DD HH24:MI:SS.FF')`;
      }
      return `TO_DATE('${stamp}','YYYY-MM-DD HH24:MI:SS')`;
    }
  }
  return quoteString(text);
}

/** 칸·표 이름을 SQL 에 쓸 글자로 — 보통 이름(대문자·숫자·_$#)은 그대로, 소문자·공백 등이 있으면 큰따옴표로 감싼다. */
export function identifierText(name: string): string {
  return /^[A-Z][A-Z0-9_$#]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}
