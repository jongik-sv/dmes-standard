#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""snapshot.py convert 후처리(위젯 SQL Oracle 판 치환) 단위 시험. Oracle·서버 없이 돈다.
실행: python3 scripts/db-snapshot/test_snapshot.py
"""
import csv
import importlib.util
import io
import json
import os
import sqlite3
import sys
import unittest
from contextlib import redirect_stderr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
spec = importlib.util.spec_from_file_location("snapshot", os.path.join(HERE, "snapshot.py"))
snap = importlib.util.module_from_spec(spec)
sys.modules["snapshot"] = snap
spec.loader.exec_module(snap)

with open(snap.WIDGET_SQL_MAP, encoding="utf-8") as _f:
    WIDGETS = json.load(_f)["widgets"]


def make_db(rows):
    con = sqlite3.connect(":memory:")
    con.execute("create table TB_MCM_WIDGET_DEF (WIDGET_ID text primary key, CONFIG_JSON text)")
    con.executemany("insert into TB_MCM_WIDGET_DEF values (?, ?)", rows)
    return con


def run_fix(con):
    err = io.StringIO()
    with redirect_stderr(err):
        snap.fix_widget_sql(con)
    return err.getvalue()


def config_of(con, wid):
    return con.execute("select CONFIG_JSON from TB_MCM_WIDGET_DEF where WIDGET_ID=?", (wid,)).fetchone()[0]


class WidgetSqlTest(unittest.TestCase):
    def test_known_sqlite_sql_becomes_oracle_and_other_keys_stay(self):
        rows = []
        for wid, w in WIDGETS.items():
            cfg = {"sql": w["sqlite"], "columns": ["가", "나"], "refreshSec": 30}
            rows.append((wid, json.dumps(cfg, ensure_ascii=False, separators=(",", ":"))))
        con = make_db(rows)
        log = run_fix(con)
        self.assertIn("%d개" % len(WIDGETS), log)
        for wid, w in WIDGETS.items():
            cfg = json.loads(config_of(con, wid))
            self.assertEqual(cfg["sql"], w["oracle"], wid)
            self.assertEqual(cfg["columns"], ["가", "나"])
            self.assertEqual(cfg["refreshSec"], 30)
            self.assertNotIn("DATE('now'", cfg["sql"])
            self.assertNotRegex(cfg["sql"], r"\bLIMIT\s+\d")

    def test_formatting_outside_sql_is_preserved(self):
        wid, w = next(iter(WIDGETS.items()))
        text = '{ "sql" : %s ,  "x":1 }' % json.dumps(w["sqlite"], ensure_ascii=False)
        con = make_db([(wid, text)])
        run_fix(con)
        out = config_of(con, wid)
        self.assertTrue(out.startswith('{ "sql" : '))
        self.assertTrue(out.endswith(' ,  "x":1 }'))
        self.assertEqual(json.loads(out)["sql"], w["oracle"])

    def test_ascii_escaped_json_is_replaced(self):
        wid, w = next(iter(WIDGETS.items()))
        text = json.dumps({"sql": w["sqlite"]}, ensure_ascii=True)
        con = make_db([(wid, text)])
        run_fix(con)
        self.assertEqual(json.loads(config_of(con, wid))["sql"], w["oracle"])

    def test_unknown_sql_is_left_alone_with_warning(self):
        unknown = json.dumps({"sql": "SELECT 1 FROM X WHERE D >= DATE('now','localtime') LIMIT 5"})
        modified = json.dumps({"sql": WIDGETS[next(iter(WIDGETS))]["sqlite"] + " "})   # 한 글자만 달라도 바꾸지 않는다
        con = make_db([("def.unknown", unknown), ("def.modified", modified)])
        log = run_fix(con)
        self.assertEqual(config_of(con, "def.unknown"), unknown)
        self.assertEqual(config_of(con, "def.modified"), modified)
        self.assertIn("def.unknown", log)
        self.assertIn("def.modified", log)

    def test_non_query_widget_and_bad_json_are_ignored(self):
        rows = [("def.url", '{"url":"https://example.com"}'), ("def.bad", "not json"), ("def.arr", "[1,2]"), ("def.null", None)]
        con = make_db(rows)
        self.assertEqual(run_fix(con), "")
        self.assertEqual(config_of(con, "def.url"), '{"url":"https://example.com"}')
        self.assertEqual(config_of(con, "def.bad"), "not json")

    def test_idempotent(self):
        wid, w = next(iter(WIDGETS.items()))
        con = make_db([(wid, json.dumps({"sql": w["sqlite"]}))])
        run_fix(con)
        first = config_of(con, wid)
        log = run_fix(con)
        self.assertEqual(config_of(con, wid), first)
        self.assertEqual(log, "")

    def test_committed_csv_has_the_oracle_text(self):
        path = os.path.join(ROOT, "db-snapshot", "MCMAPUSER", "TB_MCM_WIDGET_DEF.csv")
        csv.field_size_limit(10 ** 9)
        with open(path, encoding="utf-8", newline="") as f:
            rows = {r["WIDGET_ID"]: r for r in csv.DictReader(f)}
        for wid, w in WIDGETS.items():
            self.assertEqual(json.loads(rows[wid]["CONFIG_JSON"])["sql"], w["oracle"], wid)

    def test_apply_mcm_corrections_runs_widget_fix(self):
        wid, w = next(iter(WIDGETS.items()))
        con = make_db([(wid, json.dumps({"sql": w["sqlite"]}))])
        err = io.StringIO()
        with redirect_stderr(err):
            snap.apply_mcm_corrections(con)
        self.assertEqual(json.loads(config_of(con, wid))["sql"], w["oracle"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
