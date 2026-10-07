#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SQLite 파일 하나를 로컬 Oracle 26ai Free 의 스키마(사용자) 하나로 "그대로" 옮긴다.

사용 예
  python3 tools/oracle-free/sqlite_to_oracle.py --sqlite <사본.db> --schema MLS [--drop]

원칙
  - 원본 파일은 읽기 전용 URI 로만 연다. 서버가 쓰는 파일이면 먼저 `sqlite3 원본 ".backup 사본"` 으로 사본을 뜨고 그 사본을 넣는다.
  - 스키마(사용자)는 SYSTEM 으로 만든다. --drop 은 허용 목록(MDM·MCM·MLS·MPN·MPP·MQC·CARAVAN_CONSOLE, TMP_ 접두)
    안의 스키마만 DROP USER CASCADE 한다. dmes_user 등 다른 사용자는 건드리지 않는다.
  - 적재 순서: 테이블(제약 없음) -> 데이터 -> PK -> NOT NULL -> UNIQUE -> 인덱스.
    제약을 나중에 붙여 Oracle 이 거부하는 경우(빈 문자열이 NULL 이 됨 등)를 실제 시도로 가려내 보고한다.
  - 옮기지 않는 것: CHECK 제약, FK, 뷰, 트리거, 부분·식 인덱스, 함수식 DEFAULT, AUTOINCREMENT(IDENTITY 미적용).

필요 패키지: oracledb (thin 모드).
"""
import argparse
import json
import math
import os
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

try:
    import oracledb
except ImportError:  # pragma: no cover
    sys.exit("oracledb 패키지가 필요하다: pip install oracledb")

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

ALLOWED_SCHEMAS = {"MDM", "MCM", "MLS", "MPN", "MPP", "MQC", "CARAVAN_CONSOLE"}
ALLOWED_PREFIXES = ("TMP_",)
SCHEMA_PASSWORD = "dmes_password_123"
MAX_IDENT = 128
BYTE_LIMIT = 4000          # MAX_STRING_SIZE=STANDARD 이면 VARCHAR2 는 CHAR 의미여도 4000 바이트가 상한
BATCH_BYTES = 8 * 1024 * 1024   # 배치 하나가 담는 데이터 상한(Podman VM 2GB 보호)
SAMPLE_LIMIT = 5


def q(name):
    """Oracle 식별자를 큰따옴표로 감싼다."""
    if '"' in name:
        raise ValueError("식별자에 큰따옴표가 있다: %r" % name)
    if len(name.encode("utf-8")) > MAX_IDENT:
        raise ValueError("식별자 128바이트 초과: %r" % name)
    return '"%s"' % name


def sq(name):
    """SQLite 식별자."""
    return '"%s"' % name.replace('"', '""')


def trunc_ident(base):
    b = base.encode("utf-8")
    return base if len(b) <= MAX_IDENT else b[:MAX_IDENT].decode("utf-8", "ignore")


class Report:
    def __init__(self):
        self.tables = 0
        self.rows_sqlite = 0
        self.rows_oracle = 0
        self.mismatch = []            # (table, sqlite, oracle)
        self.skipped_indexes = []     # (table, index, reason)
        self.skipped_constraints = [] # (table, kind, detail)
        self.skipped_defaults = []    # (table, col, default, reason)
        self.notnull_dropped = []     # (table, col, reason)
        self.convert_fail = []        # (table, col, count, samples)
        self.empty_to_null = []       # (table, col, count)
        self.type_notes = []          # (table, col, note)
        self.load_errors = []         # (table, count, samples)
        self.ddl_errors = []          # (table, stmt, err)
        self.skipped_objects = []     # (kind, name)
        self.sizes = {}
        self.elapsed = 0.0

    def as_dict(self):
        return self.__dict__


# --------------------------------------------------------------------------- 타입 분석

TYPE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_ ]*?)\s*(?:\(\s*(\d+)\s*(?:,\s*(-?\d+)\s*)?\))?\s*$")


def parse_decl(decl):
    m = TYPE_RE.match(decl or "")
    if not m:
        return (decl or "").upper().strip(), None, None
    return m.group(1).upper().strip(), (int(m.group(2)) if m.group(2) else None), (int(m.group(3)) if m.group(3) else None)


def profile_columns(con, table, cols):
    """컬럼별 값 형태 요약. 테이블 1회 스캔(컬럼 100개씩 묶음)."""
    prof = {c: {} for c in cols}
    for i in range(0, len(cols), 100):
        chunk = cols[i:i + 100]
        exprs = []
        for c in chunk:
            x = sq(c)
            exprs += [
                "sum(typeof(%s)='text')" % x,
                "sum(typeof(%s)='integer')" % x,
                "sum(typeof(%s)='real')" % x,
                "sum(typeof(%s)='blob')" % x,
                "sum(%s is null)" % x,
                "max(case when typeof(%s)='text' then length(%s) end)" % (x, x),
                "max(case when typeof(%s)='text' then length(cast(%s as blob)) end)" % (x, x),
                "max(case when typeof(%s)='blob' then length(%s) end)" % (x, x),
                "sum(typeof(%s)='real' and %s <> cast(%s as integer))" % (x, x, x),
                "sum(%s = '')" % x,
            ]
        row = con.execute("select %s from %s" % (", ".join(exprs), sq(table))).fetchone()
        for k, c in enumerate(chunk):
            r = [v or 0 for v in row[k * 10:(k + 1) * 10]]
            prof[c] = dict(n_text=r[0], n_int=r[1], n_real=r[2], n_blob=r[3], n_null=r[4],
                           max_chars=r[5], max_bytes=r[6], max_blob=r[7], nonint_real=r[8], n_empty=r[9])
    return prof


def decide_type(decl, prof, rep, table, col):
    """(oracle_type_sql, kind, extra) 반환. kind: str|clob|blob|int|num|dbl|bool|ts|date"""
    base, n, s = parse_decl(decl)
    up = base
    note = lambda msg: rep.type_notes.append((table, col, msg))
    max_chars, max_bytes = prof.get("max_chars", 0), prof.get("max_bytes", 0)

    def text_type(declared_n):
        if declared_n is not None and declared_n <= 4000:
            size = declared_n
            if max_chars > size:
                size = max_chars
                note("VARCHAR(%d) 선언보다 긴 값(%d자) 있음, VARCHAR2(%d CHAR) 로 넓힘" % (declared_n, max_chars, size))
            if max_bytes > BYTE_LIMIT or size > 4000:
                note("실제 최대 %d바이트 > 4000, CLOB 으로 변환" % max_bytes)
                return "CLOB", "clob", None
            return "VARCHAR2(%d CHAR)" % size, "str", size
        if max_bytes <= BYTE_LIMIT and max_chars <= 4000:
            if declared_n is not None:
                note("VARCHAR(%d) 선언, 실제 최대 %d자 -> VARCHAR2(4000 CHAR)" % (declared_n, max_chars))
            return "VARCHAR2(4000 CHAR)", "str", 4000
        note("실제 최대 %d자/%d바이트 > 4000, CLOB" % (max_chars, max_bytes))
        return "CLOB", "clob", None

    if "BLOB" in up or up == "BYTEA":
        return "BLOB", "blob", None
    if "CLOB" in up:
        return "CLOB", "clob", None
    if up in ("BOOLEAN", "BOOL"):
        return "NUMBER(1)", "bool", None
    if up.startswith("TIMESTAMP") or up == "DATETIME":
        return "TIMESTAMP(6)", "ts", None
    if up == "DATE":
        return "DATE", "date", None
    if "INT" in up:
        if prof.get("nonint_real"):
            note("정수 컬럼에 소수 실수값 %d건 -> NUMBER" % prof["nonint_real"])
            return "NUMBER", "num", None
        return "NUMBER(19)", "int", None
    if any(k in up for k in ("CHAR", "TEXT", "VARCHAR", "NVARCHAR", "STRING")):
        return text_type(n)
    if any(k in up for k in ("REAL", "DOUB", "FLOA")):
        return "BINARY_DOUBLE", "dbl", None
    if up in ("NUMERIC", "DECIMAL", "NUMBER", "DEC"):
        if n is None:
            return "NUMBER", "num", None
        p = n
        if p > 38:
            note("NUMERIC(%d,%s) 정밀도 38 초과 -> NUMBER(38,...)" % (p, s))
            p = 38
        if s is None or s == 0:
            if prof.get("nonint_real"):
                note("NUMERIC(%d,0) 에 소수 값 %d건 -> NUMBER" % (n, prof["nonint_real"]))
                return "NUMBER", "num", None
            return "NUMBER(%d)" % p, "int", None
        return "NUMBER(%d,%d)" % (p, s), "num", None
    # 선언 타입이 없거나 모르는 타입: 값 분포로 판단
    note("알 수 없는 선언 타입 %r, 값 분포로 판단" % decl)
    if prof.get("n_blob"):
        return "BLOB", "blob", None
    if prof.get("n_text"):
        return text_type(None)
    if prof.get("n_real") or prof.get("n_int") and False:
        return "BINARY_DOUBLE", "dbl", None
    if prof.get("n_int"):
        return "NUMBER(19)", "int", None
    return "VARCHAR2(4000 CHAR)", "str", 4000


# --------------------------------------------------------------------------- 값 변환

TS_RE = re.compile(
    r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$")
NUM_RE = re.compile(r"^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$")


class Converter:
    def __init__(self, kind, epoch_tz):
        self.kind = kind
        self.tz = epoch_tz
        self.empty = 0
        self.epoch = 0
        self.fail = 0
        self.samples = []

    def failed(self, rownum, v):
        self.fail += 1
        if len(self.samples) < SAMPLE_LIMIT:
            self.samples.append((rownum, repr(v)[:60]))
        return None

    def _epoch(self, v):
        self.epoch += 1
        sec = v / 1000.0 if abs(v) >= 1e11 else float(v)
        dt = datetime.fromtimestamp(sec, tz=self.tz)
        return dt.replace(tzinfo=None)

    def _ts(self, v):
        if isinstance(v, (int, float)):
            if isinstance(v, float) and not math.isfinite(v):
                raise ValueError
            return self._epoch(v)
        if isinstance(v, str):
            s = v.strip()
            if NUM_RE.match(s):
                return self._epoch(float(s) if "." in s or "e" in s.lower() else int(s))
            m = TS_RE.match(s)
            if not m:
                raise ValueError
            y, mo, d, hh, mi, ss, fr, off = m.groups()
            micro = int((fr or "0")[:6].ljust(6, "0"))
            dt = datetime(int(y), int(mo), int(d), int(hh or 0), int(mi or 0), int(ss or 0), micro)
            if off:
                if off == "Z":
                    delta = timedelta(0)
                else:
                    sign = 1 if off[0] == "+" else -1
                    o = off[1:].replace(":", "")
                    delta = sign * timedelta(hours=int(o[:2]), minutes=int(o[2:]))
                dt = (dt - delta).replace(tzinfo=timezone.utc).astimezone(self.tz).replace(tzinfo=None)
            return dt
        raise ValueError

    def __call__(self, v, rownum):
        if v is None:
            return None
        k = self.kind
        try:
            if k in ("str", "clob"):
                if isinstance(v, str):
                    pass
                elif isinstance(v, (bytes, bytearray)):
                    v = bytes(v).decode("utf-8")
                else:
                    v = str(v)
                if v == "":
                    self.empty += 1
                    return None
                return v
            if k == "blob":
                if isinstance(v, str):
                    v = v.encode("utf-8")
                elif not isinstance(v, (bytes, bytearray)):
                    return self.failed(rownum, v)
                if len(v) == 0:
                    self.empty += 1
                    return None
                return bytes(v)
            if k in ("int", "num", "bool"):
                if isinstance(v, (bytes, bytearray)):
                    return self.failed(rownum, v)
                if isinstance(v, str):
                    s = v.strip()
                    if k == "bool" and s.lower() in ("true", "t", "y", "yes"):
                        return 1
                    if k == "bool" and s.lower() in ("false", "f", "n", "no"):
                        return 0
                    if s == "":
                        self.empty += 1
                        return None
                    if not NUM_RE.match(s):
                        return self.failed(rownum, v)
                    v = float(s) if ("." in s or "e" in s.lower()) else int(s)
                if isinstance(v, float):
                    if not math.isfinite(v):
                        return self.failed(rownum, v)
                    if k != "num" and v == int(v):
                        v = int(v)
                return v
            if k == "dbl":
                if isinstance(v, (bytes, bytearray)):
                    return self.failed(rownum, v)
                if isinstance(v, str):
                    s = v.strip()
                    if s == "":
                        self.empty += 1
                        return None
                    if not NUM_RE.match(s):
                        return self.failed(rownum, v)
                return float(v)
            if k in ("ts", "date"):
                if isinstance(v, str) and v.strip() == "":
                    self.empty += 1
                    return None
                dt = self._ts(v)
                if k == "date":
                    dt = dt.replace(microsecond=0)
                return dt
        except (ValueError, OverflowError, OSError, UnicodeDecodeError):
            return self.failed(rownum, v)
        return v


# --------------------------------------------------------------------------- DEFAULT

def convert_default(dflt, kind, ora_type, size):
    """(sql 또는 None, 사유). 단순 리터럴만 옮긴다."""
    if dflt is None:
        return None, None
    d = dflt.strip()
    if d.upper() == "NULL":
        return None, None
    lit = None
    m = re.fullmatch(r"'((?:[^']|'')*)'", d)
    if m:
        lit = ("s", m.group(1).replace("''", "'"))
    elif re.fullmatch(r"[+-]?\d+(\.\d+)?", d):
        lit = ("n", d)
    elif d.upper() in ("TRUE", "FALSE") and kind == "bool":
        lit = ("n", "1" if d.upper() == "TRUE" else "0")
    else:
        return None, "함수식/표현식 DEFAULT"
    t, val = lit
    if kind in ("str", "clob"):
        if val == "":
            return None, "빈 문자열 DEFAULT (Oracle 에서 NULL)"
        if kind == "str" and len(val) > size:
            return None, "DEFAULT 가 컬럼 길이 초과"
        if len(val.encode("utf-8")) > 4000:
            return None, "DEFAULT 4000바이트 초과"
        return "'%s'" % val.replace("'", "''"), None
    if kind in ("int", "num", "bool", "dbl"):
        if NUM_RE.match(val.strip()):
            return val.strip(), None
        return None, "숫자 컬럼에 숫자 아닌 DEFAULT"
    if kind in ("ts", "date"):
        if t == "n":
            return None, "시각 컬럼에 숫자 DEFAULT"
        mm = TS_RE.match(val.strip())
        if not mm:
            return None, "해석 못 하는 시각 DEFAULT"
        y, mo, dd, hh, mi, ss, fr, off = mm.groups()
        if off:
            return None, "오프셋 포함 시각 DEFAULT"
        if kind == "date":
            return "DATE '%04d-%02d-%02d'" % (int(y), int(mo), int(dd)), None
        micro = (fr or "0")[:6].ljust(6, "0")
        return "TIMESTAMP '%04d-%02d-%02d %02d:%02d:%02d.%s'" % (int(y), int(mo), int(dd), int(hh or 0), int(mi or 0), int(ss or 0), micro), None
    return None, "BLOB 컬럼 DEFAULT"


# --------------------------------------------------------------------------- Oracle 관리

def connect_system(args):
    return oracledb.connect(user="SYSTEM", password=args.system_password, dsn=args.dsn)


def prepare_schema(sysc, schema, drop):
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,29}", schema):
        sys.exit("스키마 이름은 대문자·숫자·_ 30자 이내여야 한다: %s" % schema)
    if schema not in ALLOWED_SCHEMAS and not schema.startswith(ALLOWED_PREFIXES):
        sys.exit("허용 목록에 없는 스키마다(%s). 허용: %s, 접두 %s" % (schema, ", ".join(sorted(ALLOWED_SCHEMAS)), ALLOWED_PREFIXES))
    cur = sysc.cursor()
    cur.execute("select oracle_maintained from dba_users where username=:u", u=schema)
    row = cur.fetchone()
    if row:
        if row[0] == "Y":
            sys.exit("Oracle 기본 사용자는 건드리지 않는다: %s" % schema)
        if not drop:
            sys.exit("스키마 %s 가 이미 있다. 다시 만들려면 --drop 을 붙인다." % schema)
        print("DROP USER %s CASCADE" % schema)
        cur.execute('drop user "%s" cascade' % schema)
    print("CREATE USER %s" % schema)
    cur.execute('create user "%s" identified by "%s" default tablespace USERS quota unlimited on USERS' % (schema, SCHEMA_PASSWORD))
    cur.execute('grant create session, create table, create sequence, create view to "%s"' % schema)


# --------------------------------------------------------------------------- 메타 수집

def read_tables(con):
    return [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]


def table_info(con, table):
    cols = []
    for r in con.execute("pragma table_xinfo(%s)" % sq(table)):
        # cid, name, type, notnull, dflt_value, pk, hidden
        cols.append(dict(cid=r[0], name=r[1], decl=r[2] or "", notnull=bool(r[3]), dflt=r[4], pk=r[5], hidden=r[6]))
    return cols


def main():
    ap = argparse.ArgumentParser(description="SQLite -> Oracle 26ai Free 스키마 복사")
    ap.add_argument("--sqlite", required=True, help="SQLite 사본 파일(원본 직접 지정 금지, .backup 사본 사용)")
    ap.add_argument("--schema", required=True, help="대상 스키마(사용자) 이름 예: MLS")
    ap.add_argument("--drop", action="store_true", help="스키마가 있으면 DROP USER CASCADE 후 재생성")
    ap.add_argument("--dsn", default=os.environ.get("ORA_DSN", "localhost:1521/FREEPDB1"))
    ap.add_argument("--system-password", default=os.environ.get("ORA_SYSTEM_PASSWORD", "sys_password_123"))
    ap.add_argument("--batch", type=int, default=1000, help="executemany 배치 행수(기본 1000, 8MB 도 넘으면 끊음)")
    ap.add_argument("--epoch-tz", default="UTC", help="epoch 숫자 -> TIMESTAMP 변환 시간대(기본 UTC; 문자열 시각은 그대로 둠)")
    ap.add_argument("--tables", help="쉼표로 구분한 테이블만 옮김(시험용)")
    ap.add_argument("--report", help="요약을 JSON 으로도 저장할 경로")
    args = ap.parse_args()

    t0 = time.time()
    schema = args.schema.upper()
    rep = Report()
    tz = timezone.utc if args.epoch_tz.upper() == "UTC" else ZoneInfo(args.epoch_tz)

    uri = "file:%s?mode=ro" % os.path.abspath(args.sqlite)
    con = sqlite3.connect(uri, uri=True)
    con.text_factory = lambda b: b.decode("utf-8", "surrogateescape")

    sysc = connect_system(args)
    prepare_schema(sysc, schema, args.drop)
    oc = oracledb.connect(user=schema, password=SCHEMA_PASSWORD, dsn=args.dsn)
    cur = oc.cursor()

    tables = read_tables(con)
    if args.tables:
        want = set(args.tables.split(","))
        tables = [t for t in tables if t in want]
    sql_of = dict(con.execute("select name, sql from sqlite_master where type='table'"))
    for kind, name in con.execute("select type, name from sqlite_master where type in ('view','trigger') order by 1,2"):
        rep.skipped_objects.append((kind, name))

    used_names = set(tables)   # 테이블·인덱스·제약 이름 충돌 방지용
    plans = {}                 # table -> plan

    # ---------------------------------------------------------------- 1) 테이블 DDL
    print("== 테이블 생성 (%d개)" % len(tables))
    for t in tables:
        cols = table_info(con, t)
        names = [c["name"] for c in cols if c["hidden"] == 0]
        for c in cols:
            if c["hidden"] != 0:
                rep.skipped_constraints.append((t, "GENERATED 컬럼", c["name"]))
        prof = profile_columns(con, t, names)
        plan_cols = []
        parts = []
        for c in cols:
            if c["hidden"] != 0:
                continue
            otype, kind, size = decide_type(c["decl"], prof[c["name"]], rep, t, c["name"])
            dsql, why = convert_default(c["dflt"], kind, otype, size)
            if c["dflt"] is not None and dsql is None and why:
                rep.skipped_defaults.append((t, c["name"], c["dflt"], why))
            piece = "%s %s" % (q(c["name"]), otype)
            if dsql is not None:
                piece += " DEFAULT %s" % dsql
            parts.append(piece)
            plan_cols.append(dict(c, otype=otype, kind=kind, prof=prof[c["name"]]))
        ddl = "CREATE TABLE %s (\n  %s\n)" % (q(t), ",\n  ".join(parts))
        sql = sql_of.get(t) or ""
        auto = bool(re.search(r"AUTOINCREMENT", sql, re.I))
        if auto:
            rep.skipped_constraints.append((t, "AUTOINCREMENT", "Oracle IDENTITY 미적용"))
        n_check = len(re.findall(r"\bCHECK\s*\(", sql, re.I))
        if n_check:
            rep.skipped_constraints.append((t, "CHECK", "%d건" % n_check))
        for r in con.execute("pragma foreign_key_list(%s)" % sq(t)):
            rep.skipped_constraints.append((t, "FK", "%s -> %s.%s" % (r[3], r[2], r[4])))
        if re.search(r"COLLATE\s+\w+", sql, re.I):
            rep.skipped_constraints.append((t, "COLLATE", ",".join(sorted(set(re.findall(r"COLLATE\s+(\w+)", sql, re.I))))))
        try:
            cur.execute(ddl)
        except oracledb.Error as e:
            rep.ddl_errors.append((t, ddl[:200], str(e)))
            print("  DDL 실패 %s: %s" % (t, e))
            plans[t] = None
            continue
        plans[t] = dict(cols=plan_cols)

    # ---------------------------------------------------------------- 2) 데이터
    print("== 데이터 적재")
    for t in tables:
        plan = plans.get(t)
        if not plan:
            continue
        cols = plan["cols"]
        convs = [Converter(c["kind"], tz) for c in cols]
        sel = "select %s from %s" % (", ".join(sq(c["name"]) for c in cols), sq(t))
        ins = "insert into %s (%s) values (%s)" % (q(t), ", ".join(q(c["name"]) for c in cols),
                                                   ", ".join(":%d" % (i + 1) for i in range(len(cols))))
        sizes = []
        for c in cols:
            k = c["kind"]
            if k == "str":
                sizes.append(4000)
            elif k == "clob":
                sizes.append(oracledb.DB_TYPE_LONG)
            elif k == "blob":
                sizes.append(oracledb.DB_TYPE_LONG_RAW)
            elif k in ("int", "num", "bool"):
                sizes.append(oracledb.DB_TYPE_NUMBER)
            elif k == "dbl":
                sizes.append(oracledb.DB_TYPE_BINARY_DOUBLE)
            elif k == "ts":
                sizes.append(oracledb.DB_TYPE_TIMESTAMP)
            else:
                sizes.append(oracledb.DB_TYPE_DATE)
        n_src = con.execute("select count(*) from %s" % sq(t)).fetchone()[0]
        load_err = Counter()
        err_samples = []
        rownum = 0
        loaded_batches = 0

        def flush(batch, first_row):
            if not batch:
                return
            cur.setinputsizes(*sizes)
            cur.executemany(ins, batch, batcherrors=True)
            for e in cur.getbatcherrors():
                load_err[e.message.split(":")[0]] += 1
                if len(err_samples) < SAMPLE_LIMIT:
                    err_samples.append("행 %d: %s" % (first_row + e.offset, e.message.strip()[:120]))

        batch, bsize, first = [], 0, 1
        rc = con.execute(sel)
        while True:
            rows = rc.fetchmany(200)
            if not rows:
                break
            for r in rows:
                rownum += 1
                out = []
                for i, v in enumerate(r):
                    cv = convs[i](v, rownum)
                    out.append(cv)
                    if cv is not None and cols[i]["kind"] in ("str", "clob", "blob"):
                        bsize += len(cv)
                if not batch:
                    first = rownum
                batch.append(tuple(out))
                if len(batch) >= args.batch or bsize >= BATCH_BYTES:
                    flush(batch, first)
                    batch, bsize = [], 0
        flush(batch, first)
        oc.commit()
        plan["n_src"] = n_src
        plan["convs"] = convs
        for c, cv in zip(cols, convs):
            if cv.fail:
                rep.convert_fail.append((t, c["name"], cv.fail, cv.samples))
            if cv.empty:
                rep.empty_to_null.append((t, c["name"], cv.empty))
            c["empty"], c["fail"] = cv.empty, cv.fail
            if cv.epoch:
                rep.type_notes.append((t, c["name"], "epoch 숫자 %d건을 %s 기준 시각으로 변환(문자열 값은 원문 그대로)" % (cv.epoch, args.epoch_tz)))
        if load_err:
            rep.load_errors.append((t, sum(load_err.values()), err_samples))
        print("  %-45s %8d행%s" % (t, n_src, ("  적재오류 %d" % sum(load_err.values())) if load_err else ""))

    # ---------------------------------------------------------------- 3) PK
    print("== PK / NOT NULL / UNIQUE")
    for t in tables:
        plan = plans.get(t)
        if not plan:
            continue
        cols = plan["cols"]
        pkc = [c for c in sorted(cols, key=lambda c: c["pk"]) if c["pk"] > 0]
        pk_names = set()
        if pkc:
            m = re.search(r'CONSTRAINT\s+"?([A-Za-z0-9_$#]+)"?\s+PRIMARY\s+KEY', sql_of.get(t) or "", re.I)
            name = m.group(1) if m else "PK_" + t
            name = trunc_ident(name)
            base, i = name, 1
            while name in used_names:
                i += 1
                name = trunc_ident(base[:120] + "_%d" % i)
            try:
                cur.execute("alter table %s add constraint %s primary key (%s)" % (
                    q(t), q(name), ", ".join(q(c["name"]) for c in pkc)))
                used_names.add(name)
                pk_names = {c["name"] for c in pkc}
            except oracledb.Error as e:
                rep.skipped_constraints.append((t, "PK 생략", "%s: %s" % (",".join(c["name"] for c in pkc), str(e).strip().split("\n")[0][:100])))
        # NOT NULL (PK 컬럼은 PK 가 대신 보장)
        for c in cols:
            if not c["notnull"] or c["name"] in pk_names:
                continue
            try:
                cur.execute("alter table %s modify (%s not null)" % (q(t), q(c["name"])))
            except oracledb.Error as e:
                why = []
                if c.get("empty"):
                    why.append("빈 문자열 %d건(Oracle 에서 NULL)" % c["empty"])
                if c.get("fail"):
                    why.append("변환 실패 %d건" % c["fail"])
                if not why:
                    why.append(str(e).strip().split("\n")[0][:80])
                rep.notnull_dropped.append((t, c["name"], ", ".join(why)))
        # UNIQUE 제약(원본에서 inline UNIQUE 로 생긴 sqlite_autoindex)
        for r in con.execute("pragma index_list(%s)" % sq(t)).fetchall():
            seq, iname, unique, origin, partial = r[0], r[1], r[2], r[3], r[4]
            if origin != "u":
                continue
            icols = [x[2] for x in con.execute("pragma index_info(%s)" % sq(iname))]
            name = trunc_ident("UQ_%s_%s" % (t, "_".join(icols)))
            base, i = name, 1
            while name in used_names:
                i += 1
                name = trunc_ident(base[:120] + "_%d" % i)
            try:
                cur.execute("alter table %s add constraint %s unique (%s)" % (
                    q(t), q(name), ", ".join(q(x) for x in icols)))
                used_names.add(name)
            except oracledb.Error as e:
                rep.skipped_constraints.append((t, "UNIQUE 생략", "%s: %s" % (",".join(icols), str(e).strip().split("\n")[0][:100])))

    # ---------------------------------------------------------------- 4) 인덱스
    print("== 인덱스")
    n_idx = 0
    for t in tables:
        plan = plans.get(t)
        if not plan:
            continue
        kinds = {c["name"]: c["kind"] for c in plan["cols"]}
        for r in con.execute("pragma index_list(%s)" % sq(t)).fetchall():
            iname, unique, origin, partial = r[1], r[2], r[3], r[4]
            if origin != "c":
                continue
            if partial:
                rep.skipped_indexes.append((t, iname, "부분 인덱스(WHERE)"))
                continue
            xinfo = con.execute("pragma index_xinfo(%s)" % sq(iname)).fetchall()
            key = [x for x in xinfo if x[5] == 1]
            if any(x[1] == -2 or x[2] is None for x in key):
                rep.skipped_indexes.append((t, iname, "식 인덱스"))
                continue
            if any(kinds.get(x[2]) in ("clob", "blob") for x in key):
                rep.skipped_indexes.append((t, iname, "LOB 컬럼 포함"))
                continue
            name = trunc_ident(iname)
            base, i = name, 1
            while name in used_names:
                i += 1
                name = trunc_ident(base[:120] + "_%d" % i)
            if name != iname:
                rep.type_notes.append((t, "(index)", "인덱스 이름 %s 충돌 -> %s" % (iname, name)))
            colsql = ", ".join("%s%s" % (q(x[2]), " DESC" if x[3] else "") for x in key)
            stmt = "create %sindex %s on %s (%s)" % ("unique " if unique else "", q(name), q(t), colsql)
            try:
                cur.execute(stmt)
                used_names.add(name)
                n_idx += 1
            except oracledb.Error as e:
                rep.skipped_indexes.append((t, iname, str(e).strip().split("\n")[0][:110]))
    print("  인덱스 %d개 생성" % n_idx)

    # ---------------------------------------------------------------- 5) 행수 검증
    print("== 행수 비교")
    for t in tables:
        plan = plans.get(t)
        if not plan:
            rep.mismatch.append((t, None, None))
            continue
        n_ora = cur.execute("select count(*) from %s" % q(t)).fetchone()[0]
        n_src = plan["n_src"]
        rep.tables += 1
        rep.rows_sqlite += n_src
        rep.rows_oracle += n_ora
        if n_src != n_ora:
            rep.mismatch.append((t, n_src, n_ora))
        print("  %-45s sqlite %8d  oracle %8d  %s" % (t, n_src, n_ora, "OK" if n_src == n_ora else "불일치"))
    oc.close()

    # ---------------------------------------------------------------- 6) 크기
    sc = sysc.cursor()
    sc.execute("select segment_type, count(*), sum(bytes) from dba_segments where owner=:o group by segment_type", o=schema)
    groups = {"테이블": 0, "인덱스": 0, "LOB": 0, "기타": 0}
    nseg = Counter()
    for st, n, b in sc:
        key = "테이블" if st.startswith("TABLE") else "LOB" if st.startswith("LOB") else "인덱스" if st.startswith("INDEX") else "기타"
        groups[key] += b
        nseg[key] += n
    rep.sizes = {k: round(v / 1048576, 2) for k, v in groups.items()}
    rep.sizes["합계"] = round(sum(groups.values()) / 1048576, 2)
    rep.sizes["세그먼트수"] = dict(nseg)
    sc.execute("select segment_name, segment_type, bytes from dba_segments where owner=:o order by bytes desc fetch first 5 rows only", o=schema)
    rep.sizes["상위5"] = [(a, b, round(c / 1048576, 2)) for a, b, c in sc]
    sysc.close()
    rep.elapsed = round(time.time() - t0, 1)

    print_summary(rep, schema)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump(rep.as_dict(), f, ensure_ascii=False, indent=1, default=str)
    ok = not rep.mismatch and not rep.ddl_errors
    sys.exit(0 if ok else 2)


def print_summary(rep, schema):
    print("\n" + "=" * 70)
    print("요약 (스키마 %s)" % schema)
    print("  테이블 %d개 / SQLite 행 %d / Oracle 행 %d" % (rep.tables, rep.rows_sqlite, rep.rows_oracle))
    print("  불일치 테이블: %s" % (", ".join("%s(%s->%s)" % m for m in rep.mismatch) or "없음"))

    def sect(title, rows, fmt, limit=40):
        print("  %s: %d건" % (title, len(rows)))
        for r in rows[:limit]:
            print("     - " + fmt(r))
        if len(rows) > limit:
            print("     ... 외 %d건" % (len(rows) - limit))

    sect("DDL 오류", rep.ddl_errors, lambda r: "%s: %s" % (r[0], r[2][:100]))
    sect("적재 오류", rep.load_errors, lambda r: "%s %d행 %s" % (r[0], r[1], r[2][:2]))
    sect("건너뛴 인덱스", rep.skipped_indexes, lambda r: "%s.%s : %s" % r)
    sect("건너뛴 제약·옵션", rep.skipped_constraints, lambda r: "%s [%s] %s" % r, limit=15)
    sect("버린 DEFAULT", rep.skipped_defaults, lambda r: "%s.%s = %s : %s" % r)
    sect("NOT NULL 해제 컬럼", rep.notnull_dropped, lambda r: "%s.%s : %s" % r)
    sect("변환 실패 값", rep.convert_fail, lambda r: "%s.%s %d건 예 %s" % (r[0], r[1], r[2], r[3]))
    sect("빈 문자열 -> NULL", rep.empty_to_null, lambda r: "%s.%s %d건" % r, limit=15)
    sect("타입 판단 메모", rep.type_notes, lambda r: "%s.%s : %s" % r, limit=15)
    sect("옮기지 않은 객체", rep.skipped_objects, lambda r: "%s %s" % r)
    s = rep.sizes
    print("  스키마 크기(dba_segments, MB): 테이블 %s / 인덱스 %s / LOB %s / 기타 %s / 합계 %s  (세그먼트 %s)" % (
        s["테이블"], s["인덱스"], s["LOB"], s["기타"], s["합계"], s["세그먼트수"]))
    print("  상위 세그먼트: " + ", ".join("%s(%s)=%sMB" % x for x in s["상위5"]))
    print("  소요 %.1f초" % rep.elapsed)


if __name__ == "__main__":
    main()
