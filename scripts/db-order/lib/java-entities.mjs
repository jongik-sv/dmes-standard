// Java 엔티티 소스 파서: @Entity 클래스의 표 이름과 컬럼 선언 순서(상속 = 부모 먼저)를 뽑는다.
// Hibernate 를 돌리지 않고 소스만 읽는다(a0 스파이크 결정). 지원 범위 = 이 저장소 엔티티가 쓰는 모양:
//   필드 접근, @Column/@JoinColumn(name), @Id, @Version, @Transient·static·transient 제외,
//   연관(@OneToMany 등) 필드 제외, @MappedSuperclass 상속, 클래스 단위 @AttributeOverride(s).
// 범위 밖 모양(@Embedded, @Access(PROPERTY), 한 줄 여러 필드 등)은 issues 에 남긴다. 추측하지 않는다.
import fs from "node:fs";
import path from "node:path";

const RELATION = /^(OneToMany|ManyToMany|OneToOne|ManyToOne|ElementCollection)$/;

/** 주석을 지운 소스. 문자열·문자 리터럴·text block 은 그대로 둔다(@Column(name="...") 를 읽어야 하므로). */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      out += " ";
    } else if (c === '"' && src.startsWith('"""', i)) {
      const end = src.indexOf('"""', i + 3);
      const stop = end < 0 ? n : end + 3;
      out += src.slice(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** s[i] 가 여는 괄호일 때 짝 닫는 괄호 다음 위치. 문자열 안 괄호는 무시한다. */
function skipBalanced(s, i, open, close) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'") {
      j++;
      while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j + 1;
  }
  return s.length;
}

/** 텍스트 앞머리의 애노테이션들을 [{name, args}] 로 읽고 나머지 텍스트를 돌려준다. 중간 애노테이션도 걷어낸다. */
export function takeAnnotations(text) {
  const anns = [];
  let rest = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@" && /[A-Za-z]/.test(text[i + 1] ?? "")) {
      const m = /^@([\w.]+)\s*/.exec(text.slice(i));
      const name = m[1].split(".").pop();
      let j = i + m[0].length;
      let args = "";
      if (text[j] === "(") {
        const end = skipBalanced(text, j, "(", ")");
        args = text.slice(j + 1, end - 1);
        j = end;
      }
      anns.push({ name, args });
      i = j;
      continue;
    }
    rest += text[i];
    i++;
  }
  return { anns, rest };
}

const strAttr = (args, key) => {
  const m = new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`).exec(args ?? "");
  return m ? m[1] : null;
};

/** 최상위 클래스 하나를 읽는다. 멤버 = 깊이 1 에서 ';' 로 끝나는 선언(필드). '{' 로 끝나면 메서드·내부 클래스라 건너뛴다. */
export function parseJavaClass(src, file = "") {
  const code = stripComments(src);
  const issues = [];
  const head = /((?:@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*)*)(?:public\s+|protected\s+|abstract\s+|final\s+)*class\s+(\w+)(?:\s*<[^{]*?>)?(?:\s+extends\s+([\w.]+)(?:\s*<[^{]*?>)?)?[^{]*\{/.exec(code);
  if (!head) return null;
  const { anns: classAnns } = takeAnnotations(head[1]);
  const body = { start: head.index + head[0].length };
  const fields = [];
  let buf = "";
  let i = body.start;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === "\\" ? 2 : 1;
      buf += code.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "(") {
      const end = skipBalanced(code, i, "(", ")");
      buf += code.slice(i, end);
      i = end - 1;
      continue;
    }
    if (c === "{") {
      // 필드 초기값의 배열·람다 블록이면 이어서 ';' 까지 읽는다. 아니면 메서드·내부 타입이다.
      const end = skipBalanced(code, i, "{", "}");
      if (/=\s*(new\s+[\w.<>\[\]]+\s*)?$/.test(buf.trim()) || /->\s*$/.test(buf.trim())) {
        buf += code.slice(i, end);
        i = end - 1;
        continue;
      }
      buf = "";
      i = end - 1;
      continue;
    }
    if (c === "}") break;
    if (c === ";") {
      const decl = buf.trim();
      buf = "";
      if (decl) {
        const f = parseField(decl, file, issues);
        if (f) fields.push(f);
      }
      continue;
    }
    buf += c;
  }
  const ann = (n) => classAnns.find((a) => a.name === n);
  const table = ann("Table");
  const overrides = new Map();
  for (const a of classAnns.filter((x) => x.name === "AttributeOverride" || x.name === "AttributeOverrides")) {
    for (const m of a.args.matchAll(/name\s*=\s*"(\w+)"\s*,\s*column\s*=\s*@Column\s*\(([^)]*)\)/g)) {
      overrides.set(m[1], strAttr(m[2], "name"));
    }
  }
  if (ann("Access") && /PROPERTY/.test(ann("Access").args)) issues.push(`${file}: @Access(PROPERTY) 미지원`);
  return {
    file,
    name: head[2],
    extends: head[3] ? head[3].split(".").pop() : null,
    isEntity: !!ann("Entity"),
    isMappedSuperclass: !!ann("MappedSuperclass"),
    table: table ? strAttr(table.args, "name") : null,
    tableSchema: table ? strAttr(table.args, "schema") : null,
    overrides,
    fields,
    issues,
  };
}

function parseField(decl, file, issues) {
  const { anns, rest } = takeAnnotations(decl);
  const text = rest.replace(/\s+/g, " ").trim();
  if (/^(import|package)\b/.test(text)) return null;
  // 메서드 선언(추상) 은 이름 뒤에 괄호가 온다. 초기값 안 괄호는 '=' 뒤라 따로 본다.
  const lhs = text.split("=")[0];
  if (/\w\s*\(/.test(lhs)) return null;
  const mods = lhs.split(" ");
  if (mods.includes("static")) return null;
  const has = (n) => anns.some((a) => a.name === n);
  const nameM = /(\w+)\s*$/.exec(lhs.trim());
  if (!nameM) return null;
  if (/,/.test(lhs.replace(/<[^>]*>/g, ""))) issues.push(`${file}: 한 줄 여러 필드 미지원 — ${text}`);
  if (mods.includes("transient") || has("Transient")) return null;
  const relation = anns.find((a) => RELATION.test(a.name));
  if (relation) {
    if (relation.name === "ManyToOne" || relation.name === "OneToOne") {
      const jc = anns.find((a) => a.name === "JoinColumn");
      if (!jc) issues.push(`${file}: ${nameM[1]} @${relation.name} 에 @JoinColumn 없음`);
      else return { field: nameM[1], column: strAttr(jc.args, "name"), id: has("Id"), version: false };
    }
    return null;
  }
  if (has("Embedded") || has("EmbeddedId")) {
    if (has("Embedded")) issues.push(`${file}: ${nameM[1]} @Embedded 미지원`);
    // @EmbeddedId 는 PK 라 순서를 PK 제약에서 가져온다. 필드 컬럼은 비워 둔다.
    return { field: nameM[1], column: null, id: true, embeddedId: true, version: false };
  }
  const col = anns.find((a) => a.name === "Column" || a.name === "JoinColumn");
  return {
    field: nameM[1],
    column: col ? strAttr(col.args, "name") : null,
    id: has("Id"),
    version: has("Version"),
  };
}

/** 디렉터리들 아래 *.java 중 @Entity·@MappedSuperclass 를 모두 읽는다. build·archive·test 는 건너뛴다. */
export function scanJava(roots) {
  const classes = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (["build", "archive", "test", "node_modules", ".gradle"].includes(e.name)) continue;
        walk(p);
      } else if (e.name.endsWith(".java")) {
        const src = fs.readFileSync(p, "utf8");
        if (!/@(Entity|MappedSuperclass)\b/.test(src)) continue;
        const c = parseJavaClass(src, p);
        if (c && (c.isEntity || c.isMappedSuperclass)) classes.push(c);
      }
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  return classes;
}

/**
 * 엔티티마다 상속을 풀어 컬럼 목록을 만든다: [{column|null, field, id, version, from}] 부모 먼저.
 * column 이 null 이면 name 을 안 준 필드다. 실제 이름은 DDL 과 맞춰 정한다(resolveColumn).
 */
export function flattenEntities(classes) {
  const supers = new Map(classes.filter((c) => c.isMappedSuperclass).map((c) => [c.name, c]));
  const issues = classes.flatMap((c) => c.issues);
  const entities = [];
  for (const c of classes.filter((x) => x.isEntity)) {
    const chain = [];
    for (let k = c; k; k = k.extends ? supers.get(k.extends) : null) {
      chain.unshift(k);
      if (k.extends && !supers.has(k.extends) && k !== c) issues.push(`${c.file}: 부모 ${k.extends} 를 찾지 못함`);
    }
    if (c.extends && !supers.has(c.extends)) issues.push(`${c.file}: 부모 ${c.extends} 를 찾지 못함(@MappedSuperclass 아님?)`);
    const cols = [];
    for (const k of chain) {
      for (const f of k.fields) {
        const over = c.overrides.get(f.field);
        cols.push({ ...f, column: over ?? f.column, from: k.name });
      }
    }
    entities.push({ name: c.name, file: c.file, table: c.table ?? c.name, tableSchema: c.tableSchema, explicitTable: !!c.table, cols });
  }
  return { entities, issues };
}

const snakeUpper = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/** name 없는 필드의 컬럼 이름을 DDL 컬럼 집합에서 찾는다. 후보 = 필드 이름 그대로·snake. 하나만 맞아야 한다. */
export function resolveColumn(field, ddlCols) {
  const set = new Set(ddlCols.map((c) => c.toUpperCase()));
  const cands = [...new Set([field.toUpperCase(), snakeUpper(field)])].filter((x) => set.has(x));
  return cands.length === 1 ? cands[0] : null;
}
