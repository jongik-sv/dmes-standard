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
