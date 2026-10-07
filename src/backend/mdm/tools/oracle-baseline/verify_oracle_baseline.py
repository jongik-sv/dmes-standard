#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Oracle 기준선 V1 을 임시 사용자에 적용하고 SQLite 최종 스키마와 대조한 뒤 동작을 점검한다.

사용 예
  python3 src/backend/mdm/tools/oracle-baseline/verify_oracle_baseline.py [--user L_MDM_MDMAPUSER] [--keep]

  - SYSTEM 으로 --user(기본 L_MDM_MDMAPUSER, README §2 의 레인 접두 사용자)를 만들고 V1 을 실행한다.
    이미 있으면 지우고 다시 만든다. 허용 접두는 L_MDM_ 하나뿐이다(다른 사용자는 건드리지 않는다).
  - 대조: 표 집합, 컬럼 집합, NULL 여부, 제약·인덱스 이름 집합(SQLite 원문 기준, 보정 패치의 nullable 반영).
  - 동작: 부분 UNIQUE 인덱스, JSON CHECK, IDENTITY(NULL·직접 값), ON DELETE CASCADE, 일시 기본값.
  - 끝나면 사용자를 지운다(--keep 이면 남긴다).

필요 패키지: oracledb(thin). 접속값은 ORA_DSN(기본 localhost:1521/FREEPDB1)·ORA_SYSTEM_PASSWORD.
"""
import argparse
import json
import os
import re
import sys

import oracledb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_oracle_baseline as gen  # noqa: E402

PASSWORD = "dmes_password_123"


def statements(sql):
    """V1 은 PL/SQL 이 없고 문자열 안에 ';' 가 없다. 주석 줄을 빼고 줄 끝 ';' 로 나눈다."""
    body = "\n".join(l for l in sql.splitlines() if not l.lstrip().startswith("--"))
    return [s.strip() for s in re.split(r";\s*\n", body + "\n") if s.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default="L_MDM_MDMAPUSER")
    ap.add_argument("--dsn", default=os.environ.get("ORA_DSN", "localhost:1521/FREEPDB1"))
    ap.add_argument("--system-password", default=os.environ.get("ORA_SYSTEM_PASSWORD", "sys_password_123"))
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()
    user = a.user.upper()
    if not user.startswith("L_MDM_"):
        sys.exit("L_MDM_ 접두 사용자만 다룬다: %s" % user)

    sysc = oracledb.connect(user="SYSTEM", password=a.system_password, dsn=a.dsn)
    sysc.call_timeout = 120000
    scur = sysc.cursor()
    if scur.execute("select count(*) from dba_users where username = :u", u=user).fetchone()[0]:
        scur.execute('DROP USER "%s" CASCADE' % user)
    scur.execute('CREATE USER "%s" IDENTIFIED BY "%s" QUOTA UNLIMITED ON USERS' % (user, PASSWORD))
    scur.execute('GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE TO "%s"' % user)
    fails = []
    try:
        con = oracledb.connect(user=user, password=PASSWORD, dsn=a.dsn)
        con.call_timeout = 120000
        cur = con.cursor()
        sql = open(gen.DEFAULT_OUT, encoding="utf-8").read()
        stmts = statements(sql)
        for s in stmts:
            try:
                cur.execute(s)
            except oracledb.DatabaseError as e:
                sys.exit("적용 실패: %s\n%s" % (e, s[:300]))
        con.commit()
        print("적용: 문장 %d개" % len(stmts))

        # ---- SQLite 최종 스키마와 대조
        src = next(p for p in gen.DEFAULT_SRC_CANDIDATES if os.path.isdir(p))
        ov = json.load(open(gen.DEFAULT_OVERRIDES, encoding="utf-8"))
        scon, _, _ = gen.load_sqlite(src)
        g = gen.Gen(scon, ov)
        g.read()
        ora_tabs = {r[0] for r in cur.execute("select table_name from user_tables")}
        if ora_tabs != set(g.tables):
            fails.append("표 집합 다름: +%s -%s" % (sorted(ora_tabs - set(g.tables)), sorted(set(g.tables) - ora_tabs)))
        ora_cols = {}
        for t, c, nl in cur.execute("select table_name, column_name, nullable from user_tab_columns"):
            ora_cols[(t, c)] = nl
        exp_cols = {}
        for t, d in g.tables.items():
            for c in d["cols"]:
                nn = (c["notnull"] or bool(c["pk"])) and ("%s.%s" % (t, c["name"])) not in ov["nullable"]
                exp_cols[(t, c["name"])] = "N" if nn else "Y"
        if set(ora_cols) != set(exp_cols):
            fails.append("컬럼 집합 다름: +%s -%s" % (sorted(set(ora_cols) - set(exp_cols))[:10], sorted(set(exp_cols) - set(ora_cols))[:10]))
        for k, v in exp_cols.items():
            if k in ora_cols and ora_cols[k] != v:
                fails.append("NULL 여부 다름: %s.%s 기대 %s 실제 %s" % (k[0], k[1], v, ora_cols[k]))
        exp_names = set()
        for t, d in g.tables.items():
            for k in d["cons"]:
                exp_names.add(k["name"])
        exp_names |= {ix["name"] for ix in g.indexes}
        ora_names = {r[0] for r in cur.execute(
            "select constraint_name from user_constraints where constraint_name not like 'SYS\\_%' escape '\\' "
            "union select index_name from user_indexes where index_name not like 'SYS\\_%' escape '\\'")}
        if ora_names != exp_names:
            fails.append("제약·인덱스 이름 다름: +%s -%s" % (sorted(ora_names - exp_names), sorted(exp_names - ora_names)))
        ck_sqlite = sum(1 for d in g.tables.values() for k in d["cons"] if k["kind"] == "CK")
        ck_ora = cur.execute("select count(*) from user_constraints where constraint_type = 'C' "
                             "and constraint_name not like 'SYS\\_%' escape '\\'").fetchone()[0]
        if ck_sqlite != ck_ora:
            fails.append("CHECK 수 다름: SQLite %d / Oracle %d" % (ck_sqlite, ck_ora))
        print("대조: 표 %d · 컬럼 %d · 이름 %d" % (len(ora_tabs), len(ora_cols), len(ora_names)))

        # ---- 동작 점검
        def expect_fail(label, stmt, code, **binds):
            try:
                cur.execute(stmt, **binds)
                fails.append("%s: 거부되어야 하는데 통과" % label)
            except oracledb.DatabaseError as e:
                if ("ORA-%05d" % code) not in str(e):
                    fails.append("%s: 다른 오류 %s" % (label, e))
            finally:
                con.rollback()

        expect_fail("SELF_YN 두 번째 Y", "insert into TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN) values ('X1','x','Y')", 1)
        cur.execute("insert into TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN) values ('X1','x','N')")
        cur.execute("insert into TB_MDM_SYSTEM (SYSTEM_CODE, SYSTEM_NAME, SELF_YN) values ('X2','x','N')")
        con.rollback()
        expect_fail("JSON 아님", "insert into TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, SYNONYMS) values ('t',1,'d','[1,')", 2290)
        cur.execute("insert into TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, SYNONYMS) values ('t',1,NULL,'[\"a\"]')")
        cur.execute("insert into TB_MDM_TERM (TERM_ID, TERM_NAME, SENSE_NO, DEFINITION) values (NULL,'t',2,'d')")
        cur.execute("insert into TB_MDM_TERM (TERM_ID, TERM_NAME, SENSE_NO, DEFINITION) values (1000,'t',3,'')")
        ids = [r[0] for r in cur.execute("select TERM_ID from TB_MDM_TERM order by TERM_ID")]
        if len(ids) != 3 or 1000 not in ids:
            fails.append("IDENTITY: %s" % ids)
        con.rollback()
        cur.execute("insert into TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND) values ('D1','d','MDM')")
        cur.execute("insert into TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME) values ('D1','C1',TIMESTAMP '2026-01-01 00:00:00','n')")
        vt = cur.execute("select to_char(VALID_TO,'YYYY-MM-DD HH24:MI:SS'), CODE_PATTERN from TB_MDM_DATA_ITEM join TB_MDM_DATA using (MARU_DATA_ID)").fetchone()
        if vt != ("9999-12-31 00:00:00", "^[0-9A-Z]{1,20}$"):
            fails.append("기본값: %s" % (vt,))
        con.rollback()
        cur.execute("insert into TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) values ('R1','r','DECISION','MDM')")
        cur.execute("insert into TB_MDM_RULE_VER (MARU_RULE_ID, VER) values ('R1', 1)")
        cur.execute("insert into TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) values ('R1',1,1,1,'NORMAL','{}')")
        cur.execute("insert into TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) values ('R1',1,2,1,'DEFAULT','{}')")
        cur.execute("insert into TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) values ('R1',1,3,1,'DEFAULT','{}')")
        try:
            cur.execute("insert into TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) values ('R1',1,4,1,'NORMAL','{}')")
            fails.append("RULE_ROW NORMAL SEQ 중복이 통과")
        except oracledb.DatabaseError as e:
            if "UX_TB_MDM_RULE_ROW_SEQ" not in str(e):
                fails.append("RULE_ROW 중복 오류 이름: %s" % e)
        cur.execute("insert into TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) values ('R1',1,1,'COND','a',1)")
        cur.execute("insert into TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) values ('R1',1,2,'COND','a',2)")
        cur.execute("insert into TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) values ('R1',1,3,'RESULT','a',1)")
        try:
            cur.execute("insert into TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) values ('R1',1,4,'RESULT','a',2)")
            fails.append("RULE_VAR RESULT 이름 중복이 통과")
        except oracledb.DatabaseError as e:
            if "UX_TB_MDM_RULE_VAR_NAME" not in str(e):
                fails.append("RULE_VAR 중복 오류 이름: %s" % e)
        cur.execute("delete from TB_MDM_RULE_VER where MARU_RULE_ID = 'R1'")
        left = cur.execute("select (select count(*) from TB_MDM_RULE_ROW) + (select count(*) from TB_MDM_RULE_VAR) from dual").fetchone()[0]
        if left:
            fails.append("CASCADE 뒤 남은 행 %d" % left)
        con.rollback()
        con.close()
    finally:
        if not a.keep:
            scur.execute('DROP USER "%s" CASCADE' % user)
            print("정리: %s 삭제" % user)
        sysc.close()
    if fails:
        print("실패 %d건" % len(fails))
        for f in fails:
            print(" - " + f)
        sys.exit(1)
    print("통과")


if __name__ == "__main__":
    main()
