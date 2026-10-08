/**
 * 로그 분석 (anl/logViewer) — SQL Binder.
 * 원본: analog-express-ui-plate src/util/sql.js 이식 (파싱 로직 동일).
 *
 * 로그 텍스트에서 SQL 구문과 동일 스레드의 파라미터 줄을 찾아
 * `?` 플레이스홀더를 타입별 리터럴로 치환한 SQL 을 만든다. 지원하는 로그 형식은 세 가지다.
 *  - MyBatis      : `DEBUG  ==> SQL :` 뒤의 본문 + `Parameters: ` 줄 (원본 이식, bindMyBatis)
 *  - Hibernate    : `DEBUG org.hibernate.SQL - ` 뒤의 본문(한 줄 또는 format_sql 여러 줄) +
 *                   `binding parameter (N:TYPE) <- [값]` 줄 (옛 `binding parameter [N] as [TYPE] - [값]` 도 읽는다)
 *  - JdbcTemplate : `Executing prepared SQL statement [...]` + `Setting SQL statement parameter value: column index N, ...` 줄
 *
 * 리터럴 규칙(세 형식 공통):
 *  - Timestamp → TO_TIMESTAMP('값', 'YYYY-MM-DD HH24:MI:SS.FFn')
 *  - Date      → TO_DATE('값', 'YYYY-MM-DD HH24:MI:SS')
 *  - null      → null
 *  - 숫자(Hibernate·JdbcTemplate 만) → 값 그대로
 *  - 그 외      → '값'
 *
 * 원본 대비 의도적 변경: `?` 수와 파라미터 수 불일치 시 원본은 경고(alert, 연산자 우선순위
 * 버그로 메시지 깨짐) 후 부분 치환을 계속했으나, 여기서는 명확한 한국어 메시지의 Error 를
 * 던지고 중단한다. 호출부(Binder 툴바)가 메시지로 표시한다.
 */

function bindMyBatis(editorString: string): string {
  // 스레드 번호 추출 — "2026-01-02 03:04:05,678 {thread} ... DEBUG  ==> SQL :" 패턴.
  const threadCheck = editorString.match(
    /20\d\d-\d\d-\d\d \d\d:\d\d:\d\d,\d\d\d ([\w\d-]+).* DEBUG {2}==> SQL :/,
  );
  let threadNo = "";
  if (threadCheck && threadCheck.length > 0) {
    threadNo = threadCheck[1];
  }

  // "SQL :" 앞부분 제거 (s 플래그 — 개행 포함 탐욕 매칭으로 마지막 "SQL :" 이후만 남김).
  const body = editorString.replace(/.*SQL :/s, "");

  const sqlStmtArray: string[] = [];
  const lineArray = body.split("\n");

  sqlStmtArray.push(lineArray[0] ?? "");
  lineArray.shift();

  // 다음 타임스탬프 줄이 나오기 전까지를 SQL 본문으로 수집.
  while (lineArray.length > 0) {
    if (
      /^20\d\d-[01]\d-[012]\d [012]\d:[012345]\d:[012345]\d/.test(lineArray[0])
    ) {
      break;
    }
    sqlStmtArray.push(lineArray[0]);
    lineArray.shift();
  }

  let sql = sqlStmtArray.join("\n");

  // 동일 스레드의 Parameters: 줄 파싱.
  const paramArr: string[] = [];
  for (let i = 0; i < lineArray.length; i++) {
    if (lineArray[i].match(`,[0-9][0-9][0-9] ${threadNo}.* Parameters: `)) {
      paramArr.push(...lineArray[i].split(" Parameters: ")[1].split(", "));
      break;
    }
  }

  const paramCnt = sql.split("?").length - 1;

  if (paramCnt > 0) {
    if (paramCnt !== paramArr.length) {
      throw new Error(
        paramCnt > paramArr.length
          ? `'?' 개수(${paramCnt})가 파라미터 개수(${paramArr.length})보다 많습니다. 선택한 로그 범위를 확인하세요.`
          : `파라미터 개수(${paramArr.length})가 '?' 개수(${paramCnt})보다 많습니다. 선택한 로그 범위를 확인하세요.`,
      );
    }

    paramArr.forEach((v) => {
      const value = v.replace(/\([^(]+\)\s*$/, "");
      if (v.match(/\(Timestamp\)\s*$/)) {
        // 예: 2023-01-03 12:23:00.0
        sql = sql.replace(
          "?",
          "TO_TIMESTAMP('" + value + "', 'YYYY-MM-DD HH24:MI:SS.FF1')",
        );
      } else if (v.match(/\(Date\)\s*$/)) {
        sql = sql.replace(
          "?",
          "TO_DATE('" + value + "', 'YYYY-MM-DD HH24:MI:SS')",
        );
      } else if (v.match(/^\s*null\s*$/)) {
        sql = sql.replace("?", "null");
      } else {
        sql = sql.replace("?", "'" + value + "'");
      }
    });
  }

  return sql;
}

// ── Hibernate · JdbcTemplate ──────────────────────────────────────────

/** 로그 한 건: 타임스탬프로 시작한 줄과 그 뒤 이어지는 줄(여러 줄 SQL 포함). */
interface LogEntry {
  /** 원본 텍스트 안의 시작 위치(여러 형식이 섞였을 때 마지막 SQL 을 고르는 데 쓴다). */
  offset: number;
  thread: string;
  /** 타임스탬프 뒤부터 이 건의 끝까지. */
  text: string;
}

type LiteralKind = "string" | "number" | "timestamp" | "date";

interface BoundParam {
  kind: LiteralKind;
  value: string;
}

const ENTRY_HEAD = /^20\d\d-[01]\d-[0123]\d [012]\d:[012345]\d:[012345]\d[.,]\d{3} ?/;
const HIBERNATE_SQL = /^[^\n]*? DEBUG\s+(?:org\.hibernate|o\.h)\.SQL - ?([\s\S]*)$/;
const JDBC_SQL = /Executing prepared SQL statement \[([\s\S]*?)\]?\s*$/;
const HIBERNATE_BIND = /binding parameter \((\d+):([^)]*)\) <- \[([\s\S]*)\]\s*$/;
const HIBERNATE_BIND_LEGACY =
  /binding parameter \[(\d+)\] as \[([^\]]*)\] - \[([\s\S]*)\]\s*$/;
const JDBC_BIND =
  /Setting SQL statement parameter value: column index (\d+), parameter value \[([\s\S]*?)\], value class \[([^\]]*)\]/;

function splitEntries(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  let offset = 0;
  let current: { offset: number; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const joined = current.lines.join("\n");
    // 스레드: Spring Boot 형식은 `[main]`, MyBatis 형식은 대괄호 없는 토큰.
    const m = joined.match(/^(?:\[([^\]]*)\]|([\w-]+))/);
    entries.push({
      offset: current.offset,
      thread: m ? (m[1] ?? m[2] ?? "") : "",
      text: joined,
    });
  };
  for (const line of text.split("\n")) {
    const head = line.match(ENTRY_HEAD);
    if (head) {
      flush();
      current = { offset, lines: [line.slice(head[0].length)] };
    } else if (current) {
      current.lines.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return entries;
}

/** 여러 줄 SQL 본문의 앞뒤 빈 줄과 공통 들여쓰기를 걷어낸다. */
function tidySql(raw: string): string {
  const lines = raw.replace(/\s+$/, "").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  const indents = lines
    .filter((l) => l.trim() !== "")
    .map((l) => (l.match(/^[ \t]*/) as RegExpMatchArray)[0].length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

function sqlOf(entry: LogEntry): string | null {
  const hibernate = entry.text.match(HIBERNATE_SQL);
  if (hibernate) return tidySql(hibernate[1]);
  const jdbc = entry.text.match(JDBC_SQL);
  if (jdbc) return tidySql(jdbc[1]);
  return null;
}

const JDBC_NUMBER_TYPES = new Set([
  "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "NUMERIC", "DECIMAL",
  "FLOAT", "REAL", "DOUBLE", "BOOLEAN", "BIT",
]);
const JAVA_NUMBER_CLASSES = new Set([
  "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte",
  "java.lang.Double", "java.lang.Float", "java.lang.Boolean",
  "java.math.BigDecimal", "java.math.BigInteger",
]);

/** Hibernate 의 JDBC 타입 이름(VARCHAR…) 또는 자바 클래스 이름을 리터럴 종류로 나눈다. */
function kindOfType(type: string): LiteralKind {
  const t = type.trim();
  if (t.includes(".")) {
    if (JAVA_NUMBER_CLASSES.has(t)) return "number";
    if (/^java\.sql\.Timestamp$|^java\.time\.(LocalDateTime|Instant|OffsetDateTime|ZonedDateTime)$/.test(t)) {
      return "timestamp";
    }
    if (/^java\.sql\.Date$|^java\.time\.LocalDate$|^java\.util\.Date$/.test(t)) return "date";
    return "string";
  }
  const u = t.toUpperCase();
  if (JDBC_NUMBER_TYPES.has(u)) return "number";
  if (u === "TIMESTAMP" || u === "TIMESTAMP_WITH_TIMEZONE" || u === "TIMESTAMP_UTC") {
    return "timestamp";
  }
  if (u === "DATE") return "date";
  return "string";
}

function quote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function literalOf(param: BoundParam): string {
  const { kind, value } = param;
  if (/^\s*null\s*$/.test(value)) return "null";
  if (kind === "number") {
    return /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.trim()) || /^(true|false)$/i.test(value.trim())
      ? value.trim()
      : quote(value);
  }
  if (kind === "timestamp") {
    // 2026-10-08T12:00:00.123456+09:00 / 2026-10-08 12:00:00.0 → 날짜 시각 + 소수부(없으면 .0).
    const m = value.trim().replace("T", " ").match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:\.(\d{1,9}))?/);
    if (!m) return quote(value);
    const fraction = m[2] ?? "0";
    return (
      "TO_TIMESTAMP('" + m[1] + "." + fraction + "', 'YYYY-MM-DD HH24:MI:SS.FF" + fraction.length + "')"
    );
  }
  if (kind === "date") {
    const m = value.trim().replace("T", " ").match(/^(\d{4}-\d\d-\d\d)(?: (\d\d:\d\d:\d\d))?/);
    if (!m) return quote(value);
    return m[2]
      ? "TO_DATE('" + m[1] + " " + m[2] + "', 'YYYY-MM-DD HH24:MI:SS')"
      : "TO_DATE('" + m[1] + "', 'YYYY-MM-DD')";
  }
  return quote(value);
}

/** 한 건에서 파라미터 줄을 읽는다. 파라미터 줄이 아니면 null. */
function paramOf(entry: LogEntry): { index: number; param: BoundParam } | null {
  const hb = entry.text.match(HIBERNATE_BIND);
  if (hb) {
    return { index: Number(hb[1]), param: { kind: kindOfType(hb[2]), value: hb[3] } };
  }
  const legacy = entry.text.match(HIBERNATE_BIND_LEGACY);
  if (legacy) {
    return {
      index: Number(legacy[1]),
      param: { kind: kindOfType(legacy[2]), value: legacy[3] },
    };
  }
  const jdbc = entry.text.match(JDBC_BIND);
  if (jdbc) {
    return { index: Number(jdbc[1]), param: { kind: kindOfType(jdbc[3]), value: jdbc[2] } };
  }
  return null;
}

/**
 * Hibernate·JdbcTemplate 로그에서 마지막 SQL 건을 찾아 같은 스레드의 파라미터를 채운다.
 * 해당 형식의 SQL 건이 없으면 null.
 */
function bindEntries(
  editorString: string,
  mybatisOffset: number,
): { sql: string; params: BoundParam[] } | null {
  const entries = splitEntries(editorString);
  let sqlAt = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (sqlOf(entries[i]) !== null) {
      sqlAt = i;
      break;
    }
  }
  if (sqlAt < 0 || entries[sqlAt].offset < mybatisOffset) return null;

  const base = entries[sqlAt];
  const sql = sqlOf(base) as string;
  const found = new Map<number, BoundParam>();
  for (let i = sqlAt + 1; i < entries.length; i++) {
    const entry = entries[i];
    if (base.thread && entry.thread !== base.thread) continue;
    if (sqlOf(entry) !== null) break; // 같은 스레드의 다음 SQL — 여기서부터는 다른 실행.
    const parsed = paramOf(entry);
    if (!parsed) continue;
    if (found.has(parsed.index)) break; // 같은 번호가 다시 나오면 배치 등 다음 실행의 파라미터.
    found.set(parsed.index, parsed.param);
  }
  const params = [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  return { sql, params };
}

export function bindSql(editorString: string): string {
  const bound = bindEntries(editorString, editorString.lastIndexOf("SQL :"));
  if (!bound) return bindMyBatis(editorString);

  const { sql, params } = bound;
  const paramCnt = sql.split("?").length - 1;
  if (paramCnt === 0) return sql;
  if (paramCnt !== params.length) {
    throw new Error(
      paramCnt > params.length
        ? `'?' 개수(${paramCnt})가 파라미터 개수(${params.length})보다 많습니다. 선택한 로그 범위를 확인하세요.`
        : `파라미터 개수(${params.length})가 '?' 개수(${paramCnt})보다 많습니다. 선택한 로그 범위를 확인하세요.`,
    );
  }
  // 한 번에 치환한다 — 값 안의 '?' 나 '$' 가 뒤 치환에 영향을 주지 않는다.
  let next = 0;
  return sql.replace(/\?/g, () => literalOf(params[next++]));
}
