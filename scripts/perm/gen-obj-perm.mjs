#!/usr/bin/env node
// 오브젝트 허용 action 카탈로그 생성기 (perm-bench c2, decompose D7·D8·D12).
//
//   node scripts/perm/gen-obj-perm.mjs            # 검사만. 디스크와 다르면 종료 코드 1
//   node scripts/perm/gen-obj-perm.mjs --write    # 산출물 3개를 쓴다(V21 은 고정 — 아래 outputs 주석)
//
// 입력
//   - src/backend/**/src/main/resources/services/**/*.bpmn 의 actionGateway 가 내보내는 sequenceFlow `name`
//     (OASIS executor 가 input='action' 으로 분기하는 이름 = 게이트 토큰 = BTN action 코드, D7).
//     오브젝트 아이디 = BPMN process id (= 서비스·화면 id, TB_MCM_SEC_OBJ.OBJECT_ID 와 대소문자까지 같다).
//   - scripts/perm/rest-supplement.json : BPMN 으로 읽을 수 없는 action(REST·아직 머지 안 된 BPMN) 손 보충.
// 출력
//   - scripts/perm/obj-perm.generated.json
//   - src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/ObjPermCatalog.java
//   - src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V21__perm_model_backfill.sql
//   - scripts/perm/check-backfill.sql
// POPUP action: BPMN 에는 "어느 action 이 팝업을 여는가" 정보가 없다(버튼·팝업 구분은 화면 코드 몫).
//   그래서 생성기 popup 목록은 보충 파일의 popup 만 쓴다. 옛 POPUP_BTN 값은 V21 SQL 이 옛 데이터에서 직접 옮긴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BACKEND = path.join(ROOT, 'src', 'backend');
const MAX_CSV = 1000;
const OUT_JSON = path.join(HERE, 'obj-perm.generated.json');
const OUT_CHECK = path.join(HERE, 'check-backfill.sql');
const OUT_JAVA = path.join(ROOT, 'src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/ObjPermCatalog.java');
const OUT_V21 = path.join(ROOT, 'src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V21__perm_model_backfill.sql');
const ACTION_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

const write = process.argv.includes('--write');

function die(msg) {
  console.error('gen-obj-perm: ' + msg);
  process.exit(1);
}

// ── BPMN 수집 ──
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', 'archive', 'test', '.gradle', 'out', 'target'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.bpmn')) yield p;
  }
}
function servicesBpmns() {
  const found = [];
  for (const f of walk(BACKEND)) {
    const rel = f.replaceAll('\\', '/');
    if (/\/src\/main\/resources\/services\//.test(rel)) found.push(f);
  }
  return found.sort();
}

const fromBpmn = new Map(); // objectId -> Set(action)
const sources = new Map(); // objectId -> relative bpmn path
const noGateway = [];
for (const f of servicesBpmns()) {
  const rel = path.relative(ROOT, f).replaceAll('\\', '/');
  const text = fs.readFileSync(f, 'utf8');
  const proc = /<bpmn:process\s[^>]*?\bid="([^"]+)"/.exec(text);
  if (!proc) die(`process id 없음: ${rel}`);
  const hasGw = /<bpmn:exclusiveGateway\s[^>]*\bid="actionGateway"/.test(text);
  if (!hasGw) { noGateway.push(rel); continue; }
  const id = proc[1];
  if (fromBpmn.has(id)) die(`같은 process id ${id} 가 둘 이상: ${sources.get(id)} · ${rel}`);
  const acts = new Set();
  for (const m of text.matchAll(/<bpmn:sequenceFlow\s([^>]*?)\/?>/g)) {
    const attrs = m[1];
    if (!/\bsourceRef="actionGateway"/.test(attrs)) continue;
    const nm = /\bname="([^"]*)"/.exec(attrs);
    if (!nm || nm[1].trim() === '') die(`이름 없는 actionGateway 분기: ${rel}`);
    const name = nm[1].trim();
    if (!ACTION_RE.test(name)) die(`action 이름 모양이 이상함 '${name}': ${rel}`);
    acts.add(name);
  }
  fromBpmn.set(id, acts);
  sources.set(id, rel);
}

// ── 보충 합치기 ──
const supp = JSON.parse(fs.readFileSync(path.join(HERE, 'rest-supplement.json'), 'utf8'));
const catalog = new Map(); // objectId -> {btn:Set, popup:Set}
function ensure(id) {
  if (!catalog.has(id)) catalog.set(id, { btn: new Set(), popup: new Set() });
  return catalog.get(id);
}
for (const [id, acts] of fromBpmn) for (const a of acts) ensure(id).btn.add(a);
for (const [id, v] of Object.entries(supp)) {
  if (id.startsWith('_')) continue;
  const e = ensure(id);
  for (const a of v.btn ?? []) { if (!ACTION_RE.test(a)) die(`보충 action 모양 '${a}' (${id})`); e.btn.add(a); }
  for (const a of v.popup ?? []) { if (!ACTION_RE.test(a)) die(`보충 popup 모양 '${a}' (${id})`); e.popup.add(a); }
}

const sorted = [...catalog.keys()].sort();
const out = {};
for (const id of sorted) {
  const e = catalog.get(id);
  const btn = [...e.btn].sort();
  const popup = [...e.popup].sort();
  for (const [k, list] of [['btn', btn], ['popup', popup]]) {
    const csv = list.join(',');
    if (csv.length > MAX_CSV) die(`${id}.${k} csv ${csv.length}자 > ${MAX_CSV} (risk §6)`);
  }
  out[id] = { btn, popup };
}

// ── JSON ──
const jsonText = JSON.stringify(out, null, 2) + '\n';

// ── Java ──
const q = (s) => '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
let javaPuts = '';
for (const id of sorted) {
  const { btn, popup } = out[id];
  if (btn.length) javaPuts += `        BTN.put(${q(id)}, ${q(btn.join(','))});\n`;
  if (popup.length) javaPuts += `        POPUP.put(${q(id)}, ${q(popup.join(','))});\n`;
}
const javaText = `package com.dongkuk.dmes.mcm.init.seed;

import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * 오브젝트별 허용 action 카탈로그 — scripts/perm/gen-obj-perm.mjs 가 만든 파일이다. 손으로 고치지 않는다.
 *
 * <p>값은 BPMN actionGateway 분기 이름 + scripts/perm/rest-supplement.json 의 합집합(쉼표 구분, 정렬).
 * BTN = TB_MCM_SEC_OBJ.BTN_PERM, POPUP = TB_MCM_SEC_OBJ.POPUP_PERM 초기 값이다. 키 = OBJECT_ID(저장된 대소문자 그대로).
 * 바꾸려면 BPMN 이나 보충 파일을 고치고 {@code node scripts/perm/gen-obj-perm.mjs --write} 를 다시 돌린다.
 */
public final class ObjPermCatalog {

    private static final Map<String, String> BTN = new TreeMap<>();
    private static final Map<String, String> POPUP = new TreeMap<>();
    private static final Set<String> IDS;

    static {
${javaPuts}        Set<String> ids = new TreeSet<>(BTN.keySet());
        ids.addAll(POPUP.keySet());
        IDS = Collections.unmodifiableSet(ids);
    }

    private ObjPermCatalog() {
    }

    /** objectId(as in TB_MCM_SEC_OBJ, case as stored) -> csv of allowed BTN actions, or null if unknown */
    public static String btnPerm(String objectId) {
        return objectId == null ? null : BTN.get(objectId);
    }

    /** objectId -> csv of allowed POPUP actions, or null */
    public static String popupPerm(String objectId) {
        return objectId == null ? null : POPUP.get(objectId);
    }

    /** all object ids known to the catalog, in sorted order */
    public static Set<String> objectIds() {
        return IDS;
    }
}
`;

// ── SQL 공통 앞부분(WITH) ──
const sqlStr = (s) => "'" + s.replaceAll("'", "''") + "'";
const catBody = sorted.map((id, i) => {
  const { btn, popup } = out[id];
  const pop = popup.length ? sqlStr(popup.join(',')) : (i === 0 ? 'CAST(NULL AS VARCHAR2(1000 CHAR))' : 'NULL');
  return i === 0
    ? `    SELECT ${sqlStr(id)} AS OBJECT_ID, ${sqlStr(btn.join(','))} AS BTN_CSV, ${pop} AS POP_CSV FROM DUAL`
    : `    UNION ALL\n    SELECT ${sqlStr(id)}, ${sqlStr(btn.join(','))}, ${pop} FROM DUAL`;
}).join('\n');

const WITH_COMMON = `WITH CAT AS (
${catBody}
)
, N AS (
    SELECT /*+ MATERIALIZE */ LEVEL AS N
    FROM   DUAL
    CONNECT BY LEVEL <= 500
)
, CAT_TOK AS (
    SELECT /*+ MATERIALIZE */ C.OBJECT_ID, 'B' AS KIND, TRIM(REGEXP_SUBSTR(C.BTN_CSV, '[^,]+', 1, N.N)) AS TOKEN
    FROM   CAT C, N
    WHERE  N.N <= REGEXP_COUNT(C.BTN_CSV, ',') + 1
    UNION ALL
    SELECT C.OBJECT_ID, 'P', TRIM(REGEXP_SUBSTR(C.POP_CSV, '[^,]+', 1, N.N))
    FROM   CAT C, N
    WHERE  N.N <= REGEXP_COUNT(C.POP_CSV, ',') + 1
)
, SRC AS (
    SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'B' AS KIND
         , P.PERMISSION_COMMON || ',' || P.PERMISSION_CUSTOM || ',' || P.PERMISSION_ACTION AS CSV
    FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
    WHERE  R.ROLE_ID = M.ROLE_ID
    AND    O.OBJECT_ID = M.OBJECT_ID
    AND    P.PERMISSION_ID = M.PERMISSION_ID
    UNION ALL
    SELECT M.ROLE_ID, M.OBJECT_ID, M.PERMISSION_ID, 'P', P.POPUP_BTN
    FROM   TB_MCM_SEC_ROLE_MAPPING M, TB_MCM_SEC_ROLE R, TB_MCM_SEC_OBJ O, TB_MCM_SEC_PERM P
    WHERE  R.ROLE_ID = M.ROLE_ID
    AND    O.OBJECT_ID = M.OBJECT_ID
    AND    P.PERMISSION_ID = M.PERMISSION_ID
)
, TOK AS (
    SELECT /*+ MATERIALIZE */ S.ROLE_ID, S.OBJECT_ID, S.PERMISSION_ID, S.KIND, TRIM(REGEXP_SUBSTR(S.CSV, '[^,]+', 1, N.N)) AS TOKEN
    FROM   SRC S, N
    WHERE  N.N <= REGEXP_COUNT(S.CSV, ',') + 1
)
, EFF AS (
    SELECT T.ROLE_ID, T.OBJECT_ID, T.KIND, T.TOKEN
    FROM   TOK T, CAT_TOK C
    WHERE  C.OBJECT_ID(+) = T.OBJECT_ID
    AND    C.KIND(+) = T.KIND
    AND    C.TOKEN(+) = T.TOKEN
    AND    T.TOKEN IS NOT NULL
    AND    (T.PERMISSION_ID <> 'PERM_ALL' OR C.OBJECT_ID IS NOT NULL)
)`;
const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

const ROLE_PERM_SELECT = `, BTN AS (
    SELECT ROLE_ID, OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
    FROM   (SELECT DISTINCT ROLE_ID, OBJECT_ID, TOKEN
            FROM   EFF
            WHERE  KIND = 'B')
    GROUP BY ROLE_ID, OBJECT_ID
)
, POP AS (
    SELECT ROLE_ID, OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
    FROM   (SELECT DISTINCT ROLE_ID, OBJECT_ID, TOKEN
            FROM   EFF
            WHERE  KIND = 'P')
    GROUP BY ROLE_ID, OBJECT_ID
)
SELECT B.ROLE_ID, B.OBJECT_ID, B.CSV AS BTN_PERM, P.CSV AS POPUP_PERM
FROM   BTN B, POP P
WHERE  P.ROLE_ID(+) = B.ROLE_ID
AND    P.OBJECT_ID(+) = B.OBJECT_ID
AND    B.ROLE_ID NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')`;

const OBJ_SELECT = `, U_TOK AS (
    SELECT OBJECT_ID, KIND, TOKEN
    FROM   TOK
    WHERE  TOKEN IS NOT NULL
    AND    PERMISSION_ID <> 'PERM_ALL'
    UNION
    SELECT OBJECT_ID, KIND, TOKEN
    FROM   CAT_TOK
    WHERE  TOKEN IS NOT NULL
)
, BTN AS (
    SELECT OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
    FROM   U_TOK
    WHERE  KIND = 'B'
    GROUP BY OBJECT_ID
)
, POP AS (
    SELECT OBJECT_ID, LISTAGG(TOKEN, ',') WITHIN GROUP (ORDER BY TOKEN) AS CSV
    FROM   U_TOK
    WHERE  KIND = 'P'
    GROUP BY OBJECT_ID
)
SELECT X.OBJECT_ID, B.CSV AS BTN_PERM, P.CSV AS POPUP_PERM
FROM   TB_MCM_SEC_OBJ X, BTN B, POP P
WHERE  B.OBJECT_ID(+) = X.OBJECT_ID
AND    P.OBJECT_ID(+) = X.OBJECT_ID
AND    (B.OBJECT_ID IS NOT NULL OR P.OBJECT_ID IS NOT NULL)`;

const nObj = sorted.length;
const nAct = sorted.reduce((s, id) => s + out[id].btn.length + out[id].popup.length, 0);

const v21Text = `-- ============================================================
-- V21: 퍼미션 모델 v2 데이터 옮기기 — 옛 역할 매핑·권한 묶음 -> TB_MCM_SEC_ROLE_PERM, 오브젝트 허용 값 처음 채움
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 scripts/perm/gen-obj-perm.mjs 가 만든다(\`node scripts/perm/gen-obj-perm.mjs --write\`). 손으로 고치지 않는다.
--   카탈로그(아래 CAT) = BPMN actionGateway 분기 이름 + scripts/perm/rest-supplement.json. 오브젝트 ${nObj}개 · action ${nAct}개.
--
-- 배경 (docs/perm-bench/decompose.md 결정 D11·D12·D13·D19):
--   1) TB_MCM_SEC_ROLE_PERM: 옛 (ROLE_ID, OBJECT_ID, PERMISSION_ID) 여러 줄 -> (ROLE_ID, OBJECT_ID) 한 줄(D11).
--      BTN_PERM  = 묶음의 PERMISSION_COMMON ∪ PERMISSION_CUSTOM ∪ PERMISSION_ACTION 토큰 합집합(쉼표 분할·trim·중복 제거·정렬).
--      POPUP_PERM = 묶음의 POPUP_BTN 토큰 합집합.
--      PERM_ALL 묶음의 토큰은 그 오브젝트의 카탈로그 action 과 교집합만 쓴다(D12). 다른 묶음 토큰은 그대로 쓴다.
--      SYSADMIN(ROLE_SYSADMIN 별칭 포함) 줄은 옮기지 않는다 — 퍼미션 행 없이 계산한다(D13).
--      BTN_PERM 이 비는 줄(popup 만 있거나 교집합이 비는 줄)은 건너뛴다(BTN_PERM not null, D14).
--   2) TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM 처음 채움 = (PERM_ALL 아닌 묶음 토큰 중 그 오브젝트에 쓰인 것) ∪ 카탈로그 action(D12).
--      SYSADMIN 줄의 PERM_ALL 아닌 묶음 토큰도 포함한다. 이미 값이 있는 오브젝트는 건드리지 않는다.
--      DATA_PERM 은 비워 둔다(D21).
--   3) 부모(역할·오브젝트·묶음)가 없는 옛 줄 = 고아라 건너뛴다(D19). 건수는 scripts/perm/check-backfill.sql 이 보고한다.
--   POPUP 카탈로그: BPMN 에는 팝업을 여는 action 정보가 없어 카탈로그 popup 은 보충 파일에 적은 것만이다.
--   옛 TB_MCM_SEC_PERM·TB_MCM_SEC_ROLE_MAPPING 은 읽기만 하고 지우지 않는다(D10).
--   두 문장 모두 다시 실행해도 안전하다(MERGE: 이미 있는 퍼미션 줄·이미 채운 오브젝트는 그대로).
--   임시 표·DDL 없이 카탈로그를 리터럴 WITH 로 담는다(문장마다 같은 CAT 이 한 번 더 나온다).

-- ── 1. 역할×오브젝트 퍼미션 옮기기 ──
MERGE INTO TB_MCM_SEC_ROLE_PERM D
USING (
${indent(WITH_COMMON, 4)}
${indent(ROLE_PERM_SELECT, 4)}
) S
ON (D.ROLE_ID = S.ROLE_ID AND D.OBJECT_ID = S.OBJECT_ID)
WHEN NOT MATCHED THEN
    INSERT (ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, VER, C_USR_ID, C_AT, C_PGM_ID)
    VALUES (S.ROLE_ID, S.OBJECT_ID, S.BTN_PERM, S.POPUP_PERM, 0, 'V21', SYSTIMESTAMP, 'V21__perm_model_backfill');

-- ── 2. 오브젝트 허용 값 처음 채움 ──
MERGE INTO TB_MCM_SEC_OBJ O
USING (
${indent(WITH_COMMON, 4)}
${indent(OBJ_SELECT, 4)}
) S
ON (O.OBJECT_ID = S.OBJECT_ID)
WHEN MATCHED THEN
    UPDATE SET O.BTN_PERM = S.BTN_PERM
             , O.POPUP_PERM = S.POPUP_PERM
             , O.U_USR_ID = 'V21'
             , O.U_AT = SYSTIMESTAMP
             , O.U_PGM_ID = 'V21__perm_model_backfill'
    WHERE  O.BTN_PERM IS NULL
    AND    O.POPUP_PERM IS NULL;

COMMIT;
`;

const checkText = `-- ============================================================
-- 퍼미션 옮기기 점검 (읽기 전용) — scripts/perm/gen-obj-perm.mjs 가 만든다. 손으로 고치지 않는다.
-- ============================================================
-- 실행: MCMAPUSER 로 접속해 이 파일을 통째로 돌린다. 문장 둘 다 SELECT 뿐이다.
--   문장 1 = 옮기기 전(V20·V21 적용 전이어도 된다). 옛 표와 카탈로그만 읽어 V21 이 옮길 건수를 미리 보인다.
--   문장 2 = V20·V21 적용 뒤. 실제로 들어간 건수.
-- 항목 설명
--   OLD_MAPPING_ROWS          옛 TB_MCM_SEC_ROLE_MAPPING 줄 수
--   ORPHAN_ROLE/OBJ/PERM      부모(역할·오브젝트·묶음)가 없어 건너뛰는 옛 줄 수 (D19)
--   SKIP_SYSADMIN_ROWS        SYSADMIN·ROLE_SYSADMIN 이라 옮기지 않는 옛 줄 수 (D13)
--   PAIRS_CANDIDATE           옮길 후보 (ROLE_ID, OBJECT_ID) 쌍 수(SYSADMIN·고아 제외)
--   PAIRS_MIGRATE             BTN_PERM 이 비지 않아 실제로 옮길 쌍 수 = V21 이 만들 TB_MCM_SEC_ROLE_PERM 줄 수
--   PAIRS_EMPTY_BTN           BTN_PERM 이 비어 건너뛰는 쌍 수
--   OBJ_WILL_FILL             V21 이 BTN_PERM·POPUP_PERM 을 채울 오브젝트 수
--   OBJ_NO_VALUE              채울 값이 없어 NULL 로 남을 오브젝트 수(SYSADMIN 이 이 화면의 버튼을 못 쓰므로 보충 파일 점검)

${WITH_COMMON}
, PAIR_ALL AS (
    SELECT DISTINCT ROLE_ID, OBJECT_ID
    FROM   SRC
    WHERE  ROLE_ID NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')
)
, PAIR_BTN AS (
    SELECT DISTINCT ROLE_ID, OBJECT_ID
    FROM   EFF
    WHERE  KIND = 'B'
    AND    ROLE_ID NOT IN ('SYSADMIN', 'ROLE_SYSADMIN')
)
, U_TOK AS (
    SELECT OBJECT_ID
    FROM   TOK
    WHERE  TOKEN IS NOT NULL
    AND    PERMISSION_ID <> 'PERM_ALL'
    UNION
    SELECT OBJECT_ID
    FROM   CAT_TOK
    WHERE  TOKEN IS NOT NULL
)
SELECT 'OLD_MAPPING_ROWS' AS ITEM, COUNT(*) AS CNT
FROM   TB_MCM_SEC_ROLE_MAPPING
UNION ALL
SELECT 'ORPHAN_ROLE', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_ROLE R WHERE R.ROLE_ID = M.ROLE_ID)
UNION ALL
SELECT 'ORPHAN_OBJ', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_OBJ O WHERE O.OBJECT_ID = M.OBJECT_ID)
UNION ALL
SELECT 'ORPHAN_PERM', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  NOT EXISTS (SELECT 1 FROM TB_MCM_SEC_PERM P WHERE P.PERMISSION_ID = M.PERMISSION_ID)
UNION ALL
SELECT 'SKIP_SYSADMIN_ROWS', COUNT(*)
FROM   TB_MCM_SEC_ROLE_MAPPING M
WHERE  M.ROLE_ID IN ('SYSADMIN', 'ROLE_SYSADMIN')
UNION ALL
SELECT 'PAIRS_CANDIDATE', COUNT(*)
FROM   PAIR_ALL
UNION ALL
SELECT 'PAIRS_MIGRATE', COUNT(*)
FROM   PAIR_BTN
UNION ALL
SELECT 'PAIRS_EMPTY_BTN', COUNT(*)
FROM   PAIR_ALL A
WHERE  NOT EXISTS (SELECT 1 FROM PAIR_BTN B WHERE B.ROLE_ID = A.ROLE_ID AND B.OBJECT_ID = A.OBJECT_ID)
UNION ALL
SELECT 'OBJ_WILL_FILL', COUNT(*)
FROM   TB_MCM_SEC_OBJ X
WHERE  EXISTS (SELECT 1 FROM U_TOK U WHERE U.OBJECT_ID = X.OBJECT_ID)
UNION ALL
SELECT 'OBJ_NO_VALUE', COUNT(*)
FROM   TB_MCM_SEC_OBJ X
WHERE  NOT EXISTS (SELECT 1 FROM U_TOK U WHERE U.OBJECT_ID = X.OBJECT_ID);

-- 문장 2: V20·V21 적용 뒤 실제 건수
SELECT 'ROLE_PERM_ROWS' AS ITEM, COUNT(*) AS CNT
FROM   TB_MCM_SEC_ROLE_PERM
UNION ALL
SELECT 'OBJ_WITH_BTN_PERM', COUNT(*)
FROM   TB_MCM_SEC_OBJ
WHERE  BTN_PERM IS NOT NULL
UNION ALL
SELECT 'OBJ_WITHOUT_BTN_PERM', COUNT(*)
FROM   TB_MCM_SEC_OBJ
WHERE  BTN_PERM IS NULL;
`;

// 2026-11-28 — V21 은 시험·레인 DB 에 이미 적용된 Flyway 파일이라 다시 쓰지 않는다(한 글자만 바뀌어도 체크섬이 깨진다).
//   그 뒤 BPMN 에 더한 action 은 새 V 파일이 TB_MCM_SEC_OBJ.BTN_PERM 에 더한다(예: V24__user_lifecycle.sql 의 commUserMng).
//   v21Text 는 V21 을 처음 만들 때의 모양을 남기려고 계산만 한다.
void v21Text;
const outputs = [[OUT_JSON, jsonText], [OUT_JAVA, javaText], [OUT_CHECK, checkText]];
let drift = 0;
for (const [file, text] of outputs) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === text) { console.log('same    ' + rel); continue; }
  if (write) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { encoding: 'utf8' });
    console.log('written ' + rel);
  } else { drift++; console.log('DRIFT   ' + rel); }
}
console.log(`오브젝트 ${nObj}개 · action ${nAct}개 · BPMN ${fromBpmn.size}개(분기 없는 BPMN ${noGateway.length}개 건너뜀)`);
if (drift) process.exit(1);
