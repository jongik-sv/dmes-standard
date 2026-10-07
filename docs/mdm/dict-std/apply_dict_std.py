# SQLite 사본 읽기 도구(로컬 DB 가 Oracle 로 바뀐 뒤에는 SQLite 사본이 있을 때만 동작), Oracle 판은 후속(oracle-1007 b8).
"""표준용어.xls(GlueMaster export) · 용어집.xlsx → 앱 DB(mdm.db) 용어 사전(TB_MDM_TERM) 병합.

원칙
- 기존 용어(컬럼 TERM_IDS 가 참조하는 MDM 컬럼 유래 용어)는 지우지 않고 TERM_ID 를 유지한 채 고친다.
- 엑셀 칸은 하나도 버리지 않는다. 칸마다 아래 자리에 옮기고, 행마다 모든 칸을 적은 근거 줄을 STD_BASIS 에 남긴다.
  끝에 엑셀 행의 비어 있지 않은 모든 칸 값이 붙은 용어 행 안에 있는지 대조하고, 하나라도 빠지면 롤백한다.
- 다시 돌려도 결과가 같다(근거 줄은 출처 행 번호로 중복 제거, 새 용어는 이름·정의·영문명으로 다시 찾는다).

칸 매핑
  용어집.xlsx  용어(변경후)→TERM_NAME  정의→DEFINITION(기존 용어도 덮어씀, 옛 값은 changes.json)
               영문→ENG_NAME(있으면 덮어씀)  영문약어→ENG_ABBR(비어 있을 때만)  용어(변경전)→SYNONYMS(신규·자기 자신 제외)
               모듈→CONTEXT  프로그램→SYSTEMS(APS·MES·ERP)  전 칸→STD_BASIS 근거 줄
  표준용어.xls 표준용어→TERM_NAME(빈 1행은 영문명)  영문 Full Name→ENG_NAME(비어 있을 때만, 'Required' 자리표시는 제외)
               항목 ID→ENG_ABBR(비어 있을 때만, 충돌은 컬럼 물리명 근거로 판정)  약어명→ALIASES(표기·항목 ID 와 다를 때)
               시스템→SYSTEMS  체인한글명→CONTEXT(새 용어만)  no.·용어구분·부문·등록일 포함 전 칸→STD_BASIS 근거 줄
  정의가 없는 표준용어 용어의 DEFINITION 은 '' 다(NOT NULL). 화면에서 고쳐 저장하려면 정의를 채워야 한다.

같은 이름 안에서 뜻(SENSE_NO) 나누기
- 용어집: 정의가 다르면 다른 뜻이다(예: BOM 설비관리·생산관리).
- 표준용어: 영문명이 다르면 다른 뜻이다(예: BR = BackupRoll·BendingRoll…). 철자만 다른 영문(유사도 0.85 이상)과
  자리표시 행(영문 없음·'Required'·표기와 같은 영문)은 같은 뜻으로 묶는다.
- 대소문자만 다른 표기(Mo 몰리브덴 ↔ MO 제조오더)는 영문명이 비슷할 때만 합친다.
- 용어집 용어 중 GL_DIFFERENT_SENSE 는 기존 용어와 이름만 같고 뜻이 달라 새 뜻으로 넣는다.
- 기존 용어와 이름이 같으면 첫 묶음은 기존 뜻(가장 작은 SENSE_NO, 영문명이 맞는 뜻 우선)에 합치고 나머지는 새 뜻으로 넣는다.
  용어집 묶음이 여럿이면 기존 정의와 글자 2-gram 이 가장 많이 겹치는 묶음을 기존 뜻에 합친다.

사용: .venv/bin/python apply_dict_std.py --std 표준용어.xls --glossary 용어집.xlsx [--db 경로] [--dry-run]
의존: pandas, openpyxl, lxml
"""
import argparse, difflib, json, os, re, sqlite3, sys, time
from collections import defaultdict
from datetime import datetime

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
AUDIT_USR, AUDIT_SVC, AUDIT_PGM = 'dict-std', 'dict-std', 'apply_dict_std'
ORIGIN_STD = '표준용어.xls 2026-10-02'
ORIGIN_GL = '용어집.xlsx 2026-10-02'
TAG_STD, TAG_GL = '표준용어.xls', '용어집.xlsx'
STD_COLS = ['no.', '시스템', '체인한글명', '표준용어', '영문 Full Name', '항목 ID', '약어명', '용어구분', '부문', '등록일']
GL_COLS = ['프로그램', '모듈', '용어(변경후)', '용어(변경전)', '영문약어', '영문', '정의']
PROGRAM_SYSTEM = {'APS 용어': 'APS', 'MES 용어': 'MES', 'ERP 용어': 'ERP'}
MODULE_SYSTEM = {'ERP 단위 업무': 'ERP', 'APS 단위 업무': 'APS', 'MES 단위 업무': 'MES'}
# 이름은 같지만 기존 용어와 뜻이 다른 용어집 용어(2026-10-02 44건을 정의로 직접 판정). 기존 뜻을 덮지 않고 새 뜻으로 넣는다.
GL_DIFFERENT_SENSE = {'보급', '분기', '분류', '클래스', '확정', '액티비티', '차원', 'PI', '조건', '예약'}
TERM_FIELDS = ['TERM_NAME', 'DEFINITION', 'CONTEXT', 'ENG_NAME', 'ENG_ABBR', 'SYNONYMS', 'ALIASES', 'SYSTEMS',
               'STD_BASIS', 'SRC_ORIGIN']


def key(s):
    return re.sub(r'\s+', '', s or '').upper()


def ws(s):
    return re.sub(r'\s+', '', s or '')


def eng_key(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def similar(a, b):
    a, b = eng_key(a), eng_key(b)
    return bool(a) and bool(b) and (a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85)


def jlist(s):
    return json.loads(s) if s else []


def jdump(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':')) if v else None


def add_unique(lst, *vals):
    for v in vals:
        if v and v not in lst:
            lst.append(v)


def basis_line(tag, rowref, cells):
    return f"{tag} {rowref}: " + ', '.join(f"{c}={v}" for c, v in cells if v)


# ──────────────────────────── 원천 읽기 → 묶음 ────────────────────────────

def read_std(path):
    df = pd.read_html(path, header=0, keep_default_na=False)[0].astype(str)
    assert list(df.columns) == STD_COLS, df.columns.tolist()
    return [{c: df.at[i, c].strip() for c in STD_COLS} for i in df.index]


def read_glossary(path):
    df = pd.read_excel(path, dtype=str, keep_default_na=False)
    assert list(df.columns) == GL_COLS, df.columns.tolist()
    rows = []
    for i in df.index:
        r = {c: df.at[i, c].strip() for c in GL_COLS}
        r['_row'] = i + 2  # 엑셀 행 번호(1행 머리글)
        rows.append(r)
    return rows


def std_groups(rows):
    """표준용어 행 → 이름별 뜻 묶음 목록."""
    by_name = defaultdict(list)
    for r in rows:
        name = r['표준용어'] or r['영문 Full Name']
        r['_name'] = name
        r['_eng'] = '' if r['영문 Full Name'] == 'Required' else r['영문 Full Name']
        by_name[key(name)].append(r)
    out = []
    for k, rs in by_name.items():
        real = [r for r in rs if r['_eng'] and eng_key(r['_eng']) != eng_key(r['_name'])]
        filler = [r for r in rs if r not in real]
        clusters = []
        for r in real:
            for c in clusters:
                if similar(c[0]['_eng'], r['_eng']):
                    c.append(r)
                    break
            else:
                clusters.append([r])
        if clusters:
            clusters[0].extend(filler)
        else:
            clusters = [filler]
        for c in clusters:
            eng = next((r['_eng'] for r in c if r in real), '') or next((r['_eng'] for r in c if r['_eng']), '')
            rec = {'kind': 'std', 'key': k, 'name': c[0]['_name'], 'definition': '', 'eng': eng,
                   'abbr': next((r['항목 ID'] for r in c if r['항목 ID']), ''), 'synonyms': [], 'aliases': [],
                   'systems': [], 'contexts': [], 'basis': [], 'rows': []}
            for r in c:
                add_unique(rec['systems'], r['시스템'])
                add_unique(rec['contexts'], r['체인한글명'])
                if r['약어명'] and r['약어명'] not in (rec['name'], r['항목 ID']):
                    add_unique(rec['aliases'], r['약어명'])
                ref = f"no.{r['no.']}"
                rec['basis'].append(basis_line(TAG_STD, ref, [(c2, r[c2]) for c2 in STD_COLS if c2 != 'no.']))
                rec['rows'].append((TAG_STD, ref, r))
            out.append(rec)
    return out


def glossary_groups(rows):
    by_name = defaultdict(list)
    for r in rows:
        by_name[key(r['용어(변경후)'])].append(r)
    out = []
    for k, rs in by_name.items():
        clusters = []
        for r in rs:
            for c in clusters:
                if ws(c[0]['정의']) == ws(r['정의']):
                    c.append(r)
                    break
            else:
                clusters.append([r])
        for c in clusters:
            rec = {'kind': 'gl', 'key': k, 'name': c[0]['용어(변경후)'], 'definition': c[0]['정의'],
                   'eng': next((r['영문'] for r in c if r['영문']), ''),
                   'abbr': next((r['영문약어'] for r in c if r['영문약어']), ''),
                   'synonyms': [], 'aliases': [], 'systems': [], 'contexts': [], 'basis': [], 'rows': []}
            for r in c:
                for old in re.split(r'\s*,\s*', r['용어(변경전)']):
                    if old and old != '신규' and key(old) != k:
                        add_unique(rec['synonyms'], old)
                add_unique(rec['systems'], PROGRAM_SYSTEM.get(r['프로그램']) or MODULE_SYSTEM.get(r['모듈']))
                add_unique(rec['contexts'], r['모듈'])
                ref = f"{r['_row']}행"
                cells = [(c2, r[c2]) for c2 in GL_COLS if c2 not in ('용어(변경후)', '정의')]
                if ws(r['정의']) != ws(rec['definition']):
                    cells.append(('정의', r['정의']))
                rec['basis'].append(basis_line(TAG_GL, ref, cells))
                rec['rows'].append((TAG_GL, ref, r))
            out.append(rec)
    return out


# ──────────────────────────── 병합 ────────────────────────────

class Dict:
    def __init__(self, db):
        self.db = db
        self.rows = {}           # TERM_ID → dict
        self.by_key = defaultdict(list)
        for r in db.execute(f"select TERM_ID, SENSE_NO, {', '.join(TERM_FIELDS)} from TB_MDM_TERM"):
            d = dict(r)
            self.rows[d['TERM_ID']] = d
            self.by_key[key(d['TERM_NAME'])].append(d['TERM_ID'])
        self.dirty, self.new = set(), set()

    def candidates(self, k):
        return sorted(self.by_key.get(k, []), key=lambda t: (self.rows[t]['SENSE_NO'], t))


def column_refs(db):
    refs = defaultdict(list)
    for phys, tids in db.execute('select PHYS_NAME, TERM_IDS from TB_MDM_COLUMN'):
        for tid in jlist(tids):
            refs[tid].append(phys.upper())
    return refs


def phys_has(phys, abbr):
    return re.search(r'(^|_)' + re.escape(abbr.upper()) + r'(_|$)', phys) is not None


def bigrams(s):
    s = ws(s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def order_glossary(d, recs):
    """같은 이름의 용어집 묶음이 여럿이면 기존 뜻(가장 작은 SENSE_NO)의 정의와 가장 비슷한 묶음을 앞에 둔다."""
    by_key = defaultdict(list)
    for r in recs:
        by_key[r['key']].append(r)
    out = []
    for k, rs in by_key.items():
        base = next((t for t in d.candidates(k) if (d.rows[t]['SRC_ORIGIN'] or '') != ORIGIN_GL), None)
        if base is not None and len(rs) > 1:
            b = bigrams(d.rows[base]['DEFINITION'])
            rs = sorted(rs, key=lambda r: -len(b & bigrams(r['definition'])) / (len(b | bigrams(r['definition'])) or 1))
        out.extend(rs)
    return out


def merge(d, recs, refs, changes, assign, now):
    claimed = defaultdict(set)  # key → 이번 출처가 이미 합친 TERM_ID
    for rec in recs:
        k, tag = rec['key'], rec['kind']
        cands = d.candidates(k)
        tid = None
        if tag == 'gl':  # 정의가 같은 뜻 → 영문명이 같은 뜻 → 아직 안 합친 가장 작은 뜻
            if rec['name'] in GL_DIFFERENT_SENSE:
                cands = [t for t in cands if d.rows[t]['SRC_ORIGIN'] == ORIGIN_GL]
            tid = next((t for t in cands if ws(d.rows[t]['DEFINITION']) == ws(rec['definition'])), None)
            if tid is None and rec['eng']:
                tid = next((t for t in cands if t not in claimed[k] and similar(d.rows[t]['ENG_NAME'], rec['eng'])),
                           None)
            if tid is None:
                tid = next((t for t in cands if t not in claimed[k]
                            and (d.rows[t]['SRC_ORIGIN'] or '') != ORIGIN_GL), None)
        else:
            if rec['eng']:
                tid = next((t for t in cands if similar(d.rows[t]['ENG_NAME'], rec['eng'])), None)
            if tid is None and not claimed[k]:  # 영문명이 달라도 표기가 똑같으면(대소문자 포함) 합친다
                tid = next((t for t in cands if ws(d.rows[t]['TERM_NAME']) == ws(rec['name'])
                            and not (d.rows[t]['ENG_NAME'] and rec['eng'] and d.rows[t]['SRC_ORIGIN'] == ORIGIN_STD)),
                           None)
        if tid is None:
            tid = insert(d, rec, now)
        else:
            update(d, tid, rec, refs, changes)
        claimed[k].add(tid)
        for tag2, ref, _ in rec['rows']:
            assign[(tag2, ref)] = tid


def insert(d, rec, now):
    sense = max([d.rows[t]['SENSE_NO'] for t in d.by_key.get(rec['key'], [])] or [0]) + 1
    row = {'TERM_NAME': rec['name'], 'SENSE_NO': sense, 'DEFINITION': rec['definition'],
           'CONTEXT': ', '.join(rec['contexts']) or None, 'ENG_NAME': rec['eng'] or None,
           'ENG_ABBR': rec['abbr'] or None, 'SYNONYMS': jdump(rec['synonyms']), 'ALIASES': jdump(rec['aliases']),
           'SYSTEMS': jdump(rec['systems']), 'STD_BASIS': '\n'.join(rec['basis']),
           'SRC_ORIGIN': ORIGIN_GL if rec['kind'] == 'gl' else ORIGIN_STD}
    cols = list(row) + ['C_USR_ID', 'C_AT', 'C_SVC_ID', 'C_PGM_ID', 'U_USR_ID', 'U_AT', 'U_SVC_ID', 'U_PGM_ID', 'VER']
    vals = list(row.values()) + [AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, 0]
    cur = d.db.execute(f"insert into TB_MDM_TERM ({', '.join(cols)}) values ({', '.join('?' * len(cols))})", vals)
    tid = cur.lastrowid
    row['TERM_ID'] = tid
    d.rows[tid] = row
    d.by_key[rec['key']].append(tid)
    d.new.add(tid)
    return tid


def update(d, tid, rec, refs, changes):
    r = d.rows[tid]
    before = dict(r)
    if rec['kind'] == 'gl':
        if ws(r['DEFINITION']) != ws(rec['definition']):
            r['DEFINITION'] = rec['definition']
        if rec['eng'] and r['ENG_NAME'] != rec['eng']:
            r['ENG_NAME'] = rec['eng']
        if rec['contexts']:
            ctx = [c for c in re.split(r'\s*,\s*', r['CONTEXT'] or '') if c]
            add_unique(ctx, *rec['contexts'])
            r['CONTEXT'] = ', '.join(ctx)
    elif not r['ENG_NAME'] and rec['eng']:
        r['ENG_NAME'] = rec['eng']
    if rec['abbr']:
        if not r['ENG_ABBR']:
            r['ENG_ABBR'] = rec['abbr']
        elif r['ENG_ABBR'].upper() != rec['abbr'].upper():
            ps = refs.get(tid, [])
            old_hits = sum(phys_has(p, r['ENG_ABBR']) for p in ps)
            new_hits = sum(phys_has(p, rec['abbr']) for p in ps)
            verdict = 'replace' if new_hits > old_hits else 'keep'
            changes['abbr_conflicts'].append({'term_id': tid, 'term': r['TERM_NAME'], 'kept' if verdict == 'keep'
                                              else 'replaced': r['ENG_ABBR'], 'source_abbr': rec['abbr'],
                                              'source': rec['kind'], 'column_hits': [old_hits, new_hits]})
            if verdict == 'replace':
                r['ENG_ABBR'] = rec['abbr']
    for field, vals in (('SYNONYMS', rec['synonyms']), ('ALIASES', rec['aliases']), ('SYSTEMS', rec['systems'])):
        lst = jlist(r[field])
        add_unique(lst, *vals)
        r[field] = jdump(lst)
    lines = [x for x in (r['STD_BASIS'] or '').split('\n') if x]
    have = {x.split(':', 1)[0] for x in lines if x.startswith((TAG_STD, TAG_GL))}
    lines += [b for b in rec['basis'] if b.split(':', 1)[0] not in have]
    r['STD_BASIS'] = '\n'.join(lines)
    diff = {f: [before[f], r[f]] for f in TERM_FIELDS if before[f] != r[f]}
    if diff:
        d.dirty.add(tid)
        if tid not in d.new:
            changes['updated'].setdefault(str(tid), {'term': r['TERM_NAME'], 'sense': r['SENSE_NO'], 'fields': {}})
            for f, (a, b) in diff.items():
                changes['updated'][str(tid)]['fields'].setdefault(f, [a, b])[1] = b


def flush(d, now):
    for tid in d.dirty - d.new:
        r = d.rows[tid]
        d.db.execute(f"update TB_MDM_TERM set {', '.join(f + '=?' for f in TERM_FIELDS)}, EMBEDDING=NULL, "
                     "EMBEDDING_MODEL=NULL, U_USR_ID=?, U_AT=?, U_SVC_ID=?, U_PGM_ID=?, VER=coalesce(VER,0)+1 "
                     "where TERM_ID=?", [r[f] for f in TERM_FIELDS] + [AUDIT_USR, now, AUDIT_SVC, AUDIT_PGM, tid])
    for tid in d.new:
        r = d.rows[tid]
        d.db.execute(f"update TB_MDM_TERM set {', '.join(f + '=?' for f in TERM_FIELDS)} where TERM_ID=?",
                     [r[f] for f in TERM_FIELDS] + [tid])


# ──────────────────────────── 검증 ────────────────────────────

def verify(db, std_rows, gl_rows, assign):
    """엑셀 행의 비어 있지 않은 모든 칸 값이 붙은 용어 행 안에 있는지 대조한다."""
    rows = {r['TERM_ID']: r for r in db.execute(f"select TERM_ID, {', '.join(TERM_FIELDS)} from TB_MDM_TERM")}
    missing, unassigned = [], []
    for tag, srcrows, cols, ref_of in ((TAG_STD, std_rows, STD_COLS, lambda r: f"no.{r['no.']}"),
                                       (TAG_GL, gl_rows, GL_COLS, lambda r: f"{r['_row']}행")):
        for r in srcrows:
            ref = ref_of(r)
            tid = assign.get((tag, ref))
            if tid is None or tid not in rows:
                unassigned.append(f"{tag} {ref}")
                continue
            hay = ws('\n'.join(str(rows[tid][f] or '') for f in TERM_FIELDS))
            for c in cols:
                if r[c] and ws(r[c]) not in hay and ws(json.dumps(r[c], ensure_ascii=False)[1:-1]) not in hay:
                    missing.append({'source': f"{tag} {ref}", 'column': c, 'value': r[c], 'term_id': tid})
    return missing, unassigned


TARGET = {TAG_STD: {'시스템': ['SYSTEMS'], '체인한글명': ['CONTEXT'], '표준용어': ['TERM_NAME'],
                    '영문 Full Name': ['ENG_NAME'], '항목 ID': ['ENG_ABBR'],
                    '약어명': ['ALIASES', 'TERM_NAME', 'ENG_ABBR']},
          TAG_GL: {'프로그램': ['SYSTEMS'], '모듈': ['CONTEXT'], '용어(변경후)': ['TERM_NAME'],
                   '용어(변경전)': ['SYNONYMS'], '영문약어': ['ENG_ABBR'], '영문': ['ENG_NAME'], '정의': ['DEFINITION']}}


def field_coverage(db, std_rows, gl_rows, assign):
    """칸별로 값이 전용 칼럼에 들어갔는지(placed), 근거 줄(STD_BASIS)에만 있는지(basis_only) 센다."""
    rows = {r['TERM_ID']: r for r in db.execute(f"select TERM_ID, {', '.join(TERM_FIELDS)} from TB_MDM_TERM")}
    cov = {}
    for tag, srcrows, cols, ref_of in ((TAG_STD, std_rows, STD_COLS, lambda r: f"no.{r['no.']}"),
                                       (TAG_GL, gl_rows, GL_COLS, lambda r: f"{r['_row']}행")):
        for r in srcrows:
            t = rows[assign[(tag, ref_of(r))]]
            for c in cols:
                if not r[c]:
                    continue
                c_cov = cov.setdefault(f"{tag}:{c}", {'placed': 0, 'basis_only': 0})
                vals = [r[c]]
                if tag == TAG_GL and c == '프로그램':
                    vals = [PROGRAM_SYSTEM.get(r[c]) or MODULE_SYSTEM.get(r['모듈']) or '\0']
                if tag == TAG_GL and c == '용어(변경전)':
                    vals = [v for v in re.split(r'\s*,\s*', r[c]) if v and v != '신규' and key(v) != key(r['용어(변경후)'])] or ['\0']
                hay = ws('\n'.join(str(t[f] or '') for f in TARGET.get(tag, {}).get(c, [])))
                placed = all(ws(v) in hay for v in vals) and hay != ''
                c_cov['placed' if placed else 'basis_only'] += 1
    return cov


def check_db(db):
    out = {}
    out['dangling_term_ids'] = db.execute(
        "select count(*) from TB_MDM_COLUMN c, json_each(c.TERM_IDS) j "
        "where j.value not in (select TERM_ID from TB_MDM_TERM)").fetchone()[0]
    out['dup_name_sense'] = db.execute(
        "select count(*) from (select TERM_NAME, SENSE_NO from TB_MDM_TERM group by 1, 2 having count(*) > 1)").fetchone()[0]
    out['bad_json'] = db.execute(
        "select count(*) from TB_MDM_TERM where (SYNONYMS is not null and not json_valid(SYNONYMS)) "
        "or (ALIASES is not null and not json_valid(ALIASES)) or (SYSTEMS is not null and not json_valid(SYSTEMS))").fetchone()[0]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=os.path.join(ROOT, 'src/backend/data/mdm.db'))
    ap.add_argument('--std', required=True)
    ap.add_argument('--glossary', required=True)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    std_rows, gl_rows = read_std(a.std), read_glossary(a.glossary)
    gl_recs, std_recs = glossary_groups(gl_rows), std_groups(std_rows)
    print(f"원천: 용어집 {len(gl_rows)}행 → {len(gl_recs)}묶음, 표준용어 {len(std_rows)}행 → {len(std_recs)}묶음")

    if not a.dry_run:
        bak = f"{a.db}.bak-{datetime.now():%Y%m%d-%H%M%S}-dictstd"
        src, dst = sqlite3.connect(a.db), sqlite3.connect(bak)
        src.backup(dst)
        dst.close(); src.close()
        print('백업:', bak)

    db = sqlite3.connect(a.db, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN IMMEDIATE')
    now = int(time.time() * 1000)
    before = db.execute('select count(*) from TB_MDM_TERM').fetchone()[0]
    d = Dict(db)
    refs = column_refs(db)
    changes = {'updated': {}, 'abbr_conflicts': []}
    assign = {}
    merge(d, order_glossary(d, gl_recs), refs, changes, assign, now)   # 정의가 있는 용어집이 먼저
    merge(d, std_recs, refs, changes, assign, now)
    flush(d, now)

    missing, unassigned = verify(db, std_rows, gl_rows, assign)
    checks = check_db(db)
    coverage = field_coverage(db, std_rows, gl_rows, assign)
    after = db.execute('select count(*) from TB_MDM_TERM').fetchone()[0]
    origin = dict(db.execute('select SRC_ORIGIN, count(*) from TB_MDM_TERM group by 1').fetchall())
    summary = {'terms_before': before, 'terms_after': after, 'inserted': len(d.new),
               'updated_existing': len(d.dirty - d.new), 'by_origin': origin,
               'abbr_conflicts': {'keep': sum('kept' in c for c in changes['abbr_conflicts']),
                                  'replace': sum('replaced' in c for c in changes['abbr_conflicts'])},
               'excel_cells_missing': len(missing), 'excel_rows_unassigned': len(unassigned), **checks}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print('칸별 반영:', json.dumps(coverage, ensure_ascii=False))
    ok = not missing and not unassigned and not any(checks.values())
    if not ok:
        print('검증 실패 → 롤백', json.dumps((missing + unassigned)[:20], ensure_ascii=False, indent=1))
        db.rollback()
        sys.exit(1)
    if a.dry_run:
        db.rollback()
        print('dry-run: 롤백')
        return
    db.commit()
    json.dump({'summary': summary, 'field_coverage': coverage, **changes}, open(os.path.join(HERE, 'changes.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, 'last-run.txt'), 'w', encoding='utf-8') as f:
        f.write(f"백업: {bak}\n" + json.dumps(summary, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
