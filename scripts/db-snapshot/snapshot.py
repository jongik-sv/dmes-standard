#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""로컬 DB 스냅샷(표별 CSV) 도구 — SQLite 없이 Oracle 에서 Oracle 로 (oracle-1007 b5).

Flyway 가 만든 표에 **데이터만** 넣는다. 표·스키마는 만들지 않는다(예외: 동적 표 TB_MCA_*).
macOS·Linux·Windows 공용이며 python3 + oracledb(pip install oracledb, thin 모드) 만 쓴다. sqlite3 CLI 는 필요 없다.

사용법
  python3 scripts/db-snapshot/snapshot.py convert --from-db src/backend/data/mdm.db --name mdm
  python3 scripts/db-snapshot/snapshot.py convert --from-sql db-snapshot/mcm --name mcm      # 옛 SQL 스냅샷
  python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM [MDMAPUSER MCMAPUSER ...]
  python3 scripts/db-snapshot/snapshot.py export --pdb L_ORA_MDM [MDMAPUSER ...]

  convert  SQLite(.db 또는 옛 SQL 스냅샷) -> db-snapshot/<스키마>/<표>.csv  (일회성. 원본 .db 는 읽기 전용 사본으로만 연다)
  export   Oracle 스키마 -> db-snapshot/<스키마>/<표>.csv
  import   db-snapshot/<스키마>/<표>.csv -> Oracle 스키마(PDB 를 --pdb 로 지정: 레인 PDB·FREEPDB1 모두)

CSV 규칙(git diff 가 안정적이도록 고정)
  - UTF-8(BOM 없음), 줄 끝 LF(저장소 .gitattributes 가 eol=lf 로 고정), 첫 줄은 칸 이름, 데이터는 PK 순.
  - NULL 은 \\N, 값이 백슬래시로 시작하면 백슬래시를 하나 더 붙인다. BLOB 은 b64:<base64>.
  - convert 의 값은 SQLite 원본 그대로(epoch 밀리초 포함)이고, 해석은 import 가 대상 칸 종류로 한다.
    시각 칸: 숫자(epoch 초·밀리초)는 KST 로 바꾸고 문자열은 그대로 읽는다(시간대 표기가 붙은 것만 KST 로 환산).
    빈 문자열은 Oracle 규칙대로 NULL, PK 칸이 비는 행은 건너뛴다(예: TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID='').
"""
import argparse
import base64
import csv
import datetime as dt
import decimal
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time

try:
    import oracledb
except ImportError:  # convert 는 oracledb 없이도 돈다
    oracledb = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SNAP_DIR = os.environ.get("DMES_SNAPSHOT_DIR", os.path.join(ROOT, "db-snapshot"))
KST = dt.timezone(dt.timedelta(hours=9))

# ── 고치기 쉬운 설정 ─────────────────────────────────────────────────────────
# SQLite DB 이름 -> 대상 스키마(기본) / 접두 경로 / 여러 스키마에 같이 넣을 표
SOURCES = {
    "mdm": {"schema": "MDMAPUSER", "route": [], "copy_to": {}},
    # 로컬 서버 전환용(--full 로 내 PC 의 .db 를 옮길 때). 데이터가 적은 모듈이라 리포 스냅샷에는 넣지 않는다.
    "mls": {"schema": "MLSAPUSER", "route": [], "copy_to": {}},
    "caravan-console": {"schema": "CARAVANUSER", "route": [], "copy_to": {}},
    "mcm": {
        "schema": "MCMAPUSER",
        # 업무기준(룰) 표와 동적 표는 MCAAPUSER 에 있다.
        "route": [("TB_MCA_", "MCAAPUSER")],
        # 원장 3표는 운영 MSSQL 처럼 MCM_SOURCE 와 MCMAPUSER 양쪽에 같은 이름으로 있다(SQLite 는 한 벌이었다).
        "copy_to": {"MCM_SOURCE": ["TB_MCM_CODE_MASTER", "TB_MCM_CODE_CATEGORY", "TB_MCM_CODE_DETAIL"]},
    },
}
# 스키마만 있고 데이터는 넣지 않는 표(보안·불필요 데이터). 파일은 헤더만 둔다.
DATA_EXCLUDE = {
    "TB_MCM_SEC_USER_PWD", "TB_SEC_REVOKED_TOKEN", "TB_MCM_SEC_USER_HIS", "TB_MCM_SEC_USER_ROLL_HIS",
    "TB_SEC_KEY_STORE", "TB_SEC_USER", "TB_SEC_LOGIN_LOG", "TB_SEC_AUDIT_LOG",
}
# 값을 NULL 로 내보내는 칸(표.칸): KURE 벡터는 전체 크기 대부분이라 복원 뒤 다시 계산한다.
NULLIFY = {"TB_MDM_TERM.EMBEDDING", "TB_MDM_TERM.EMBEDDING_MODEL"}
# 사용자 관련 표는 admin 행만 내보낸다(표 -> SQLite WHERE / Oracle WHERE).
ROW_FILTER = {t: "USER_ID='admin'" for t in (
    "TB_MCM_SEC_USER", "TB_MCM_SEC_USER_MAPPING", "TB_MCM_SEC_USER_FAVORITE", "TB_MCM_SEC_USER_FAVORITE_FOLD",
    "TB_MCM_SEC_USER_START_PGM", "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_WIDGET_TAB", "TB_MCM_SEC_USER_WIDGET_CHAT",
    "TB_MCM_SEC_USER_WIDGET_MEMO", "TB_SEC_SCREEN_USAGE_DAY", "TB_SEC_SCREEN_USAGE_LOG")}
# 적재 대상이 아닌 스키마(백업 대상이라 비워 둔다: 동기화 관리 화면이 채운다).
EMPTY_SCHEMAS = {"MCM_BACKUP"}
# 적재 뒤 MAX(키)+1 로 다시 맞출 시퀀스: 시퀀스 -> (표, 키 칸), 스키마
SEQUENCES = {"MCMAPUSER": {"SEQ_MCM_MOM_TC_SEND": ("TB_MCM_MOM_TC_SEND", "SEND_SQ_VAL"),
                           "SEQ_MCM_MOM_TC_ERROR": ("TB_MCM_MOM_TC_ERROR", "SQ_VAL")}}
# 동적 표(앱이 만들지 않는다): 정적 표 이름과 접두. 적재기가 만들고 GRANTEE 에 DML 권한을 준다.
DYNAMIC_PREFIX = "TB_MCA_"
STATIC_MCA = {"TB_MCA_RULE_MASTER", "TB_MCA_RULE_COL_LIST"}
DYNAMIC_GRANTEE = "MCMAPUSER"
# 적재하지 않는 표: Flyway 이력, SQLite 가 시퀀스 흉내로 쓰던 표(Oracle 은 실제 SEQUENCE 라 적재 뒤 MAX(키)+1 로 맞춘다)
# E2E 시험이 옛 로컬 DB 에 남긴 행(E2E_USR_* 등)은 리포 스냅샷에서 지우지 않고 적재할 때 거른다(데이터 삭제는 사용자 승인 사항).
# 규칙: 해당 스키마 행에서 어느 칸이든 값이 대문자 E2E 로 시작하면 뺀다(ora-mdm 확인: 413행, 고아 행 없음). --keep-e2e 로 끈다.
E2E_FILTER_SCHEMAS = {"MDMAPUSER"}
E2E_PREFIX = "E2E"
SKIP_TABLES = {"FLYWAY_SCHEMA_HISTORY", "SEQ_MCM_MOM_TC_SEND", "SEQ_MCM_MOM_TC_ERROR"}
NULL = "\\N"
BATCH = 1000

NUM_RE = re.compile(r"^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$")
INT_RE = re.compile(r"^[+-]?\d+$")
TS_RE = re.compile(
    r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$")


def out(msg=""):
    print(msg, flush=True)


def die(msg):
    sys.exit("[snapshot] 오류: %s" % msg)


# ── CSV 읽기·쓰기 ────────────────────────────────────────────────────────────

def enc(v):
    """값 -> CSV 칸 문자열(NULL 은 \\N)."""
    if v is None:
        return NULL
    if isinstance(v, (bytes, bytearray)):
        return "b64:" + base64.b64encode(bytes(v)).decode("ascii")
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    if isinstance(v, dt.datetime):
        s = v.strftime("%Y-%m-%d %H:%M:%S")
        return s + ".%06d" % v.microsecond if v.microsecond else s
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    s = str(v)
    return "\\" + s if s.startswith("\\") else s


def dec(s):
    if s == NULL:
        return None
    if s.startswith("\\"):
        return s[1:]
    return s


def write_csv(path, header, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        for r in rows:
            w.writerow([enc(v) for v in r])
            n += 1
    return n


def read_csv(path):
    f = open(path, "r", encoding="utf-8", newline="")
    r = csv.reader(f)
    header = next(r, None)
    if header is None:
        f.close()
        return [], iter(())

    def rows():
        try:
            for row in r:
                yield [dec(c) for c in row]
        finally:
            f.close()
    return header, rows()


# ── convert: SQLite -> CSV ──────────────────────────────────────────────────

def restore_sql_snapshot(snap, target):
    """옛 SQL 스냅샷 폴더를 임시 SQLite 파일로 복원한다(_schema.sql 먼저, 표 파일은 한 트랜잭션)."""
    def read(p):
        with open(p, "r", encoding="utf-8", newline="") as f:
            return f.read()
    parts = ["PRAGMA foreign_keys=OFF;\n", read(os.path.join(snap, "_schema.sql")), "\nBEGIN;\n"]
    for n in sorted(os.listdir(snap)):
        if n.endswith(".sql") and n not in ("_schema.sql", "sqlite_sequence.sql"):
            parts.append(read(os.path.join(snap, n)) + "\n")
    parts.append("COMMIT;\n")
    con = sqlite3.connect(target, isolation_level=None)
    try:
        con.executescript("".join(parts))
    finally:
        con.close()


def sqlite_oracle_type(decl, max_bytes, has_blob):
    d = (decl or "").upper()
    if "BLOB" in d or has_blob:
        return "BLOB"
    if "TIMESTAMP" in d or "DATETIME" in d:
        return "TIMESTAMP(6)"
    if "INT" in d:
        return "NUMBER(19)"
    if any(k in d for k in ("REAL", "DOUB", "FLOA")):
        return "BINARY_DOUBLE"
    if any(k in d for k in ("NUMERIC", "DECIMAL")):
        return "NUMBER"
    return "CLOB" if max_bytes > 4000 else "VARCHAR2(4000 CHAR)"


def apply_mcm_corrections(con):
    """SQLite mcm.db 가 거친 적 없는 데이터 보정을 사본에 한 번 적용한다(멱등, 행 삭제 없음).

    출처: src/backend/mcm/api/.../init/seed/SchemaArtifactsMssql.java 의 MSSQL 기동 보정 중
    - normalizeTbMcmSecObjFormUrlValues: SEC_MENU 와 JOIN 되는 OBJ 의 FORM_URL 을 `PARENT_MENU_ID/OBJECT_ID` 로
    - 폴더 mcm·cma·csa·cme 의 USE_TP·MENU_VIEW_YN 을 COALESCE 'Y'
    ACCESS_TP 정규화와 MENU_SEQ 8자리 LPAD 는 이 DB 에서 이미 맞아 있어 넣지 않는다. cmb 폴더·MENU_TP 는 옛 로직 밖이라 건드리지 않는다.
    """
    have = {r[0].upper() for r in con.execute("select name from sqlite_master where type='table'")}
    if {"TB_MCM_SEC_OBJ", "TB_MCM_SEC_MENU"} <= have:
        parent = ("select m.PARENT_MENU_ID || '/' || TB_MCM_SEC_OBJ.OBJECT_ID from TB_MCM_SEC_MENU m "
                  "where m.OBJECT_ID = TB_MCM_SEC_OBJ.OBJECT_ID and m.PARENT_MENU_ID is not null order by m.MENU_ID limit 1")
        con.execute(
            "update TB_MCM_SEC_OBJ set FORM_URL = (%s) where exists (select 1 from TB_MCM_SEC_MENU m "
            "where m.OBJECT_ID = TB_MCM_SEC_OBJ.OBJECT_ID and m.PARENT_MENU_ID is not null) "
            "and (FORM_URL is null or FORM_URL = '' or FORM_URL like '%%.xfdl' or FORM_URL = OBJECT_ID)" % parent)
    if "TB_MCM_SEC_MENU_FLD" in have:
        con.execute(
            "update TB_MCM_SEC_MENU_FLD set USE_TP = coalesce(USE_TP, 'Y'), MENU_VIEW_YN = coalesce(MENU_VIEW_YN, 'Y') "
            "where MENU_ID in ('mcm', 'cma', 'csa', 'cme')")
    con.commit()


def cmd_convert(args):
    cfg = SOURCES.get(args.name)
    if cfg is None:
        die("알 수 없는 이름 %r (지원: %s)" % (args.name, ", ".join(sorted(SOURCES))))
    tmp = tempfile.mkdtemp(prefix="snapshot-convert-")
    try:
        copy = os.path.join(tmp, args.name + ".db")
        if args.from_db:
            if not os.path.isfile(args.from_db):
                die("파일이 없다: %s" % args.from_db)
            src = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(args.from_db).replace("\\", "/"), uri=True)
            dst = sqlite3.connect(copy)
            src.backup(dst)   # 서버가 쓰는 중이어도 안전한 사본
            src.close()
            dst.close()
        else:
            if not os.path.isfile(os.path.join(args.from_sql, "_schema.sql")):
                die("옛 SQL 스냅샷이 아니다: %s" % args.from_sql)
            restore_sql_snapshot(args.from_sql, copy)
        con = sqlite3.connect(copy)
        if args.name == "mcm":
            apply_mcm_corrections(con)
        tables = [r[0] for r in con.execute(
            "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
        summary = {}
        meta = {}
        for t in tables:
            tu = t.upper()
            if tu in SKIP_TABLES:
                continue
            schema = cfg["schema"]
            for prefix, target in cfg["route"]:
                if tu.startswith(prefix):
                    schema = target
            info = con.execute('pragma table_info("%s")' % t).fetchall()
            cols = [r[1] for r in info]
            pk = [r[1] for r in sorted((r for r in info if r[5] > 0), key=lambda r: r[5])]
            where = ""
            if tu in ROW_FILTER and not args.full:
                where = " where " + ROW_FILTER[tu]
            order = ", ".join('"%s"' % c for c in pk) if pk else "rowid"
            targets = [schema] + [s for s, tbls in cfg["copy_to"].items() if tu in tbls]
            if tu in DATA_EXCLUDE and not args.full:
                rows_iter = []
            else:
                sel = ", ".join('"%s"' % c for c in cols)
                rows_iter = con.execute('select %s from "%s"%s order by %s' % (sel, t, where, order))
                nullify = [] if args.full else [i for i, c in enumerate(cols) if ("%s.%s" % (tu, c.upper())) in NULLIFY]
                if nullify:
                    def mask(rows, idx=nullify):
                        for r in rows:
                            r = list(r)
                            for i in idx:
                                r[i] = None
                            yield r
                    rows_iter = mask(rows_iter)
            rows = list(rows_iter)
            for s in targets:
                n = write_csv(os.path.join(SNAP_DIR, s, tu + ".csv"), [c.upper() for c in cols], rows)
                summary[(s, tu)] = n
            if tu.startswith(DYNAMIC_PREFIX) and tu not in STATIC_MCA:
                # 동적 표는 import 가 만들 수 있게 칸 종류를 남긴다.
                col_meta = []
                for r in info:
                    c = r[1]
                    mb = con.execute('select max(length(cast("%s" as blob))) from "%s" where typeof("%s")=\'text\''
                                     % (c, t, c)).fetchone()[0] or 0
                    hb = con.execute('select count(*) from "%s" where typeof("%s")=\'blob\'' % (t, c)).fetchone()[0] > 0
                    col_meta.append({"name": c.upper(), "type": sqlite_oracle_type(r[2], mb, hb), "notnull": bool(r[3])})
                meta.setdefault(schema, {})[tu] = {"columns": col_meta, "pk": [p.upper() for p in pk]}
        con.close()
        for s, tables_meta in meta.items():
            p = os.path.join(SNAP_DIR, s, "_dynamic.json")
            with open(p, "w", encoding="utf-8", newline="") as f:
                json.dump(tables_meta, f, ensure_ascii=False, indent=1, sort_keys=True)
                f.write("\n")
        bySchema = {}
        for (s, t), n in summary.items():
            a = bySchema.setdefault(s, [0, 0])
            a[0] += 1
            a[1] += n
        for s, (nt, nr) in sorted(bySchema.items()):
            out("convert %-12s 표 %d개 행 %d -> %s" % (s, nt, nr, os.path.join(SNAP_DIR, s)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── Oracle 연결·메타 ────────────────────────────────────────────────────────

def connect(schema, pdb):
    if oracledb is None:
        die("oracledb 패키지가 필요하다: pip install oracledb")
    host = os.environ.get("DMES_ORA_HOST", "localhost")
    port = os.environ.get("DMES_ORA_PORT", "1521")
    pw = os.environ.get("DMES_ORA_PASSWORD", "dmes_password_123")
    try:
        return oracledb.connect(user=schema, password=pw, dsn="%s:%s/%s" % (host, port, pdb))
    except oracledb.Error as e:
        die("Oracle 접속 실패(%s@%s:%s/%s): %s\n  PDB 가 열려 있고 사용자가 있는지: node scripts/oracle/pdb.mjs list / users %s"
            % (schema, host, port, pdb, e, pdb))


def table_columns(cur, table):
    """대상 표의 칸 목록(가상 칸 제외) [(name, data_type, char_len, scale, nullable)]."""
    cur.execute("""select column_name, data_type, nvl(char_length,0), nvl(data_scale,-1), nullable
                   from user_tab_cols where table_name=:t and virtual_column='NO' and hidden_column='NO' order by column_id""", t=table)
    return cur.fetchall()


def pk_columns(cur, table):
    cur.execute("""select cc.column_name from user_constraints c join user_cons_columns cc on cc.constraint_name=c.constraint_name
                   where c.table_name=:t and c.constraint_type='P' order by cc.position""", t=table)
    return [r[0] for r in cur.fetchall()]


def list_tables(cur):
    cur.execute("select table_name from user_tables where temporary='N' and table_name not like 'DR$%' "
                "and table_name not like 'ISEQ$$%' and table_name not like 'BIN$%' order by table_name")
    return [r[0] for r in cur.fetchall() if r[0] not in SKIP_TABLES]


# ── export: Oracle -> CSV ───────────────────────────────────────────────────

def cmd_export(args):
    schemas = [s.upper() for s in args.schemas]
    if not schemas:
        schemas = sorted({c["schema"] for c in SOURCES.values()} | {"MCAAPUSER", "MCM_SOURCE"})
    for schema in schemas:
        if schema in EMPTY_SCHEMAS:
            out("export %-12s 건너뜀(백업 대상: 비워 둔다)" % schema)
            continue
        con = connect(schema, args.pdb)
        cur = con.cursor()
        total = 0
        dynamic = {}
        for t in list_tables(cur):
            cols = table_columns(cur, t)
            names = [c[0] for c in cols]
            pk = pk_columns(cur, t)
            if t in DATA_EXCLUDE:
                write_csv(os.path.join(SNAP_DIR, schema, t + ".csv"), names, [])
                continue
            sel = []
            for c in names:
                sel.append("NULL" if ("%s.%s" % (t, c)) in NULLIFY else '"%s"' % c)
            where = (" where " + ROW_FILTER[t]) if t in ROW_FILTER else ""
            # PK 가 없으면 LOB 을 뺀 모든 칸 순서(ROWID 는 적재마다 달라 diff 가 흔들린다)
            order = ", ".join('"%s"' % c for c in pk) if pk else ", ".join(
                '"%s"' % c[0] for c in cols if c[1] not in ("CLOB", "BLOB", "NCLOB")) or "1"
            cur.execute('select %s from "%s"%s order by %s' % (", ".join(sel), t, where, order))
            lob = any(c[1] in ("CLOB", "BLOB", "NCLOB") for c in cols)

            def gen(c=cur, lob=lob):
                while True:
                    batch = c.fetchmany(500)
                    if not batch:
                        return
                    for r in batch:
                        if lob:
                            r = [v.read() if hasattr(v, "read") else v for v in r]
                        yield r
            total += write_csv(os.path.join(SNAP_DIR, schema, t + ".csv"), names, gen())
            if t.startswith(DYNAMIC_PREFIX) and t not in STATIC_MCA:
                dynamic[t] = {"columns": [{"name": c[0], "type": oracle_ddl_type(c), "notnull": c[4] == "N"} for c in cols],
                              "pk": pk}
        if dynamic:
            with open(os.path.join(SNAP_DIR, schema, "_dynamic.json"), "w", encoding="utf-8", newline="") as f:
                json.dump(dynamic, f, ensure_ascii=False, indent=1, sort_keys=True)
                f.write("\n")
        out("export %-12s 행 %d" % (schema, total))
        con.close()


def oracle_ddl_type(c):
    name, dtype, clen, scale, _ = c
    if dtype in ("VARCHAR2", "NVARCHAR2", "CHAR"):
        return "VARCHAR2(%d CHAR)" % (clen or 4000)
    if dtype == "NUMBER":
        return "NUMBER" if scale == -1 else "NUMBER(19)"
    return dtype


# ── import: CSV -> Oracle ───────────────────────────────────────────────────

class Conv:
    """대상 칸 종류별 값 변환."""
    def __init__(self, dtype, scale):
        self.dtype = dtype
        self.scale = scale
        self.kind = self._kind(dtype)
        self.epoch = 0
        self.fail = 0
        self.samples = []

    @staticmethod
    def _kind(d):
        if d in ("CLOB", "NCLOB"):
            return "clob"
        if d == "BLOB":
            return "blob"
        if d == "BOOLEAN":
            return "bool"
        if d.startswith("TIMESTAMP") or d == "DATE":
            return "ts"
        if d == "NUMBER":
            return "num"
        if d in ("BINARY_DOUBLE", "BINARY_FLOAT", "FLOAT"):
            return "dbl"
        return "str"

    def _bad(self, v, rown):
        self.fail += 1
        if len(self.samples) < 3:
            self.samples.append((rown, str(v)[:60]))
        return None

    def __call__(self, v, rown):
        if v is None:
            return None
        k = self.kind
        try:
            if k in ("str", "clob"):
                return v if v != "" else None
            s = v.strip()
            if k == "blob":
                if s == "":
                    return None
                return base64.b64decode(s[4:]) if s.startswith("b64:") else v.encode("utf-8")
            if s == "":
                return None
            if k == "bool":
                low = s.lower()
                if low in ("1", "true", "t", "y", "yes"):
                    return True
                if low in ("0", "false", "f", "n", "no"):
                    return False
                return self._bad(v, rown)
            if k == "num":
                if INT_RE.match(s):
                    return int(s)
                if NUM_RE.match(s):
                    return decimal.Decimal(s)
                low = s.lower()
                if low in ("true", "t", "y"):
                    return 1
                if low in ("false", "f", "n"):
                    return 0
                return self._bad(v, rown)
            if k == "dbl":
                if NUM_RE.match(s):
                    f = float(s)
                    return f if math.isfinite(f) else self._bad(v, rown)
                return self._bad(v, rown)
            if k == "ts":
                return self._ts(s)
        except (ValueError, OverflowError, OSError, decimal.InvalidOperation):
            return self._bad(v, rown)
        return v

    def _ts(self, s):
        if NUM_RE.match(s):
            x = float(s)
            self.epoch += 1
            sec = x / 1000.0 if abs(x) >= 1e11 else x
            d = dt.datetime.fromtimestamp(sec, tz=KST).replace(tzinfo=None)
            return d.replace(microsecond=0) if self.dtype == "DATE" else d
        m = TS_RE.match(s)
        if not m:
            raise ValueError
        y, mo, d, hh, mi, ss, fr, off = m.groups()
        micro = int((fr or "0")[:6].ljust(6, "0"))
        v = dt.datetime(int(y), int(mo), int(d), int(hh or 0), int(mi or 0), int(ss or 0), micro)
        if off:
            if off == "Z":
                delta = dt.timedelta(0)
            else:
                sign = 1 if off[0] == "+" else -1
                o = off[1:].replace(":", "")
                delta = sign * dt.timedelta(hours=int(o[:2]), minutes=int(o[2:]))
            v = (v - delta).replace(tzinfo=dt.timezone.utc).astimezone(KST).replace(tzinfo=None)
        return v.replace(microsecond=0) if self.dtype == "DATE" else v


def create_dynamic(cur, table, spec, schema):
    cols = []
    for c in spec["columns"]:
        cols.append('"%s" %s%s' % (c["name"], c["type"], " NOT NULL" if c.get("notnull") else ""))
    pk = spec.get("pk") or []
    if pk:
        cols.append("PRIMARY KEY (%s)" % ", ".join('"%s"' % c for c in pk))
    cur.execute('create table "%s" (%s)' % (table, ", ".join(cols)))
    if schema != DYNAMIC_GRANTEE:
        cur.execute('grant select, insert, update, delete on "%s" to %s' % (table, DYNAMIC_GRANTEE))


def import_schema(schema, pdb, args):
    folder = os.path.join(SNAP_DIR, schema)
    if schema in EMPTY_SCHEMAS:
        out("import %-12s 건너뜀(백업 대상: 비워 둔다)" % schema)
        return True
    if not os.path.isdir(folder):
        out("import %-12s 스냅샷 폴더 없음(%s) — 건너뜀" % (schema, folder))
        return True
    files = sorted(f for f in os.listdir(folder) if f.endswith(".csv"))
    con = connect(schema, pdb)
    cur = con.cursor()
    ok = True
    t0 = time.time()
    existing = set(list_tables(cur))
    dyn = {}
    dp = os.path.join(folder, "_dynamic.json")
    if os.path.isfile(dp):
        with open(dp, encoding="utf-8") as f:
            dyn = json.load(f)
    # 동적 표: 앱이 만들지 않으므로 적재기가 만든다.
    for t, spec in sorted(dyn.items()):
        if t not in existing:
            create_dynamic(cur, t, spec, schema)
            existing.add(t)
            out("  동적 표 생성: %s.%s (+ %s 에 SELECT·INSERT·UPDATE·DELETE)" % (schema, t, DYNAMIC_GRANTEE))
    # FK 는 적재 동안 끈다.
    cur.execute("select table_name, constraint_name from user_constraints where constraint_type='R' and status='ENABLED'")
    fks = cur.fetchall()
    for t, c in fks:
        cur.execute('alter table "%s" disable constraint "%s"' % (t, c))
    rep = []
    drop_e2e = schema in E2E_FILTER_SCHEMAS and not args.keep_e2e
    e2e_total = 0
    try:
        for fn in files:
            t = fn[:-4]
            path = os.path.join(folder, fn)
            if t not in existing:
                n = sum(1 for _ in read_csv(path)[1])
                if n:
                    out("  경고: 표 없음 %s.%s (CSV 행 %d 건너뜀)" % (schema, t, n))
                    ok = False
                continue
            cols = table_columns(cur, t)
            cmap = {c[0]: Conv(c[1], c[3]) for c in cols}
            header, rows = read_csv(path)
            unknown = [h for h in header if h not in cmap]
            if unknown:
                out("  경고: %s 의 CSV 칸이 표에 없다 %s (무시)" % (t, unknown))
                ok = False
            use = [h for h in header if h in cmap]
            idx = [header.index(h) for h in use]
            convs = [cmap[h] for h in use]
            pk = pk_columns(cur, t)
            pk_idx = [use.index(p) for p in pk if p in use]
            cur.execute('select count(*) from "%s"' % t)
            have = cur.fetchone()[0]
            if args.replace and have:
                cur.execute('delete from "%s"' % t)
                have = 0
            mode = "insert" if have == 0 else "merge"
            if mode == "merge" and not pk:
                out("  경고: %s 에 PK 가 없고 이미 행이 있어 건너뜀(--replace 로 지우고 적재)" % t)
                ok = False
                continue
            if mode == "insert":
                sql = 'insert into "%s" (%s) values (%s)' % (t, ", ".join('"%s"' % u for u in use),
                                                              ", ".join(":%d" % (i + 1) for i in range(len(use))))
            else:
                non_pk = [u for u in use if u not in pk]
                src = ", ".join(":%d %s" % (i + 1, '"c%d"' % i) for i in range(len(use)))
                on = " and ".join('t."%s" = s."c%d"' % (p, use.index(p)) for p in pk)
                upd = ("when matched then update set " + ", ".join('t."%s" = s."c%d"' % (u, use.index(u)) for u in non_pk)) if non_pk else ""
                ins = "when not matched then insert (%s) values (%s)" % (
                    ", ".join('"%s"' % u for u in use), ", ".join('s."c%d"' % i for i in range(len(use))))
                sql = 'merge into "%s" t using (select %s from dual) s on (%s) %s %s' % (t, src, on, upd, ins)
            lob_sizes = []
            for cv in convs:
                lob_sizes.append(oracledb.DB_TYPE_CLOB if cv.kind == "clob" else
                                 oracledb.DB_TYPE_BLOB if cv.kind == "blob" else None)
            n_in = n_skip = n_e2e = 0
            batch = []
            lob_table = any(s is not None for s in lob_sizes)
            size = 100 if lob_table else BATCH

            def flush():
                if not batch:
                    return
                cur.setinputsizes(*lob_sizes) if lob_table else None
                cur.executemany(sql, batch)
                batch.clear()
            for rown, row in enumerate(rows, 2):
                if drop_e2e and any(v is not None and v.startswith(E2E_PREFIX) for v in row):
                    n_e2e += 1   # 어느 칸이든 대문자 E2E 로 시작하면 E2E 시험이 남긴 행이다(자식 행의 감사 칸 포함)
                    continue
                vals = [convs[i](row[idx[i]] if idx[i] < len(row) else None, rown) for i in range(len(use))]
                if pk_idx and any(vals[i] is None for i in pk_idx):
                    n_skip += 1
                    continue
                batch.append(vals)
                n_in += 1
                if len(batch) >= size:
                    flush()
            flush()
            cur.execute('select count(*) from "%s"' % t)
            n_out = cur.fetchone()[0]
            bad = sum(c.fail for c in convs)
            eps = sum(c.epoch for c in convs)
            line = "  %-34s CSV %6d 건너뜀 %d 적재 %s Oracle %6d" % (t, n_in + n_skip, n_skip, mode, n_out)
            if n_e2e:
                line += " (E2E 행 %d 거름)" % n_e2e
                e2e_total += n_e2e
            if eps:
                line += " (epoch→KST %d)" % eps
            if bad:
                line += " 변환 실패 %d" % bad
                ok = False
                for c in convs:
                    for s in c.samples:
                        line += "\n      샘플 행 %d: %r" % s
            out(line)
            rep.append((t, n_in, n_skip, n_out))
            if n_out < n_in:
                ok = False
        con.commit()
        # IDENTITY 재설정: 적재한 최대값 다음부터.
        cur.execute("select i.table_name, i.column_name, i.generation_type, c.default_on_null from user_tab_identity_cols i "
                    "join user_tab_cols c on c.table_name = i.table_name and c.column_name = i.column_name")
        for t, c, gen, onnull in cur.fetchall():
            if not any(r[0] == t and r[1] for r in rep):
                continue
            ddl = 'alter table "%s" modify ("%s" generated %s%s as identity (start with limit value))' % (
                t, c, "always" if gen == "ALWAYS" else "by default", " on null" if onnull == "YES" else "")
            try:
                cur.execute(ddl)
            except oracledb.Error as e:
                out("  경고: IDENTITY 재설정 실패 %s.%s: %s" % (t, c, str(e).splitlines()[0]))
                ok = False
        # 시퀀스 재설정
        for seq, (tbl, col) in SEQUENCES.get(schema, {}).items():
            if tbl not in existing:
                continue
            cur.execute('select nvl(max("%s"),0)+1 from "%s"' % (col, tbl))
            nxt = int(cur.fetchone()[0])
            try:
                cur.execute('alter sequence "%s" restart start with %d' % (seq, nxt))
                out("  시퀀스 %s -> %d" % (seq, nxt))
            except oracledb.Error as e:
                out("  경고: 시퀀스 재설정 실패 %s: %s" % (seq, str(e).splitlines()[0]))
                ok = False
    finally:
        for t, c in fks:
            try:
                cur.execute('alter table "%s" enable constraint "%s"' % (t, c))
            except oracledb.Error as e:
                out("  경고: FK 다시 켜기 실패 %s.%s: %s" % (t, c, str(e).splitlines()[0]))
                ok = False
        con.commit()
        con.close()
    out("import %-12s 표 %d개 행 %d / %.1f초%s" % (schema, len(rep), sum(r[3] for r in rep), time.time() - t0,
                                                 (" — E2E 잔여 행 %d 개를 거르고 적재(--keep-e2e 로 그대로 적재)" % e2e_total) if drop_e2e else ""))
    return ok


def cmd_import(args):
    schemas = [s.upper() for s in args.schemas] or sorted(
        d for d in os.listdir(SNAP_DIR) if os.path.isdir(os.path.join(SNAP_DIR, d)) and d == d.upper())
    if not schemas:
        die("적재할 스냅샷이 없다: %s (먼저 convert 또는 export)" % SNAP_DIR)
    all_ok = True
    for s in schemas:
        all_ok = import_schema(s, args.pdb.upper(), args) and all_ok
    sys.exit(0 if all_ok else 2)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="DB 스냅샷(표별 CSV) 변환·내보내기·적재")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("convert", help="SQLite -> CSV")
    g = c.add_mutually_exclusive_group(required=True)
    g.add_argument("--from-db", help="SQLite 파일(읽기 전용 사본으로 연다)")
    g.add_argument("--from-sql", help="옛 SQL 스냅샷 폴더(db-snapshot/mdm 등)")
    c.add_argument("--name", required=True, choices=sorted(SOURCES), help="원본 DB 이름")
    c.add_argument("--full", action="store_true",
                   help="공유용 걸러내기(제외 표·admin 행만·임베딩 NULL)를 끄고 모든 행을 옮긴다. 내 PC 로컬 서버를 Oracle 로 바꿀 때 DMES_SNAPSHOT_DIR 을 리포 밖으로 두고 쓴다")
    c.set_defaults(fn=cmd_convert)
    e = sub.add_parser("export", help="Oracle -> CSV")
    e.add_argument("--pdb", required=True)
    e.add_argument("schemas", nargs="*")
    e.set_defaults(fn=cmd_export)
    i = sub.add_parser("import", help="CSV -> Oracle(데이터만)")
    i.add_argument("--pdb", required=True)
    i.add_argument("--replace", action="store_true", help="적재 전에 그 표의 행을 모두 지운다(초기 행도 CSV 로 덮는다)")
    i.add_argument("--keep-e2e", action="store_true",
                   help="MDMAPUSER 의 E2E 잔여 행(어느 칸이든 대문자 E2E 로 시작)을 거르지 않고 적재한다(내 PC 의 로컬 데이터를 그대로 옮길 때)")
    i.add_argument("schemas", nargs="*")
    i.set_defaults(fn=cmd_import)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
