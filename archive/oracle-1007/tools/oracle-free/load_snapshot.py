#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""git 의 db-snapshot/<db>/ 만으로 로컬 Oracle 26ai Free 에 같은 데이터를 넣는다.

사용 예
  python3 tools/oracle-free/load_snapshot.py                 # db-snapshot/ 아래 전부(mdm mcm)
  python3 tools/oracle-free/load_snapshot.py mdm mcm --drop  # 스키마가 이미 있으면 지우고 다시 적재

동작
  1) db-snapshot/<db>/ 를 임시 SQLite 파일로 복원한다(scripts/db-snapshot/import.sh 와 같은 방식:
     _schema.sql 먼저, 표 파일은 한 트랜잭션, foreign_keys OFF, sqlite_sequence.sql 은 마지막).
  2) tools/oracle-free/sqlite_to_oracle.py 를 불러 같은 이름의 대문자 스키마(MDM·MCM)에 적재한다.
  3) 끝나면 임시 파일을 지우고 스키마별 표 수·행수 일치 여부를 요약한다.

주의
  - src/backend/data/*.db 는 읽지도 쓰지도 않는다.
  - 스키마가 이미 있는데 --drop 이 없으면 아무것도 하지 않고 멈춘다.
  - 스냅샷은 임베딩이 NULL 이고 비밀번호 등 일부 표가 빠져 있다(db-snapshot/README.md).
  - Oracle 접속은 환경변수 ORA_DSN(기본 localhost:1521/FREEPDB1)·ORA_SYSTEM_PASSWORD 를 sqlite_to_oracle.py 와 같이 쓴다.

필요: python3 + oracledb(pip install oracledb). 그 밖에는 표준 라이브러리만 쓴다.
"""
import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

try:
    import oracledb
except ImportError:
    sys.exit("oracledb 패키지가 필요하다: pip install oracledb")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SNAP_DIR = os.path.join(ROOT, "db-snapshot")
CONVERTER = os.path.join(HERE, "sqlite_to_oracle.py")
DSN = os.environ.get("ORA_DSN", "localhost:1521/FREEPDB1")
SYS_PW = os.environ.get("ORA_SYSTEM_PASSWORD", "sys_password_123")


def out(msg=""):
    print(msg, flush=True)


def find_snapshots(names):
    """스냅샷 폴더 이름 목록. 지정이 없으면 _schema.sql 이 있는 하위 폴더 전부."""
    if names:
        found = []
        for n in names:
            if not os.path.isfile(os.path.join(SNAP_DIR, n, "_schema.sql")):
                sys.exit("스냅샷 없음: %s" % os.path.join(SNAP_DIR, n, "_schema.sql"))
            found.append(n)
        return found
    if not os.path.isdir(SNAP_DIR):
        sys.exit("db-snapshot 폴더가 없다: %s" % SNAP_DIR)
    found = sorted(d for d in os.listdir(SNAP_DIR) if os.path.isfile(os.path.join(SNAP_DIR, d, "_schema.sql")))
    if not found:
        sys.exit("db-snapshot/ 아래에 스냅샷이 없다")
    return found


def read_text(path):
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def restore_sqlite(snap, target):
    """import.sh 와 같은 순서로 스냅샷을 SQLite 파일로 복원한다."""
    parts = ["PRAGMA foreign_keys=OFF;\n", read_text(os.path.join(snap, "_schema.sql")), "\nBEGIN;\n"]
    for n in sorted(os.listdir(snap)):
        if not n.endswith(".sql") or n in ("_schema.sql", "sqlite_sequence.sql"):
            continue
        parts.append(read_text(os.path.join(snap, n)))
        parts.append("\n")
    seq = os.path.join(snap, "sqlite_sequence.sql")
    if os.path.isfile(seq):
        parts.append(read_text(seq))
        parts.append("\n")
    parts.append("COMMIT;\n")
    con = sqlite3.connect(target, isolation_level=None)
    try:
        con.executescript("".join(parts))
        n = con.execute("select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'").fetchone()[0]
    finally:
        con.close()
    return n


def existing_schemas(schemas):
    """Oracle 에 이미 있는 스키마 이름 집합."""
    try:
        con = oracledb.connect(user="SYSTEM", password=SYS_PW, dsn=DSN)
    except oracledb.Error as e:
        sys.exit("Oracle 접속 실패(%s): %s\n컨테이너 oracle-26ai-free 가 떠 있는지 확인한다." % (DSN, e))
    try:
        cur = con.cursor()
        have = set()
        for s in schemas:
            cur.execute("select count(*) from dba_users where username=:u", u=s)
            if cur.fetchone()[0]:
                have.add(s)
        return have
    finally:
        con.close()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="db-snapshot -> 임시 SQLite -> Oracle 26ai Free 스키마 적재")
    ap.add_argument("dbs", nargs="*", help="스냅샷 이름(mdm mcm ...). 생략하면 db-snapshot/ 아래 전부")
    ap.add_argument("--drop", action="store_true", help="스키마가 이미 있으면 DROP USER CASCADE 후 다시 적재")
    args = ap.parse_args()

    dbs = find_snapshots(args.dbs)
    schemas = {d: d.upper() for d in dbs}
    out("대상 스냅샷: %s -> 스키마 %s (%s)" % (", ".join(dbs), ", ".join(schemas.values()), DSN))

    have = existing_schemas(list(schemas.values()))
    if have and not args.drop:
        sys.exit("스키마가 이미 있다: %s\n"
                 "지우고 스냅샷으로 다시 적재하려면 --drop 을 붙인다. 예) python3 tools/oracle-free/load_snapshot.py %s --drop"
                 % (", ".join(sorted(have)), " ".join(dbs)))

    tmp = tempfile.mkdtemp(prefix="load-snapshot-")
    results = []   # (db, schema, rc, report 또는 None)
    try:
        for db in dbs:
            schema = schemas[db]
            out("\n" + "=" * 70)
            out("[%s] 스냅샷 복원 중 ..." % db)
            t0 = time.time()
            sq_path = os.path.join(tmp, db + ".db")
            n = restore_sqlite(os.path.join(SNAP_DIR, db), sq_path)
            out("[%s] 임시 SQLite 복원 완료: 표 %d개, %.1f초" % (db, n, time.time() - t0))

            report = os.path.join(tmp, db + ".json")
            cmd = [sys.executable, CONVERTER, "--sqlite", sq_path, "--schema", schema, "--report", report]
            if args.drop:
                cmd.append("--drop")
            env = dict(os.environ, PYTHONIOENCODING="utf-8")
            out("[%s] Oracle 스키마 %s 적재 중 ..." % (db, schema))
            rc = subprocess.call(cmd, env=env)
            rep = None
            if os.path.isfile(report):
                with open(report, encoding="utf-8") as f:
                    rep = json.load(f)
            results.append((db, schema, rc, rep))
            os.remove(sq_path)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    out("\n" + "=" * 70)
    out("최종 요약")
    bad = False
    for db, schema, rc, rep in results:
        if rep is None:
            out("  %-4s 실패(종료 코드 %s, 보고 없음)" % (schema, rc))
            bad = True
            continue
        mism = rep.get("mismatch") or []
        ddl = rep.get("ddl_errors") or []
        ok = rc == 0 and not mism and not ddl and rep["rows_sqlite"] == rep["rows_oracle"]
        bad = bad or not ok
        out("  %-4s 표 %d개 / 스냅샷 행 %d / Oracle 행 %d / %s" % (
            schema, rep["tables"], rep["rows_sqlite"], rep["rows_oracle"],
            "일치" if ok else "불일치 또는 오류(위 로그 확인)"))
        for m in mism:
            out("       불일치: %s" % (m,))
    out("임베딩(TB_MDM_TERM.EMBEDDING)은 NULL, 비밀번호 등 일부 표는 스키마만 있다(db-snapshot/README.md).")
    sys.exit(2 if bad else 0)


if __name__ == "__main__":
    main()
