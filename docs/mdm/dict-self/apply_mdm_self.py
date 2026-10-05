"""MDM 자체 테이블(TB_MDM_*) 컬럼 → 앱 DB(mdm.db) 용어·도메인·컬럼 사전과 MDM 시스템별 필드 등록.

!! 경고 (2026-10-05): mcm 이 MDM 별칭(시스템 코드 MES,MDM)도 찾아 캐시한다. 이 스크립트는 SQL 로 별칭·컬럼을 직접 넣고
!! TB_MDM_META_REV(메타 변경 기록)를 남기지 않으므로, 이 스크립트로 별칭을 바꾸면 mcm 캐시가 낡은 채 남는다.
!! 별칭을 새로 넣거나 바꿀 때는 columnMng save 경로(scripts/mdm-meta/register-columns.mjs)를 쓴다 — 저장 서비스가 같은 트랜잭션에서
!! META_REV 를 남긴다. 이 스크립트를 이미 돌렸다면 실행 뒤 mcm 의 mdmCacheMng 화면에서 다시 읽기를 한다.
!! (META_REV 행을 이 스크립트가 직접 넣지 않는 이유: 키가 COLUMN 별칭뿐 아니라 LAYOUT·DOMAIN 으로도 펼쳐져 SQL 로 맞추기 어렵다.)

입력: 같은 폴더의 decisions.json (물리명마다 기존 표준 컬럼에 붙일지(map), 새로 만들지(new) 판정한 결과)

원칙
- 기존 행은 지우지 않는다. 기존 용어에는 별칭(ALIASES)과 시스템(SYSTEMS 에 "MDM")만 더한다.
- 다시 돌려도 같은 결과다(새 행은 이름으로 다시 찾는다).
- 한 시스템 안에서 필드명 하나는 표준 컬럼 하나에만 붙는다(02-term-domain-column.md 912행) — 어기면 멈춘다.
- 끝에 TB_MDM_* 의 모든 물리 컬럼이 MDM 시스템별 필드로 등록됐는지 확인한다.

사용: python3 apply_mdm_self.py [--db 경로] [--dry-run]
"""
import argparse, json, os, re, sqlite3, sys, time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../dict-candidates/apply'))
from apply_candidates import gen_ast  # 앱과 같은 엔진(AstExporter)으로 검증식 AST 를 만든다

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
AUDIT_USR, AUDIT_SVC, AUDIT_PGM = 'dict-self', 'dict-self', 'apply_mdm_self'
SRC_ORIGIN = 'MDM 자체 스키마 2026-10-01'
SYSTEM = 'MDM'
PHYS_RE = re.compile(r'^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$')
TERM_RE = re.compile(r'^[가-힣A-Za-z0-9]+$')
AUD_COLS = 'C_USR_ID,C_AT,C_SVC_ID,C_PGM_ID,U_USR_ID,U_AT,U_SVC_ID,U_PGM_ID,VER'


def jlist(s):
    return json.loads(s) if s else []


def jdump(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':')) if v else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--decisions', default=os.path.join(HERE, 'decisions.json'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    dec = json.load(open(a.decisions, encoding='utf-8'))
    rules = {i: d['std_rule'] for i, d in enumerate(dec['new_domains']) if d.get('std_rule')}
    asts = gen_ast(rules) if rules else {}

    if not a.dry_run:
        bak = f"{a.db}.bak-{datetime.now():%Y%m%d-%H%M%S}-dictself"
        src, dst = sqlite3.connect(a.db), sqlite3.connect(bak)
        src.backup(dst)
        dst.close(); src.close()
        print('백업:', bak)

    db = sqlite3.connect(a.db, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('BEGIN IMMEDIATE')
    now = int(time.time() * 1000)
    audit = (AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, 0)
    stat = {k: [0, 0] for k in ('term', 'alias', 'term_system', 'domain', 'column', 'column_system')}  # [추가, 기존]

    def touch(table, key_col, key):
        db.execute(f'update {table} set U_USR_ID=?, U_AT=?, U_SVC_ID=?, U_PGM_ID=?, VER=coalesce(VER,0)+1 where {key_col}=?',
                   (AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, key))

    # ── 새 용어
    new_term = {}
    for t in dec['new_terms']:
        name, sense = t['term_name'], t.get('sense_no') or 1
        if not TERM_RE.match(name) or not PHYS_RE.match(t['eng_abbr']):
            raise SystemExit(f'용어 이름·약어 규칙 위반: {name} {t["eng_abbr"]}')
        row = db.execute('select TERM_ID from TB_MDM_TERM where TERM_NAME=? and SENSE_NO=?', (name, sense)).fetchone()
        if row:
            new_term[name] = row[0]
            stat['term'][1] += 1
            continue
        cur = db.execute(
            f'insert into TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION,CONTEXT,ENG_NAME,ENG_ABBR,SYNONYMS,ALIASES,SYSTEMS,'
            f'STD_BASIS,SRC_ORIGIN,{AUD_COLS}) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (name, sense, t['definition'], t.get('context'), t['eng_name'], t['eng_abbr'], None,
             jdump(t.get('aliases')), jdump([SYSTEM]), t.get('source'), SRC_ORIGIN, *audit))
        new_term[name] = cur.lastrowid
        stat['term'][0] += 1

    # ── 기존 용어 별칭
    for x in dec['aliases']:
        row = db.execute('select ALIASES, ENG_ABBR from TB_MDM_TERM where TERM_ID=?', (x['term_id'],)).fetchone()
        al = jlist(row['ALIASES'])
        if x['alias'] == row['ENG_ABBR'] or x['alias'] in al:
            stat['alias'][1] += 1
            continue
        db.execute('update TB_MDM_TERM set ALIASES=? where TERM_ID=?', (jdump(al + [x['alias']]), x['term_id']))
        touch('TB_MDM_TERM', 'TERM_ID', x['term_id'])
        stat['alias'][0] += 1

    # ── 새 도메인
    new_domain = {}
    for i, d in enumerate(dec['new_domains']):
        row = db.execute('select DOMAIN_ID from TB_MDM_DOMAIN where STD_NAME=? or DOMAIN_NAME=?',
                         (d['std_name'], d['domain_name'])).fetchone()
        if row:
            new_domain[d['domain_name']] = row[0]
            stat['domain'][1] += 1
            continue
        cur = db.execute(
            f'insert into TB_MDM_DOMAIN (DOMAIN_NAME,STD_NAME,PARENT_DOMAIN_ID,DOMAIN_KIND,DATA_TYPE,LENGTH,SCALE,UNIT_CODE,'
            f'STD_RULE,STD_AST,DESCRIPTION,TEST_CASES,CHG_SEQ,{AUD_COLS}) values (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)',
            (d['domain_name'], d['std_name'], d.get('parent_domain_id'), d['domain_kind'], d['data_type'],
             d.get('length'), d.get('scale'), d.get('unit_code'), d.get('std_rule'), asts.get(i), d.get('description'),
             jdump(d.get('test_cases')), *audit))
        new_domain[d['domain_name']] = cur.lastrowid
        stat['domain'][0] += 1

    def term_ref(r):
        return r['term_id'] if 'term_id' in r else new_term[r['new_term']]

    # ── 표준 컬럼(new 먼저, same_as·map 은 그 뒤)
    col_of = {}
    for c in dec['columns']:
        if c['action'] != 'new':
            continue
        n = c['new_column']
        tids = [term_ref(r) for r in n['terms']]
        terms = [db.execute('select TERM_NAME, ENG_ABBR from TB_MDM_TERM where TERM_ID=?', (t,)).fetchone() for t in tids]
        if n['column_name'] != ' '.join(t[0] for t in terms) or n['phys_name'] != '_'.join(t[1] for t in terms):
            raise SystemExit(f"{c['phys']}: 이름이 구성 용어와 다르다 {n['column_name']}/{n['phys_name']} vs "
                             f"{' '.join(t[0] for t in terms)}/{'_'.join(t[1] for t in terms)}")
        if not PHYS_RE.match(n['phys_name']) or len(n['phys_name']) > 50:
            raise SystemExit(f"{c['phys']}: 표준 물리명 규칙 위반 {n['phys_name']}")
        dom = n['domain']['domain_id'] if 'domain_id' in n['domain'] else new_domain[n['domain']['new_domain']]
        row = db.execute('select COLUMN_ID, C_PGM_ID from TB_MDM_COLUMN where COLUMN_NAME=? or PHYS_NAME=?',
                         (n['column_name'], n['phys_name'])).fetchone()
        if row:
            if row[1] != AUDIT_PGM:
                raise SystemExit(f"{c['phys']}: 새 컬럼 {n['column_name']}({n['phys_name']}) 이 기존 컬럼 {row[0]} 과 겹친다")
            col_of[c['phys']] = row[0]
            stat['column'][1] += 1
            continue
        cur = db.execute(
            f'insert into TB_MDM_COLUMN (COLUMN_NAME,LABEL_LONG,LABEL_MID,LABEL_SHORT,PHYS_NAME,DESCRIPTION,DOMAIN_ID,'
            f'REQUIRED,DEFAULT_VALUE,TERM_IDS,USAGE_NOTE,CHG_SEQ,{AUD_COLS}) values (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)',
            (n['column_name'], n.get('label_long'), n.get('label_mid'), n.get('label_short'), n['phys_name'],
             n['description'], dom, n.get('required') or 0, n.get('default_value'), json.dumps(tids),
             n.get('usage_note'), *audit))
        col_of[c['phys']] = cur.lastrowid
        stat['column'][0] += 1
    for c in dec['columns']:
        if c['action'] == 'map':
            if not db.execute('select 1 from TB_MDM_COLUMN where COLUMN_ID=?', (c['column_id'],)).fetchone():
                raise SystemExit(f"{c['phys']}: 없는 컬럼 {c['column_id']}")
            col_of[c['phys']] = c['column_id']
    for c in dec['columns']:
        if c['action'] == 'same_as':
            col_of[c['phys']] = col_of[c['same_as_phys']]

    # ── MDM 시스템별 필드
    for c in dec['columns']:
        cid = col_of[c['phys']]
        other = db.execute('select COLUMN_ID from TB_MDM_COLUMN_SYSTEM where SYSTEM_CODE=? and PHYS_NAME=? and COLUMN_ID<>?',
                           (SYSTEM, c['phys'], cid)).fetchone()
        if other:
            raise SystemExit(f"{c['phys']}: MDM 필드명이 이미 다른 컬럼 {other[0]} 에 붙어 있다")
        cur = db.execute(
            f'insert or ignore into TB_MDM_COLUMN_SYSTEM (COLUMN_ID,SYSTEM_CODE,PHYS_NAME,TRANSFORM,NOTE,{AUD_COLS}) '
            f'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (cid, SYSTEM, c['phys'], None, c.get('note'), *audit))
        stat['column_system'][0 if cur.rowcount else 1] += 1

    # ── MDM 컬럼을 이루는 용어에 SYSTEMS "MDM" 추가
    tids = set()
    for cid in set(col_of.values()):
        tids.update(jlist(db.execute('select TERM_IDS from TB_MDM_COLUMN where COLUMN_ID=?', (cid,)).fetchone()[0]))
    for tid in sorted(tids):
        s = jlist(db.execute('select SYSTEMS from TB_MDM_TERM where TERM_ID=?', (tid,)).fetchone()[0])
        if SYSTEM in s:
            stat['term_system'][1] += 1
            continue
        db.execute('update TB_MDM_TERM set SYSTEMS=? where TERM_ID=?', (jdump(s + [SYSTEM]), tid))
        touch('TB_MDM_TERM', 'TERM_ID', tid)
        stat['term_system'][0] += 1

    # ── 검사: TB_MDM_* 의 모든 물리 컬럼이 MDM 필드로 등록됐나
    phys = {r[0] for t in db.execute("select name from sqlite_master where type='table' and name like 'TB_MDM_%'").fetchall()
            for r in db.execute(f"select name from pragma_table_info('{t[0]}')")}
    have = {r[0] for r in db.execute('select PHYS_NAME from TB_MDM_COLUMN_SYSTEM where SYSTEM_CODE=?', (SYSTEM,))}
    missing = sorted(phys - have)
    fk = db.execute('PRAGMA foreign_key_check').fetchall()
    if fk or missing:
        db.rollback()
        raise SystemExit(f'되돌림 — 외래 키 위반 {len(fk)}건 {fk[:5]}, 미등록 물리명 {missing}')
    db.rollback() if a.dry_run else db.commit()
    print(('[dry-run] ' if a.dry_run else '') + '추가/기존:', json.dumps(stat, ensure_ascii=False))
    print(f'MDM 물리 컬럼 {len(phys)}개 모두 등록됨')
    if not a.dry_run and any(v[0] for v in stat.values()):
        print('주의: META_REV 를 남기지 않았다 — mcm 의 mdmCacheMng 에서 다시 읽기를 하거나 columnMng save(scripts/mdm-meta/register-columns.mjs)를 쓴다.',
              file=sys.stderr)


if __name__ == '__main__':
    main()
