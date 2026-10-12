/**
 * 로그 분석 (anl/logViewer) — Tree 탭 모델.
 * GET log/range/time/tree 응답(Workspace.jsonData)을 Tree 탭이 그리는 노드 모델로 바꾸고,
 * 보이는 행 계산·검색·값 바인딩 같은 순수 함수를 둔다(화면 코드는 tree-tab.tsx).
 *
 * 응답 노드 = `{ property: { objectType, … }, child: [ 노드 | 문자열 ] }`. 실제 계층은 Request → Process → Task → Query.
 *  - objectType 대응: Request→REQ, Service·Process→SVC, Task→TSK, Query→SQL. 모르는 objectType 은 원문 그대로 배지.
 *  - 서브서비스: 로그 "Sub-service [X] start." 는 objectType "Service" 노드로 호출한 Task 아래에 중첩되어 오고,
 *    호출한 부모 노드 property 에 `hasSubService: "y"` 가 붙는다. objectType "SubService" 는 따로 없다.
 *    그래서 Task 바로 아래에 중첩된 objectType Service 노드만 kind SUB(레거시 뷰어의 SUB 배지)로 보인다.
 *    "Service [X] start." 로 생긴 최상위 Service 와 그 아래 Process 는 SVC 로 둔다(Request > Service > Process > Task).
 *    sub 호출 부모는 `subMark` 로 "s" 표식을 받는다(Request 는 최상위 서비스 때문에 플래그만 있으므로 제외).
 *  - child 의 문자열 → MSG. Query 바로 뒤의 `binding parameter (1:BIGINT) <- [185]` 문자열은 그 SQL 의 Param 이 되고
 *    트리에서는 그 SQL 아래 BND 자식으로 묶는다. property.exception → ERR 자식.
 *  - runTime 은 문자열·숫자로 모두 와서 숫자로 맞춘다. 문자열 "More......" 는 생략 표식이지만 일반 MSG 로 둔다.
 */

/** 배지 코드. 모르는 objectType 은 원문이 들어가므로 string. */
export type TreeKind = string;

/** 연속 MSG 묶음 노드의 kind — 배지는 MSG 로 보이고 children 이 묶인 MSG 들이다. */
export const MSG_GROUP = "MSGS";

/** SQL 의 바인딩 값 하나. */
export interface TreeParam {
  idx: number;
  type: string;
  value: string;
}

export interface TreeNode {
  /** 변환 순서로 매긴 유일 키. */
  id: string;
  /** 배지 글자 — REQ·SVC·SUB·TSK·SQL·MSG·BND·ERR, 모르는 종류는 objectType 원문. */
  kind: TreeKind;
  /** 응답 objectType 원문(문자열·BND·ERR 노드는 없음). */
  objectType?: string;
  /** 트리에 보일 이름. */
  label: string;
  /** MSG·BND·ERR 의 전문. */
  text?: string;
  /** SQL 노드: 앞뒤 빈 줄·공통 들여쓰기를 걷은 SQL, 바인딩 값. */
  sql?: string;
  params?: TreeParam[];
  /** 응답 property 원본(속성 패널용). */
  prop: Record<string, unknown>;
  /** 서브서비스를 부른 노드(property.hasSubService === "y" 이거나 SUB 자식이 있음) — 행에 "s" 표식. Request 는 제외. */
  subMark: boolean;
  /** 시작 시각(ms, 시각 문자열을 UTC 로 해석 — 차이 계산·표시 전용). */
  startMs?: number;
  /** 수행시간(ms). */
  runTime?: number;
  /** ERR 이거나 자기 아래에 ERR 가 있음. */
  hasError: boolean;
  /** 검색용 소문자 텍스트(이름·SQL·메시지). */
  searchText: string;
  children: TreeNode[];
}

/** Request 하나의 요약과 트리 뿌리. */
export interface TreeRequest {
  root: TreeNode;
  name: string;
  serviceTag: string;
  thread: string;
  /** 구간 시작·끝 (표시용 시각 문자열, 모르면 빈 문자열). */
  start: string;
  end: string;
  runTime?: number;
  sqlCount: number;
  msgCount: number;
  errorCount: number;
}

const KIND_BY_TYPE: Record<string, TreeKind> = {
  Request: "REQ",
  Service: "SVC",
  Process: "SVC",
  Task: "TSK",
  Query: "SQL",
};

/** 알려진 종류 밖이어도 이름에 Service·Process 가 들면 서비스 노드로 본다(실제 응답엔 없는 대비용 폴백). */
const SERVICE_LIKE_RE = /service|process/i;
const BIND_RE = /^binding parameter \((\d+):([A-Za-z_]+)\) <- \[(.*)\]$/s;
const NUM_TYPES = /INT|NUMERIC|DECIMAL|DOUBLE|FLOAT|REAL|NUMBER/i;
const TS_RE = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:[.,](\d{1,3}))?/;

/** 속성 패널에 이 순서로 먼저 보여 줄 property 키. */
const PROP_ORDER = ["objectName", "objectId", "request", "thread", "serviceTag", "hasQuery"];
const SKIP_PROPS = new Set(["objectType", "timestamp", "runTime", "query", "params", "exception", "child"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** runTime 은 문자열·숫자로 모두 온다 → 숫자로, 못 읽으면 undefined. */
export function normalizeRunTime(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** "YYYY-MM-DD HH:mm:ss.SSS" → ms (UTC 로 해석. 시간대 변환 없이 차이·표시만 쓴다). */
export function parseTimestamp(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = TS_RE.exec(v.trim());
  if (!m) return undefined;
  const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** ms → "YYYY-MM-DD HH:mm:ss.SSS" (parseTimestamp 의 역). */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

export function formatRunTime(ms: number): string {
  return `${ms.toLocaleString("ko-KR")} ms`;
}

/** 수행시간 히트맵 단계(0=없음, 1~5) — 서비스 목록 anl-heat-N 과 같은 경계. */
export function heatLevel(runTime: number | undefined): 0 | 1 | 2 | 3 | 4 | 5 {
  if (runTime === undefined) return 0;
  if (runTime >= 5000) return 5;
  if (runTime >= 4000) return 4;
  if (runTime >= 3000) return 3;
  if (runTime >= 2000) return 2;
  if (runTime >= 1000) return 1;
  return 0;
}

/** Hibernate 서식 SQL 정리 — 앞뒤 빈 줄과 공통 들여쓰기를 걷어 낸다. */
export function cleanSql(query: unknown): string {
  const lines = str(query).replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    indent = Math.min(indent, line.length - line.trimStart().length);
  }
  if (!Number.isFinite(indent)) return lines.join("\n");
  return lines.map((l) => l.slice(indent)).join("\n");
}

/** 노드 라벨 — "SELECT · tb_mdm_domain" (첫 키워드 + from/into/update 대상). */
export function sqlTitle(sql: string): string {
  const kw = /^\s*(\w+)/.exec(sql)?.[1] ?? "SQL";
  const table = /\b(?:from|into|update)\s+([\w.$]+)/i.exec(sql)?.[1];
  return kw.toUpperCase() + (table ? ` · ${table}` : "");
}

/** SQL 의 `?` 를 params 순서대로 값으로 바꾼다. 숫자 타입은 따옴표 없이, 나머지는 '값'. 값이 모자라면 `?` 유지. */
export function bindParams(sql: string, params: readonly TreeParam[]): string {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const pm = params[i++];
    if (!pm) return "?";
    if (/^\s*null\s*$/i.test(pm.value)) return "null";
    // 타입을 모르는 값(property.params)은 숫자 모양이면 따옴표 없이 쓴다.
    const numeric = pm.type ? NUM_TYPES.test(pm.type) : /^[+-]?\d+(?:\.\d+)?$/.test(pm.value.trim());
    return numeric ? pm.value.trim() : `'${pm.value.replace(/'/g, "''")}'`;
  });
}

/** 호출이 달라도 id 가 겹치지 않게 모듈에서 센다(새 조회 직후 이전 선택·펼침 id 와 충돌 방지). */
let nodeSeq = 0;

class Builder {
  private nextId(): string {
    return `n${nodeSeq++}`;
  }

  private leaf(kind: TreeKind, text: string, label = text): TreeNode {
    return {
      id: this.nextId(),
      kind,
      label,
      text,
      prop: {},
      subMark: false,
      hasError: kind === "ERR",
      searchText: text.toLowerCase(),
      children: [],
    };
  }

  /** 같은 부모 아래 연달아 나온 MSG 2개 이상을 묶음 노드(MSGS) 하나로 줄인다. 1개짜리·다른 노드 사이는 그대로. */
  private groupMessages(kids: TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    let run: TreeNode[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const first = run[0].text ?? "";
        out.push({
          id: this.nextId(),
          kind: MSG_GROUP,
          label: first.split("\n", 1)[0],
          prop: {},
          subMark: false,
          hasError: false,
          searchText: "",
          children: run,
        });
      } else out.push(...run);
      run = [];
    };
    for (const k of kids) {
      if (k.kind === "MSG") run.push(k);
      else {
        flush();
        out.push(k);
      }
    }
    flush();
    return out;
  }

  /** parentKind: 부모 노드 kind — Request 아래가 아닌 서비스 노드를 SUB 로 가르는 데 쓴다(뿌리는 undefined). */
  node(raw: unknown, parentKind?: TreeKind): TreeNode {
    if (typeof raw === "string") return this.leaf("MSG", raw);
    const rec = isRecord(raw) ? raw : {};
    const prop = isRecord(rec.property) ? rec.property : {};
    const objectType = str(prop.objectType);
    let kind =
      KIND_BY_TYPE[objectType] ??
      (prop.exception ? "ERR" : SERVICE_LIKE_RE.test(objectType) ? "SVC" : objectType || "?");
    // Sub-service 는 서비스 호출 Task 가 부르므로 Task 바로 아래의 objectType Service 만 SUB.
    // Process 는 SUB 가 되지 않고, Request·다른 서비스 바로 아래 Service(ServiceStart)도 SVC 다.
    if (kind === "SVC" && objectType === "Service" && parentKind === "TSK") kind = "SUB";
    const node: TreeNode = {
      id: this.nextId(),
      kind,
      objectType: objectType || undefined,
      label: "",
      prop,
      startMs: parseTimestamp(prop.timestamp),
      runTime: normalizeRunTime(prop.runTime),
      subMark: false,
      hasError: false,
      searchText: "",
      children: [],
    };
    if (kind === "SQL") {
      node.sql = cleanSql(prop.query);
      // 바인딩 값 두 경로: property.params 배열(타입 모름), 뒤따르는 binding parameter 문자열(타입 있음).
      node.params = Array.isArray(prop.params)
        ? prop.params.map((v, i) => ({ idx: i + 1, type: "", value: str(v) }))
        : [];
      node.label = sqlTitle(node.sql);
    } else {
      const name = str(prop.objectName);
      const id = str(prop.objectId);
      node.label = name ? `${name}${id ? ` (${id})` : ""}` : id || str(prop.request) || objectType || "?";
    }

    const child = Array.isArray(rec.child) ? rec.child : [];
    let lastSql: TreeNode | null = null;
    for (const c of child) {
      if (typeof c === "string") {
        const m = BIND_RE.exec(c);
        if (m && lastSql) {
          lastSql.params?.push({ idx: Number(m[1]), type: m[2], value: m[3] });
          lastSql.children.push(this.leaf("BND", c));
          continue;
        }
      }
      const k = this.node(c, kind);
      if (k.kind === "SQL") lastSql = k;
      else if (k.kind !== "MSG") lastSql = null;
      node.children.push(k);
    }
    node.children = this.groupMessages(node.children);
    const exceptions = Array.isArray(prop.exception) ? prop.exception : prop.exception ? [prop.exception] : [];
    if (kind === "ERR") {
      // objectType 이 없고 exception 만 있는 노드 — 노드 자신이 오류이므로 같은 내용을 자식으로 또 만들지 않는다.
      node.text = exceptions.map(str).join("\n");
      node.label = node.text.split("\n", 1)[0] || "Exception";
    } else {
      for (const e of exceptions) {
        const text = str(e);
        node.children.push(this.leaf("ERR", text, text.split("\n", 1)[0]));
      }
    }

    if (kind === "REQ") {
      const first = child.find((c): c is string => typeof c === "string");
      node.label = first || str(prop.request) || "Request";
      const proc = node.children.find((k) => k.kind === "SVC");
      if (node.runTime === undefined && proc) node.runTime = proc.runTime;
    }

    node.subMark = kind !== "REQ" && (str(prop.hasSubService).toLowerCase() === "y" || node.children.some((k) => k.kind === "SUB"));
    node.hasError = kind === "ERR" || node.children.some((k) => k.hasError);
    node.searchText = [node.label, node.sql ?? ""].join(" ").toLowerCase();
    return node;
  }
}

function countKinds(node: TreeNode, acc: { sql: number; msg: number; err: number }): void {
  if (node.kind === "SQL") acc.sql += 1;
  else if (node.kind === "MSG") acc.msg += 1;
  else if (node.kind === "ERR") acc.err += 1;
  node.children.forEach((c) => countKinds(c, acc));
}

/** 응답 전체 → Request 목록. 모양이 달라 읽을 수 없으면 빈 배열. */
export function toTreeRequests(data: unknown): TreeRequest[] {
  const list = Array.isArray(data) ? data : isRecord(data) ? [data] : [];
  const builder = new Builder();
  const out: TreeRequest[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const root = builder.node(raw);
    const acc = { sql: 0, msg: 0, err: 0 };
    countKinds(root, acc);
    const end =
      root.startMs !== undefined && root.runTime !== undefined ? formatTimestamp(root.startMs + root.runTime) : "";
    out.push({
      root,
      name: root.label,
      serviceTag: str(root.prop.serviceTag),
      thread: str(root.prop.thread),
      start: root.startMs !== undefined ? formatTimestamp(root.startMs) : str(root.prop.timestamp),
      end,
      runTime: root.runTime,
      sqlCount: acc.sql,
      msgCount: acc.msg,
      errorCount: acc.err,
    });
  }
  return out;
}

/** 속성 패널 줄 — ObjectType 다음 알려진 키 순서, 그 뒤 나머지 property. */
export interface TreeProp {
  key: string;
  value: string;
  mono?: boolean;
}

export function propsOf(node: TreeNode): TreeProp[] {
  const out: TreeProp[] = [];
  if (node.kind === MSG_GROUP) {
    return [
      { key: "ObjectType", value: "Message" },
      { key: "Count", value: String(node.children.length) },
    ];
  }
  if (node.kind === "MSG" || node.kind === "BND" || node.kind === "ERR") {
    out.push({ key: "ObjectType", value: node.kind === "ERR" ? "Exception" : "Message" });
    return out;
  }
  out.push({ key: "ObjectType", value: node.objectType ?? node.kind });
  const seen = new Set<string>();
  const add = (k: string) => {
    const v = node.prop[k];
    if (v === undefined || v === null || v === "") return;
    seen.add(k);
    out.push({ key: k[0].toUpperCase() + k.slice(1), value: str(v), mono: k === "objectId" || k === "thread" });
  };
  PROP_ORDER.forEach(add);
  for (const k of Object.keys(node.prop)) if (!seen.has(k) && !SKIP_PROPS.has(k)) add(k);
  return out;
}

/** 서비스 노드(최상위 SVC · 중첩 SUB). */
const isService = (k: TreeKind) => k === "SVC" || k === "SUB";

/** 기본 펼침: 뿌리, 서비스(SVC·SUB), 그리고 SQL·서비스를 가진 TSK. */
export function defaultExpanded(root: TreeNode | undefined): Set<string> {
  const open = new Set<string>();
  if (!root) return open;
  const walk = (n: TreeNode) => {
    if (n.kind === "REQ" || isService(n.kind) || (n.kind === "TSK" && n.children.some((k) => k.kind === "SQL" || isService(k.kind)))) {
      open.add(n.id);
    }
    n.children.forEach(walk);
  };
  walk(root);
  return open;
}

/** 자식이 있는 모든 노드. */
export function allExpandable(root: TreeNode | undefined): Set<string> {
  const open = new Set<string>();
  const walk = (n: TreeNode) => {
    if (n.children.length > 0) open.add(n.id);
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return open;
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
  open: boolean;
  /** 보이는 자식이 있는가(MSG 숨김 등 필터 반영). */
  hasKids: boolean;
  /** 검색·오류 경로 때문에 강제로 펼쳐진 상태 — 토글을 눌러도 보이는 변화가 없다. */
  forced: boolean;
}

export interface FlattenOptions {
  query: string;
  errOnly: boolean;
  /** SQL·업무 노드만 — MSG·BND 숨김. */
  bizOnly: boolean;
}

const BIZ_KINDS = new Set(["REQ", "SVC", "SUB", "TSK", "SQL", "ERR"]);

/**
 * 화면에 그릴 행(펼친 노드만). 검색어가 있으면 일치 노드와 조상만 남기고 조상을 펼친다.
 * 오류 경로만 = 오류가 든 가지만, 모두 펼침. 업무 노드만 = MSG·BND 숨김.
 */
export function flattenRows(root: TreeNode | undefined, expanded: ReadonlySet<string>, opt: FlattenOptions): TreeRow[] {
  if (!root) return [];
  const q = opt.query.trim().toLowerCase();
  const keep = new Set<string>();
  const shown = (n: TreeNode) => !(opt.bizOnly && !BIZ_KINDS.has(n.kind));
  if (q) {
    const mark = (n: TreeNode): boolean => {
      let any = shown(n) && n.searchText.includes(q);
      for (const c of n.children) if (mark(c)) any = true;
      if (any) keep.add(n.id);
      return any;
    };
    if (!mark(root)) return [];
  }
  const visible = (n: TreeNode) => shown(n) && (!q || keep.has(n.id)) && (!opt.errOnly || n.hasError);
  const rows: TreeRow[] = [];
  const walk = (n: TreeNode, depth: number) => {
    const kids = n.children.filter(visible);
    const open = kids.length > 0 && (q || opt.errOnly ? true : expanded.has(n.id));
    rows.push({ node: n, depth, open, hasKids: kids.length > 0, forced: Boolean(q) || opt.errOnly });
    if (open) kids.forEach((k) => walk(k, depth + 1));
  };
  walk(root, 0);
  return rows;
}

/** id 로 노드를 찾는다. */
export function findNode(root: TreeNode | undefined, id: string): TreeNode | undefined {
  if (!root) return undefined;
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}

/** 처음 보여 줄 선택 노드 — 첫 SQL, 없으면 뿌리. */
export function firstSelection(root: TreeNode | undefined): TreeNode | undefined {
  if (!root) return undefined;
  const stack: TreeNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop() as TreeNode;
    if (n.kind === "SQL") return n;
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return root;
}
