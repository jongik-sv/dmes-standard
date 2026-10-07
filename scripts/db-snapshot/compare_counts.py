#!/usr/bin/env python3
"""SQLite .db 와 Oracle PDB 의 표별 행 수를 대조한다(로컬 서버를 Oracle 로 옮긴 뒤 확인용, 읽기 전용).

사용:
  python3 scripts/db-snapshot/compare_counts.py --from-db src/backend/data/mcm.db --name mcm --pdb L_MAIN

`snapshot.py convert --full` 로 옮겼을 때 모든 표가 일치해야 한다. 공유용 변환(--full 없음)은 제외 표·admin 행 필터 때문에 일부 표가 다르다.
SQLite 에만 있는 보조 표(flyway_schema_history·sqlite_*·HTE_*·SEQ_*)는 보지 않는다. 끝나면 일치하지 않는 표가 있을 때 종료 코드 1.
"""
import argparse
import importlib.util
import os
import shutil
import sqlite3
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("snapshot", os.path.join(HERE, "snapshot.py"))
snap = importlib.util.module_from_spec(spec)
sys.modules["snapshot"] = snap
spec.loader.exec_module(snap)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-db", required=True)
    ap.add_argument("--name", required=True, choices=sorted(snap.SOURCES))
    ap.add_argument("--pdb", required=True)
    args = ap.parse_args()
    if snap.oracledb is None:
        sys.exit("oracledb 가 없다: pip install oracledb")
    cfg = snap.SOURCES[args.name]
    tmp = tempfile.mkdtemp(prefix="compare-")
    try:
        cp = os.path.join(tmp, "c.db")
        src = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(args.from_db).replace("\\", "/"), uri=True)
        dst = sqlite3.connect(cp)
        src.backup(dst)
        src.close()
        con = dst
        tables = [r[0] for r in con.execute(
            "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
        counts = {t: con.execute('select count(*) from "%s"' % t).fetchone()[0] for t in tables}
        con.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    conns = {}

    def oracle_count(schema, table):
        if schema not in conns:
            conns[schema] = snap.connect(schema, args.pdb.upper())
        cur = conns[schema].cursor()
        try:
            cur.execute('select count(*) from "%s"' % table)
        except snap.oracledb.Error:
            return None
        return cur.fetchone()[0]

    same = 0
    bad = []
    for t in tables:
        tu = t.upper()
        if tu in snap.SKIP_TABLES or tu.startswith("HTE_") or tu.startswith("SQLITE_"):
            continue
        schema = cfg["schema"]
        for prefix, target in cfg["route"]:
            if tu.startswith(prefix):
                schema = target
        targets = [schema] + [s for s, tbls in cfg["copy_to"].items() if tu in tbls]
        for s in targets:
            n = oracle_count(s, tu)
            if n == counts[t]:
                same += 1
            else:
                bad.append((s, tu, counts[t], n))
    print("원본 %s: 표 %d개, 행 %d, Oracle(%s) 대조 일치 %d, 불일치 %d" % (
        args.name, len(tables), sum(counts.values()), args.pdb.upper(), same, len(bad)))
    for s, t, a, b in bad:
        print("  %-12s %-34s SQLite %7d  Oracle %s" % (s, t, a, "표 없음" if b is None else b))
    for c in conns.values():
        c.close()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
