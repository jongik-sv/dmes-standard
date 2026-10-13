// Oracle 마이그레이션 SQL 파서: create table 블록(컬럼 줄·PK), ALTER TABLE ADD, DROP TABLE,
// 재배치 V 파일의 MODIFY (c INVISIBLE|VISIBLE) 를 읽어 표의 최종 컬럼 순서를 흉내 낸다.
// 컬럼 정의는 줄 안에서 끝난다고 본다(한 줄에 여럿은 허용). 여러 줄에 걸치거나 읽지 못한 모양은 issues 에 남긴다.

const CONSTRAINT_HEAD = /^(constraint|primary|unique|check|foreign)\b/i;

/** 다음 위치: 문자열 리터럴(일반·q'x..x')이면 그 끝, 아니면 null. maskSql 과 같은 규칙(isQQuoteStart·literalAt). */
const litEnd = (s, i) => (s[i] === "'" || isQQuoteStart(s, i) ? literalAt(s, i).end : null);

export const splitTopComma = (s) => {
  const parts = [];
  let depth = 0;
  let cur = "";
  let dq = false;
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (dq) {
      cur += c;
      if (c === '"') dq = false;
      i++;
      continue;
    }
    const e = litEnd(s, i);
    if (e !== null) {
      cur += s.slice(i, e);
      i = e;
      continue;
    }
    if (c === '"') dq = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
    i++;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
};

export const parenBalance = (s) => {
  let d = 0;
  for (let i = 0; i < s.length; ) {
    const e = litEnd(s, i);
    if (e !== null) {
      i = e;
      continue;
    }
    if (s[i] === "(") d++;
    else if (s[i] === ")") d--;
    i++;
  }
  return d;
};

const unquote = (n) => n.replace(/"/g, "").toUpperCase();

/** 줄 끝 '--' 주석을 떼어 낸다(문자열 안 '--' 는 그대로). */
export function splitLineComment(line) {
  for (let i = 0; i < line.length; ) {
    const e = litEnd(line, i);
    if (e !== null) {
      i = e;
      continue;
    }
    if (line[i] === "-" && line[i + 1] === "-") return { code: line.slice(0, i), comment: line.slice(i) };
    i++;
  }
  return { code: line, comment: "" };
}

/**
 * 컬럼 줄을 (들여쓰기, 본문, 쉼표 여부, 주석) 으로 나눈다. 본문 = 쉼표·끝 공백 뺀 정의.
 * 다시 붙일 때는 자리(slot)의 쉼표 여부를 따른다 — 마지막 컬럼 줄이 옮겨져도 문법이 맞게.
 */
export function splitColumnLine(line) {
  const { code, comment } = splitLineComment(line);
  const indent = /^\s*/.exec(code)[0];
  let core = code.slice(indent.length).replace(/\s+$/, "");
  const comma = core.endsWith(",");
  if (comma) core = core.slice(0, -1).replace(/\s+$/, "");
  const gap = comment ? code.slice(code.replace(/\s+$/, "").length) : "";
  return { indent, core, comma, comment, gap };
}

export function joinColumnLine({ indent, core, comment, gap }, comma) {
  return `${indent}${core}${comma ? "," : ""}${comment ? gap + comment : ""}`;
}

/**
 * 주석(-- · /* *\/)과 문자열 리터럴 내용을 같은 길이의 공백으로 가린 텍스트. 글자 위치·줄 수는 원본과 같다.
 * `execute immediate '…'` 의 문자열은 실제로 실행되는 DDL 이라 가리지 않는다.
 */
export function maskSql(text) {
  const out = text.split("");
  const blank = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === "-" && text[i + 1] === "-") {
      const e = text.indexOf("\n", i);
      const stop = e < 0 ? n : e;
      blank(i, stop);
      i = stop;
    } else if (text[i] === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      const stop = e < 0 ? n : e + 2;
      blank(i, stop);
      i = stop;
    } else if (text[i] === "'" || isQQuoteStart(text, i)) {
      const lit = literalAt(text, i);
      const keep = /execute\s+immediate\s*$/i.test(out.slice(Math.max(0, i - 40), i).join(""));
      if (!keep) blank(lit.innerStart, lit.innerEnd);
      i = lit.end;
    } else i++;
  }
  return out.join("");
}

const Q_CLOSE = { "[": "]", "{": "}", "(": ")", "<": ">" };

/** `q'[..]'` · `nq'{..}'` 같은 Oracle 대체 인용 리터럴의 시작(q 글자) 위치인지. */
function isQQuoteStart(text, i) {
  const c = text[i];
  if ((c !== "q" && c !== "Q") || text[i + 1] !== "'") return false;
  const d = text[i + 2];
  if (d === undefined || /\s/.test(d) || d === "'") return false;
  const prev = text[i - 1];
  const prev2 = text[i - 2];
  if (prev && /[nN]/.test(prev) && !(prev2 && /[\w$#]/.test(prev2))) return true; // nq'…'
  return !(prev && /[\w$#"]/.test(prev));
}

/** i 에서 시작하는 문자열 리터럴(일반 '…' 또는 q'x…x'): 안쪽 범위와 끝(마지막 따옴표 다음) 위치. */
function literalAt(text, i) {
  const n = text.length;
  if (text[i] !== "'") {
    const q = text.indexOf("'", i);
    const d = text[q + 1];
    const close = (Q_CLOSE[d] ?? d) + "'";
    const e = text.indexOf(close, q + 2);
    const innerEnd = e < 0 ? n : e;
    return { innerStart: q + 2, innerEnd, end: e < 0 ? n : e + 2 };
  }
  let j = i + 1;
  while (j < n && !(text[j] === "'" && text[j + 1] !== "'")) j += text[j] === "'" ? 2 : 1;
  return { innerStart: i + 1, innerEnd: j, end: j + 1 };
}

/**
 * `execute immediate` 뒤가 단일 문자열 리터럴이 아니면(변수·`||` 이어 붙임) 실제 SQL 을 알 수 없다.
 * 그 식(다음 ';' 까지)을 가려 잘못 읽지 않게 하고 issues 에 알린다. 위치·줄 수는 그대로.
 */
function blankDynamicImmediate(masked, orig, file, issues) {
  const out = masked.split("");
  const re = /\bexecute\s+immediate\s*/gi;
  for (let m; (m = re.exec(masked)); ) {
    const start = m.index + m[0].length;
    let p = start;
    if (masked[p] === "'" || isQQuoteStart(masked, p)) {
      p = literalAt(masked, p).end;
      if (!/^\s*(;|using\b|into\b|returning\b|bulk\b)/i.test(masked.slice(p, p + 20))) {
        // 리터럴 뒤에 `||` 등이 이어진다 → 동적
      } else continue;
    }
    let e = masked.indexOf(";", p);
    if (e < 0) e = masked.length;
    for (let k = start; k < e; k++) if (out[k] !== "\n") out[k] = " ";
    const line = orig.slice(0, m.index).split("\n").length;
    issues.push(`${file}:${line} 동적 execute immediate(변수·문자열 이어 붙임)는 읽지 않음: ${orig.slice(start, e).replace(/\s+/g, " ").trim().slice(0, 50)}`);
  }
  return out.join("");
}

/** 파일들(버전 순)을 차례로 읽어 마지막에 남은 뷰 이름. 뒤 파일에서 drop view 된 것은 뺀다. */
export function liveViews(files) {
  const live = new Set();
  const re = /\b(?:create\s+(?:or\s+replace\s+)?(?:(?:no\s+)?force\s+)?(view)|drop\s+(view))\s+(?:"?\w+"?\.)?"?(\w+)"?/gi;
  for (const f of files) {
    for (const m of maskSql(f.text).matchAll(re)) {
      const name = m[3].toUpperCase();
      if (m[1]) live.add(name);
      else live.delete(name);
    }
  }
  return [...live];
}

const nameOf = (x) => unquote(/^("?[\w$#]+"?)/.exec(x)?.[1] ?? "?");

/**
 * 파일 하나를 읽어 문장 목록을 낸다. 위치(at) = 원본 글자 위치(가린 텍스트와 같다).
 * create: {kind:'create', table, startLine, endLine, colLines:[{line, name, multi, ...}], pk, declared}
 * add:    {kind:'add', table, cols:[...] } · drop: {kind:'drop', table}
 * modify: {kind:'modify', table, cols:[{name, vis:'INVISIBLE'|'VISIBLE'}]} · addPk: {kind:'addPk', table, pk}
 * 이해하지 못한 모양(괄호 없는 ALTER ADD·DROP COLUMN·RENAME·SET UNUSED·다른 create table 머리 등)은 issues 에 남긴다.
 */
export function parseSqlFile(text, file = "") {
  const lines = text.split("\n");
  const stmts = [];
  const issues = [];
  const masked = blankDynamicImmediate(maskSql(text), text, file, issues);
  const mlines = masked.split("\n");
  const lineStart = [];
  let pos = 0;
  for (const l of lines) {
    lineStart.push(pos);
    pos += l.length + 1;
  }
  for (let i = 0; i < mlines.length; i++) {
    const ct = /^\s*create\s+(global\s+temporary\s+)?table\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(\s*$/i.exec(mlines[i]);
    if (!ct) continue;
    const table = unquote(ct[2]);
    if (ct[1]) issues.push(`${file}:${i + 1} ${table} 임시 표는 INVISIBLE 재배치를 할 수 없음`);
    const colLines = [];
    let j = i + 1;
    let depth = 1;
    let closed = false;
    for (; j < mlines.length; j++) {
      const code = mlines[j];
      const t = code.trim();
      if (depth === 1 && /^\)/.test(t)) {
        closed = true;
        break;
      }
      if (!t) continue;
      const bal = parenBalance(code);
      if (depth === 1) {
        // 한 줄에 정의 여럿(`C_USR_ID …, C_AT …, …`)도 있다 — 괄호 깊이 0 의 쉼표로 나눈다(NUMBER(10,2) 안 쉼표는 그대로).
        const parts = splitTopComma(t);
        for (const part of parts) {
          if (CONSTRAINT_HEAD.test(part)) continue;
          const name = nameOf(part);
          if (bal !== 0) issues.push(`${file}:${j + 1} ${table}.${name} 컬럼 정의가 한 줄이 아님`);
          colLines.push({ line: j, name, multi: parts.length > 1, ...splitColumnLine(lines[j]) });
        }
      }
      depth += bal;
      if (depth <= 0) {
        issues.push(`${file}:${j + 1} ${table} 닫는 괄호가 컬럼 줄 끝에 있음(줄 단위 다시 쓰기 불가)`);
        closed = true;
        break;
      }
    }
    if (!closed) issues.push(`${file}:${i + 1} ${table} create table 이 닫히지 않음`);
    // 검산용·PK: 줄 구분과 무관하게 본문 전체를 쉼표로 나눠 본다(여러 줄 PK 제약도 잡힌다).
    const body = mlines.slice(i + 1, j).join(" ");
    const items = splitTopComma(body);
    const declared = items.filter((x) => !CONSTRAINT_HEAD.test(x)).map(nameOf);
    const pk = [];
    for (const x of items) {
      const m = /^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(x);
      if (m) pk.push(...m[1].split(",").map((y) => unquote(y.trim())));
      else if (!CONSTRAINT_HEAD.test(x) && /\bprimary\s+key\b/i.test(x)) pk.push(nameOf(x));
    }
    stmts.push({ kind: "create", table, startLine: i, endLine: j, colLines, pk, declared, at: lineStart[i] });
    i = j;
  }
  const creates = (masked.match(/\bcreate\s+(?:global\s+temporary\s+)?table\b/gi) ?? []).length;
  if (creates !== stmts.length) issues.push(`${file}: create table ${creates}개 중 ${stmts.length}개만 읽음(머리 모양이 다름)`);
  // ALTER·DROP 은 줄을 넘어 이어질 수 있어 가린 텍스트에서 ';' 단위로 본다. execute immediate '…' 안의 drop 도 잡는다.
  for (const m of masked.matchAll(/\bdrop\s+table\s+(?:"?\w+"?\.)?"?(\w+)"?/gi)) stmts.push({ kind: "drop", table: unquote(m[1]), at: m.index });
  for (const m of masked.matchAll(/\balter\s+table\s+(?:"?\w+"?\.)?"?(\w+)"?\s+([^;']*)/gi)) {
    const table = unquote(m[1]);
    const rest = m[2].trim();
    const at = m.index;
    const head = /^(add|modify)\s*\(/i.exec(rest);
    if (head) {
      const open = m.index + m[0].indexOf(rest) + head[0].length - 1;
      let d = 0;
      let k = open;
      for (; k < masked.length; k++) {
        if (masked[k] === "(") d++;
        else if (masked[k] === ")" && --d === 0) break;
      }
      const items = splitTopComma(masked.slice(open + 1, k));
      if (head[1].toLowerCase() === "add") {
        const cons = items.filter((x) => CONSTRAINT_HEAD.test(x));
        for (const c of cons) {
          const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(c);
          if (pk) stmts.push({ kind: "addPk", table, pk: pk[1].split(",").map((x) => unquote(x.trim())), at });
        }
        stmts.push({ kind: "add", table, cols: items.filter((x) => !CONSTRAINT_HEAD.test(x)).map(nameOf), at });
      } else {
        // MODIFY ( … ) 중 순서에 영향 있는 것 = INVISIBLE·VISIBLE 뿐. 타입·NULL 변경은 순서를 바꾸지 않는다.
        const cols = items
          .map((x) => /^("?[\w$#]+"?)\s+(INVISIBLE|VISIBLE)\s*$/i.exec(x))
          .filter(Boolean)
          .map((x) => ({ name: unquote(x[1]), vis: x[2].toUpperCase() }));
        if (cols.length) stmts.push({ kind: "modify", table, cols, at });
      }
      continue;
    }
    const pkc = /^add\s+(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(rest);
    if (pkc) {
      stmts.push({ kind: "addPk", table, pk: pkc[1].split(",").map((x) => unquote(x.trim())), at });
      continue;
    }
    // 순서와 무관한 제약·상태 변경은 넘긴다. 그 밖(괄호 없는 ADD/MODIFY, DROP COLUMN, RENAME COLUMN, SET UNUSED, DROP PRIMARY KEY …)은 알린다.
    // 괄호 없는 MODIFY <컬럼> …: INVISIBLE|VISIBLE 만이면 순서 변경, 그 밖(NOT NULL·DEFAULT·타입)은 순서와 무관해 넘긴다.
    const pm = /^modify\s+(?!partition\b|subpartition\b|lob\b|nested\b|varray\b|constraint\b|default\b|storage\b)("?[\w$#]+"?)\s+([\s\S]*)$/i.exec(rest);
    if (pm) {
      const vis = /^(INVISIBLE|VISIBLE)\s*$/i.exec(pm[2]);
      if (vis) stmts.push({ kind: "modify", table, cols: [{ name: unquote(pm[1]), vis: vis[1].toUpperCase() }], at });
      else if (!/\b(invisible|visible)\b/i.test(pm[2])) continue;
      else issues.push(`${file}:${masked.slice(0, at).split("\n").length} ${table} 이해하지 못한 ALTER: ${rest.replace(/\s+/g, " ").slice(0, 60)}`);
      continue;
    }
    if (/^(add\s+(constraint|unique|check|foreign)\b|modify\s+constraint\b|drop\s+constraint\b|rename\s+constraint\b|enable\b|disable\b|move\b|compile\b)/i.test(rest)) continue;
    const line = masked.slice(0, at).split("\n").length;
    issues.push(`${file}:${line} ${table} 이해하지 못한 ALTER: ${rest.replace(/\s+/g, " ").slice(0, 60)}`);
  }
  stmts.sort((a, b) => a.at - b.at);
  return { lines, stmts, issues };
}

/**
 * V 파일들(버전 순)을 차례로 적용해 표마다 최종 모양을 만든다: Map<table, {cols:[...], pk:[...], dropped, createdIn}>.
 * INVISIBLE 은 순서에서 빠지고 VISIBLE 은 끝에 붙는다(Oracle 동작). 모르는 컬럼을 건드리면 tables.issues 에 남긴다.
 */
export function simulate(parsedFiles) {
  const tables = new Map();
  tables.issues = [];
  for (const { file, parsed } of parsedFiles) {
    for (const s of parsed.stmts) {
      const t = tables.get(s.table);
      if (s.kind === "create") {
        tables.set(s.table, { cols: s.colLines.map((c) => c.name), hidden: [], pk: [...s.pk], dropped: false, createdIn: file, declared: [...(s.declared ?? [])] });
      } else if (!t) {
        continue; // 다른 스키마의 표·없는 표(execute immediate 안 조건부 drop 등)
      } else if (s.kind === "drop") {
        t.dropped = true;
      } else if (s.kind === "add") {
        t.cols.push(...s.cols);
        t.declared?.push(...s.cols);
      } else if (s.kind === "addPk") {
        t.pk = s.pk;
      } else if (s.kind === "modify") {
        for (const c of s.cols) {
          const from = c.vis === "INVISIBLE" ? t.cols : t.hidden;
          const to = c.vis === "INVISIBLE" ? t.hidden : t.cols;
          const k = from.indexOf(c.name);
          if (k >= 0) {
            from.splice(k, 1);
            to.push(c.name);
          } else if (!to.includes(c.name)) {
            tables.issues.push(`${file}: ${s.table}.${c.name} 없는 컬럼을 ${c.vis}`);
          }
        }
      }
    }
  }
  return tables;
}

/** "V12__x.sql" → 12. 버전 순 정렬용. */
export const versionOf = (name) => {
  const m = /^V(\d+(?:[._]\d+)*)__/.exec(name);
  return m ? m[1].split(/[._]/).map(Number) : null;
};

export const byVersion = (a, b) => {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (va[i] ?? 0) - (vb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};
