/**
 * DB 뷰어 — SQL 편집 보조용 순수 함수 모음 (Monaco·React 의존 없음).
 *  - 쿼리 문장에서 FROM/JOIN 의 표·별칭 뽑기
 *  - 조회 결과 셀 값을 SQL 리터럴로 바꾸기
 * 주석·문자열 가리기, 문장 범위, 칸 이름·값을 끼울 때 붙일 공백·쉼표, 키워드 목록은 공용 편집기
 * (@dk-oasis/shared/code-editor)로 올렸다.
 */

import {
  NON_ALIAS_WORDS,
  maskCommentsAndStrings,
} from "@dk-oasis/shared/code-editor";

/** 이 단어 뒤에는 표 이름이 온다. */
const TABLE_KEYWORDS = new Set(["FROM", "JOIN", "INTO", "UPDATE", "TABLE"]);

export interface TableRef {
  /** 쓴 그대로의 스키마(없으면 null) — 대문자. */
  schema: string | null;
  /** 대문자 표 이름. */
  table: string;
  /** 대문자 별칭(없으면 null). */
  alias: string | null;
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
      const paren = /^\s*\(/.exec(rest);
      if (paren) {
        // 서브쿼리 `( … ) 별칭` 은 표로 읽지 않고 건너뛴 뒤 쉼표 목록을 이어 읽는다.
        let depth = 0;
        let k = paren[0].length - 1;
        for (; k < rest.length; k++) {
          if (rest[k] === "(") depth += 1;
          else if (rest[k] === ")" && --depth === 0) break;
        }
        if (k >= rest.length) break;
        const tail = /^\s*(?:AS\s+)?[\w$#"]*\s*,/i.exec(rest.slice(k + 1));
        if (!tail) break;
        pos += k + 1 + tail[0].length;
        continue;
      }
      const r = REF_RE.exec(rest);
      if (!r) break;
      const [whole, first, second, aliasPart, aliasName] = r;
      if (!second && NON_ALIAS_WORDS.has(unquote(first))) break;
      // 별칭 자리에 온 단어가 다음 절 키워드면 별칭이 아니므로 읽은 길이에서 뺀다.
      const isAlias = !!aliasName && !NON_ALIAS_WORDS.has(unquote(aliasName));
      refs.push({
        schema: second ? unquote(first) : null,
        table: unquote(second ?? first),
        alias: isAlias ? unquote(aliasName) : null,
      });
      pos +=
        isAlias || !aliasPart ? whole.length : whole.length - aliasPart.length;
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
  const m = new RegExp(String.raw`(${IDENT})\s*\.\s*[\w$#]*$`).exec(
    lineBeforeCursor,
  );
  return m ? unquote(m[1]) : null;
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
    const froms = [...stripped.matchAll(/\bFROM\b/gi)];
    // 뒤에서부터 보며, 괄호가 닫힌 서브쿼리 안의 FROM 은 건너뛰고 지금 문장 단계의 FROM 을 찾는다.
    for (let i = froms.length - 1; i >= 0; i--) {
      const tail = stripped.slice(froms[i].index);
      let depth = 0;
      let closedBelowStart = false;
      for (const ch of tail) {
        if (ch === "(") depth += 1;
        else if (ch === ")" && --depth < 0) {
          closedBelowStart = true;
          break;
        }
      }
      if (closedBelowStart) continue;
      return (
        depth === 0 &&
        !/\b(WHERE|GROUP|ORDER|HAVING|ON|SELECT|CONNECT|UNION)\b/i.test(tail)
      );
    }
  }
  return false;
}

const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
/** 숫자 모양이되 앞에 0 이 붙은 정수(`007`)는 제외하지 않는다 — 숫자 형식 칸이면 그대로 숫자다. */
const LOOSE_NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/;
/** 시간대가 붙은 TIMESTAMP 글자 — `2026-09-01 00:00:00.0 +09:00` (지역 이름 형식은 글자로 둔다). */
const TIMESTAMP_TZ_RE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*([+-]\d{2}:\d{2})$/;
const STRING_TYPES = /^(?:N?VARCHAR2?|N?CHAR|LONG|CLOB|NCLOB|ROWID|UROWID)/i;
const NUMBER_TYPES = /^(?:NUMBER|FLOAT|INTEGER|INT|SMALLINT|DECIMAL|NUMERIC|BINARY_(?:FLOAT|DOUBLE))/i;
const DATE_TYPES = /^(?:DATE|TIMESTAMP)/i;

/** 소수 초 글자 → `.123`. 0 뿐이거나 없으면 빈 글자. */
function fractionOf(digits: string | undefined): string {
  return digits && /[1-9]/.test(digits) ? `.${digits.replace(/0+$/, "")}` : "";
}

export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 조회 결과 셀 값 → SQL 리터럴.
 * 서버가 모든 값을 문자열로 보내므로, 같은 표의 칸 정보가 있으면 `dataType` 으로 형식을 정하고
 * 없으면(별칭 칸·조인 결과) 값의 모양으로 짐작한다.
 *  - null·빈 글자 → NULL (오라클은 빈 문자열을 NULL 로 다루고, 서버도 SQL NULL 을 null 로 보낸다)
 *  - 문자 형식(CHAR·VARCHAR2·NCHAR 등) → '값'(작은따옴표 두 번)
 *  - 숫자 형식(NUMBER·FLOAT 등) → 그대로
 *  - DATE·TIMESTAMP → `TIMESTAMP '…'` (시간이 자정이면 `DATE '…'`), 시간대가 있으면 `TIMESTAMP '… +09:00'`
 *    서버가 괄호를 거부하므로(TO_DATE(…) 는 실행되지 않는다) 괄호 없는 ANSI 리터럴을 쓰고,
 *    NLS 날짜 형식과도 무관하다.
 *  - 형식을 모를 때: 숫자 모양은 그대로(앞에 0 이 붙은 글자 `007` 은 문자열), 날짜 모양은 날짜
 *  - 그 밖(형식을 아는 RAW·INTERVAL 등 포함) → '값'
 */
export function toSqlLiteral(value: unknown, dataType?: string | null): string {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  if (text === "") return "NULL";
  if (dataType && STRING_TYPES.test(dataType)) return quoteString(text);
  if (dataType && NUMBER_TYPES.test(dataType)) {
    return LOOSE_NUMBER_RE.test(text) ? text : quoteString(text);
  }
  const isDateType = !!dataType && DATE_TYPES.test(dataType);
  // 형식을 아는데 문자·숫자·날짜가 아니면(RAW·INTERVAL 등) 값 모양으로 짐작하지 않고 글자로 둔다.
  if (dataType && !isDateType) return quoteString(text);
  if (!isDateType && NUMBER_RE.test(text)) return text;
  if (isDateType || !dataType) {
    const tz = TIMESTAMP_TZ_RE.exec(text);
    if (tz) {
      return `TIMESTAMP '${tz[1]} ${tz[2]}${fractionOf(tz[3])} ${tz[4]}'`;
    }
    const d = DATE_RE.exec(text);
    if (d) {
      const fraction = fractionOf(d[3]);
      if (d[2] === "00:00:00" && fraction === "") return `DATE '${d[1]}'`;
      return `TIMESTAMP '${d[1]} ${d[2]}${fraction}'`;
    }
  }
  return quoteString(text);
}

/** 칸·표 이름을 SQL 에 쓸 글자로 — 보통 이름(대문자·숫자·_$#)은 그대로, 소문자·공백 등이 있으면 큰따옴표로 감싼다. */
export function identifierText(name: string): string {
  return /^[A-Z][A-Z0-9_$#]*$/.test(name)
    ? name
    : `"${name.replace(/"/g, '""')}"`;
}

/**
 * 표 제안으로 넣을 글자. 이 화면은 서버가 `FROM 스키마.표` 형식만 받으므로(스키마 생략 불가) 스키마를 붙인다.
 * 이미 `스키마.` 를 친 뒤라면(`schema` 를 null 로) 표 이름만 넣는다.
 */
export function tableInsertText(schema: string | null, table: string): string {
  const name = identifierText(table);
  return schema === null ? name : `${identifierText(schema)}.${name}`;
}
