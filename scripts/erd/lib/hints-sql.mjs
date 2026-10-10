// 소스의 SQL·JPQL 조인 등식(a.X = b.Y)을 근거(kind SQL_JOIN)로 캔다. 연구 방법 C(J-relation-inference.md §4)를 옮겼다.
// SQL 파서는 쓰지 않는다: 정규식 + 별칭 표. 외부 의존성 없음.

/** 표 뒤에 와도 별칭으로 보지 않는 낱말. */
export const RESERVED = new Set(
  ("WHERE ON LEFT RIGHT INNER OUTER FULL CROSS JOIN SELECT SET USING GROUP ORDER HAVING UNION AND OR WHEN " +
    "FETCH FOR START CONNECT VALUES WITH AS FROM INTO NATURAL LATERAL").split(" "),
);

const TABLE_REF =
  /(?:\b(?:FROM|JOIN|UPDATE|INTO|USING)|,)\s+(?:"?(\w+)"?\.)?"?(TB_[A-Z0-9_]+|SAMPLE_[A-Z0-9_]+)"?\b(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi;
const ENTITY_REF = /(?:\b(?:FROM|JOIN|from|join)|,)\s+([A-Z][A-Za-z0-9]+)\s+(?:(?:AS|as)\s+)?([a-z]\w*)\b/g;
// 별칭.칼럼 = 별칭.칼럼. Oracle (+) 를 허용하고, JPQL 복합 키 경로(별칭.id.필드)는 별칭.필드로 읽는다.
const EQUALITY =
  /\b([A-Za-z_]\w*)\.(?:id\.)?([A-Za-z_]\w*)\s*(?:\(\+\))?\s*=\s*(?:\(\+\)\s*)?([A-Za-z_]\w*)\.(?:id\.)?([A-Za-z_]\w*)\b(?!\.)/g;

/** 낙타형 필드 이름 → 대문자 밑줄 칼럼 이름(Spring 기본 물리 이름 규칙). */
export const snake = (x) => x.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/** Java 문자열 이어 붙이기("..." + "...")를 공백 하나로 합친다. 줄바꿈은 남겨 줄 번호가 원본과 같게 한다. */
export function joinJavaStrings(text) {
  return text.replace(/"\s*\+\s*"/g, (m) => " " + m.replace(/[^\n]/g, ""));
}

function splitAt(text, re) {
  const out = [];
  let start = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > start) out.push({ text: text.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push({ text: text.slice(start), start });
  return out;
}

/** 파일을 조각으로 나눈다. Java 는 멤버 단위, XML 은 문장 태그 단위, SQL 은 문장(;) 단위, 나머지는 파일 하나. start 는 원문 위치. */
export function segmentsOf(text, path) {
  if (path.endsWith(".java")) return splitAt(text, /\n {2,4}(?=[@\w])/g);
  if (path.endsWith(".xml")) return splitAt(text, /(?=<(?:select|update|insert|delete|sql)\b)/g);
  if (path.endsWith(".sql")) return splitAt(text, /;/g);
  return [{ text, start: 0 }];
}

/** @Entity 클래스 → { 엔티티 이름: { schema, table, fields: Map(필드 → 칼럼) } }. @Table 의 name·schema 순서는 상관없다. */
export function parseEntities(files) {
  const map = new Map();
  for (const f of files) {
    if (!f.path.endsWith(".java") || !/^@Entity\b/m.test(f.text)) continue;
    const table = /@Table\s*\(([^)]*)\)/.exec(f.text);
    const name = table && /\bname\s*=\s*"([^"]+)"/.exec(table[1]);
    const cls = /\bclass\s+(\w+)/.exec(f.text);
    if (!name || !cls) continue;
    const schema = /\bschema\s*=\s*"([^"]+)"/.exec(table[1]);
    const entityName = /@Entity\s*\(\s*name\s*=\s*"([^"]+)"/.exec(f.text)?.[1] ?? cls[1];
    const fields = new Map();
    const FIELD = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:private|protected)\s+[\w<>,.[\] ?]+?\s+(\w+)\s*(?:=[^;]*)?;/g;
    for (const m of f.text.matchAll(FIELD)) {
      const col = /@(?:Column|JoinColumn)\s*\([^)]*\bname\s*=\s*"([^"]+)"/.exec(m[1]);
      fields.set(m[2], (col ? col[1] : snake(m[2])).toUpperCase());
    }
    map.set(entityName, { schema: schema ? schema[1].toUpperCase() : null, table: name[1].toUpperCase(), fields });
  }
  return map;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * 파일 하나의 조인 등식을 캔다. 한 조각 안에서 같은 별칭 짝의 등식은 복합 조인 하나로 묶는다.
 * 같은 별칭끼리의 등식(a.X = a.Y)과 같은 표·같은 칼럼끼리의 등식(상관 하위 질의)은 뺀다.
 * @returns {Array<{a:{schema,table,columns}, b:{schema,table,columns}, ref:string}>}
 */
export function mineJoins(file, entities) {
  const text = file.path.endsWith(".java") ? joinJavaStrings(file.text) : file.text;
  const lineAt = lineIndex(text);
  const out = [];
  for (const seg of segmentsOf(text, file.path)) {
    if (!/\b(FROM|UPDATE|MERGE|JOIN)\b/i.test(seg.text) || !seg.text.includes("=")) continue;
    const alias = new Map();
    for (const m of seg.text.matchAll(TABLE_REF)) {
      const t = { schema: m[1] ? m[1].toUpperCase() : null, table: m[2].toUpperCase(), fields: null };
      alias.set(t.table, t);
      if (m[3] && !RESERVED.has(m[3].toUpperCase())) alias.set(m[3].toUpperCase(), t);
    }
    for (const m of seg.text.matchAll(ENTITY_REF)) {
      const e = entities.get(m[1]);
      if (e && !RESERVED.has(m[2].toUpperCase())) alias.set(m[2].toUpperCase(), e);
    }
    const groups = new Map();
    for (const m of seg.text.matchAll(EQUALITY)) {
      let [la, lc, ra, rc] = [m[1].toUpperCase(), m[2], m[3].toUpperCase(), m[4]];
      const l = alias.get(la);
      const r = alias.get(ra);
      if (!l || !r || la === ra) continue;
      const col = (t, c) => (t.fields ? t.fields.get(c) ?? snake(c) : c.toUpperCase());
      let left = { alias: la, t: l, c: col(l, lc) };
      let right = { alias: ra, t: r, c: col(r, rc) };
      if (left.alias > right.alias) [left, right] = [right, left];
      const key = `${left.alias}|${right.alias}`;
      const g = groups.get(key) ?? { left, right, pairs: [], offset: seg.start + m.index };
      if (!g.pairs.some(([a, b]) => a === left.c && b === right.c)) g.pairs.push([left.c, right.c]);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      if (g.left.t.table === g.right.t.table && g.pairs.every(([a, b]) => a === b)) continue;
      out.push({
        a: { schema: g.left.t.schema, table: g.left.t.table, columns: g.pairs.map((p) => p[0]) },
        b: { schema: g.right.t.schema, table: g.right.t.table, columns: g.pairs.map((p) => p[1]) },
        ref: `${file.path}:${lineAt(g.offset)}`,
      });
    }
  }
  return out;
}

const columnList = (s) =>
  s
    .split(",")
    .map((c) => c.trim().replace(/"/g, "").replace(/\s+(ASC|DESC)$/i, "").toUpperCase())
    .filter(Boolean);

/**
 * Flyway V 파일 본문들(버전 순)에서 표별 PK·UK 칼럼을 읽는다. drop table 은 표를 지운다.
 * 함수 기반 고유 인덱스(칼럼 이름만으로 이루어지지 않은 것)는 뺀다. PL/SQL 블록 안 문장은 읽지 않는다.
 * @returns {Map<string, {pk: string[]|null, uks: string[][]}>}
 */
export function parseDdl(texts) {
  const keys = new Map();
  const entry = (t) => {
    const k = t.toUpperCase();
    if (!keys.has(k)) keys.set(k, { pk: null, uks: [] });
    return keys.get(k);
  };
  for (const text of texts) {
    for (const raw of text.replace(/--[^\n]*/g, "").split(";")) {
      const s = raw.trim();
      let m;
      if ((m = /^create\s+table\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(/i.exec(s))) {
        const e = entry(m[1]);
        const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(s);
        if (pk) e.pk = columnList(pk[1]);
        for (const u of s.matchAll(/\bunique\s*\(([^)]*)\)/gi)) e.uks.push(columnList(u[1]));
      } else if ((m = /^create\s+unique\s+index\s+\S+\s+on\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(([\s\S]*)\)\s*$/i.exec(s))) {
        const plain = m[2].split(",").every((c) => /^\s*"?\w+"?(\s+(ASC|DESC))?\s*$/i.test(c));
        if (plain && keys.has(m[1].toUpperCase())) entry(m[1]).uks.push(columnList(m[2]));
      } else if ((m = /^alter\s+table\s+(?:"?\w+"?\.)?"?(\w+)"?\s+add\s+(?:constraint\s+\S+\s+)?(primary\s+key|unique)\s*\(([^)]*)\)/i.exec(s))) {
        const e = entry(m[1]);
        if (/^primary/i.test(m[2])) e.pk = columnList(m[3]);
        else e.uks.push(columnList(m[3]));
      } else if ((m = /^drop\s+table\s+(?:"?\w+"?\.)?"?(\w+)"?/i.exec(s))) {
        keys.delete(m[1].toUpperCase());
      }
    }
  }
  return keys;
}

const sameSet = (a, b) => a && a.length === b.length && a.every((c) => b.includes(c));

function keyOf(keys, side) {
  const k = keys.get(side.table);
  if (k && sameSet(k.pk, side.columns)) return { score: 2, order: k.pk };
  const uk = k && k.uks.find((u) => sameSet(u, side.columns));
  return uk ? { score: 1, order: uk } : { score: 0, order: null };
}

const sideText = (s) => `${s.table}(${s.columns.join(",")})`;

/**
 * 조인 하나의 방향을 정한다. 칼럼이 그 표의 PK 와 같은 쪽(2) > UK 와 같은 쪽(1) > 나머지(0) 가 부모다.
 * 같으면 표 이름이 다른 쪽의 앞부분인 쪽(TB_X 와 TB_X_HIS 의 TB_X)이 부모, 그래도 같으면 "표(칼럼)" 글이 작은 쪽이 부모다.
 * 짝 순서는 부모 키 순서(키가 없으면 부모 칼럼 이름 순)로 맞춘다.
 */
export function orientJoin(join, keys) {
  const ka = keyOf(keys, join.a);
  const kb = keyOf(keys, join.b);
  let aIsParent;
  if (ka.score !== kb.score) aIsParent = ka.score > kb.score;
  else if (join.a.table !== join.b.table && join.b.table.startsWith(join.a.table)) aIsParent = true;
  else if (join.a.table !== join.b.table && join.a.table.startsWith(join.b.table)) aIsParent = false;
  else aIsParent = sideText(join.a) < sideText(join.b);
  const [parent, child, order] = aIsParent ? [join.a, join.b, ka.order] : [join.b, join.a, kb.order];
  const idx = parent.columns.map((_, i) => i);
  const rank = (i) => (order ? order.indexOf(parent.columns[i]) : 0);
  idx.sort((x, y) => rank(x) - rank(y) || (parent.columns[x] < parent.columns[y] ? -1 : parent.columns[x] > parent.columns[y] ? 1 : 0));
  return {
    kind: "SQL_JOIN",
    child: { schema: child.schema, table: child.table, columns: idx.map((i) => child.columns[i]) },
    parent: { schema: parent.schema, table: parent.table, columns: idx.map((i) => parent.columns[i]) },
    ref: join.ref,
  };
}
