# SQLite 사본 읽기 도구(로컬 DB 가 Oracle 로 바뀐 뒤에는 SQLite 사본이 있을 때만 동작), Oracle 판은 후속(oracle-1007 b8).
"""MDM 사전 후보(candidates.sqlite) → 앱 DB(mdm.db) TB_MDM_TERM·DOMAIN·UNIT·COLUMN·COLUMN_SYSTEM 병합.

원칙
- 기존 행은 지우거나 고치지 않는다. 이름이 겹치면 기존 행을 쓰고 후보 쪽 참조를 그 ID 로 바꾼다.
- 다시 돌려도 같은 결과다(이미 들어간 행은 이름으로 다시 찾는다).
- 도메인 검증식 AST 는 앱과 같은 엔진(AstExporter)으로 만든다(AstGen.java).

사용: python3 apply_candidates.py [--db 경로] [--dry-run]
"""
import argparse, json, os, shutil, sqlite3, subprocess, sys, time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
CAND = os.path.join(HERE, '..', 'candidates.sqlite')
JAVA = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java'
ENGINE_JAR = os.path.join(ROOT, 'src/backend/maru-mdm-engine/build/libs/maru-mdm-engine-0.1.0-SNAPSHOT.jar')

AUDIT_USR, AUDIT_SVC, AUDIT_PGM = 'dict-candidates', 'dict-candidates', 'apply_candidates'
SRC_ORIGIN = 'llm-wiki 후보 2026-10-01'

# 후보 단위 → 앱 단위. 앱 규칙: 코드·차원 ^[A-Za-z0-9_]+$, 차원마다 기준 단위 하나.
UNIT_MAP = {  # 후보 코드: (앱 코드, 차원, 기준 단위, 계수)
    'm': ('m', 'LENGTH', 'mm', 1000), 'mm': ('mm', 'LENGTH', 'mm', 1), 'µm': ('um', 'LENGTH', 'mm', 0.001),
    'kg': ('kg', 'MASS', 'kg', 1), 'ton': ('ton', 'MASS', 'kg', 1000),
    'EA': ('EA', 'COUNT', 'EA', 1), '%': ('pct', 'RATIO', 'ratio', 0.01), '℃': ('degC', 'TEMPERATURE', 'degC', 1),
    'sec': ('s', 'TIME', 's', 1), 'min': ('min', 'TIME', 's', 60), 'hour': ('h', 'TIME', 's', 3600),
    'day': ('day', 'TIME', 's', 86400),
    'mpm': ('mpm', 'SPEED', 'mpm', 1), 'm/s': ('MPS', 'SPEED', 'mpm', 60),
    'pH': ('pH', 'ACIDITY', 'pH', 1),
    'kg/h': ('KG_H', 'MASS_FLOW', 'KG_H', 1), 'ton/h': ('TON_H', 'MASS_FLOW', 'KG_H', 1000),
    'Pa': ('Pa', 'PRESSURE', 'Pa', 1), 'MPa': ('MPa', 'PRESSURE', 'Pa', 1000000), 'bar': ('bar', 'PRESSURE', 'Pa', 100000),
    'GU': ('GU', 'GLOSS', 'GU', 1), 'g/m²': ('GPM2', 'AREAL_DENSITY', 'GPM2', 1), 'm²': ('M2', 'AREA', 'M2', 1),
    'deg': ('deg', 'ANGLE', 'deg', 1), 'KRW': ('KRW', 'CURRENCY', 'KRW', 1), 'A': ('A', 'CURRENT', 'A', 1),
    'rpm': ('rpm', 'ROTATION_SPEED', 'rpm', 1), 'Hz': ('Hz', 'FREQUENCY', 'Hz', 1), 'kHz': ('kHz', 'FREQUENCY', 'Hz', 1000),
    'W': ('W', 'POWER', 'W', 1), 'kW': ('kW', 'POWER', 'W', 1000),
}
DATA_TYPE_MAP = {'VARCHAR': 'STRING', 'CLOB': 'STRING', 'NUMBER': 'NUMBER', 'DATE': 'DATE', 'TIMESTAMP': 'DATE'}


def jnull(s):
    """빈 배열·null 은 NULL(앱이 비어 있으면 NULL 로 저장한다)."""
    if s is None:
        return None
    v = json.loads(s)
    return None if v == [] else json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def term_name(s):
    return s.replace(' ', '')  # 앱 규칙 ^[가-힣A-Za-z0-9]+$ — 후보 9건에 공백이 있다


def run_java(inp, *args):
    cp = ENGINE_JAR + ':' + subprocess.check_output(
        ['find', os.path.expanduser('~/.gradle/caches/modules-2'), '-name', 'EvalEx-3.7.0.jar'], text=True).split()[0]
    return subprocess.run([JAVA, '-cp', cp, os.path.join(HERE, 'AstGen.java'), *args], input=inp, capture_output=True,
                          text=True, check=True).stdout


def gen_ast(rules):
    out = run_java(''.join(f'{i}\t{r}\n' for i, r in rules.items()))
    res = {}
    for line in out.splitlines():
        i, ast, problems = line.split('\t')
        if not ast or problems:
            raise SystemExit(f'검증식 파싱·검사 실패: 도메인 {i} {problems}')
        res[int(i)] = ast
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    cand = sqlite3.connect(CAND)
    cand.row_factory = sqlite3.Row
    rules = {r['domain_id']: r['std_rule'] for r in cand.execute(
        "select domain_id, std_rule from MD_DOMAIN where std_rule is not null and domain_kind <> 'CODE'")}
    asts = gen_ast(rules)

    if not a.dry_run:
        bak = f"{a.db}.bak-{datetime.now():%Y%m%d-%H%M%S}-dictcand"
        src = sqlite3.connect(a.db)
        dst = sqlite3.connect(bak)
        src.backup(dst)
        dst.close(); src.close()
        print('백업:', bak)

    db = sqlite3.connect(a.db, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('BEGIN IMMEDIATE')
    now = int(time.time() * 1000)
    audit = (AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, 0)
    AUD_COLS = 'C_USR_ID,C_AT,C_SVC_ID,C_PGM_ID,U_USR_ID,U_AT,U_SVC_ID,U_PGM_ID,VER'
    stat = {k: [0, 0] for k in ('unit', 'term', 'domain', 'column', 'column_system')}  # [추가, 기존 사용]
    report = {'term': [], 'domain': [], 'column': [], 'abbr_dup': [], 'domain_rule': []}

    # ── 단위
    for u in cand.execute('select * from MD_UNIT'):
        code, dim, base, factor = UNIT_MAP[u['unit_code']]
        row = db.execute('select DIMENSION, BASE_UNIT, FACTOR from TB_MDM_UNIT where UNIT_CODE=?', (code,)).fetchone()
        if row:
            stat['unit'][1] += 1
            if (row[0], row[1]) != (dim, base) or abs(float(row[2]) - factor) > 1e-12:
                raise SystemExit(f'단위 {code} 정의가 기존과 다르다: {tuple(row)} vs {(dim, base, factor)}')
            continue
        db.execute(f'insert into TB_MDM_UNIT (UNIT_CODE,DIMENSION,BASE_UNIT,FACTOR,CHG_SEQ,{AUD_COLS}) '
                   f'values (?,?,?,?,0,?,?,?,?,?,?,?,?,?)', (code, dim, base, factor, *audit))
        stat['unit'][0] += 1

    # ── 용어
    term_id = {}
    for t in cand.execute('select * from MD_TERM order by term_id'):
        name = term_name(t['term_name'])
        row = db.execute('select TERM_ID, ENG_ABBR, C_PGM_ID from TB_MDM_TERM where TERM_NAME=? and SENSE_NO=?',
                         (name, t['sense_no'])).fetchone()
        if row:
            term_id[t['term_id']] = row[0]
            stat['term'][1] += 1
            if row[2] != AUDIT_PGM and row[1] != t['eng_abbr']:  # 이 스크립트가 넣지 않은 행과의 충돌만 보고
                report['term'].append(f"{name}: 기존 {row[1]} 유지 (후보 {t['eng_abbr']})")
            continue
        dup = db.execute('select TERM_NAME from TB_MDM_TERM where ENG_ABBR=?', (t['eng_abbr'],)).fetchone()
        if dup:
            report['abbr_dup'].append(f"{t['eng_abbr']}: 기존 {dup[0]} · 후보 {name}")
        cur = db.execute(
            f'insert into TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION,CONTEXT,ENG_NAME,ENG_ABBR,SYNONYMS,ALIASES,SYSTEMS,'
            f'STD_BASIS,SRC_ORIGIN,{AUD_COLS}) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (name, t['sense_no'], t['definition'], t['context'], t['eng_name'], t['eng_abbr'], jnull(t['synonyms']),
             jnull(t['aliases']), jnull(t['systems']), t['std_basis'], SRC_ORIGIN, *audit))
        term_id[t['term_id']] = cur.lastrowid
        stat['term'][0] += 1

    # ── 도메인(부모 먼저)
    doms = {d['domain_id']: d for d in cand.execute('select * from MD_DOMAIN')}
    domain_id = {}

    def effective(did):
        """기존 도메인의 유효 정의(부모 사슬에서 처음 나오는 값, 검증식은 모두)."""
        e = {'rules': []}
        while did:
            r = db.execute('select * from TB_MDM_DOMAIN where DOMAIN_ID=?', (did,)).fetchone()
            for k in ('DOMAIN_KIND', 'DATA_TYPE', 'UNIT_CODE', 'LENGTH', 'SCALE', 'MARU_CODE_ID'):
                e.setdefault(k, r[k]) if e.get(k) is None else None
            if r['STD_RULE']:
                e['rules'].append(r['STD_RULE'])
            did = r['PARENT_DOMAIN_ID']
        return e

    def compatible(d, did):
        """후보 도메인 값을 기존 도메인이 그대로 받을 수 있나 — 아니면 후보 도메인을 따로 넣는다."""
        e = effective(did)
        why = []
        unit = UNIT_MAP[d['unit_code']][0] if d['unit_code'] else None
        if e['DOMAIN_KIND'] != d['domain_kind'] or e['DATA_TYPE'] != DATA_TYPE_MAP[d['data_type']]:
            why.append(f"종류·타입 {e['DOMAIN_KIND']}/{e['DATA_TYPE']}")
        if e['UNIT_CODE'] != unit:
            why.append(f"단위 {e['UNIT_CODE']}≠{unit}")
        if e['LENGTH'] is not None and (d['length'] is None or e['LENGTH'] < d['length']):
            why.append(f"길이 {e['LENGTH']}<{d['length']}")
        if e['DATA_TYPE'] == 'NUMBER' and e['LENGTH'] is not None and d['length'] is not None:
            if (e['LENGTH'] - (e['SCALE'] or 0)) < (d['length'] - (d['scale'] or 0)) or (e['SCALE'] or 0) < (d['scale'] or 0):
                why.append(f"자리 ({e['LENGTH']},{e['SCALE']})<({d['length']},{d['scale']})")
        if e['MARU_CODE_ID'] and e['MARU_CODE_ID'] != d['maru_code_id']:
            why.append(f"코드 참조 {e['MARU_CODE_ID']}")
        if e['rules']:
            cases = json.loads(d['test_cases'])
            if not cases:
                why.append('기존 검증식을 확인할 후보 테스트 없음')
            typ = 'NUMBER' if e['DATA_TYPE'] == 'NUMBER' else 'STRING'
            out = run_java(''.join(f"{did}\t{typ}\t{c['input']}\t{str(bool(c['expected'])).lower()}\t" + '\x01'.join(e['rules']) + '\n'
                                   for c in cases), 'test')
            bad = [l.split('\t')[1] for l in out.splitlines() if l.split('\t')[2] != l.split('\t')[3].split('(')[0]]
            if bad:
                why.append(f"기존 검증식과 다른 판정 {bad}")
        return why

    def alt_names(d):
        spec = f"{d['length'] or ''}{',' + str(d['scale']) if d['scale'] else ''}"
        unit = UNIT_MAP[d['unit_code']][0] if d['unit_code'] else ''
        return f"{d['domain_name']} ({spec}{' ' + unit if unit else ''})".replace('( ', '('), f"{d['std_name']}_{d['length'] or 'X'}"

    def put_domain(cid):
        if cid in domain_id:
            return domain_id[cid]
        d = doms[cid]
        parent = put_domain(d['parent_domain_id']) if d['parent_domain_id'] else None
        row = (db.execute('select DOMAIN_ID, DOMAIN_NAME, STD_NAME, C_PGM_ID from TB_MDM_DOMAIN where STD_NAME=?', (d['std_name'],)).fetchone()
               or db.execute('select DOMAIN_ID, DOMAIN_NAME, STD_NAME, C_PGM_ID from TB_MDM_DOMAIN where DOMAIN_NAME=?', (d['domain_name'],)).fetchone())
        name, std = d['domain_name'], d['std_name']
        if row and row[3] != AUDIT_PGM:
            why = compatible(d, row[0])
            if why:  # 기존 도메인과 맞지 않으면 이름을 바꿔 따로 넣는다
                name, std = alt_names(d)
                report['domain'].append(f"{d['domain_name']}({d['std_name']}) ↛ 기존 {row[0]} {row[1]}: {'; '.join(why)} → 새 도메인 {name}({std})")
                row = db.execute('select DOMAIN_ID, DOMAIN_NAME, STD_NAME, C_PGM_ID from TB_MDM_DOMAIN where STD_NAME=?', (std,)).fetchone()
            else:
                report['domain'].append(f"{d['domain_name']}({d['std_name']}) → 기존 {row[0]} {row[1]}({row[2]}) 사용")
        if row:
            domain_id[cid] = row[0]
            stat['domain'][1] += 1
            return row[0]
        code = d['domain_kind'] == 'CODE'
        tcs = [{'value': c['input'], 'expect': bool(c['expected'])} for c in json.loads(d['test_cases'])]
        cur = db.execute(
            f'insert into TB_MDM_DOMAIN (DOMAIN_NAME,STD_NAME,PARENT_DOMAIN_ID,DOMAIN_KIND,DATA_TYPE,LENGTH,SCALE,UNIT_CODE,'
            f'MARU_CODE_ID,CATE_ID,STD_RULE,STD_AST,DESCRIPTION,EXAMPLES,TEST_CASES,CHG_SEQ,{AUD_COLS}) '
            f'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)',
            (name, std, parent, d['domain_kind'], DATA_TYPE_MAP[d['data_type']], d['length'],
             d['scale'], UNIT_MAP[d['unit_code']][0] if d['unit_code'] else None, d['maru_code_id'], d['cate_id'],
             None if code else d['std_rule'], None if code or not d['std_rule'] else asts[cid], d['description'],
             jnull(d['examples']), json.dumps(tcs, ensure_ascii=False, separators=(',', ':')) if tcs else None, *audit))
        domain_id[cid] = cur.lastrowid
        stat['domain'][0] += 1
        return cur.lastrowid

    for cid in sorted(doms):
        put_domain(cid)

    # ── 컬럼
    column_id = {}
    for c in cand.execute('select * from MD_COLUMN order by column_id'):
        row = db.execute('select COLUMN_ID, COLUMN_NAME, PHYS_NAME, C_PGM_ID, DOMAIN_ID from TB_MDM_COLUMN where COLUMN_NAME=? or PHYS_NAME=?',
                         (c['column_name'], c['phys_name'])).fetchone()
        if row:
            column_id[c['column_id']] = row[0]
            stat['column'][1] += 1
            if row[3] == AUDIT_PGM and row[4] != domain_id[c['domain_id']]:  # 이전 실행이 넣은 행의 도메인 바로잡기
                db.execute('update TB_MDM_COLUMN set DOMAIN_ID=?, U_AT=? where COLUMN_ID=?', (domain_id[c['domain_id']], now, row[0]))
                stat.setdefault('column_domain_fixed', 0)
                stat['column_domain_fixed'] += 1
            if row[3] != AUDIT_PGM:
                report['column'].append(f"{c['column_name']}({c['phys_name']}) → 기존 {row[0]} {row[1]}({row[2]})")
            continue
        tids = [term_id[x] for x in json.loads(c['term_ids'])]
        cur = db.execute(
            f'insert into TB_MDM_COLUMN (COLUMN_NAME,LABEL_LONG,LABEL_MID,LABEL_SHORT,PHYS_NAME,DESCRIPTION,DOMAIN_ID,REQUIRED,'
            f'DEFAULT_VALUE,REF_KIND,REF_TARGET,REF_CATE_ID,TERM_IDS,USAGE_NOTE,CHG_SEQ,{AUD_COLS}) '
            f'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)',
            (c['column_name'], c['label_long'], c['label_mid'], c['label_short'], c['phys_name'], c['description'],
             domain_id[c['domain_id']], c['required'], c['default_value'], c['ref_kind'], c['ref_target'],
             c['ref_cate_id'], json.dumps(tids) if tids else None, c['usage_note'], *audit))
        column_id[c['column_id']] = cur.lastrowid
        stat['column'][0] += 1

    # ── 시스템별 필드
    for s in cand.execute('select * from MD_COLUMN_SYSTEM'):
        cur = db.execute(
            f'insert or ignore into TB_MDM_COLUMN_SYSTEM (COLUMN_ID,SYSTEM_CODE,PHYS_NAME,TRANSFORM,NOTE,{AUD_COLS}) '
            f'values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (column_id[s['column_id']], s['system_code'], s['phys_name'], s['transform'], s['note'], *audit))
        stat['column_system'][0 if cur.rowcount else 1] += 1

    # ── 앱 도메인 규칙(DomainRuleChecker S02·R06·QTY 단위) 점검 — 들어간 도메인만
    for d in db.execute('select c.DOMAIN_ID, c.DOMAIN_NAME, c.DOMAIN_KIND, c.DATA_TYPE, c.UNIT_CODE, c.LENGTH, c.SCALE, '
                        'p.DOMAIN_NAME PN, p.DOMAIN_KIND PK, p.DATA_TYPE PT, p.UNIT_CODE PU, p.LENGTH PL, c.PARENT_DOMAIN_ID '
                        'from TB_MDM_DOMAIN c left join TB_MDM_DOMAIN p on p.DOMAIN_ID=c.PARENT_DOMAIN_ID where c.C_PGM_ID=?',
                        (AUDIT_PGM,)):
        name = f"{d['DOMAIN_NAME']}({d['DOMAIN_ID']})"
        if d['DOMAIN_KIND'] == 'QTY' and d['PARENT_DOMAIN_ID'] is None and d['UNIT_CODE'] is None:
            report['domain_rule'].append(f'{name}: QTY 최상위인데 단위 없음')
        if d['SCALE'] is not None and d['LENGTH'] is not None and d['SCALE'] > d['LENGTH']:
            report['domain_rule'].append(f'{name}: 소수 자리 > 길이')
        if d['PARENT_DOMAIN_ID'] is not None:
            for f, pf in (('DOMAIN_KIND', 'PK'), ('DATA_TYPE', 'PT')):
                if d[f] != d[pf]:
                    report['domain_rule'].append(f"{name}: {f} {d[f]} ≠ 부모 {d['PN']} {d[pf]}")
            if d['UNIT_CODE'] is not None and d['UNIT_CODE'] != d['PU']:
                report['domain_rule'].append(f"{name}: 단위 {d['UNIT_CODE']} ≠ 부모 {d['PN']} {d['PU']}")
            if d['LENGTH'] is not None and d['PL'] is not None and d['LENGTH'] > d['PL']:
                report['domain_rule'].append(f"{name}: 길이 {d['LENGTH']} > 부모 {d['PN']} {d['PL']}")

    fk = db.execute('PRAGMA foreign_key_check').fetchall()
    if fk:
        db.rollback()
        raise SystemExit(f'외래 키 위반 {len(fk)}건 — 되돌림: {fk[:5]}')
    if a.dry_run:
        db.rollback()
    else:
        db.commit()

    print(('[dry-run] ' if a.dry_run else '') + '추가/기존사용:', json.dumps(stat, ensure_ascii=False))
    for k, v in report.items():
        print(f'\n## {k} ({len(v)})')
        for x in v:
            print('-', x)


if __name__ == '__main__':
    main()
