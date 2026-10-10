# ERD 도구 단계 1 — Task 10·11: 추정 근거 생성 스크립트와 MCP 읽기 서버

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [04-frontend-viewer.md](04-frontend-viewer.md) · [README](README.md) · 다음: [06-close.md](06-close.md)

레인 S 다. 두 Task 는 `scripts/erd/`·루트 `package.json`·`pnpm-lock.yaml`·`.mcp.json` 과 근거 파일 `src/backend/mdm/api/src/main/resources/erd/hints/` 만 고친다. 다른 레인의 파일은 건드리지 않는다.

README Review Focus 5개 가운데 Task 10·11 에 속하는 것은 없다.

모든 명령은 워크트리 루트(예: `/Users/jji/project/dmes-standard-wt/erd-stage1`)에서 부른다. node 시험은 `node --test scripts/erd/tests/` 로 돈다(디렉터리 인자. node 26 에서 `*.test.mjs` 만 찾는 것을 확인했다. `tests/fixtures/` 아래 파일은 시험 파일 이름 규칙에 걸리지 않는다. node 18.17 하한은 Global Constraints 의 금지 API 를 쓰지 않는 것으로 지킨다).

---

### Task 10: 추정 근거 생성 스크립트

리포를 훑어 관계 추정 근거를 모듈별 파일로 만든다(S6). 근거는 두 종류다.

- `DOC`: `docs/**/*.dbml` 의 짧은 형식 `Ref:` 줄(연구 방법 E, B-import-infer §2.6).
- `SQL_JOIN`: `src/backend/**` 의 `.java`·`.xml`·`.sql`·`.bpmn` 에 있는 조인 등식(연구 방법 C, §2.5). Java 문자열 잇기, XML 문장 태그 나누기, 표·별칭 정규식, 등식 정규식, JPQL 엔티티 → 표 바꾸기를 옮긴다.

스크립트는 외부 의존성이 없다(S16). 서버(Task 3 `ErdHintsLoader`)는 만든 파일을 클래스패스에서 읽는다. 파일이 없으면 그 근거만 빠진다.

정한 규칙(시험이 고정한다):

| 주제 | 규칙 |
|---|---|
| 모듈 배정 | 표 이름 접두로 정한다. `mcm` = `TB_MCM_`·`TB_SEC_`·`SAMPLE_`, `mdm` = `TB_MDM_`(대소문자 무시). SQL·엔티티에 스키마 접두가 있으면 그 모듈의 스키마(`MCMAPUSER`·`MDMAPUSER`)와 같을 때만 받는다. 그래서 `MCM_SOURCE.TB_MCM_CODE_*`·`MCAAPUSER.TB_MCA_*` 는 빠진다. 자식·부모가 같은 모듈일 때만 그 모듈 파일에 넣고, 모듈 사이 근거는 버린다(stderr 에 수만 적는다) |
| SQL_JOIN 묶음 | 한 조각(Java 멤버·XML 문장·SQL 파일) 안에서 같은 별칭 짝의 등식은 복합 조인 하나로 묶는다. 같은 별칭끼리(`a.X = a.Y`), 같은 표·같은 칼럼끼리(상관 하위 질의)는 뺀다. 같은 표·다른 칼럼(자기 참조)은 남긴다 |
| SQL_JOIN 방향 | 등식에는 방향이 없다. 모듈의 Flyway V 파일(버전 순, `drop table` 반영)에서 PK·UK 를 읽어, 칼럼이 그 표의 PK 와 같은 쪽 > UK 와 같은 쪽 > 나머지 순으로 부모를 정한다. 같으면 표 이름이 다른 쪽의 앞부분인 쪽(`TB_X` 와 `TB_X_HIS` 의 `TB_X`), 그래도 같으면 `표(칼럼)` 글이 작은 쪽이 부모다. 짝 순서는 부모 키 순서(키가 없으면 부모 칼럼 이름 순)다 |
| DOC 방향 | `>` 왼쪽이 자식, `<` 오른쪽이 자식, `-`(1:1) 왼쪽이 자식. `<>`·긴 형식 `Ref { }` 는 읽지 않고 stderr 에 알린다 |
| ref | 저장소 루트 기준 경로(`/` 구분) + `:` + 원본 줄 번호. Java 문자열을 이어 붙일 때 줄바꿈을 남겨 줄 번호가 원본과 같다 |
| 결정성 | (kind, child, parent) 로 중복을 없애며 가장 앞선 ref 를 남긴다. 정렬은 ref 경로(문자열) → 줄(숫자) → kind·child·parent. 비교는 `<`·`>` 만 쓴다(`localeCompare` 금지). 파일은 README 의 네 필드(`module`·`generatedBy`·`generatedAt`·`refs`)만 쓰고, 근거 하나를 한 줄로 쓴다. LF, 끝 줄바꿈 |
| `generatedAt` | 근거가 그대로면 파일을 건드리지 않는다(시각도 그대로). `--check` 는 `generatedAt` 을 뺀 나머지를 글자 단위로 비교해 다르면 종료 코드 1 이다(CRLF 는 LF 로 본다) |
| 훑는 범위 | `src/backend` 아래에서 `build`·`node_modules`·`.git`·`test`·`archive`·`out`·`.gradle`·`logs` 폴더를 뺀다. 연구는 `data` 도 뺐지만 `contract/data`·`widget/data` 소스 패키지가 빠지므로 빼지 않는다. 문서는 `docs` 아래 `*.dbml` |

작성 시점(2026-10-11, dev) 실측: 원천 파일 2,340개, 엔티티 105개, DOC 31건(csa-menu 29 + notice 2), SQL_JOIN 56건(중복 포함) → `mcm.json` DOC 31·SQL_JOIN 21, `mdm.json` SQL_JOIN 10, 모듈 밖 6건. 실행 시간 1초 미만.

**Files:**
- Create: `scripts/erd/erd-hints.mjs`
- Create: `scripts/erd/lib/{hints-file.mjs,hints-dbml.mjs,hints-sql.mjs}`
- Create: `scripts/erd/tests/{hints-file,hints-dbml,hints-sql,erd-hints}.test.mjs`
- Create(생성물, 커밋): `src/backend/mdm/api/src/main/resources/erd/hints/{mcm.json,mdm.json}`

**Interfaces:**
- Consumes: README "근거 파일 `erd/hints/<module>.json`" 형식. Flyway 폴더 `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/`, `src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/`.
- Produces:
  - 근거 파일(Task 3 `ErdHintsLoader` 가 읽는다): `{ "module", "generatedBy": "scripts/erd/erd-hints.mjs", "generatedAt", "refs": [ { "kind": "DOC"|"SQL_JOIN", "child": {"table","columns"}, "parent": {"table","columns"}, "ref" } ] }`. 표·컬럼은 대문자, 스키마 접두 없음.
  - CLI: `node scripts/erd/erd-hints.mjs [--root DIR] [--out DIR] [--check]`. 종료 코드 0 정상, 1 `--check` 에서 다시 만들어야 함, 2 인자 오류. 로그는 stderr.
  - `lib/hints-file.mjs`: `MODULES`, `moduleOf(table, schema)`, `moduleOfRef(ref)`, `buildRefs(raw, module)`, `renderHints({module, generatedAt, refs})`, `unchangedGeneratedAt(text, module, refs)`, `GENERATED_BY`.
  - `lib/hints-dbml.mjs`: `parseDbml(text, relPath) → {refs, skipped}`.
  - `lib/hints-sql.mjs`: `joinJavaStrings`, `segmentsOf`, `parseEntities`, `mineJoins`, `parseDdl`, `orientJoin`, `snake`, `RESERVED`.

- [ ] **Step 1: 근거 파일 형식 시험 작성 (실패)**

`scripts/erd/tests/hints-file.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildRefs, moduleOf, renderHints, unchangedGeneratedAt } from "../lib/hints-file.mjs";

const ref = (kind, ct, cc, pt, pc, at, cs = null, ps = null) => ({
  kind,
  child: { schema: cs, table: ct, columns: cc },
  parent: { schema: ps, table: pt, columns: pc },
  ref: at,
});

test("모듈 배정: 표 이름 접두 + 스키마 접두", () => {
  assert.equal(moduleOf("TB_MCM_SEC_MENU"), "mcm");
  assert.equal(moduleOf("tb_sec_user"), "mcm");
  assert.equal(moduleOf("SAMPLE_NOTICE"), "mcm");
  assert.equal(moduleOf("TB_MDM_CODE"), "mdm");
  assert.equal(moduleOf("TB_MCM_SEC_MENU", "MCMAPUSER"), "mcm");
  assert.equal(moduleOf("TB_MCM_CODE_DETAIL", "MCM_SOURCE"), null);
  assert.equal(moduleOf("TB_MCA_RULE_MASTER"), null);
  assert.equal(moduleOf("TB_MLS_ORDER"), null);
});

test("근거 목록: 모듈 거르기·대문자·스키마 제거·중복 제거(앞선 ref)·ref 순(줄은 숫자로)", () => {
  const raw = [
    ref("SQL_JOIN", "TB_MCM_SEC_MENU", ["object_id"], "TB_MCM_SEC_OBJ", ["OBJECT_ID"], "src/b/Z.java:9", "MCMAPUSER"),
    ref("DOC", "TB_MCM_SEC_MENU", ["OBJECT_ID"], "TB_MCM_SEC_OBJ", ["OBJECT_ID"], "docs/mcm/erd/csa-menu.dbml:494"),
    ref("SQL_JOIN", "TB_MCM_SEC_MENU", ["OBJECT_ID"], "TB_MCM_SEC_OBJ", ["OBJECT_ID"], "src/b/A.java:120"),
    ref("DOC", "TB_MCM_NOTICE_TARGET", ["NOTICE_ID"], "TB_MCM_NOTICE", ["NOTICE_ID"], "docs/mcm/erd/csa-menu.dbml:52"),
    ref("SQL_JOIN", "TB_MCM_CODE_DETAIL", ["CATEGORY_ID"], "TB_MCM_CODE_CATEGORY", ["CATEGORY_ID"], "src/b/C.java:1", "MCM_SOURCE", "MCM_SOURCE"),
    ref("SQL_JOIN", "TB_MDM_CODE_VER", ["MARU_CODE_ID"], "TB_MCM_SEC_USER", ["USER_ID"], "src/b/X.java:1"),
    ref("SQL_JOIN", "TB_MDM_CODE_VER", ["MARU_CODE_ID"], "TB_MDM_CODE", ["MARU_CODE_ID"], "src/b/M.java:3"),
  ];
  assert.deepEqual(
    buildRefs(raw, "mcm").map((r) => `${r.kind} ${r.child.table}.${r.child.columns} ${r.ref}`),
    [
      "DOC TB_MCM_NOTICE_TARGET.NOTICE_ID docs/mcm/erd/csa-menu.dbml:52",
      "DOC TB_MCM_SEC_MENU.OBJECT_ID docs/mcm/erd/csa-menu.dbml:494",
      "SQL_JOIN TB_MCM_SEC_MENU.OBJECT_ID src/b/A.java:120",
    ],
  );
  assert.deepEqual(Object.keys(buildRefs(raw, "mcm")[0].child), ["table", "columns"]);
  assert.equal(buildRefs(raw, "mdm").length, 1);
});

test("파일 형식은 README 그대로다(골든)", () => {
  const refs = buildRefs(
    [ref("DOC", "TB_MCM_SEC_MENU", ["OBJECT_ID"], "TB_MCM_SEC_OBJ", ["OBJECT_ID"], "docs/mcm/erd/csa-menu.dbml:494")],
    "mcm",
  );
  assert.equal(
    renderHints({ module: "mcm", generatedAt: "2026-10-11T10:00:00Z", refs }),
    [
      "{",
      '  "module": "mcm",',
      '  "generatedBy": "scripts/erd/erd-hints.mjs",',
      '  "generatedAt": "2026-10-11T10:00:00Z",',
      '  "refs": [',
      '    {"kind":"DOC","child":{"table":"TB_MCM_SEC_MENU","columns":["OBJECT_ID"]},"parent":{"table":"TB_MCM_SEC_OBJ","columns":["OBJECT_ID"]},"ref":"docs/mcm/erd/csa-menu.dbml:494"}',
      "  ]",
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(renderHints({ module: "mdm", generatedAt: "x", refs: [] }).includes('"refs": []'), true);
});

test("내용이 같으면 기존 generatedAt 을 돌려주고(CRLF 무시), 다르면 null", () => {
  const refs = buildRefs([ref("DOC", "TB_MCM_A", ["X"], "TB_MCM_B", ["X"], "d:1")], "mcm");
  const old = renderHints({ module: "mcm", generatedAt: "2026-10-01T00:00:00Z", refs });
  assert.equal(unchangedGeneratedAt(old, "mcm", refs), "2026-10-01T00:00:00Z");
  assert.equal(unchangedGeneratedAt(old.replace(/\n/g, "\r\n"), "mcm", refs), "2026-10-01T00:00:00Z");
  assert.equal(unchangedGeneratedAt(old, "mcm", []), null);
  assert.equal(unchangedGeneratedAt(null, "mcm", refs), null);
  assert.equal(unchangedGeneratedAt("{깨진", "mcm", refs), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/erd/tests/hints-file.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`scripts/erd/lib/hints-file.mjs` 가 없다).

- [ ] **Step 3: 근거 파일 모듈 구현**

`scripts/erd/lib/hints-file.mjs`:

```js
// 추정 근거 파일(erd/hints/<module>.json)의 모듈 배정·중복 제거·정렬·직렬화·비교. 외부 의존성 없음.
// 형식 정본: docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md "근거 파일".

export const GENERATED_BY = "scripts/erd/erd-hints.mjs";

/**
 * 모듈 배정 규칙. 표 이름 접두로 모듈을 정하고, 스키마 접두가 붙어 있으면 그 모듈의 스키마와 같을 때만 받는다.
 * migrations 는 PK·UK(방향 판정)를 읽을 Flyway 폴더다(저장소 루트 기준).
 */
export const MODULES = {
  mcm: {
    schema: "MCMAPUSER",
    prefixes: ["TB_MCM_", "TB_SEC_", "SAMPLE_"],
    migrations: ["src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser"],
  },
  mdm: {
    schema: "MDMAPUSER",
    prefixes: ["TB_MDM_"],
    migrations: ["src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle"],
  },
};

/** 표 하나의 모듈. 접두가 맞지 않거나 스키마 접두가 다른 스키마면 null. */
export function moduleOf(table, schema) {
  const t = String(table).toUpperCase();
  const s = schema ? String(schema).toUpperCase() : null;
  for (const [id, m] of Object.entries(MODULES)) {
    if (!m.prefixes.some((p) => t.startsWith(p))) continue;
    if (s && s !== m.schema) return null;
    return id;
  }
  return null;
}

/** 근거 하나의 모듈. 자식·부모가 같은 모듈일 때만 그 모듈, 아니면 null(모듈 사이·다른 스키마·모르는 표). */
export function moduleOfRef(r) {
  const c = moduleOf(r.child.table, r.child.schema);
  const p = moduleOf(r.parent.table, r.parent.schema);
  return c && c === p ? c : null;
}

/** "경로:줄" 을 경로(문자열)·줄(숫자) 순으로 비교한다. localeCompare 는 쓰지 않는다(환경마다 결과가 달라진다). */
function splitRef(ref) {
  const i = ref.lastIndexOf(":");
  const line = Number(ref.slice(i + 1));
  return i > 0 && Number.isInteger(line) ? [ref.slice(0, i), line] : [ref, 0];
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const side = (s) => `${s.table}(${s.columns.join(",")})`;
export const refKey = (r) => `${r.kind}|${side(r.child)}|${side(r.parent)}`;

export function compareRefs(a, b) {
  const [pa, la] = splitRef(a.ref);
  const [pb, lb] = splitRef(b.ref);
  return cmp(pa, pb) || la - lb || cmp(refKey(a), refKey(b));
}

/** 출력용 정규형: 대문자, 스키마 접두 제거, 필드 순서 고정. */
function normalize(r) {
  const s = (x) => ({ table: x.table.toUpperCase(), columns: x.columns.map((c) => c.toUpperCase()) });
  return { kind: r.kind, child: s(r.child), parent: s(r.parent), ref: r.ref };
}

/** 한 모듈의 근거 목록: 모듈 거르기 → (kind, child, parent) 중복 제거(가장 앞선 ref 를 남긴다) → ref 순 정렬. */
export function buildRefs(raw, module) {
  const best = new Map();
  for (const r of raw) {
    if (moduleOfRef(r) !== module) continue;
    const n = normalize(r);
    const k = refKey(n);
    const prev = best.get(k);
    if (!prev || compareRefs(n, prev) < 0) best.set(k, n);
  }
  return [...best.values()].sort(compareRefs);
}

/** 파일 본문. 근거 하나를 한 줄로 써서 diff 가 읽기 쉽다. LF·끝 줄바꿈. */
export function renderHints({ module, generatedAt, refs }) {
  const head = [
    "{",
    `  "module": ${JSON.stringify(module)},`,
    `  "generatedBy": ${JSON.stringify(GENERATED_BY)},`,
    `  "generatedAt": ${JSON.stringify(generatedAt)},`,
  ];
  if (refs.length === 0) return [...head, '  "refs": []', "}", ""].join("\n");
  const body = refs.map((r, i) => `    ${JSON.stringify(r)}${i < refs.length - 1 ? "," : ""}`);
  return [...head, '  "refs": [', ...body, "  ]", "}", ""].join("\n");
}

/**
 * 기존 파일이 지금 만들 파일과 같은가. generatedAt 만 기존 값을 그대로 두고 나머지는 글자 단위로 비교한다(CRLF 는 LF 로 본다).
 * 같으면 기존 generatedAt 을, 다르면 null 을 돌려준다.
 */
export function unchangedGeneratedAt(existingText, module, refs) {
  if (existingText == null) return null;
  const text = existingText.replace(/\r\n/g, "\n");
  let old;
  try {
    old = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof old?.generatedAt !== "string") return null;
  return renderHints({ module, generatedAt: old.generatedAt, refs }) === text ? old.generatedAt : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/erd/tests/hints-file.test.mjs`
Expected: PASS 4건.

- [ ] **Step 5: dbml·SQL 근거 시험 작성 (실패)**

`scripts/erd/tests/hints-dbml.test.mjs`(고정물은 실제 `csa-menu.dbml` 의 형식 4가지 + 스키마 접두·이름 붙은 Ref·CRLF·`<>`·긴 형식):

```js
import assert from "node:assert/strict";
import test from "node:test";
import { parseDbml } from "../lib/hints-dbml.mjs";

const DBML = [
  "Table TB_MCM_SEC_MENU {", // 1
  "  MENU_ID varchar [pk, ref: > TB_MCM_SEC_OBJ.OBJECT_ID]", // 2 칸 안 ref 는 읽지 않는다(Ref 로 시작하지 않음)
  "}", // 3
  "Ref: TB_MCM_SEC_MENU.OBJECT_ID          - TB_MCM_SEC_OBJ.OBJECT_ID      // 화면 실체 (1:1)", // 4
  "Ref: TB_MCM_SEC_USER_FAVORITE.USER_ID > TB_MCM_SEC_USER.USER_ID", // 5
  "Ref: TB_MCM_NOTICE.NOTICE_ID < TB_MCM_NOTICE_TARGET.NOTICE_ID", // 6
  "Ref: TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)", // 7
  "Ref fk_menu_fld: MCMAPUSER.TB_MCM_SEC_MENU_FLD.PARENT_MENU_ID > MCMAPUSER.TB_MCM_SEC_MENU_FLD.MENU_ID", // 8
  "Ref: TB_A.ID <> TB_B.ID", // 9
  "Ref {", // 10
  "  TB_A.ID > TB_B.ID", // 11
  "}", // 12
].join("\r\n");

test("짧은 형식 Ref 의 방향·복합·이름·스키마 접두를 읽는다", () => {
  const { refs } = parseDbml(DBML, "docs/mcm/erd/x.dbml");
  assert.deepEqual(
    refs.map((r) => [r.ref, r.child.schema, r.child.table, r.child.columns.join("+"), r.parent.table, r.parent.columns.join("+")]),
    [
      ["docs/mcm/erd/x.dbml:4", null, "TB_MCM_SEC_MENU", "OBJECT_ID", "TB_MCM_SEC_OBJ", "OBJECT_ID"],
      ["docs/mcm/erd/x.dbml:5", null, "TB_MCM_SEC_USER_FAVORITE", "USER_ID", "TB_MCM_SEC_USER", "USER_ID"],
      ["docs/mcm/erd/x.dbml:6", null, "TB_MCM_NOTICE_TARGET", "NOTICE_ID", "TB_MCM_NOTICE", "NOTICE_ID"],
      ["docs/mcm/erd/x.dbml:7", null, "TB_MCM_SEC_USER_WIDGET", "USER_ID+TAB_ID", "TB_MCM_SEC_USER_WIDGET_TAB", "USER_ID+TAB_ID"],
      ["docs/mcm/erd/x.dbml:8", "MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "PARENT_MENU_ID", "TB_MCM_SEC_MENU_FLD", "MENU_ID"],
    ],
  );
  assert.ok(refs.every((r) => r.kind === "DOC"));
});

test("many-to-many 와 긴 형식은 읽지 않고 skipped 로 알린다", () => {
  const { skipped } = parseDbml(DBML, "docs/mcm/erd/x.dbml");
  assert.deepEqual(
    skipped.map((s) => s.ref),
    ["docs/mcm/erd/x.dbml:9", "docs/mcm/erd/x.dbml:10"],
  );
});
```

`scripts/erd/tests/hints-sql.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { joinJavaStrings, mineJoins, orientJoin, parseDdl, parseEntities } from "../lib/hints-sql.mjs";

const pretty = (j) => `${j.a.table}(${j.a.columns}) = ${j.b.table}(${j.b.columns}) @${j.ref}`;
const prettyRef = (r) => `${r.child.table}(${r.child.columns}) > ${r.parent.table}(${r.parent.columns}) @${r.ref}`;

test("Java 문자열 잇기를 합쳐도 줄 번호가 그대로다", () => {
  const src = 'a = "SELECT 1 " +\n      "FROM DUAL";\nb = 2;';
  const out = joinJavaStrings(src);
  assert.equal(out, 'a = "SELECT 1  \nFROM DUAL";\nb = 2;');
  assert.equal(out.split("\n").length, src.split("\n").length);
});

test("Java 네이티브 SQL: 별칭·스키마 접두·(+)·복합 조인·줄 번호", () => {
  const java = [
    "class Repo {", // 1
    "    String q() {", // 2
    '        return "SELECT u.USER_ID FROM MCMAPUSER.TB_MCM_SEC_USER u " +', // 3
    '               "JOIN TB_MCM_SEC_USER_WIDGET w ON w.USER_ID = u.USER_ID " +', // 4
    '               "JOIN TB_MCM_SEC_USER_WIDGET_TAB t ON t.USER_ID(+) = w.USER_ID AND t.TAB_ID = w.TAB_ID " +', // 5
    '               "WHERE u.USER_ID = u.USER_ID";', // 6 같은 별칭 → 뺀다
    "    }", // 7
    "    String r() {", // 8
    '        return "SELECT 1 FROM TB_MCM_CODE_DETAIL a, TB_MCM_CODE_DETAIL b WHERE a.CODE = b.CODE";', // 9 같은 표·같은 칼럼 → 뺀다
    "    }", // 10
    "}", // 11
  ].join("\n");
  const joins = mineJoins({ path: "src/backend/x/Repo.java", text: java }, new Map());
  assert.deepEqual(joins.map(pretty), [
    "TB_MCM_SEC_USER(USER_ID) = TB_MCM_SEC_USER_WIDGET(USER_ID) @src/backend/x/Repo.java:4",
    "TB_MCM_SEC_USER_WIDGET_TAB(USER_ID,TAB_ID) = TB_MCM_SEC_USER_WIDGET(USER_ID,TAB_ID) @src/backend/x/Repo.java:5",
  ]);
  assert.equal(joins[0].a.schema, "MCMAPUSER");
});

test("XML 매퍼는 문장 태그마다 따로 본다", () => {
  const xml = [
    "<mapper>", // 1
    '<select id="a">SELECT * FROM TB_MCM_MOM_TC_LIST L', // 2
    "  JOIN TB_MCM_MOM_FORMAT_LIST F ON F.FORMAT_ID = L.FORMAT_ID</select>", // 3
    '<select id="b">SELECT * FROM TB_MCM_NOTICE L WHERE L.NOTICE_ID = F.NOTICE_ID</select>', // 4 F 는 이 문장에 없다
    "</mapper>",
  ].join("\n");
  const joins = mineJoins({ path: "src/backend/x/m.xml", text: xml }, new Map());
  assert.deepEqual(joins.map(pretty), ["TB_MCM_MOM_FORMAT_LIST(FORMAT_ID) = TB_MCM_MOM_TC_LIST(FORMAT_ID) @src/backend/x/m.xml:3"]);
});

test("JPQL: @Table(schema, name) 순서와 상관없이 엔티티를 표로, 필드를 칼럼으로 바꾼다", () => {
  const files = [
    {
      path: "src/backend/x/RuleVer.java",
      text: '@Entity\n@Table(schema = "MDMAPUSER", name = "TB_MDM_RULE_VER")\npublic class MdmRuleVer {\n  @Column(name = "MARU_RULE_ID")\n  private String maruRuleId;\n  private BigDecimal ver;\n}',
    },
    {
      path: "src/backend/x/Rule.java",
      text: '@Entity\n@Table(name = "TB_MDM_RULE")\npublic class MdmRule {\n  private String maruRuleId;\n}',
    },
  ];
  const entities = parseEntities(files);
  assert.equal(entities.get("MdmRuleVer").schema, "MDMAPUSER");
  assert.equal(entities.get("MdmRuleVer").fields.get("ver"), "VER");
  const q = {
    path: "src/backend/x/Q.java",
    text: 'class Q {\n  static final String J = "SELECT r FROM MdmRule r JOIN MdmRuleVer v ON v.maruRuleId = r.maruRuleId WHERE v.id.ver = r.ver";\n}',
  };
  assert.deepEqual(mineJoins(q, entities).map(pretty), ["TB_MDM_RULE(MARU_RULE_ID,VER) = TB_MDM_RULE_VER(MARU_RULE_ID,VER) @src/backend/x/Q.java:2"]);
});

test("DDL: 대소문자·drop table·UNIQUE 제약·고유 인덱스(함수 기반 제외)", () => {
  const keys = parseDdl([
    "create table TB_MCM_SEC_USER (\n  USER_ID varchar2(30 char) not null, -- 사번; 주석\n  constraint PK_TB_MCM_SEC_USER primary key (USER_ID)\n);\n" +
      "CREATE TABLE TB_MDM_COLUMN (COLUMN_ID NUMBER(19), PHYS_NAME VARCHAR2(50), COLUMN_NAME VARCHAR2(50),\n" +
      "  CONSTRAINT PK_TB_MDM_COLUMN PRIMARY KEY (COLUMN_ID), CONSTRAINT UX_TB_MDM_COLUMN_PHYS UNIQUE (PHYS_NAME));\n" +
      "CREATE UNIQUE INDEX UX_TB_MDM_COLUMN_NAME ON TB_MDM_COLUMN (COLUMN_NAME);\n" +
      "CREATE UNIQUE INDEX UX_F ON TB_MDM_COLUMN (CASE WHEN PHYS_NAME IS NULL THEN 1 END);\n" +
      "create table TB_MCM_GONE (A number, constraint PK_G primary key (A));",
    "drop table TB_MCM_GONE;",
  ]);
  assert.deepEqual([...keys.keys()], ["TB_MCM_SEC_USER", "TB_MDM_COLUMN"]);
  assert.deepEqual(keys.get("TB_MCM_SEC_USER").pk, ["USER_ID"]);
  assert.deepEqual(keys.get("TB_MDM_COLUMN").uks, [["PHYS_NAME"], ["COLUMN_NAME"]]);
});

test("방향: PK 쪽 > UK 쪽 > 표 이름 앞부분 > 글 순서. 짝은 부모 키 순서로", () => {
  const keys = parseDdl([
    "create table TB_MDM_RULE_VER (MARU_RULE_ID varchar2(50), VER number, constraint PK_V primary key (MARU_RULE_ID, VER));" +
      "create table TB_MDM_COLUMN (COLUMN_ID number, PHYS_NAME varchar2(50), constraint PK_C primary key (COLUMN_ID), constraint UX_C unique (PHYS_NAME));" +
      "create table TB_MCM_SEC_USER (USER_ID varchar2(30), constraint PK_U primary key (USER_ID));" +
      "create table TB_MCM_SEC_USER_PWD (USER_ID varchar2(30), constraint PK_P primary key (USER_ID));",
  ]);
  const j = (a, ac, b, bc) => ({ a: { schema: null, table: a, columns: ac }, b: { schema: null, table: b, columns: bc }, ref: "f:1" });
  assert.deepEqual(
    [
      orientJoin(j("TB_MDM_RULE_ROW", ["VER", "MARU_RULE_ID"], "TB_MDM_RULE_VER", ["VER", "MARU_RULE_ID"]), keys),
      orientJoin(j("TB_MDM_COLUMN", ["PHYS_NAME"], "TB_MDM_LAYOUT_ITEM", ["COLUMN_PHYS"]), keys),
      orientJoin(j("TB_MCM_SEC_USER_PWD", ["USER_ID"], "TB_MCM_SEC_USER", ["USER_ID"]), keys),
      orientJoin(j("TB_MCM_CODE_DETAIL", ["CATEGORY_ID"], "TB_MCM_CODE_CATEGORY", ["CATEGORY_ID"]), keys),
    ].map(prettyRef),
    [
      "TB_MDM_RULE_ROW(MARU_RULE_ID,VER) > TB_MDM_RULE_VER(MARU_RULE_ID,VER) @f:1",
      "TB_MDM_LAYOUT_ITEM(COLUMN_PHYS) > TB_MDM_COLUMN(PHYS_NAME) @f:1",
      "TB_MCM_SEC_USER_PWD(USER_ID) > TB_MCM_SEC_USER(USER_ID) @f:1",
      "TB_MCM_CODE_DETAIL(CATEGORY_ID) > TB_MCM_CODE_CATEGORY(CATEGORY_ID) @f:1",
    ],
  );
});
```

- [ ] **Step 6: 실패 확인**

Run: `node --test scripts/erd/tests/hints-dbml.test.mjs scripts/erd/tests/hints-sql.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`lib/hints-dbml.mjs`, `lib/hints-sql.mjs`).

- [ ] **Step 7: dbml 파서 구현**

`scripts/erd/lib/hints-dbml.mjs`:

```js
// dbml 문서의 짧은 형식 Ref 줄을 근거(kind DOC)로 읽는다. 외부 의존성 없음.
//   Ref: 자식.컬럼 > 부모.컬럼      (many-to-one, 왼쪽이 자식)
//   Ref: 부모.컬럼 < 자식.컬럼      (one-to-many, 오른쪽이 자식)
//   Ref: 자식.컬럼 - 부모.컬럼      (one-to-one, 왼쪽을 자식으로 본다)
//   Ref 이름: ...,  스키마.표.컬럼,  표.(컬럼1, 컬럼2) 복합 컬럼도 읽는다.
// many-to-many(<>)·긴 형식(Ref { ... })은 읽지 않고 skipped 로 돌려준다. 칸 안 [ref: ...] 는 읽지 않는다(Ref 로 시작하지 않는다).

const REF_LINE = /^\s*Ref\b/;
const SHORT_REF =
  /^\s*Ref(?:\s+[\w"]+)?\s*:\s*([\w".]+?)\.(\([^)]*\)|"?\w+"?)\s*(<>|<|>|-)\s*([\w".]+?)\.(\([^)]*\)|"?\w+"?)(?![\w."])/;

const unquote = (s) => s.replace(/"/g, "");

function tableOf(text) {
  const parts = unquote(text).split(".");
  return parts.length === 2 ? { schema: parts[0], table: parts[1] } : { schema: null, table: parts[0] };
}

function columnsOf(text) {
  return unquote(text)
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {string} text dbml 본문
 * @param {string} relPath 저장소 루트 기준 경로(/ 구분). ref 에 쓴다.
 * @returns {{refs: Array, skipped: Array<{ref: string, reason: string}>}}
 */
export function parseDbml(text, relPath) {
  const refs = [];
  const skipped = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    if (!REF_LINE.test(line)) return;
    const ref = `${relPath}:${i + 1}`;
    const m = SHORT_REF.exec(line);
    if (!m) return void skipped.push({ ref, reason: "짧은 형식 Ref 가 아니다" });
    const [, lt, lc, op, rt, rc] = m;
    if (op === "<>") return void skipped.push({ ref, reason: "many-to-many 는 관계 하나로 옮길 수 없다" });
    const left = { ...tableOf(lt), columns: columnsOf(lc) };
    const right = { ...tableOf(rt), columns: columnsOf(rc) };
    if (left.columns.length !== right.columns.length || left.columns.length === 0) {
      return void skipped.push({ ref, reason: "양쪽 컬럼 수가 다르다" });
    }
    const [child, parent] = op === "<" ? [right, left] : [left, right];
    refs.push({ kind: "DOC", child, parent, ref });
  });
  return { refs, skipped };
}
```

- [ ] **Step 8: SQL 조인 채굴·DDL 키·방향 구현**

`scripts/erd/lib/hints-sql.mjs`. 연구 `methodC.mjs` 와 다른 점: 쉼표 앞 공백을 허용하는 표 정규식, `@Table` 의 `name`·`schema` 순서 무관, 엔티티 필드에 없는 이름은 `snake()` 로 바꾼다, `별칭.id.필드`(복합 키 경로)를 `별칭.필드` 로 읽는다, 등식 뒤에 `.` 이 이어지면 잡지 않는다, 줄 번호를 남긴다.

```js
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

/** 파일을 조각으로 나눈다. Java 는 멤버 단위, XML 은 문장 태그 단위, 나머지는 파일 하나. start 는 원문 위치. */
export function segmentsOf(text, path) {
  if (path.endsWith(".java")) return splitAt(text, /\n {2,4}(?=[@\w])/g);
  if (path.endsWith(".xml")) return splitAt(text, /(?=<(?:select|update|insert|delete|sql)\b)/g);
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
```

- [ ] **Step 9: 통과 확인**

Run: `node --test scripts/erd/tests/hints-dbml.test.mjs scripts/erd/tests/hints-sql.test.mjs`
Expected: PASS 8건.

- [ ] **Step 10: CLI 시험 작성 (실패)**

가짜 저장소를 `os.tmpdir()` 에 만들어 CLI 를 자식 프로세스로 돌린다. 고정물 파일을 `scripts/` 에 두지 않으므로 실제 실행이 고정물을 훑지 않는다.

`scripts/erd/tests/erd-hints.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-hints.mjs");

/** 작은 가짜 저장소: Flyway V 파일 2개 모듈, dbml 하나, Java 하나, 시험 폴더(제외 대상) 하나. */
function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "erd-hints-"));
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put(
    "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql",
    "create table TB_MCM_SEC_USER (USER_ID varchar2(30), constraint PK_U primary key (USER_ID));\n" +
      "create table TB_MCM_SEC_USER_HIS (USER_ID varchar2(30), SEQ number, constraint PK_H primary key (USER_ID, SEQ));\n",
  );
  put(
    "src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V1__baseline.sql",
    "CREATE TABLE TB_MDM_CODE (MARU_CODE_ID VARCHAR2(50), CONSTRAINT PK_C PRIMARY KEY (MARU_CODE_ID));\n",
  );
  put("docs/mcm/erd/a.dbml", "Ref: TB_MCM_SEC_USER_HIS.USER_ID > TB_MCM_SEC_USER.USER_ID\n");
  put(
    "src/backend/mcm-core/src/main/java/x/HisRepo.java",
    'class HisRepo {\n  String q = "SELECT * FROM TB_MCM_SEC_USER_HIS h " +\n      "JOIN TB_MCM_SEC_USER u ON u.USER_ID = h.USER_ID";\n}\n',
  );
  put(
    "src/backend/mdm/lib/src/test/java/x/IgnoredTest.java",
    'class T { String q = "SELECT * FROM TB_MDM_CODE a JOIN TB_MDM_CODE_VER v ON v.MARU_CODE_ID = a.MARU_CODE_ID"; }\n',
  );
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });

test("모듈별 파일을 만들고, 다시 돌려도 바뀌지 않으며, --check 가 낡은 파일을 잡는다", () => {
  const root = fakeRepo();
  try {
    const out = join(root, "src/backend/mdm/api/src/main/resources/erd/hints");
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const mcm = JSON.parse(readFileSync(join(out, "mcm.json"), "utf8"));
    assert.deepEqual(
      mcm.refs.map((r) => `${r.kind} ${r.child.table}>${r.parent.table} ${r.ref}`),
      [
        "DOC TB_MCM_SEC_USER_HIS>TB_MCM_SEC_USER docs/mcm/erd/a.dbml:1",
        "SQL_JOIN TB_MCM_SEC_USER_HIS>TB_MCM_SEC_USER src/backend/mcm-core/src/main/java/x/HisRepo.java:3",
      ],
    );
    assert.deepEqual(JSON.parse(readFileSync(join(out, "mdm.json"), "utf8")).refs, []);

    const before = readFileSync(join(out, "mcm.json"), "utf8");
    assert.equal(run(root).status, 0);
    assert.equal(readFileSync(join(out, "mcm.json"), "utf8"), before, "근거가 같으면 generatedAt 도 그대로");
    assert.equal(run(root, "--check").status, 0);

    writeFileSync(join(root, "docs/mcm/erd/a.dbml"), "\n" + readFileSync(join(root, "docs/mcm/erd/a.dbml"), "utf8"));
    const stale = run(root, "--check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /mcm: 다시 만들어야 합니다/);
    assert.equal(readFileSync(join(out, "mcm.json"), "utf8"), before, "--check 는 쓰지 않는다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("모르는 인자는 종료 코드 2", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /알 수 없는 인자/);
});
```

Run: `node --test scripts/erd/tests/erd-hints.test.mjs`
Expected: FAIL — 첫 시험의 `first.status` 가 1(`Cannot find module .../erd-hints.mjs`), 둘째 시험의 종료 코드가 2 가 아니다.

- [ ] **Step 11: CLI 구현**

`scripts/erd/erd-hints.mjs`:

```js
#!/usr/bin/env node
// 관계 추정 근거 파일을 만든다(단계 1 S6). 리포의 dbml 문서(DOC)와 SQL·JPQL 조인(SQL_JOIN)을 모듈별로 모아
// src/backend/mdm/api/src/main/resources/erd/hints/<module>.json 에 쓴다. 서버(ErdHintsLoader)가 클래스패스에서 읽는다.
// 외부 의존성 없음(node 18.17 이상).
//
// 사용: node scripts/erd/erd-hints.mjs [--root DIR] [--out DIR] [--check]
//   --check  파일을 쓰지 않고, 다시 만들면 내용이 바뀌는 파일이 있으면 종료 코드 1.
//   근거가 그대로면 파일을 건드리지 않는다(generatedAt 도 그대로). 그래서 다시 돌려도 diff 가 생기지 않는다.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDbml } from "./lib/hints-dbml.mjs";
import { MODULES, buildRefs, moduleOfRef, renderHints, unchangedGeneratedAt } from "./lib/hints-file.mjs";
import { mineJoins, orientJoin, parseDdl, parseEntities } from "./lib/hints-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(["build", "node_modules", ".git", "test", "archive", "out", ".gradle", "logs"]);
const OUT_REL = "src/backend/mdm/api/src/main/resources/erd/hints";

function usage(err) {
  if (err) console.error(`오류: ${err}`);
  console.error("사용: node scripts/erd/erd-hints.mjs [--root DIR] [--out DIR] [--check]");
  process.exitCode = err ? 2 : 0;
}

function parseArgs(argv) {
  const opt = { root: join(HERE, "..", ".."), out: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" || a === "--out") {
      if (i + 1 >= argv.length) return { error: `${a} 에 값이 없습니다` };
      opt[a.slice(2)] = argv[++i];
    } else if (a === "--check") opt.check = true;
    else if (a === "-h" || a === "--help") return { help: true };
    else return { error: `알 수 없는 인자: ${a}` };
  }
  opt.out = opt.out ?? join(opt.root, OUT_REL);
  return { opt };
}

/** 디렉터리를 이름순으로 훑는다(readdirSync recursive 는 node 20.1+ 라 쓰지 않는다). */
function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, accept, out);
    } else if (accept(e.name)) out.push(p);
  }
  return out;
}

const toRel = (root, p) => relative(root, p).split(sep).join("/");

/** 모듈 Flyway 폴더의 V 파일을 버전 숫자 순으로. */
function migrationTexts(root) {
  const texts = [];
  for (const m of Object.values(MODULES)) {
    for (const dir of m.migrations) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      const files = readdirSync(abs)
        .map((n) => [n, /^V(\d+)__.*\.sql$/i.exec(n)])
        .filter(([, v]) => v)
        .sort((a, b) => Number(a[1][1]) - Number(b[1][1]));
      for (const [n] of files) texts.push(readFileSync(join(abs, n), "utf8"));
    }
  }
  return texts;
}

/** 모든 근거(모듈 거르기 전)와 통계를 모은다. */
export function collect(root) {
  const keys = parseDdl(migrationTexts(root));
  const sources = walk(join(root, "src", "backend"), (n) => /\.(java|xml|sql|bpmn)$/.test(n)).map((p) => ({
    path: toRel(root, p),
    text: readFileSync(p, "utf8"),
  }));
  const entities = parseEntities(sources);
  const sql = sources.flatMap((f) => mineJoins(f, entities)).map((j) => orientJoin(j, keys));
  const doc = [];
  const skipped = [];
  for (const p of walk(join(root, "docs"), (n) => n.endsWith(".dbml"))) {
    const r = parseDbml(readFileSync(p, "utf8"), toRel(root, p));
    doc.push(...r.refs);
    skipped.push(...r.skipped);
  }
  return { raw: [...doc, ...sql], stats: { sources: sources.length, entities: entities.size, doc: doc.length, sql: sql.length, skipped } };
}

export function main(argv, now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
  const { opt, error, help } = parseArgs(argv);
  if (error || help) return usage(error);
  const { raw, stats } = collect(opt.root);
  const outside = raw.filter((r) => moduleOfRef(r) === null).length;
  console.error(`원천 ${stats.sources}개 · 엔티티 ${stats.entities}개 · DOC ${stats.doc}건 · SQL_JOIN ${stats.sql}건 · 모듈 밖(다른 스키마·모듈 사이) ${outside}건`);
  for (const s of stats.skipped) console.error(`읽지 않은 Ref: ${s.ref} (${s.reason})`);
  let stale = 0;
  for (const module of Object.keys(MODULES)) {
    const refs = buildRefs(raw, module);
    const file = join(opt.out, `${module}.json`);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
    const kept = unchangedGeneratedAt(existing, module, refs);
    const count = `DOC ${refs.filter((r) => r.kind === "DOC").length} · SQL_JOIN ${refs.filter((r) => r.kind === "SQL_JOIN").length}`;
    if (kept) {
      console.error(`${module}: 변경 없음 (${count})`);
    } else if (opt.check) {
      stale++;
      console.error(`${module}: 다시 만들어야 합니다 (${count}) — node scripts/erd/erd-hints.mjs`);
    } else {
      mkdirSync(opt.out, { recursive: true });
      writeFileSync(file, renderHints({ module, generatedAt: now(), refs }));
      console.error(`${module}: 썼습니다 ${toRel(opt.root, file)} (${count})`);
    }
  }
  process.exitCode = stale ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main(process.argv.slice(2));
```

- [ ] **Step 12: 통과 확인**

Run: `node --test scripts/erd/tests/`
Expected: PASS 14건(hints-file 4, hints-dbml 2, hints-sql 6, erd-hints 2).

- [ ] **Step 13: 실제 근거 파일 생성과 확인**

```bash
node scripts/erd/erd-hints.mjs
node scripts/erd/erd-hints.mjs --check ; echo exit=$?
```
Expected(stderr):
```
원천 2340개 · 엔티티 105개 · DOC 31건 · SQL_JOIN 56건 · 모듈 밖(다른 스키마·모듈 사이) 6건
mcm: 썼습니다 src/backend/mdm/api/src/main/resources/erd/hints/mcm.json (DOC 31 · SQL_JOIN 21)
mdm: 썼습니다 src/backend/mdm/api/src/main/resources/erd/hints/mdm.json (DOC 0 · SQL_JOIN 10)
...
mcm: 변경 없음 (DOC 31 · SQL_JOIN 21)
mdm: 변경 없음 (DOC 0 · SQL_JOIN 10)
exit=0
```
수는 작성 시점 값이다. dev 에 새 SQL·문서가 들어왔으면 조금 다를 수 있다. DOC 는 31 이어야 한다(dbml 2개의 `Ref:` 줄 수: `grep -c '^Ref:' docs/mcm/erd/*.dbml` 의 합).

내용을 눈으로 확인한다.

```bash
grep -c '"kind":"DOC"' src/backend/mdm/api/src/main/resources/erd/hints/mcm.json
grep '"ref":"docs/mcm/erd/csa-menu.dbml:494"' src/backend/mdm/api/src/main/resources/erd/hints/mcm.json
grep 'TB_MCM_MOM_TC_ERROR' src/backend/mdm/api/src/main/resources/erd/hints/mcm.json
grep 'TB_MDM_RULE_ROW' src/backend/mdm/api/src/main/resources/erd/hints/mdm.json
node -e 'for (const m of ["mcm","mdm"]) { const f = JSON.parse(require("fs").readFileSync(`src/backend/mdm/api/src/main/resources/erd/hints/${m}.json`, "utf8")); if (Object.keys(f).join() !== "module,generatedBy,generatedAt,refs" || f.refs.some(r => Object.keys(r).join() !== "kind,child,parent,ref")) throw new Error(m); console.log(m, f.refs.length); }'
```
Expected:
- 첫 줄 `31`.
- 둘째 줄: `{"kind":"DOC","child":{"table":"TB_MCM_SEC_MENU","columns":["OBJECT_ID"]},"parent":{"table":"TB_MCM_SEC_OBJ","columns":["OBJECT_ID"]},"ref":"docs/mcm/erd/csa-menu.dbml:494"}` 한 줄.
- 셋째: `TB_MCM_MOM_TC_SEND`(`ERR_SQ_VAL`) → `TB_MCM_MOM_TC_ERROR`(`SQ_VAL`) 와 `TB_MCM_MOM_TC_ERROR`(`TRANSACTION_CODE`) → `TB_MCM_MOM_TC_LIST` 두 줄(이름이 다른 참조를 SQL 이 찾는 예).
- 넷째: `TB_MDM_RULE_ROW`(`MARU_RULE_ID`,`VER`) → `TB_MDM_RULE_VER`(`MARU_RULE_ID`,`VER`) — 복합 조인 하나.
- 다섯째: `mcm 52`, `mdm 10`(필드가 README 의 네 개뿐인지 확인).

- [ ] **Step 14: 커밋**

```bash
/usr/bin/git add scripts/erd/erd-hints.mjs scripts/erd/lib/hints-file.mjs scripts/erd/lib/hints-dbml.mjs scripts/erd/lib/hints-sql.mjs \
  scripts/erd/tests/hints-file.test.mjs scripts/erd/tests/hints-dbml.test.mjs scripts/erd/tests/hints-sql.test.mjs scripts/erd/tests/erd-hints.test.mjs \
  src/backend/mdm/api/src/main/resources/erd/hints/mcm.json src/backend/mdm/api/src/main/resources/erd/hints/mdm.json
/usr/bin/git commit -F - <<'EOF'
feat(erd): 추정 근거 생성 스크립트와 MCM·MDM 근거 파일

dbml Ref(DOC)와 SQL·JPQL 조인 등식(SQL_JOIN)을 모듈별 erd/hints/<module>.json 으로 만든다.
의존성 없는 node 스크립트이며 --check 로 커밋된 파일이 낡았는지 본다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```

---

### Task 11: MCP 읽기 서버

`scripts/erd/erd-mcp.mjs` 는 stdio MCP 서버다. MDM 서버의 OASIS `erdEdit` 를 감싸기만 하고(스펙 2.3), 단계 1 은 읽기 도구 6개만 둔다(README "MCP 도구" 표). 텍스트 형식 함수는 `lib/model-text.mjs` 의 순수 함수로 두고 node 시험으로 고정한다(S17). OASIS 호출은 `lib/oasis.mjs` 하나로 모은다(`scripts/mdm-meta/register-columns.mjs` 의 `oasis()` 와 같은 규칙: 기본 URL, 헤더, null 제거, 30초 제한, `meta.success` 판정, 오류 나누기).

서버 쪽 경로 가운데 `view kind=STATUS`(Task 5)·`compare kind=DB_DIFF`(Task 5)·`ErdRelation.candidateRank`(Task 3)는 다른 레인이 만든다. 이 Task 의 시험은 가짜 OASIS 서버(`http.createServer`)로 하고, 실제 서버 연결은 Task 12 에서 확인한다.

정한 규칙:

| 주제 | 규칙 |
|---|---|
| 환경변수 | `ERD_BASE`(기본 `http://localhost:8096`, 끝 `/` 제거) · `ERD_USER`(`erd-mcp`) · `ERD_ROLE`(`MDM_STEWARD`, `ErdEditOasisHttpTest` 와 같다) · `BACKEND_CLIENT_KEY`(`dmes-bff-local-client-key-2026`) · `ERD_SESSION`(`mcp-<ERD_USER>`). 세션 이름은 단계 1 에서 시작 로그에만 쓰고, 단계 2 의 쓰기·`SET_VIEW` 가 쓴다 |
| 요청 | `POST {ERD_BASE}/api/mdm/oasis/erdEdit/{action}`, 헤더 `Content-Type`·`X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`, 본문 `{"meta":{"menuId":"erdEdit"},"params":{…null 뺀 값}}`, `AbortSignal.timeout(30000)`(본문 읽기 포함) |
| 응답 | `meta.success === true` 면 `data.result ?? data ?? {}`. 아니면 `OasisError(code=meta.code, message=meta.message)`. 본문이 JSON 이 아니면 `OasisError(status)`. 연결 실패·시간 초과는 `OasisUnreachableError` |
| 도구 오류 | 던지지 않고 `{isError:true, content:[{type:"text", text}]}` 로 돌려준다. 글에는 코드·메시지와 "다음:" 한 줄(스펙 4.5)을 쓴다. 닿지 못함 → `ERD_BASE`, HTTP 401·403 → `BACKEND_CLIENT_KEY`·`ERD_USER`·`ERD_ROLE`, `MDM029`(모델 없음) → `modelId` 확인 |
| LLM 순서(스펙 4.6) | 서버 `instructions` 에 5단계를 모두 적고, 단계 2 에서 생길 도구(`claimTable`·`apply`·`releaseTable`)는 "(단계 2 에서 추가)" 로 표시한다. 도구 설명마다 그 도구가 몇 단계에 쓰이는지 적는다 |
| `getModelText` | `view` 로 모델을 읽고, 같은 `ver` 로 `view kind=STATUS` 를 읽는다. 표는 물리명 순, 컬럼은 `columnOrder` 순, 논리명이 비면 `-`. 타입은 길이가 없으면 괄호 없이, 스케일이 null 이 아니면 `(길이,스케일)`. FK 토큰은 관계 하나에 하나, 부모 글 순으로 공백 구분, 추정은 끝에 `?`, 다른 모델 부모(`parentRef`)는 `FK>@모델`. 도메인 이름이 STATUS 의 `domains` 에 없으면 `[도메인 <id>]`. Ref 줄: 복합은 `(A, B)`, 근거는 `NAME_RULE` 만 종류, 나머지는 `종류 <ref 의 마지막 / 뒤>`. `diagram` 은 id·이름·`업무영역/이름` 으로 찾고, 그때 Ref 줄은 양 끝 표가 모두 그 다이어그램에 있을 때만 쓴다. 기각과 `candidateRank`>1 은 쓰지 않는다 |
| 다른 도구 | `getCurrentView`: `view` 의 `presence` 중 `source=UI` 만. `getChangesSince`: `view`+`sinceRev`, 요약 텍스트와 JSON 두 덩이. `listViolations`: `view`+STATUS 에서 OK·ALIAS 가 아닌 컬럼. `listInferredRelations`: `INFERRED` 만, 관계 id 를 앞에 둔다. `getDbDiff`: `compare kind=DB_DIFF` |

**Files:**
- Modify: `package.json`(루트, `dependencies` 추가)
- Create: `pnpm-lock.yaml`(루트), `.mcp.json`
- Create: `scripts/erd/erd-mcp.mjs`, `scripts/erd/lib/{oasis.mjs,model-text.mjs}`
- Create: `scripts/erd/tests/{oasis,model-text,erd-mcp,mcp-config}.test.mjs`, `scripts/erd/tests/fixtures/{erd-view.mjs,fake-oasis.mjs}`

**Interfaces:**
- Consumes: 단계 0 `view`(`ErdModelView`: `modelId, rev, ver, status, ownerId, editors, rowVersion, model(MODEL_JSON 문자열), diagrams, nodes, presence`)·`view`+`sinceRev`(`ErdChangesView`); Task 5 `view kind=STATUS`(`ErdStatusView`)·`compare kind=DB_DIFF`(`ErdDbDiffView`); Task 3 `ErdRelation.candidateRank`. 모양은 README "인터페이스" 그대로.
- Produces:
  - `.mcp.json` 서버 키 `erd`(Task 12 가 `mcp__erd__<도구>` 로 부른다), 도구 6개: `getModelText{modelId, diagram?}`, `getCurrentView{modelId, session?}`, `getChangesSince{modelId, rev}`, `listViolations{modelId, status?: NEW|TYPE|DOMAIN|MISS}`, `listInferredRelations{modelId, includeFolded?}`, `getDbDiff{modelId}`.
  - `lib/oasis.mjs`: `DEFAULTS`, `configFromEnv(env)`, `createOasisClient(config, fetchImpl?) → {config, call(action, params)}`, `OasisError`, `OasisUnreachableError`, `compact`, `describeError(e, config)`. 단계 2 의 `erd-cli.mjs`·쓰기 도구가 다시 쓴다.
  - `lib/model-text.mjs`: `getModelText(view, status, {diagram?})`, `formatCurrentView`, `formatChanges`, `formatViolations`, `formatInferred`, `formatDbDiff`, `findDiagram`, `isShown`.
  - `erd-mcp.mjs`: `INSTRUCTIONS`, `TOOLS`, `handlers(client)`, `createErdServer(client)`(시험이 import 해도 서버를 띄우지 않는다).

- [ ] **Step 1: MCP 의존성 버전 고르기와 설치(S16)**

규칙: 설치하는 날 기준으로 공개된 지 14일이 지난 정식 버전 가운데 가장 높은 것. SDK 는 1.x, zod 는 4.x 안에서 고른다(SDK 1.x 의 peer 는 `zod ^3.25 || ^4.0`).

```bash
node -e '
const { execFileSync } = require("node:child_process");
const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
const num = (v) => v.split(".").map(Number);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
for (const [pkg, major] of [["@modelcontextprotocol/sdk", 1], ["zod", 4]]) {
  const time = JSON.parse(execFileSync("npm", ["view", pkg, "time", "--json"], { encoding: "utf8" }));
  let best = null;
  for (const [v, at] of Object.entries(time)) {
    if (!/^\d+\.\d+\.\d+$/.test(v) || num(v)[0] !== major || Date.parse(at) > cutoff) continue;
    if (!best || newer(v, best[0])) best = [v, at];
  }
  console.log(pkg, best[0], best[1]);
}'
```
Expected: 두 줄. 작성 시점(2026-10-11) 결과는 `@modelcontextprotocol/sdk 1.30.1 2026-09-23T16:06:59.541Z`, `zod 4.6.5 2026-09-13T23:25:14.644Z` 이다(1.31.0 은 2026-09-28 공개라 2026-10-12 19시부터 고를 수 있다). 이 계획의 코드는 1.30.1·4.6.5 로 시험했다. 나온 값을 `<SDK>`·`<ZOD>` 로 쓴다.

루트에서 설치한다. 루트에는 `pnpm-workspace.yaml` 이 없어서 `src/frontend` 작업 공간과 섞이지 않는다.

```bash
pnpm add -E @modelcontextprotocol/sdk@<SDK> zod@<ZOD>
cat package.json
ls pnpm-lock.yaml
```
Expected: `package.json` 이 아래와 같다(버전은 위에서 고른 값, 캐럿 없음). 루트 `pnpm-lock.yaml` 이 생긴다. `node_modules/` 는 `.gitignore` 가 막는다. `@cfworker/json-schema` 는 선택 peer 라 설치 경고가 나와도 무시한다.

```json
{
  "name": "@dk-oasis/repository-tools",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "export-design-dummy": "node scripts/export-design-dummy.mjs",
    "import-design-dummy": "node scripts/import-design-dummy.mjs"
  },
  "packageManager": "pnpm@10.30.3",
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.1",
    "zod": "4.6.5"
  }
}
```

설치본에서 import 경로와 시그니처를 확인한다(이 계획의 코드가 쓰는 것만).

```bash
grep -n "registerTool<" node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts
grep -n "instructions?: string" node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts
grep -n "env?: Record<string, string>\|stderr?: IOType" node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.d.ts
node --input-type=module -e '
const m = await import("@modelcontextprotocol/sdk/server/mcp.js");
const s = await import("@modelcontextprotocol/sdk/server/stdio.js");
const c = await import("@modelcontextprotocol/sdk/client/index.js");
const t = await import("@modelcontextprotocol/sdk/client/stdio.js");
const { z } = await import("zod");
console.log(typeof m.McpServer, typeof s.StdioServerTransport, typeof c.Client, typeof t.StdioClientTransport, typeof z.object);'
```
Expected: `registerTool<OutputArgs extends …, InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(name: string, config: {` 한 줄(이어지는 줄에 `inputSchema?: InputArgs;`·`cb: ToolCallback<InputArgs>`), `instructions?: string;` 한 줄, `env?: Record<string, string>;`·`stderr?: IOType | Stream | number;` 두 줄, 마지막에 `function function function function function`. 하나라도 다르면 멈추고 알린다(다른 메이저·이름 변경).

- [ ] **Step 2: OASIS 클라이언트 시험 작성 (실패)**

가짜 OASIS 서버 `scripts/erd/tests/fixtures/fake-oasis.mjs`(erd-mcp 시험도 쓴다):

```js
// 가짜 MDM OASIS 서버. POST /api/mdm/oasis/erdEdit/{action} 만 받고, 받은 요청을 기록한다.
import { createServer } from "node:http";

export const success = (result) => ({ status: 200, body: { meta: { success: true }, data: { result } } });
export const failure = (code, message) => ({ status: 200, body: { meta: { success: false, code, message } } });

/**
 * @param {(action: string, params: object, req: import("node:http").IncomingMessage) => {status:number, body:any, delayMs?:number}} route
 * @returns {Promise<{url: string, requests: Array<{action, params, headers, body}>, close: () => Promise<void>}>}
 */
export async function startFakeOasis(route) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const m = /^\/api\/mdm\/oasis\/erdEdit\/(\w+)$/.exec(req.url);
      if (req.method !== "POST" || !m) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ action: m[1], params: body.params, headers: req.headers, body });
      const out = route(m[1], body.params, req);
      const send = () => {
        const text = typeof out.body === "string" ? out.body : JSON.stringify(out.body);
        res.writeHead(out.status, { "Content-Type": typeof out.body === "string" ? "text/plain" : "application/json" }).end(text);
      };
      if (out.delayMs) setTimeout(send, out.delayMs);
      else send();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
```

`scripts/erd/tests/oasis.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { OasisError, OasisUnreachableError, configFromEnv, createOasisClient, describeError } from "../lib/oasis.mjs";
import { failure, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

test("환경변수 기본값과 덮어쓰기", () => {
  assert.deepEqual(configFromEnv({}), {
    base: "http://localhost:8096",
    clientKey: "dmes-bff-local-client-key-2026",
    user: "erd-mcp",
    role: "MDM_STEWARD",
    session: "mcp-erd-mcp",
    timeoutMs: 30000,
  });
  const c = configFromEnv({ ERD_BASE: "http://h:1/", ERD_USER: "41000207", ERD_ROLE: "MDM_STD_ADMIN", BACKEND_CLIENT_KEY: "k", ERD_SESSION: "claude-a" });
  assert.deepEqual([c.base, c.user, c.role, c.clientKey, c.session], ["http://h:1", "41000207", "MDM_STD_ADMIN", "k", "claude-a"]);
});

test("요청 경로·헤더·본문(null 제거)과 data.result", async () => {
  const fake = await startFakeOasis(() => success({ rev: 3 }));
  try {
    const client = createOasisClient({ ...configFromEnv({ ERD_BASE: fake.url, ERD_USER: "41000207" }), timeoutMs: 2000 });
    assert.deepEqual(await client.call("view", { modelId: "mcm", kind: null, ver: undefined }), { rev: 3 });
    const [r] = fake.requests;
    assert.equal(r.action, "view");
    assert.deepEqual(r.body, { meta: { menuId: "erdEdit" }, params: { modelId: "mcm" } });
    assert.equal(r.headers["x-client-key"], "dmes-bff-local-client-key-2026");
    assert.equal(r.headers["x-authenticated-user"], "41000207");
    assert.equal(r.headers["x-authenticated-role"], "MDM_STEWARD");
    assert.equal(r.headers["content-type"], "application/json");
  } finally {
    await fake.close();
  }
});

test("업무 오류·JSON 아닌 본문은 OasisError, 다음 할 일이 붙는다", async () => {
  const fake = await startFakeOasis((action) =>
    action === "view" ? failure("MDM029", "ERD 모델이 없습니다") : { status: 401, body: "Unauthorized" },
  );
  try {
    const config = { ...configFromEnv({ ERD_BASE: fake.url }), timeoutMs: 2000 };
    const client = createOasisClient(config);
    const e1 = await client.call("view", { modelId: "x" }).catch((e) => e);
    assert.ok(e1 instanceof OasisError);
    assert.equal(e1.code, "MDM029");
    assert.match(describeError(e1, config), /^\[MDM029\] ERD 모델이 없습니다\n다음: modelId 를 확인하세요/);
    const e2 = await client.call("compare", { modelId: "x" }).catch((e) => e);
    assert.ok(e2 instanceof OasisError);
    assert.equal(e2.status, 401);
    assert.match(describeError(e2, config), /BACKEND_CLIENT_KEY/);
  } finally {
    await fake.close();
  }
});

test("닿지 못함·시간 초과는 OasisUnreachableError 이고 ERD_BASE 를 안내한다", async () => {
  const fake = await startFakeOasis(() => ({ ...success({}), delayMs: 1000 }));
  try {
    const config = { ...configFromEnv({ ERD_BASE: fake.url }), timeoutMs: 100 };
    const slow = await createOasisClient(config).call("view", { modelId: "mcm" }).catch((e) => e);
    assert.ok(slow instanceof OasisUnreachableError);
    assert.match(describeError(slow, config), /ERD_BASE/);
  } finally {
    await fake.close();
  }
  const closed = { ...configFromEnv({ ERD_BASE: "http://127.0.0.1:9" }), timeoutMs: 2000 };
  const down = await createOasisClient(closed).call("view", { modelId: "mcm" }).catch((e) => e);
  assert.ok(down instanceof OasisUnreachableError);
  assert.match(down.message, /127\.0\.0\.1:9 에 닿지 못했습니다\(erdEdit\/view\)/);
});
```

Run: `node --test scripts/erd/tests/oasis.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`lib/oasis.mjs`).

- [ ] **Step 3: OASIS 클라이언트 구현**

`scripts/erd/lib/oasis.mjs`:

```js
// MDM 서버 OASIS erdEdit 를 부르는 작은 클라이언트. scripts/mdm-meta/register-columns.mjs 의 oasis() 와 같은 규칙이다.
// 로컬 전용 인증(스펙 D12): X-Client-Key + 사용자 헤더. node 18.17 내장 fetch·AbortSignal.timeout 만 쓴다.

export const DEFAULTS = Object.freeze({
  base: "http://localhost:8096",
  clientKey: "dmes-bff-local-client-key-2026",
  user: "erd-mcp",
  role: "MDM_STEWARD",
  timeoutMs: 30000,
});

/** 환경변수 → 설정. ERD_BASE·ERD_USER·ERD_ROLE·BACKEND_CLIENT_KEY·ERD_SESSION, 비면 기본값. */
export function configFromEnv(env) {
  const user = env.ERD_USER || DEFAULTS.user;
  return {
    base: (env.ERD_BASE || DEFAULTS.base).replace(/\/+$/, ""),
    clientKey: env.BACKEND_CLIENT_KEY || DEFAULTS.clientKey,
    user,
    role: env.ERD_ROLE || DEFAULTS.role,
    session: env.ERD_SESSION || `mcp-${user}`,
    timeoutMs: DEFAULTS.timeoutMs,
  };
}

/** 서버가 업무 오류(meta.success=false)나 JSON 이 아닌 본문을 돌려줬다. */
export class OasisError extends Error {
  constructor(message, { action, code = null, status = null } = {}) {
    super(message);
    this.name = "OasisError";
    this.action = action;
    this.code = code;
    this.status = status;
  }
}

/** 서버에 닿지 못했다(연결 거부·시간 초과). */
export class OasisUnreachableError extends Error {
  constructor(message, { action, cause } = {}) {
    super(message);
    this.name = "OasisUnreachableError";
    this.action = action;
    this.cause = cause;
  }
}

/** null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못한다. */
export function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

/** @returns {{config: object, call: (action: string, params: object) => Promise<any>}} */
export function createOasisClient(config, fetchImpl = globalThis.fetch) {
  async function call(action, params = {}) {
    const url = `${config.base}/api/mdm/oasis/erdEdit/${action}`;
    let res;
    let text;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "X-Client-Key": config.clientKey,
          "X-Authenticated-User": config.user,
          "X-Authenticated-Role": config.role,
        },
        body: JSON.stringify({ meta: { menuId: "erdEdit" }, params: compact(params) }),
      });
      text = await res.text(); // 본문 읽기도 같은 시간 제한 안에서
    } catch (e) {
      throw new OasisUnreachableError(`${config.base} 에 닿지 못했습니다(erdEdit/${action}): ${e.cause?.code ?? e.name} ${e.message}`, {
        action,
        cause: e,
      });
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OasisError(`erdEdit/${action} HTTP ${res.status}: ${text.slice(0, 200)}`, { action, status: res.status });
    }
    if (body?.meta?.success !== true) {
      throw new OasisError(body?.meta?.message || `erdEdit/${action} HTTP ${res.status}`, {
        action,
        code: body?.meta?.code ?? null,
        status: res.status,
      });
    }
    return body.data?.result ?? body.data ?? {};
  }
  return { config, call };
}

/** 오류를 LLM 이 다음에 할 일까지 읽을 수 있는 문장으로(스펙 4.5). */
export function describeError(e, config) {
  if (e instanceof OasisUnreachableError) {
    return `${e.message}\n다음: MDM 서버(기본 포트 8096)를 켜거나 ERD_BASE 환경변수를 확인한 뒤 같은 도구를 다시 부르세요.`;
  }
  if (e instanceof OasisError) {
    if (e.status === 401 || e.status === 403) {
      return `인증이 거절되었습니다(HTTP ${e.status}): ${e.message}\n다음: BACKEND_CLIENT_KEY 가 서버의 cactus.security.client-key 와 같은지, ERD_USER(${config.user})·ERD_ROLE(${config.role})이 맞는지 확인하세요.`;
    }
    if (e.code === "MDM029") {
      return `[MDM029] ${e.message}\n다음: modelId 를 확인하세요. 모델 목록은 m-mdm ERD 화면에서 보거나 OASIS erdEdit/search 로 읽습니다.`;
    }
    return `[${e.code ?? `HTTP ${e.status}`}] ${e.message}\n다음: 입력을 고쳐 다시 부르세요. 같은 오류가 이어지면 사용자에게 서버 로그 확인을 부탁하세요.`;
  }
  return `${e?.message ?? e}\n다음: 입력을 확인하고 다시 부르세요.`;
}
```

Run: `node --test scripts/erd/tests/oasis.test.mjs`
Expected: PASS 4건. 닿지 못함 시험은 포트 9(discard)에 연결 거부를 기대한다.

- [ ] **Step 4: 텍스트 형식 시험 작성 (실패)**

가짜 `view`·STATUS 응답과 골든 텍스트 `scripts/erd/tests/fixtures/erd-view.mjs`. 허브 1·2순위 후보, 기각, 복합 DB FK, 한 컬럼의 FK 두 개, 길이 없는 타입, 스케일 0, 사전에 없는 도메인, 논리명 없는 표, 화면·MCP 세션을 담는다.

```js
// model-text·erd-mcp 시험이 함께 쓰는 가짜 OASIS 응답. 모양은 계획 README "인터페이스" 의 ErdModelView·ErdStatusView.

const col = (table, phys, logical, dataType, length, scale, notNull, domainId = null) => ({
  table, phys, logical, domainId, dataType, length, scale, notNull, default: null, comment: "", _rev: {},
});
const rel = (child, parent, pairs, state, evidence, candidateRank = null) => ({
  child, parent, pairs, identifying: false, cardinality: { parent: "ONE", child: "ZERO_OR_MORE" },
  state, dbFk: state === "DB", evidence, parentRef: null, candidateRank, _rev: {},
});

export const MODEL = {
  schemaVersion: 1,
  model: { module: "mcm", schema: "MCMAPUSER" },
  tables: {
    "t-menu": { phys: "TB_MCM_SEC_MENU", logical: "메뉴", comment: "", columnOrder: ["c-m1", "c-m2", "c-m3"], _rev: {} },
    "t-obj": { phys: "TB_MCM_SEC_OBJ", logical: "오브젝트", comment: "", columnOrder: ["c-o1"], _rev: {} },
    "t-fld": { phys: "TB_MCM_SEC_MENU_FLD", logical: "", comment: "", columnOrder: ["c-d1"], _rev: {} },
    "t-user": { phys: "TB_MCM_SEC_USER", logical: "사용자", comment: "", columnOrder: ["c-u1", "c-u2", "c-u3"], _rev: {} },
    "t-fav": { phys: "TB_MCM_SEC_USER_FAVORITE", logical: "즐겨찾기", comment: "", columnOrder: ["c-f1", "c-f2"], _rev: {} },
    "t-wid": { phys: "TB_MCM_SEC_USER_WIDGET", logical: "위젯", comment: "", columnOrder: ["c-w1", "c-w2"], _rev: {} },
    "t-tab": { phys: "TB_MCM_SEC_USER_WIDGET_TAB", logical: "위젯탭", comment: "", columnOrder: ["c-t1", "c-t2"], _rev: {} },
  },
  columns: {
    "c-m1": col("t-menu", "MENU_ID", "메뉴아이디", "VARCHAR2", 30, null, true, 12),
    "c-m2": col("t-menu", "OBJECT_ID", "오브젝트아이디", "VARCHAR2", 50, null, false, 12),
    "c-m3": col("t-menu", "MENU_NM", "메뉴명", "VARCHAR2", 200, null, true, 99),
    "c-o1": col("t-obj", "OBJECT_ID", "오브젝트아이디", "VARCHAR2", 50, null, true),
    "c-d1": col("t-fld", "MENU_ID", "", "VARCHAR2", 30, null, true),
    "c-u1": col("t-user", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-u2": col("t-user", "PWD_FAIL_CNT", "비밀번호실패수", "NUMBER", 3, 0, false),
    "c-u3": col("t-user", "C_AT", "생성일시", "TIMESTAMP", null, 6, false),
    "c-f1": col("t-fav", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-f2": col("t-fav", "MENU_ID", "메뉴아이디", "VARCHAR2", 30, null, true),
    "c-w1": col("t-wid", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-w2": col("t-wid", "TAB_ID", "탭아이디", "VARCHAR2", 30, null, true),
    "c-t1": col("t-tab", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-t2": col("t-tab", "TAB_ID", "탭아이디", "VARCHAR2", 30, null, true),
  },
  keys: {
    "k-1": { table: "t-menu", kind: "PK", name: "PK_TB_MCM_SEC_MENU", columns: ["c-m1"], _rev: {} },
    "k-2": { table: "t-obj", kind: "PK", name: "PK_TB_MCM_SEC_OBJ", columns: ["c-o1"], _rev: {} },
    "k-3": { table: "t-fld", kind: "PK", name: "PK_TB_MCM_SEC_MENU_FLD", columns: ["c-d1"], _rev: {} },
    "k-4": { table: "t-user", kind: "PK", name: "PK_TB_MCM_SEC_USER", columns: ["c-u1"], _rev: {} },
    "k-5": { table: "t-fav", kind: "PK", name: "PK_TB_MCM_SEC_USER_FAVORITE", columns: ["c-f1", "c-f2"], _rev: {} },
    "k-6": { table: "t-wid", kind: "PK", name: "PK_TB_MCM_SEC_USER_WIDGET", columns: ["c-w1", "c-w2"], _rev: {} },
    "k-7": { table: "t-tab", kind: "PK", name: "PK_TB_MCM_SEC_USER_WIDGET_TAB", columns: ["c-t1", "c-t2"], _rev: {} },
    "k-8": { table: "t-menu", kind: "IX", name: "IX_TB_MCM_SEC_MENU_OBJ", columns: ["c-m2"], _rev: {} },
  },
  relations: {
    "r-1": rel("t-menu", "t-obj", [["c-m2", "c-o1"]], "INFERRED", [
      { kind: "DOC", ref: "docs/mcm/erd/csa-menu.dbml:494" },
      { kind: "NAME_RULE", ref: "PK 이름 일치" },
    ]),
    "r-2": rel("t-fav", "t-user", [["c-f1", "c-u1"]], "CONFIRMED", [{ kind: "DOC", ref: "docs/mcm/erd/csa-menu.dbml:512" }]),
    "r-3": rel("t-fav", "t-menu", [["c-f2", "c-m1"]], "INFERRED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }], 1),
    "r-4": rel("t-fav", "t-fld", [["c-f2", "c-d1"]], "INFERRED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }], 2),
    "r-5": rel("t-menu", "t-fld", [["c-m1", "c-d1"]], "REJECTED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }]),
    "r-6": rel("t-wid", "t-tab", [["c-w1", "c-t1"], ["c-w2", "c-t2"]], "DB", [{ kind: "DB_FK", ref: "FK_TB_MCM_SEC_USER_WIDGET_TAB" }]),
    "r-7": rel("t-wid", "t-user", [["c-w1", "c-u1"]], "INFERRED", [
      { kind: "SQL_JOIN", ref: "src/backend/mcm-core/src/main/java/x/WidgetRepo.java:41" },
      { kind: "NAME_RULE", ref: "PK 이름 일치" },
    ]),
  },
  _tombstones: {},
};

export const VIEW = {
  modelId: "mcm",
  rev: 12,
  ver: "1.000",
  status: "DRAFT",
  ownerId: "41000207",
  editors: [],
  rowVersion: 3,
  model: JSON.stringify(MODEL),
  diagrams: [
    { id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 },
    { id: "d-menu", areaName: "메뉴", diagramName: "메뉴 화면", sortSeq: 1 },
  ],
  nodes: [
    ...Object.keys(MODEL.tables).map((t, i) => ({ diagram: "d-all", table: t, x: (i % 8) * 280, y: Math.floor(i / 8) * 220, foldMode: "NONE" })),
    { diagram: "d-menu", table: "t-menu", x: 0, y: 0, foldMode: "NONE" },
    { diagram: "d-menu", table: "t-obj", x: 280, y: 0, foldMode: "NONE" },
    { diagram: "d-menu", table: "t-fav", x: 560, y: 0, foldMode: "NONE" },
  ],
  presence: [
    { session: "claude-a", userId: "41000207", source: "MCP", diagramId: null, selectedTables: [], at: "2026-10-10T10:00:01Z" },
    { session: "ui-41000207", userId: "41000207", source: "UI", diagramId: "d-menu", selectedTables: ["t-menu", "t-obj"], at: "2026-10-10T10:00:00Z" },
  ],
};

export const STATUS = {
  modelId: "mcm",
  ver: "1.000",
  rev: 12,
  statuses: {
    "c-m1": "OK", "c-m2": "NEW", "c-m3": "MISS", "c-o1": "ALIAS", "c-d1": "OK", "c-u1": "OK", "c-u2": "DOMAIN", "c-u3": "OK",
    "c-f1": "OK", "c-f2": "OK", "c-w1": "OK", "c-w2": "TYPE", "c-t1": "OK", "c-t2": "OK",
  },
  domains: { 12: { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 9, ALIAS: 1, NEW: 1, TYPE: 1, DOMAIN: 1, MISS: 1 },
  elapsedMs: 85,
};

export const GOLDEN = `# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12
TB_MCM_SEC_MENU 메뉴 {
  MENU_ID 메뉴아이디 VARCHAR2(30) PK NN [아이디]
  OBJECT_ID 오브젝트아이디 VARCHAR2(50) FK>TB_MCM_SEC_OBJ.OBJECT_ID? [아이디] !NEW
  MENU_NM 메뉴명 VARCHAR2(200) NN [도메인 99] !MISS
}
TB_MCM_SEC_MENU_FLD {
  MENU_ID - VARCHAR2(30) PK NN
}
TB_MCM_SEC_OBJ 오브젝트 {
  OBJECT_ID 오브젝트아이디 VARCHAR2(50) PK NN
}
TB_MCM_SEC_USER 사용자 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN
  PWD_FAIL_CNT 비밀번호실패수 NUMBER(3,0) !DOMAIN
  C_AT 생성일시 TIMESTAMP
}
TB_MCM_SEC_USER_FAVORITE 즐겨찾기 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER.USER_ID
  MENU_ID 메뉴아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_MENU.MENU_ID?
}
TB_MCM_SEC_USER_WIDGET 위젯 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER.USER_ID? FK>TB_MCM_SEC_USER_WIDGET_TAB.USER_ID
  TAB_ID 탭아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER_WIDGET_TAB.TAB_ID !TYPE
}
TB_MCM_SEC_USER_WIDGET_TAB 위젯탭 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN
  TAB_ID 탭아이디 VARCHAR2(30) PK NN
}
Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)
Ref TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID INFERRED (NAME_RULE)
Ref TB_MCM_SEC_USER_FAVORITE.USER_ID > TB_MCM_SEC_USER.USER_ID CONFIRMED (DOC csa-menu.dbml:512)
Ref TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID) DB (DB_FK FK_TB_MCM_SEC_USER_WIDGET_TAB)
Ref TB_MCM_SEC_USER_WIDGET.USER_ID > TB_MCM_SEC_USER.USER_ID INFERRED (SQL_JOIN WidgetRepo.java:41, NAME_RULE)`;
```

`scripts/erd/tests/model-text.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChanges,
  formatCurrentView,
  formatDbDiff,
  formatInferred,
  formatViolations,
  getModelText,
} from "../lib/model-text.mjs";
import { GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";

test("getModelText 골든: 표 물리명 순·컬럼 순서·PK·NN·FK(?)·도메인·!상태·Ref 줄", () => {
  assert.equal(getModelText(VIEW, STATUS), GOLDEN);
});

test("getModelText diagram: 그 다이어그램의 표만, Ref 는 양 끝이 다 있을 때만", () => {
  const text = getModelText(VIEW, STATUS, { diagram: "메뉴 화면" });
  assert.equal(text.split("\n")[0], "# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12 다이어그램 메뉴/메뉴 화면");
  assert.deepEqual(
    text.split("\n").filter((l) => /^\S.* \{$/.test(l)),
    ["TB_MCM_SEC_MENU 메뉴 {", "TB_MCM_SEC_OBJ 오브젝트 {", "TB_MCM_SEC_USER_FAVORITE 즐겨찾기 {"],
  );
  assert.match(text, /USER_ID 사용자아이디 VARCHAR2\(30\) PK NN FK>TB_MCM_SEC_USER\.USER_ID\n/);
  assert.deepEqual(
    text.split("\n").filter((l) => l.startsWith("Ref ")),
    [
      "Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)",
      "Ref TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID INFERRED (NAME_RULE)",
    ],
  );
  assert.equal(getModelText(VIEW, STATUS, { diagram: "d-menu" }), text);
  assert.equal(getModelText(VIEW, STATUS, { diagram: "메뉴/메뉴 화면" }), text);
  assert.throws(() => getModelText(VIEW, STATUS, { diagram: "없음" }), /있는 다이어그램: d-all\(기본\/전체\), d-menu\(메뉴\/메뉴 화면\)/);
});

test("빈 모델은 머리줄과 (표 없음)", () => {
  const empty = { ...VIEW, model: JSON.stringify({ schemaVersion: 1, model: { module: "mdm", schema: "MDMAPUSER" }, tables: {}, columns: {}, keys: {}, relations: {} }) };
  assert.equal(getModelText(empty, { statuses: {}, domains: {} }), "# MDM 모델 (MDMAPUSER) ver 1.000 DRAFT rev 12\n(표 없음)");
});

test("getCurrentView: 화면 세션(source=UI)만, 다이어그램 이름과 선택한 표의 물리명·논리명", () => {
  assert.equal(
    formatCurrentView(VIEW),
    "# 화면 세션 1개 (모델 mcm rev 12)\n" +
      "- ui-41000207 (41000207) 다이어그램 메뉴/메뉴 화면 · 선택 2개: TB_MCM_SEC_MENU 메뉴, TB_MCM_SEC_OBJ 오브젝트 · 2026-10-10T10:00:00Z",
  );
  assert.match(formatCurrentView(VIEW, { session: "claude-a" }), /화면 세션 claude-a 이 없습니다/);
  assert.match(formatCurrentView({ ...VIEW, presence: [] }), /열려 있는 화면 세션이 없습니다/);
});

test("getChangesSince 요약과 reload", () => {
  const changes = {
    rev: 14,
    reload: false,
    deltas: [{ modelId: "mcm", rev: 13, userId: "41000207", session: "ui-41000207", source: "UI", changes: [{ kind: "table", id: "t-1", op: "upsert", value: {} }] }],
  };
  assert.equal(formatChanges(changes, 12), "# rev 12 이후 변경 1건 (현재 rev 14)\nrev 13 41000207/ui-41000207 UI: table upsert t-1");
  assert.match(formatChanges({ rev: 20, reload: true, deltas: [] }, 12), /^# reload: .*현재 rev 20\. getModelText 로/);
});

test("listViolations: OK·ALIAS 를 뺀 컬럼, 상태 거르기", () => {
  assert.equal(
    formatViolations(VIEW, STATUS),
    [
      "# 표준 위반 4건 · 전체 NEW 1, TYPE 1, DOMAIN 1, MISS 1 · 판정 85ms",
      "TB_MCM_SEC_MENU.OBJECT_ID 오브젝트아이디 NEW [아이디]",
      "TB_MCM_SEC_MENU.MENU_NM 메뉴명 MISS [도메인 99]",
      "TB_MCM_SEC_USER.PWD_FAIL_CNT 비밀번호실패수 DOMAIN",
      "TB_MCM_SEC_USER_WIDGET.TAB_ID 탭아이디 TYPE",
    ].join("\n"),
  );
  assert.equal(formatViolations(VIEW, STATUS, { only: "MISS" }).split("\n").length, 2);
});

test("listInferredRelations: 접힌 후보는 includeFolded 일 때만", () => {
  assert.equal(
    formatInferred(VIEW),
    [
      "# 추정 관계 3개 · 접힌 후보 1개 뺌(includeFolded=true 로 봅니다)",
      "r-1 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID (DOC csa-menu.dbml:494, NAME_RULE)",
      "r-3 TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID 후보 1 (NAME_RULE)",
      "r-7 TB_MCM_SEC_USER_WIDGET.USER_ID > TB_MCM_SEC_USER.USER_ID (SQL_JOIN WidgetRepo.java:41, NAME_RULE)",
    ].join("\n"),
  );
  assert.match(formatInferred(VIEW, { includeFolded: true }), /r-4 TB_MCM_SEC_USER_FAVORITE\.MENU_ID > TB_MCM_SEC_MENU_FLD\.MENU_ID 후보 2/);
});

test("getDbDiff: 항목 id 와 컬럼 변경 전→후", () => {
  const diff = {
    modelId: "mcm",
    rev: 12,
    schema: "MCMAPUSER",
    items: [
      { id: "TABLE_ADDED:TB_MCM_NEW", kind: "TABLE_ADDED", table: "TB_MCM_NEW", column: null, before: null, after: null },
      {
        id: "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM",
        kind: "COLUMN_CHANGED",
        table: "TB_MCM_SEC_MENU",
        column: "MENU_NM",
        before: { dataType: "VARCHAR2", length: 100, scale: null, notNull: true },
        after: { dataType: "VARCHAR2", length: 200, scale: null, notNull: true },
      },
    ],
  };
  assert.equal(
    formatDbDiff(diff),
    "# DB 차이 2건 (스키마 MCMAPUSER, 모델 rev 12). 반영은 단계 2 에서 합니다.\n" +
      "TABLE_ADDED:TB_MCM_NEW\n" +
      "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM VARCHAR2(100) NN → VARCHAR2(200) NN",
  );
  assert.equal(formatDbDiff({ ...diff, items: [] }), "DB(MCMAPUSER) 와 모델(rev 12)이 같습니다.");
});
```

Run: `node --test scripts/erd/tests/model-text.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`(`lib/model-text.mjs`).

- [ ] **Step 5: 텍스트 형식 구현**

`scripts/erd/lib/model-text.mjs`:

```js
// ERD 모델·상태 응답을 LLM 이 읽을 텍스트로 바꾸는 순수 함수(단계 1 S17). 네트워크·파일을 쓰지 않는다.
// 입력: OASIS erdEdit view 응답(ErdModelView, model 은 MODEL_JSON 문자열), view kind=STATUS 응답(ErdStatusView),
//       view sinceRev 응답(ErdChangesView), compare kind=DB_DIFF 응답(ErdDbDiffView).

const QUIET = new Set(["OK", "ALIAS"]);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function modelOf(view) {
  const m = typeof view.model === "string" ? JSON.parse(view.model) : view.model;
  return {
    info: m?.model ?? {},
    tables: m?.tables ?? {},
    columns: m?.columns ?? {},
    keys: m?.keys ?? {},
    relations: m?.relations ?? {},
  };
}

/** 화면·텍스트에 그리는 관계: 기각하지 않았고, 허브 후보면 1순위만. */
export const isShown = (r) => r.state !== "REJECTED" && (r.candidateRank == null || r.candidateRank === 1);

function typeText(c) {
  if (!c.dataType) return "-";
  if (c.length == null) return c.dataType;
  return `${c.dataType}(${c.length}${c.scale != null ? `,${c.scale}` : ""})`;
}

function colsText(m, ids) {
  const names = ids.map((id) => m.columns[id]?.phys ?? "?");
  return names.length === 1 ? names[0] : `(${names.join(", ")})`;
}

function evidenceText(ev) {
  return (ev ?? [])
    .map((e) => (e.kind === "NAME_RULE" || !e.ref ? e.kind : `${e.kind} ${String(e.ref).split("/").pop()}`))
    .join(", ");
}

/** 다이어그램 id·이름·"업무영역/이름" 으로 찾는다. 없으면 있는 이름을 담아 오류. */
export function findDiagram(view, key) {
  const ds = view.diagrams ?? [];
  const d =
    ds.find((x) => x.id === key) ??
    ds.find((x) => x.diagramName === key) ??
    ds.find((x) => `${x.areaName}/${x.diagramName}` === key);
  if (!d) {
    const names = ds.map((x) => `${x.id}(${x.areaName}/${x.diagramName})`).join(", ") || "없음";
    throw new Error(`다이어그램을 찾을 수 없습니다: ${key}. 있는 다이어그램: ${names}`);
  }
  return d;
}

/** 표 id 목록(물리명 순). diagram 을 주면 그 다이어그램에 놓인 표만. */
function tableIds(view, m, diagram) {
  let ids = Object.keys(m.tables);
  if (diagram) {
    const onIt = new Set((view.nodes ?? []).filter((n) => n.diagram === diagram.id).map((n) => n.table));
    ids = ids.filter((id) => onIt.has(id));
  }
  return ids.sort((a, b) => cmp(m.tables[a].phys, m.tables[b].phys) || cmp(a, b));
}

/**
 * getModelText 형식(README "MCP 도구"):
 *   # MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12[ 다이어그램 업무영역/이름]
 *   표물리명 표논리명 {
 *     물리명 논리명 타입(길이[,스케일]) [PK] [NN] [FK>부모표.부모컬럼[?]]... [도메인이름] [!상태]
 *   }
 *   Ref 자식표.컬럼 > 부모표.컬럼 상태 (근거, ...)
 * - 표는 물리명 순, 컬럼은 columnOrder 순. 논리명이 비면 "-".
 * - FK 토큰은 컬럼마다 관계 하나에 하나(부모표·부모컬럼 순). 추정(INFERRED)은 끝에 "?". 다른 모델 부모(parentRef)는 "FK>@모델".
 * - 기각(REJECTED)과 candidateRank>1 관계는 쓰지 않는다.
 * - Ref 줄: 복합은 (A, B). diagram 을 주면 양 끝 표가 모두 그 다이어그램에 있을 때만 쓴다.
 * - 근거: NAME_RULE 은 종류만, 나머지는 "종류 파일이름:줄"(ref 의 마지막 / 뒤).
 */
export function getModelText(view, status, opts = {}) {
  const m = modelOf(view);
  const diagram = opts.diagram ? findDiagram(view, opts.diagram) : null;
  const ids = tableIds(view, m, diagram);
  const inSet = new Set(ids);
  const statuses = status?.statuses ?? {};
  const domains = status?.domains ?? {};
  const rels = Object.entries(m.relations).filter(([, r]) => isShown(r));

  const out = [];
  const head = `# ${String(m.info.module ?? view.modelId).toUpperCase()} 모델 (${m.info.schema ?? "-"}) ver ${view.ver} ${view.status} rev ${view.rev}`;
  out.push(diagram ? `${head} 다이어그램 ${diagram.areaName}/${diagram.diagramName}` : head);
  if (ids.length === 0) out.push("(표 없음)");

  for (const tid of ids) {
    const t = m.tables[tid];
    out.push(t.logical ? `${t.phys} ${t.logical} {` : `${t.phys} {`);
    const pk = new Set(
      Object.values(m.keys)
        .filter((k) => k.table === tid && k.kind === "PK")
        .flatMap((k) => k.columns),
    );
    for (const cid of t.columnOrder ?? []) {
      const c = m.columns[cid];
      if (!c) continue;
      const parts = [c.phys, c.logical || "-", typeText(c)];
      if (pk.has(cid)) parts.push("PK");
      if (c.notNull) parts.push("NN");
      const fks = [];
      for (const [, r] of rels) {
        if (r.child !== tid) continue;
        for (const [childCol, parentCol] of r.pairs ?? []) {
          if (childCol !== cid) continue;
          const mark = r.state === "INFERRED" ? "?" : "";
          if (r.parentRef) fks.push(`FK>@${r.parentRef.model}${mark}`);
          else fks.push(`FK>${m.tables[r.parent]?.phys ?? "?"}.${m.columns[parentCol]?.phys ?? "?"}${mark}`);
        }
      }
      parts.push(...fks.sort(cmp));
      if (c.domainId != null) parts.push(`[${domains[String(c.domainId)]?.name ?? `도메인 ${c.domainId}`}]`);
      const st = statuses[cid];
      if (st && !QUIET.has(st)) parts.push(`!${st}`);
      out.push(`  ${parts.join(" ")}`);
    }
    out.push("}");
  }

  const refLines = [];
  for (const [, r] of rels) {
    if (!inSet.has(r.child)) continue;
    if (diagram && !r.parentRef && !inSet.has(r.parent)) continue;
    const child = `${m.tables[r.child].phys}.${colsText(m, (r.pairs ?? []).map((p) => p[0]))}`;
    const parent = r.parentRef
      ? `@${r.parentRef.model}`
      : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[1]))}`;
    const ev = evidenceText(r.evidence);
    refLines.push(`Ref ${child} > ${parent} ${r.state}${ev ? ` (${ev})` : ""}`);
  }
  out.push(...refLines.sort(cmp));
  return out.join("\n");
}

/** getCurrentView: 화면 세션(source=UI)마다 다이어그램과 선택한 표. session 을 주면 그 세션만. */
export function formatCurrentView(view, opts = {}) {
  const m = modelOf(view);
  const ui = (view.presence ?? []).filter((p) => p.source === "UI" && (!opts.session || p.session === opts.session));
  if (ui.length === 0) {
    return opts.session
      ? `화면 세션 ${opts.session} 이 없습니다. 세션 이름을 확인하거나 session 없이 다시 부르세요.`
      : "열려 있는 화면 세션이 없습니다. 사용자가 m-mdm ERD 화면에서 모델을 열면 보입니다. 그동안은 getModelText 로 모델을 읽으세요.";
  }
  const lines = [`# 화면 세션 ${ui.length}개 (모델 ${view.modelId} rev ${view.rev})`];
  for (const p of ui) {
    const d = (view.diagrams ?? []).find((x) => x.id === p.diagramId);
    const where = d ? `다이어그램 ${d.areaName}/${d.diagramName}` : "다이어그램 없음";
    const sel = (p.selectedTables ?? []).map((id) => {
      const t = m.tables[id];
      return t ? (t.logical ? `${t.phys} ${t.logical}` : t.phys) : `${id}(모델에 없음)`;
    });
    lines.push(`- ${p.session} (${p.userId}) ${where} · 선택 ${sel.length}개${sel.length ? `: ${sel.join(", ")}` : ""} · ${p.at}`);
  }
  return lines.join("\n");
}

/** getChangesSince 요약. reload 면 다시 읽으라고 쓴다. */
export function formatChanges(changes, sinceRev) {
  if (changes.reload) {
    return `# reload: rev ${sinceRev} 이후 변경을 이어 줄 수 없습니다(DRAFT 를 새로 만들었거나 지웠거나, 500건을 넘었습니다). 현재 rev ${changes.rev}. getModelText 로 모델 전체를 다시 읽으세요.`;
  }
  const deltas = changes.deltas ?? [];
  const lines = [`# rev ${sinceRev} 이후 변경 ${deltas.length}건 (현재 rev ${changes.rev})`];
  for (const d of deltas) {
    const what = (d.changes ?? []).map((c) => `${c.kind} ${c.op} ${c.id}`).join(", ");
    lines.push(`rev ${d.rev} ${d.userId}/${d.session} ${d.source}: ${what || "(변경 없음)"}`);
  }
  return lines.join("\n");
}

/** listViolations: 상태가 OK·ALIAS 가 아닌 컬럼. only 를 주면 그 상태만. */
export function formatViolations(view, status, opts = {}) {
  const m = modelOf(view);
  const statuses = status?.statuses ?? {};
  const domains = status?.domains ?? {};
  const counts = status?.counts ?? {};
  const rows = [];
  for (const tid of tableIds(view, m, null)) {
    const t = m.tables[tid];
    for (const cid of t.columnOrder ?? []) {
      const st = statuses[cid];
      if (!st || QUIET.has(st) || (opts.only && st !== opts.only)) continue;
      const c = m.columns[cid];
      const dom = c.domainId != null ? ` [${domains[String(c.domainId)]?.name ?? `도메인 ${c.domainId}`}]` : "";
      rows.push(`${t.phys}.${c.phys} ${c.logical || "-"} ${st}${dom}`);
    }
  }
  const summary = ["NEW", "TYPE", "DOMAIN", "MISS"].map((k) => `${k} ${counts[k] ?? 0}`).join(", ");
  const head = `# 표준 위반 ${rows.length}건${opts.only ? ` (${opts.only} 만)` : ""} · 전체 ${summary} · 판정 ${status?.elapsedMs ?? "-"}ms`;
  return [head, ...rows].join("\n");
}

/** listInferredRelations: INFERRED 관계. includeFolded 가 아니면 candidateRank>1 을 뺀다. 관계 id 를 앞에 둔다. */
export function formatInferred(view, opts = {}) {
  const m = modelOf(view);
  const all = Object.entries(m.relations).filter(([, r]) => r.state === "INFERRED");
  const folded = all.filter(([, r]) => r.candidateRank != null && r.candidateRank > 1).length;
  const rows = all
    .filter(([, r]) => opts.includeFolded || r.candidateRank == null || r.candidateRank === 1)
    .map(([id, r]) => ({
      id,
      r,
      child: `${m.tables[r.child]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[0]))}`,
      parent: r.parentRef
        ? `@${r.parentRef.model}`
        : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[1]))}`,
    }))
    .sort((a, b) => cmp(a.child, b.child) || cmp(a.parent, b.parent) || cmp(a.id, b.id))
    .map(({ id, r, child, parent }) => {
      const rank = r.candidateRank == null ? "" : ` 후보 ${r.candidateRank}`;
      const ev = evidenceText(r.evidence);
      return `${id} ${child} > ${parent}${rank}${ev ? ` (${ev})` : ""}`;
    });
  const head = `# 추정 관계 ${rows.length}개 · 접힌 후보 ${folded}개 ${opts.includeFolded ? "포함" : "뺌(includeFolded=true 로 봅니다)"}`;
  return [head, ...rows].join("\n");
}

function colState(s) {
  if (!s) return "-";
  return `${s.dataType}${s.length != null ? `(${s.length}${s.scale != null ? `,${s.scale}` : ""})` : ""}${s.notNull ? " NN" : ""}`;
}

/** getDbDiff: 차이 항목. COLUMN_CHANGED 는 전→후 를 붙인다. */
export function formatDbDiff(diff) {
  const items = diff.items ?? [];
  if (items.length === 0) return `DB(${diff.schema}) 와 모델(rev ${diff.rev})이 같습니다.`;
  const lines = [`# DB 차이 ${items.length}건 (스키마 ${diff.schema}, 모델 rev ${diff.rev}). 반영은 단계 2 에서 합니다.`];
  for (const it of items) {
    lines.push(it.kind === "COLUMN_CHANGED" ? `${it.id} ${colState(it.before)} → ${colState(it.after)}` : it.id);
  }
  return lines.join("\n");
}
```

Run: `node --test scripts/erd/tests/model-text.test.mjs`
Expected: PASS 8건.

- [ ] **Step 6: MCP 서버 끝-끝 시험과 설정 시험 작성 (실패)**

SDK 의 `Client` + `StdioClientTransport` 로 `erd-mcp.mjs` 를 자식 프로세스로 띄우고, 가짜 OASIS 서버를 `ERD_BASE` 로 준다. `StdioClientTransport` 는 `env` 를 기본 환경(PATH·HOME 등)과 합친다.

`scripts/erd/tests/erd-mcp.test.mjs`:

```js
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";
import { failure, startFakeOasis, success } from "./fixtures/fake-oasis.mjs";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-mcp.mjs");

function route(action, params) {
  if (params.modelId !== "mcm") return failure("MDM029", "ERD 모델이 없습니다");
  if (action === "view" && params.kind === "STATUS") return success(STATUS);
  if (action === "view" && params.sinceRev != null) return success({ rev: 12, reload: false, deltas: [] });
  if (action === "view") return success(VIEW);
  if (action === "compare" && params.kind === "DB_DIFF") return success({ modelId: "mcm", rev: 12, schema: "MCMAPUSER", items: [] });
  return failure("MDM000", `가짜 서버가 모르는 요청: ${action}`);
}

test("stdio MCP 서버: 도구 6개, getModelText 골든, OASIS 오류는 isError", async () => {
  const fake = await startFakeOasis(route);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ERD_BASE: fake.url, ERD_USER: "41000207", ERD_SESSION: "claude-test" },
    stderr: "pipe",
  });
  let log = "";
  transport.stderr?.on("data", (c) => (log += c));
  const client = new Client({ name: "erd-mcp-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    assert.match(client.getInstructions() ?? "", /getCurrentView 로 사용자가 화면에서 보는/);

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["getChangesSince", "getCurrentView", "getDbDiff", "getModelText", "listInferredRelations", "listViolations"],
    );
    const gm = tools.find((t) => t.name === "getModelText");
    assert.deepEqual(gm.inputSchema.required, ["modelId"]);
    assert.ok(gm.inputSchema.properties.diagram);

    const text = await client.callTool({ name: "getModelText", arguments: { modelId: "mcm" } });
    assert.equal(text.isError ?? false, false);
    assert.equal(text.content[0].text, GOLDEN);
    const statusReq = fake.requests.find((r) => r.params.kind === "STATUS");
    assert.deepEqual(statusReq.params, { modelId: "mcm", kind: "STATUS", ver: "1.000" });
    assert.equal(statusReq.headers["x-authenticated-user"], "41000207");

    const since = await client.callTool({ name: "getChangesSince", arguments: { modelId: "mcm", rev: 12 } });
    assert.equal(since.content.length, 2);
    assert.deepEqual(JSON.parse(since.content[1].text), { rev: 12, reload: false, deltas: [] });

    const missing = await client.callTool({ name: "getModelText", arguments: { modelId: "nope" } });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /^\[MDM029\] ERD 모델이 없습니다\n다음: modelId 를 확인하세요/);

    assert.match(log, /erd-mcp 시작: http:\/\/127\.0\.0\.1:\d+ · 사용자 41000207 · 역할 MDM_STEWARD · 세션 claude-test/);
  } finally {
    await client.close();
    await fake.close();
  }
});
```

`scripts/erd/tests/mcp-config.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test(".mcp.json: erd 서버가 저장소의 erd-mcp.mjs 를 띄우고, 환경변수마다 기본값이 있다", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  const erd = cfg.mcpServers.erd;
  assert.equal(erd.command, "node");
  assert.deepEqual(erd.args, ["scripts/erd/erd-mcp.mjs"]);
  assert.ok(existsSync(join(ROOT, erd.args[0])));
  assert.deepEqual(Object.keys(erd.env).sort(), ["BACKEND_CLIENT_KEY", "ERD_BASE", "ERD_ROLE", "ERD_SESSION", "ERD_USER"]);
  for (const [k, v] of Object.entries(erd.env)) assert.match(v, new RegExp(`^\\$\\{${k}:-[^}]+\\}$`), `${k} 에 기본값이 없다`);
});
```

Run: `node --test scripts/erd/tests/erd-mcp.test.mjs scripts/erd/tests/mcp-config.test.mjs`
Expected: FAIL — erd-mcp 는 `MCP error -32000: Connection closed`(서버 파일이 없어 자식 프로세스가 바로 끝난다), mcp-config 는 `ENOENT ... .mcp.json`.

- [ ] **Step 7: MCP 서버와 `.mcp.json` 구현**

`scripts/erd/erd-mcp.mjs`:

```js
#!/usr/bin/env node
// ERD 모델 읽기용 stdio MCP 서버(단계 1). MDM 서버 OASIS erdEdit 를 감싸기만 한다(스펙 2.3).
// stdout 은 MCP 프로토콜 전용이다. 로그는 stderr(console.error)로만 쓴다.
// 환경변수: ERD_BASE(기본 http://localhost:8096) · ERD_USER(erd-mcp) · ERD_ROLE(MDM_STEWARD)
//           · BACKEND_CLIENT_KEY(dmes-bff-local-client-key-2026) · ERD_SESSION(mcp-<ERD_USER>)
// 의존성: @modelcontextprotocol/sdk·zod(루트 package.json). 처음 한 번 저장소 루트에서 pnpm install 을 돌린다.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";
import { formatChanges, formatCurrentView, formatDbDiff, formatInferred, formatViolations, getModelText } from "./lib/model-text.mjs";

/** 스펙 4.6 "LLM 이 쓰는 순서". 단계 1 서버는 읽기 도구만 있다. */
export const INSTRUCTIONS = [
  "ERD 모델(모듈 하나 = 모델 하나, 예: mcm·mdm)을 읽는 서버다. 이 서버는 읽기만 한다.",
  "쓰는 순서:",
  "1. getCurrentView 로 사용자가 화면에서 보는 다이어그램과 선택한 표를 확인하거나, getModelText 로 모델을 읽는다.",
  "2. claimTable 로 작업할 표를 선언한다. (단계 2 에서 추가)",
  "3. apply 로 명령을 묶어 보낸다. (단계 2 에서 추가)",
  "4. CONFLICT 를 받으면 getChangesSince(rev) 로 최신 상태를 확인하고 다시 보낸다.",
  "5. 끝나면 releaseTable 로 선언을 푼다. 선언은 만료 시간이 지나면 저절로 풀린다. (단계 2 에서 추가)",
  "표준 위반은 listViolations, 사람이 확인할 추정 관계는 listInferredRelations, DB 와 모델의 차이는 getDbDiff 로 본다.",
].join("\n");

const modelId = z.string().min(1).max(50).describe("ERD 모델 ID. 모듈 이름과 같다(예: mcm, mdm)");

export const TOOLS = {
  getModelText: {
    description:
      "모델을 DBML 비슷한 텍스트로 읽는다. 컬럼 줄: 물리명 논리명 타입 [PK] [NN] [FK>부모표.부모컬럼(?=추정)] [도메인] [!표준상태]. " +
      "끝에 Ref 줄(관계 상태와 근거)이 붙는다. 순서 1단계: 화면 상태가 없으면 이 도구로 시작한다. diagram 을 주면 그 다이어그램의 표만 쓴다.",
    inputSchema: { modelId, diagram: z.string().min(1).optional().describe("다이어그램 id, 이름, 또는 '업무영역/이름'") },
  },
  getCurrentView: {
    description:
      "사용자가 m-mdm ERD 화면에서 보고 있는 다이어그램과 선택한 표(물리명·논리명)를 세션마다 돌려준다. 순서 1단계: 사용자가 '이 표', '선택한 표' 라고 하면 먼저 부른다.",
    inputSchema: { modelId, session: z.string().min(1).optional().describe("화면 세션 이름. 주지 않으면 화면 세션 전부") },
  },
  getChangesSince: {
    description:
      "rev 이후의 변경 목록을 요약 텍스트와 JSON 으로 돌려준다. 순서 4단계: CONFLICT 를 받았거나 오래 쉬었으면 부른다. reload 가 오면 getModelText 로 다시 읽는다.",
    inputSchema: { modelId, rev: z.number().int().min(0).describe("마지막으로 본 rev") },
  },
  listViolations: {
    description:
      "표준 상태가 OK·ALIAS 가 아닌 컬럼(NEW 사전에 없는 새 이름, TYPE 같은 이름 다른 타입, DOMAIN 도메인과 다른 타입, MISS 사전에 없는 토막)을 돌려준다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, status: z.enum(["NEW", "TYPE", "DOMAIN", "MISS"]).optional().describe("이 상태만 본다") },
  },
  listInferredRelations: {
    description:
      "사람이 확정·기각할 추정(INFERRED) 관계를 관계 id·근거·후보 순위와 함께 돌려준다. 허브 컬럼의 2순위 이하 후보는 includeFolded=true 일 때만 나온다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, includeFolded: z.boolean().optional().describe("접힌 후보(candidateRank 2 이상)도 볼지") },
  },
  getDbDiff: {
    description:
      "DB 딕셔너리와 모델의 차이(표·컬럼 추가·사라짐·타입 변경, FK 추가·사라짐)를 돌려준다. 읽기만 한다. 반영은 단계 2 에서 추가한다.",
    inputSchema: { modelId },
  },
};

const ok = (...texts) => ({ content: texts.map((text) => ({ type: "text", text })) });

/** 도구 처리기. OASIS 오류는 던지지 않고 isError 결과로 돌려준다. */
export function handlers(client) {
  return {
    async getModelText({ modelId, diagram }) {
      const view = await client.call("view", { modelId });
      const status = await client.call("view", { modelId, kind: "STATUS", ver: view.ver });
      return ok(getModelText(view, status, { diagram }));
    },
    async getCurrentView({ modelId, session }) {
      return ok(formatCurrentView(await client.call("view", { modelId }), { session }));
    },
    async getChangesSince({ modelId, rev }) {
      const changes = await client.call("view", { modelId, sinceRev: rev });
      return ok(formatChanges(changes, rev), JSON.stringify(changes));
    },
    async listViolations({ modelId, status }) {
      const view = await client.call("view", { modelId });
      const st = await client.call("view", { modelId, kind: "STATUS", ver: view.ver });
      return ok(formatViolations(view, st, { only: status }));
    },
    async listInferredRelations({ modelId, includeFolded }) {
      return ok(formatInferred(await client.call("view", { modelId }), { includeFolded }));
    },
    async getDbDiff({ modelId }) {
      return ok(formatDbDiff(await client.call("compare", { modelId, kind: "DB_DIFF" })));
    },
  };
}

export function createErdServer(client) {
  const server = new McpServer({ name: "erd", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const h = handlers(client);
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, def, async (args) => {
      try {
        return await h[name](args);
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: describeError(e, client.config) }] };
      }
    });
  }
  return server;
}

async function main() {
  const config = configFromEnv(process.env);
  const server = createErdServer(createOasisClient(config));
  await server.connect(new StdioServerTransport());
  console.error(`erd-mcp 시작: ${config.base} · 사용자 ${config.user} · 역할 ${config.role} · 세션 ${config.session}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => {
    console.error(`erd-mcp 시작 실패: ${e?.stack ?? e}`);
    process.exitCode = 1;
  });
}
```

`.mcp.json`(저장소 루트, project scope). 토큰을 직접 넣지 않고 `${이름:-기본값}` 으로 둔다. 기본값이 있어 변수가 없어도 설정을 읽을 수 있다. `args` 는 저장소 루트 기준이므로 Claude Code 를 루트에서 띄운다.

```json
{
  "mcpServers": {
    "erd": {
      "command": "node",
      "args": ["scripts/erd/erd-mcp.mjs"],
      "env": {
        "ERD_BASE": "${ERD_BASE:-http://localhost:8096}",
        "ERD_USER": "${ERD_USER:-erd-mcp}",
        "ERD_ROLE": "${ERD_ROLE:-MDM_STEWARD}",
        "BACKEND_CLIENT_KEY": "${BACKEND_CLIENT_KEY:-dmes-bff-local-client-key-2026}",
        "ERD_SESSION": "${ERD_SESSION:-claude-erd}"
      }
    }
  }
}
```

- [ ] **Step 8: 통과 확인과 stdout 확인**

```bash
node --test scripts/erd/tests/
T=$(mktemp -d)
node scripts/erd/erd-mcp.mjs < /dev/null > "$T/out" 2> "$T/err" ; echo exit=$? ; wc -c < "$T/out" ; cat "$T/err" ; rm -rf "$T"
```
Expected:
- `node --test`: PASS 28건(Task 10 의 14 + oasis 4, model-text 8, erd-mcp 1, mcp-config 1).
- `exit=0`, stdout `0` 바이트(프로토콜 전용), stderr `erd-mcp 시작: http://localhost:8096 · 사용자 erd-mcp · 역할 MDM_STEWARD · 세션 mcp-erd-mcp`.

- [ ] **Step 9: 커밋**

```bash
/usr/bin/git add package.json pnpm-lock.yaml .mcp.json scripts/erd/erd-mcp.mjs scripts/erd/lib/oasis.mjs scripts/erd/lib/model-text.mjs \
  scripts/erd/tests/oasis.test.mjs scripts/erd/tests/model-text.test.mjs scripts/erd/tests/erd-mcp.test.mjs scripts/erd/tests/mcp-config.test.mjs \
  scripts/erd/tests/fixtures/erd-view.mjs scripts/erd/tests/fixtures/fake-oasis.mjs
/usr/bin/git status --short
/usr/bin/git commit -F - <<'EOF'
feat(erd): MCP 읽기 서버 — 모델 텍스트·화면 상태·변경·위반·추정 관계·DB 차이

stdio MCP 서버 scripts/erd/erd-mcp.mjs 가 OASIS erdEdit 를 감싸 읽기 도구 6개를 낸다.
@modelcontextprotocol/sdk·zod 를 루트 package.json 에 정확한 버전으로 고정하고 잠금 파일을 커밋한다(S16).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r
EOF
```
Expected: `git status --short` 에 `node_modules/` 가 없다. 커밋 1개.

---

## 계획 작성자 메모

- README 파일 구조에 없는 파일을 더했다: `scripts/erd/lib/hints-file.mjs`(모듈 배정·정렬·직렬화·비교), `scripts/erd/tests/fixtures/{erd-view,fake-oasis}.mjs`, `scripts/erd/tests/mcp-config.test.mjs`.
- S17 은 `getModelText` 를 "`erd-mcp.mjs` 안의 순수 함수" 라 했지만 README 파일 구조는 `lib/model-text.mjs` 다. 파일 구조를 따랐다(`erd-mcp.mjs` 가 import 한다).
- SQL_JOIN 등식에는 방향이 없다. 스크립트가 Flyway PK·UK 로 정하지만 양쪽이 모두 키가 아니면(예: PK 없는 `TB_MCM_CODE_*`) 표 이름·글 순서로 정하므로 실제와 반대일 수 있다. Task 3 은 SQL_JOIN 근거를 양방향으로 맞춰 보거나 DB 메타의 키로 방향을 다시 정해야 한다.
- 모듈 사이 근거와 다른 스키마(`MCM_SOURCE`·`MCAAPUSER`) 근거는 버린다(작성 시점 6건). 단계 1 가져오기는 모듈 사이 관계(`parentRef`)를 만들지 않기 때문이다.
- README 가 정하지 않은 `getModelText` 세부를 정했다: `diagram` 이 있으면 Ref 줄은 양 끝 표가 모두 그 다이어그램에 있을 때만 쓴다. 다른 모델 부모는 `FK>@모델`, 사전에 없는 도메인은 `[도메인 <id>]` 로 쓴다. 머리줄 끝에 ` 다이어그램 업무영역/이름` 을 붙인다.
- S16 의 "14일" 규칙으로 작성 시점에 고른 버전은 SDK 1.30.1·zod 4.6.5 다. 조사표(D)의 1.32.1 은 2026-10-05 공개라 규칙에 맞지 않는다.
- `.mcp.json` 의 `env` 는 `${이름:-기본값}` 형식이다. Task 12 Step 4-1 의 `jq` 출력에 기본값이 함께 보인다.
- Task 10·11 은 계획 글이 각각 약 960·1,140줄로 권장 상한(700)을 넘는다. 시험을 통과한 코드(Task 10 약 800줄, Task 11 약 900줄)를 그대로 실어서다. 줄이려면 시험 사례를 덜어내야 한다.
- `mdm.json` 은 `ErdEditService.java:102`·`:156` 같은 줄 번호를 ref 로 쓴다. 레인 BE(Task 1·4·5)가 그 파일을 고치므로 머지 뒤 `erd-hints.mjs --check` 가 줄 번호만 바뀌어 실패할 수 있다. Task 10 결함이 아니며 Task 12 가 다시 만들어 커밋한다.
