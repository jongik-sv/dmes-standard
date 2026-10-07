#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mdm SQLite 마이그레이션(V1~Vn)의 최종 스키마로 Oracle 기준선 V1 을 만든다.

사용 예
  python3 src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py            # V1·결정표를 다시 쓴다
  python3 src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py --check    # 다시 만든 결과가 커밋본과 같은지만 본다

원칙
  - SQLite 마이그레이션을 메모리 DB 에 차례로 적용하고, 그 최종 스키마(sqlite_master 원문 + PRAGMA)를 읽는다.
  - 기계적으로 정할 수 없는 컬럼별 결정(CLOB·NULL 허용·BOOLEAN·업무 일시)은 overrides.json(보정 패치)에 이유와 함께 둔다.
  - 표는 FK 없이 만들고, FK 는 끝에서 ALTER TABLE 로 붙인다(순환 참조 대비).
  - 부분 인덱스는 Oracle 함수 기반 인덱스(CASE WHEN 조건 THEN 컬럼 END)로 바꾼다. 키가 모두 NULL 인 행은 인덱스에
    들어가지 않으므로 의미가 같다. FK 가 가리키는 고유 인덱스는 같은 이름의 UNIQUE 제약으로 바꾼다(ORA-02270 대비).
  - 출력은 입력이 같으면 바이트 단위로 같다. 표·인덱스·FK 는 이름 순이다.

표준 라이브러리만 쓴다(윈도우에서도 python3 하나로 돈다).
"""
import argparse
import glob
import hashlib
import io
import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MDM = os.path.normpath(os.path.join(HERE, "..", ".."))
DEFAULT_SRC_CANDIDATES = [
    os.path.join(MDM, "api", "src", "main", "resources", "db", "migration", "mdm", "sqlite"),
    os.path.join(MDM, "archive", "db-migration-sqlite"),
]
DEFAULT_OUT = os.path.join(MDM, "api", "src", "main", "resources", "db", "migration", "mdm", "oracle", "V1__baseline.sql")
DEFAULT_DECISIONS = os.path.join(HERE, "DECISIONS.md")
DEFAULT_OVERRIDES = os.path.join(HERE, "overrides.json")

QUOTE_ALWAYS = set()  # 원문이 따옴표로 감싼 컬럼은 원문을 따른다(아래 parse_column)


# ---------------------------------------------------------------- SQLite 적용

def version_of(path):
    m = re.match(r"V(\d+)__", os.path.basename(path))
    return int(m.group(1)) if m else None


def load_sqlite(src):
    files = [p for p in glob.glob(os.path.join(src, "V*__*.sql")) if version_of(p) is not None]
    files.sort(key=version_of)
    if not files:
        sys.exit("SQLite 마이그레이션이 없다: %s" % src)
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys=ON")
    digest = hashlib.sha256()
    for f in files:
        # 윈도우 체크아웃(CRLF)에서도 같은 해시·같은 출력이 나오게 줄바꿈을 LF 로 맞춘다.
        raw = open(f, "rb").read().replace(b"\r\n", b"\n")
        digest.update(os.path.basename(f).encode("utf-8") + b"\0" + raw + b"\0")
        con.executescript(raw.decode("utf-8"))
    con.commit()
    return con, [os.path.basename(f) for f in files], digest.hexdigest()


# ---------------------------------------------------------------- 원문 파싱

def strip_comments(sql):
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if c == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'" and (j + 1 >= n or sql[j + 1] != "'"):
                    break
                j += 2 if sql[j] == "'" else 1
            out.append(sql[i:j + 1]); i = j + 1
        elif sql.startswith("/*", i):
            raise ValueError("블록 주석은 다루지 않는다: %s" % sql[i:i + 60])
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        else:
            out.append(c); i += 1
    return "".join(out)


def split_top(body):
    """괄호·따옴표 밖의 쉼표로 나눈다."""
    parts, depth, cur, i, n = [], 0, [], 0, len(body)
    while i < n:
        c = body[i]
        if c == "'":
            j = i + 1
            while j < n:
                if body[j] == "'" and (j + 1 >= n or body[j + 1] != "'"):
                    break
                j += 2 if body[j] == "'" else 1
            cur.append(body[i:j + 1]); i = j + 1; continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        if c == "," and depth == 0:
            parts.append("".join(cur).strip()); cur = []
        else:
            cur.append(c)
        i += 1
    if "".join(cur).strip():
        parts.append("".join(cur).strip())
    return parts


def paren_span(s, start):
    """s[start] == '(' 일 때 짝 괄호까지의 안쪽 문자열과 끝 위치."""
    assert s[start] == "("
    depth, i = 0, start
    while i < len(s):
        if s[i] == "'":
            j = s.find("'", i + 1)
            i = j + 1; continue
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return s[start + 1:i], i + 1
        i += 1
    raise ValueError("괄호 짝이 없다: %s" % s[start:start + 80])


def unq(name):
    name = name.strip()
    if name[:1] in ('"', "`", "[") and name[-1:] in ('"', "`", "]"):
        return name[1:-1]
    return name


IDENT = r'(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)'


def parse_table(sql):
    sql = strip_comments(sql)
    m = re.match(r"\s*CREATE\s+TABLE\s+(" + IDENT + r")\s*", sql, re.I)
    table = unq(m.group(1))
    body, _ = paren_span(sql, sql.index("(", m.end() - 1))
    cols, constraints = [], []
    for item in split_top(body):
        if re.match(r"CONSTRAINT\b", item, re.I):
            constraints.append(parse_table_constraint(item))
        elif re.match(r"(PRIMARY|FOREIGN|UNIQUE|CHECK)\b", item, re.I):
            raise ValueError("이름 없는 표 제약은 다루지 않는다: %s" % item)
        else:
            col, inline = parse_column(item)
            cols.append(col)
            constraints.extend(inline)
    return table, cols, constraints


def parse_table_constraint(item):
    m = re.match(r"CONSTRAINT\s+(" + IDENT + r")\s+(.*)$", item, re.I | re.S)
    name, rest = unq(m.group(1)), m.group(2).strip()
    if re.match(r"PRIMARY\s+KEY", rest, re.I):
        inner, _ = paren_span(rest, rest.index("("))
        return {"kind": "PK", "name": name, "cols": [unq(c) for c in split_top(inner)]}
    if re.match(r"UNIQUE", rest, re.I):
        inner, _ = paren_span(rest, rest.index("("))
        return {"kind": "UQ", "name": name, "cols": [unq(c) for c in split_top(inner)]}
    if re.match(r"CHECK", rest, re.I):
        inner, _ = paren_span(rest, rest.index("("))
        return {"kind": "CK", "name": name, "expr": inner}
    if re.match(r"FOREIGN\s+KEY", rest, re.I):
        inner, end = paren_span(rest, rest.index("("))
        m2 = re.match(r"\s*REFERENCES\s+(" + IDENT + r")\s*", rest[end:], re.I)
        p0 = end + m2.end()
        pinner, pend = paren_span(rest, rest.index("(", p0 - 1))
        tail = rest[pend:].strip()
        on_delete = None
        md = re.search(r"ON\s+DELETE\s+(CASCADE|SET\s+NULL)", tail, re.I)
        if md:
            on_delete = re.sub(r"\s+", " ", md.group(1).upper())
        elif tail:
            raise ValueError("다루지 않는 FK 꼬리: %s" % tail)
        return {"kind": "FK", "name": name, "cols": [unq(c) for c in split_top(inner)],
                "ref_table": unq(m2.group(1)), "ref_cols": [unq(c) for c in split_top(pinner)],
                "on_delete": on_delete}
    raise ValueError("모르는 제약: %s" % item)


def parse_column(item):
    m = re.match(r"(" + IDENT + r")\s*(.*)$", item, re.S)
    raw_name, rest = m.group(1), m.group(2)
    name = unq(raw_name)
    quoted = raw_name[0] in ('"', "`", "[")
    tm = re.match(r"([A-Za-z]+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)", rest)
    sqlite_type = re.sub(r"\s+", "", tm.group(1)).upper() if tm else ""
    rest = rest[tm.end():] if tm else rest
    inline = []
    autoinc = False
    while True:
        mc = re.search(r"CONSTRAINT\s+(" + IDENT + r")\s+(PRIMARY\s+KEY(?:\s+AUTOINCREMENT)?|CHECK\s*)", rest, re.I)
        if not mc:
            break
        cname = unq(mc.group(1))
        if mc.group(2).upper().startswith("PRIMARY"):
            autoinc = "AUTOINCREMENT" in mc.group(2).upper()
            inline.append({"kind": "PK", "name": cname, "cols": [name]})
            rest = rest[:mc.start()] + rest[mc.end():]
        else:
            p = rest.index("(", mc.end() - 1)
            inner, end = paren_span(rest, p)
            inline.append({"kind": "CK", "name": cname, "expr": inner})
            rest = rest[:mc.start()] + rest[end:]
    if re.search(r"\bCONSTRAINT\b|\bREFERENCES\b|\bUNIQUE\b|\bPRIMARY\b|\bCHECK\b|\bCOLLATE\b|\bGENERATED\b|\bAS\s*\(", rest, re.I):
        raise ValueError("컬럼 정의에 남은 제약: %s" % item)
    return {"name": name, "quoted": quoted, "sqlite_type": sqlite_type, "autoinc": autoinc}, inline


def parse_index(sql):
    sql = strip_comments(sql)
    m = re.match(r"\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(" + IDENT + r")\s+ON\s+(" + IDENT + r")\s*", sql, re.I)
    inner, end = paren_span(sql, sql.index("(", m.end() - 1))
    where = None
    mw = re.match(r"\s*WHERE\s+(.*?)\s*;?\s*$", sql[end:], re.I | re.S)
    if mw:
        where = mw.group(1)
    elif sql[end:].strip(" ;\n"):
        raise ValueError("다루지 않는 인덱스 꼬리: %s" % sql[end:])
    return {"name": unq(m.group(2)), "table": unq(m.group(3)), "unique": bool(m.group(1)),
            "cols": [unq(c) for c in split_top(inner)], "where": where}


# ---------------------------------------------------------------- 변환

class Gen:
    def __init__(self, con, ov):
        self.con, self.ov = con, ov
        self.tables = {}      # name -> dict
        self.indexes = []
        self.decisions = []   # (table, col, sqlite_type, oracle_type, null, reason)
        self.used = {"clob": set(), "boolean": set(), "nullable": set(), "datetime_exclude": set(),
                     "unique_nullable_ok": set()}

    def read(self):
        for name, sql in self.con.execute(
                "select name, sql from sqlite_master where type='table' and name not like 'sqlite_%' "
                "and name <> 'flyway_schema_history' order by name"):
            tname, cols, cons = parse_table(sql)
            if tname != name:
                raise ValueError("표 이름 불일치 %s / %s" % (tname, name))
            info = {r[1]: r for r in self.con.execute('pragma table_info("%s")' % name)}
            for c in cols:
                r = info[c["name"]]
                c["notnull"] = bool(r[3])
                c["dflt"] = r[4]
                c["pk"] = r[5]
            if set(info) != {c["name"] for c in cols}:
                raise ValueError("컬럼 파싱 불일치: %s" % name)
            self.tables[name] = {"cols": cols, "cons": cons}
        for (sql,) in self.con.execute(
                "select sql from sqlite_master where type='index' and sql is not null order by name"):
            self.indexes.append(parse_index(sql))

    # -- 형 결정
    def base_type(self, t, c):
        key = "%s.%s" % (t, c["name"])
        st = c["sqlite_type"]
        dt = self.ov["datetime_text"]
        if c["autoinc"]:
            return "NUMBER(19)", "AUTOINCREMENT -> IDENTITY"
        if key in self.ov["boolean"]:
            self.used["boolean"].add(key)
            return "NUMBER(1)", "BOOLEAN: " + self.ov["boolean"][key]
        if key in self.ov["clob"]:
            if st != "TEXT":
                raise ValueError("CLOB 보정 대상이 TEXT 가 아니다: %s %s" % (key, st))
            self.used["clob"].add(key)
            return "CLOB", "CLOB: " + self.ov["clob"][key]
        if st == "TEXT":
            if re.match(dt["name_regex"], c["name"]) and key not in dt["exclude"]:
                return "TIMESTAMP(6)", "업무 일시 TEXT -> TIMESTAMP"
            if key in dt["exclude"]:
                self.used["datetime_exclude"].add(key)
            return "VARCHAR2(4000 BYTE)", "TEXT(4000바이트 이하)"
        m = re.match(r"VARCHAR\((\d+)\)$", st)
        if m:
            return "VARCHAR2(%s CHAR)" % m.group(1), ""
        m = re.match(r"NUMERIC\((\d+),(\d+)\)$", st)
        if m:
            return "NUMBER(%s,%s)" % m.groups(), ""
        if st == "INTEGER":
            if re.match(self.ov["number19"]["name_regex"], c["name"]):
                return "NUMBER(19)", "엔티티 long 계수기"
            return "NUMBER(10)", ""
        if st == "BIGINT":
            return "NUMBER(19)", ""
        if st == "TIMESTAMP":
            return "TIMESTAMP(6)", "감사 일시"
        if st == "BLOB":
            return "BLOB", ""
        raise ValueError("모르는 SQLite 형: %s %s" % (key, st))

    def resolve_types(self):
        types = {}
        for t, d in self.tables.items():
            for c in d["cols"]:
                types[(t, c["name"])] = list(self.base_type(t, c))
        # FK 자식 컬럼은 부모 컬럼 형을 따른다(IDENTITY NUMBER(19) 전파). 고정점까지 돈다.
        changed = True
        while changed:
            changed = False
            for t, d in self.tables.items():
                for k in d["cons"]:
                    if k["kind"] != "FK":
                        continue
                    for cc, pc in zip(k["cols"], k["ref_cols"]):
                        pt = types[(k["ref_table"], pc)][0]
                        ct = types[(t, cc)]
                        if ct[0] != pt:
                            # 넓히기만 허용한다: 정수 NUMBER(10) -> NUMBER(19). 그 밖(소수 자릿수·문자 길이 차이)은 멈춘다.
                            if not (ct[0] == "NUMBER(10)" and pt == "NUMBER(19)"):
                                raise ValueError("FK 형 불일치 %s.%s %s -> %s" % (t, cc, ct[0], pt))
                            ct[0] = pt
                            ct[1] = (ct[1] + "; " if ct[1] else "") + "FK %s 부모 형" % k["name"]
                            changed = True
        self.types = types

    # -- 식 변환
    def conv_expr(self, expr, cols_quoted):
        e = expr
        e = re.sub(r"`([^`]+)`", r'"\1"', e)
        js = self.ov["json_check"]
        e = re.sub(r"json_valid\(\s*(" + IDENT + r")\s*\)", lambda m: "%s %s" % (self.ident(m.group(1), cols_quoted), js), e)
        if re.search(r"\b(json_?\w*|strftime|datetime|date|time|julianday|ifnull|iif|typeof|glob|length|substr|printf|instr|unicode|hex)\s*\(", e, re.I) \
                or "==" in e or re.search(r"\bIS\s+'", e, re.I):
            raise ValueError("SQLite 전용 함수·연산자가 식에 남았다: %s" % expr)
        # SQLite LIKE 는 ASCII 대소문자를 구분하지 않고 Oracle 은 구분한다. 영문자가 든 패턴은 의미가 갈린다.
        for lm in re.finditer(r"\bLIKE\s+'((?:[^']|'')*)'", e, re.I):
            if re.search(r"[A-Za-z]", lm.group(1)):
                raise ValueError("영문자 LIKE 패턴은 대소문자 의미가 갈린다: %s" % expr)
        return re.sub(r"\s+", " ", e).strip()

    def ident(self, raw, cols_quoted=()):
        n = unq(raw)
        return '"%s"' % n if n in cols_quoted else n

    def default_sql(self, otype, dflt):
        if dflt is None:
            return None
        if otype.startswith("TIMESTAMP"):
            m = re.match(r"'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'$", dflt)
            if not m:
                raise ValueError("일시 기본값 모양: %s" % dflt)
            return "TIMESTAMP '%s'" % m.group(1)
        if re.match(r"^-?\d+(\.\d+)?$", dflt) or re.match(r"^'(?:[^']|'')*'$", dflt):
            if dflt == "''":
                raise ValueError("빈 문자열 기본값은 Oracle 에서 NULL 이다")
            return dflt
        raise ValueError("함수식 기본값은 다루지 않는다: %s" % dflt)

    # -- 출력
    def emit(self, out, files, digest):
        w = out.write
        w("-- mdm Oracle 기준선 V1 — 자동 생성 파일. 직접 고치지 말고 생성기·보정 패치를 고친 뒤 다시 만든다.\n")
        w("--   생성기: src/backend/mdm/tools/oracle-baseline/gen_oracle_baseline.py\n")
        w("--   보정 패치: src/backend/mdm/tools/oracle-baseline/overrides.json · 결정표: DECISIONS.md\n")
        w("--   원천: SQLite 마이그레이션 %s ~ %s (%d개)\n" % (files[0], files[-1], len(files)))
        w("--   원천 SHA-256: %s\n" % digest)
        w("-- 접속 사용자 = 스키마 주인(MDMAPUSER). SQL 에 스키마 접두를 두지 않는다.\n")
        w("-- 순서: 표(PK·UNIQUE·CHECK) -> 인덱스 -> FK -> 초기 행.\n\n")

        fk_all = []
        uq_from_index = self.fk_unique_indexes()
        for t in sorted(self.tables):
            d = self.tables[t]
            cols_quoted = {c["name"] for c in d["cols"] if c["quoted"]}
            lines = []
            for c in d["cols"]:
                key = "%s.%s" % (t, c["name"])
                otype, reason = self.types[(t, c["name"])]
                s = "    %-22s %s" % (self.ident(c["name"], cols_quoted), otype)
                if c["autoinc"]:
                    s += " GENERATED BY DEFAULT ON NULL AS IDENTITY"
                dv = self.default_sql(otype, c["dflt"])
                if dv is not None:
                    s += " DEFAULT " + dv
                notnull = c["notnull"] or bool(c["pk"])
                if key in self.ov["nullable"]:
                    if not notnull:
                        raise ValueError("이미 NULL 허용인 컬럼을 nullable 보정에 적었다: %s" % key)
                    self.used["nullable"].add(key)
                    notnull = False
                    reason = (reason + "; " if reason else "") + "NOT NULL 해제: " + self.ov["nullable"][key]
                if notnull:
                    s += " NOT NULL"
                lines.append(s)
                self.decisions.append((t, c["name"], c["sqlite_type"] + (" AUTOINCREMENT" if c["autoinc"] else ""),
                                       otype, "NOT NULL" if notnull else "NULL", reason))
            for k in d["cons"]:
                if k["kind"] == "PK":
                    lines.append("    CONSTRAINT %s PRIMARY KEY (%s)" % (k["name"], ", ".join(self.ident(c, cols_quoted) for c in k["cols"])))
            for k in d["cons"]:
                if k["kind"] == "UQ":
                    lines.append("    CONSTRAINT %s UNIQUE (%s)" % (k["name"], ", ".join(self.ident(c, cols_quoted) for c in k["cols"])))
            for ix in uq_from_index:
                if ix["table"] == t:
                    lines.append("    CONSTRAINT %s UNIQUE (%s)" % (ix["name"], ", ".join(self.ident(c, cols_quoted) for c in ix["cols"])))
            for k in d["cons"]:
                if k["kind"] == "CK":
                    lines.append("    CONSTRAINT %s CHECK (%s)" % (k["name"], self.conv_expr(k["expr"], cols_quoted)))
                elif k["kind"] == "FK":
                    fk_all.append((t, k, cols_quoted))
            w("CREATE TABLE %s (\n%s\n);\n\n" % (t, ",\n".join(lines)))

        w("-- 인덱스. 부분 인덱스(WHERE)는 함수 기반 인덱스로 바꾼다.\n")
        uq_names = {ix["name"] for ix in uq_from_index}
        for ix in sorted(self.indexes, key=lambda x: x["name"]):
            if ix["unique"]:
                self.check_unique_nulls(ix)
            if ix["name"] in uq_names:
                continue
            cols_quoted = {c["name"] for c in self.tables[ix["table"]]["cols"] if c["quoted"]}
            for c in ix["cols"]:
                if self.types[(ix["table"], c)][0] in ("CLOB", "BLOB"):
                    raise ValueError("LOB 컬럼에 인덱스: %s.%s" % (ix["table"], c))
            keys = [self.ident(c, cols_quoted) for c in ix["cols"]]
            if ix["where"]:
                cond = self.conv_expr(ix["where"], cols_quoted)
                m = re.match(r"^(" + IDENT + r") IS NOT NULL$", cond)
                if not ix["unique"] and m and len(ix["cols"]) == 1 and unq(m.group(1)) == ix["cols"][0]:
                    w("-- %s: 원문 WHERE %s. Oracle B-tree 는 키가 모두 NULL 인 행을 넣지 않으므로 일반 인덱스로 같은 의미다.\n" % (ix["name"], cond))
                else:
                    w("-- %s: 원문 WHERE %s. 조건 밖 행은 키가 모두 NULL 이 되어 인덱스에 들어가지 않는다.\n" % (ix["name"], cond))
                    keys = ["CASE WHEN %s THEN %s END" % (cond, k) for k in keys]
            w("CREATE %sINDEX %s ON %s (%s);\n" % ("UNIQUE " if ix["unique"] else "", ix["name"], ix["table"], ", ".join(keys)))
        w("\n-- FK 자식 컬럼 인덱스(SQLite 원천에는 없음). Oracle 은 FK 에 인덱스를 자동으로 만들지 않아 부모 삭제 때\n")
        w("-- 자식 표 전체 읽기·표 잠금이 난다. PK·UNIQUE·기존 인덱스 앞 컬럼이 덮는 FK 는 뺐다.\n")
        self.fk_ix = self.fk_indexes()
        for fx in self.fk_ix:
            cols_quoted = {c["name"] for c in self.tables[fx["table"]]["cols"] if c["quoted"]}
            w("CREATE INDEX %s ON %s (%s);\n" % (fx["name"], fx["table"], ", ".join(self.ident(c, cols_quoted) for c in fx["cols"])))
        w("\n-- FK. 순환 참조(EAI <-> LAYOUT_VER 등)가 있어 표를 모두 만든 뒤 붙인다.\n")
        for t, k, cols_quoted in sorted(fk_all, key=lambda x: x[1]["name"]):
            pq = {c["name"] for c in self.tables[k["ref_table"]]["cols"] if c["quoted"]}
            w("ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)%s;\n" % (
                t, k["name"], ", ".join(self.ident(c, cols_quoted) for c in k["cols"]), k["ref_table"],
                ", ".join(self.ident(c, pq) for c in k["ref_cols"]), " ON DELETE " + k["on_delete"] if k["on_delete"] else ""))
        w("\n-- 초기 행(SQLite 최종 상태 그대로).\n")
        for t in sorted(self.tables):
            d = self.tables[t]
            cols_quoted = {c["name"] for c in d["cols"] if c["quoted"]}
            names = [c["name"] for c in d["cols"]]
            pk = [c["name"] for c in sorted(d["cols"], key=lambda c: c["pk"]) if c["pk"]] or names
            rows = self.con.execute('select %s from "%s" order by %s' % (
                ", ".join('"%s"' % n for n in names), t, ", ".join('"%s"' % n for n in pk))).fetchall()
            for r in rows:
                cs, vs = [], []
                for n, v in zip(names, r):
                    if v is None:
                        continue
                    cs.append(self.ident(n, cols_quoted)); vs.append(self.literal(self.types[(t, n)][0], v, t, n))
                w("INSERT INTO %s (%s) VALUES (%s);\n" % (t, ", ".join(cs), ", ".join(vs)))

    def literal(self, otype, v, t, n):
        if isinstance(v, (int, float)):
            if otype.startswith("TIMESTAMP"):
                raise ValueError("숫자 일시 초기 행: %s.%s" % (t, n))
            return repr(v)
        if isinstance(v, bytes):
            raise ValueError("BLOB 초기 행은 다루지 않는다: %s.%s" % (t, n))
        if v == "":
            raise ValueError("빈 문자열 초기 행: %s.%s" % (t, n))
        if otype.startswith("TIMESTAMP"):
            return "TIMESTAMP '%s'" % v
        return "'%s'" % v.replace("'", "''")

    def fk_indexes(self):
        """FK 자식 컬럼 인덱스. Oracle 은 FK 에 인덱스를 자동으로 만들지 않아 부모 삭제·키 변경 때 자식 표를
        전체 읽고 표 잠금을 건다. PK·UNIQUE·기존 일반 인덱스의 앞 컬럼들(순서 무관)이 FK 컬럼을 덮으면 만들지 않는다.
        이름은 FK 이름의 FK_ 를 IX_ 로 바꾼다."""
        covers = []
        for t, d in self.tables.items():
            for k in d["cons"]:
                if k["kind"] in ("PK", "UQ"):
                    covers.append((t, k["cols"]))
        for ix in self.indexes:
            if not ix["where"]:
                covers.append((ix["table"], ix["cols"]))
        names = {k["name"] for d in self.tables.values() for k in d["cons"]} | {ix["name"] for ix in self.indexes}
        out = []
        for t in sorted(self.tables):
            for k in sorted((x for x in self.tables[t]["cons"] if x["kind"] == "FK"), key=lambda x: x["name"]):
                n = len(k["cols"])
                if any(ct == t and len(cc) >= n and set(cc[:n]) == set(k["cols"]) for ct, cc in covers):
                    continue
                name = "IX_" + k["name"][3:]
                if not k["name"].startswith("FK_") or name in names:
                    raise ValueError("FK 인덱스 이름을 만들 수 없다: %s -> %s" % (k["name"], name))
                names.add(name)
                covers.append((t, k["cols"]))
                out.append({"name": name, "table": t, "cols": k["cols"], "fk": k["name"]})
        return out

    def check_unique_nulls(self, ix):
        """UNIQUE 키에 NULL 허용 컬럼이 있으면 SQLite(NULL 끼리 다름)와 Oracle(일부 NULL 이면 중복)의 의미가 갈린다."""
        cols = {c["name"]: c for c in self.tables[ix["table"]]["cols"]}
        for cn in ix["cols"]:
            c = cols[cn]
            nullable = not (c["notnull"] or c["pk"]) or ("%s.%s" % (ix["table"], cn)) in self.ov["nullable"]
            key = "%s.%s" % (ix["name"], cn)
            if not nullable:
                continue
            if key not in self.ov["unique_nullable_ok"]:
                raise ValueError("UNIQUE 키에 NULL 허용 컬럼: %s (근거를 unique_nullable_ok 에 적는다)" % key)
            self.used["unique_nullable_ok"].add(key)

    def fk_unique_indexes(self):
        """PK 가 아닌 컬럼을 가리키는 FK 의 대상 고유 인덱스 -> UNIQUE 제약으로 바꿀 목록."""
        need = []
        for t, d in self.tables.items():
            for k in d["cons"]:
                if k["kind"] != "FK":
                    continue
                pd = self.tables[k["ref_table"]]
                pk = next((x["cols"] for x in pd["cons"] if x["kind"] == "PK"), None)
                if pk == k["ref_cols"]:
                    continue
                if any(x["kind"] == "UQ" and x["cols"] == k["ref_cols"] for x in pd["cons"]):
                    continue
                ix = next((i for i in self.indexes if i["table"] == k["ref_table"] and i["unique"]
                           and not i["where"] and i["cols"] == k["ref_cols"]), None)
                if ix is None:
                    raise ValueError("FK %s 의 대상 키(%s)에 PK·UNIQUE 가 없다" % (k["name"], k["ref_cols"]))
                if ix not in need:
                    need.append(ix)
        return sorted(need, key=lambda x: x["name"])

    def check_overrides_used(self):
        for kind in ("clob", "boolean", "nullable", "unique_nullable_ok"):
            unused = set(k for k in self.ov[kind] if not k.startswith("_")) - self.used[kind]
            if unused:
                raise ValueError("보정 패치 %s 에 쓰이지 않은 항목: %s" % (kind, sorted(unused)))

    def emit_decisions(self, out, files, digest):
        w = out.write
        w("# mdm Oracle 기준선 결정표 (자동 생성)\n\n")
        w("`gen_oracle_baseline.py` 가 V1 과 함께 만든다. 직접 고치지 않는다. 원천 %s ~ %s, SHA-256 `%s`.\n\n" % (files[0], files[-1], digest[:16]))
        w("## 규칙\n\n")
        w("| SQLite | Oracle | 비고 |\n|---|---|---|\n")
        w("| `VARCHAR(n)` | `VARCHAR2(n CHAR)` | SQLite 는 길이를 강제하지 않았다. 로컬 DB 실측에서 넘는 값 없음 |\n")
        w("| `TEXT` | `VARCHAR2(4000 BYTE)` | 크기 상한이 없는 JSON·요청 원문만 `CLOB`(보정 패치) |\n")
        w("| `TEXT` 업무 일시(이름 `%s`) | `TIMESTAMP(6)` | KST `yyyy-MM-dd HH:mm:ss`. 열린 끝 기본값은 `TIMESTAMP '9999-12-31 00:00:00'` |\n" % self.ov["datetime_text"]["name_regex"])
        w("| `TIMESTAMP`(감사 `C_AT`·`U_AT`) | `TIMESTAMP(6)` | Instant 매핑은 레인 간 결정 대기 |\n")
        w("| `INTEGER` / `BIGINT` | `NUMBER(10)` / `NUMBER(19)` | FK 자식은 부모 형을 따른다 |\n")
        w("| `INTEGER PRIMARY KEY AUTOINCREMENT` | `NUMBER(19) GENERATED BY DEFAULT ON NULL AS IDENTITY` | 적재 뒤 `START WITH LIMIT VALUE` 로 다시 맞춘다 |\n")
        w("| BOOLEAN(`INTEGER` 0/1) | `NUMBER(1)` | 보정 패치 |\n")
        w("| `NUMERIC(p,s)` | `NUMBER(p,s)` | |\n")
        w("| `CHECK (json_valid(X))` | `CHECK (X %s)` | NULL 은 통과 |\n" % self.ov["json_check"])
        w("| 부분 UNIQUE 인덱스 | 함수 기반 UNIQUE 인덱스 `CASE WHEN 조건 THEN 컬럼 END` | |\n")
        w("| FK 가 가리키는 고유 인덱스 | 같은 이름의 `UNIQUE` 제약 | ORA-02270 대비 |\n")
        w("| (없음) | FK 자식 컬럼 인덱스 `IX_<FK 이름에서 FK_ 를 뺀 것>` | 부모 삭제 때 표 잠금 방지. PK·UNIQUE·기존 인덱스 앞 컬럼이 덮는 FK 는 뺀다 |\n\n")
        w("## FK 자식 인덱스 (%d개)\n\n| 인덱스 | 표 | 컬럼 | FK |\n|---|---|---|---|\n" % len(self.fk_ix))
        for fx in self.fk_ix:
            w("| %s | %s | %s | %s |\n" % (fx["name"], fx["table"], ", ".join(fx["cols"]), fx["fk"]))
        w("\n")
        w("## 컬럼별\n\n| 표 | 컬럼 | SQLite | Oracle | NULL | 이유 |\n|---|---|---|---|---|---|\n")
        for t, c, st, ot, nl, why in self.decisions:
            w("| %s | %s | %s | %s | %s | %s |\n" % (t, c, st, ot, nl, why.replace("|", "\\|")))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="SQLite 마이그레이션 폴더(기본: sqlite 폴더, 없으면 archive)")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--decisions", default=DEFAULT_DECISIONS)
    ap.add_argument("--overrides", default=DEFAULT_OVERRIDES)
    ap.add_argument("--check", action="store_true", help="파일을 쓰지 않고 커밋본과 같은지만 본다(다르면 종료 코드 1)")
    a = ap.parse_args()
    src = a.src or next((p for p in DEFAULT_SRC_CANDIDATES if os.path.isdir(p)), None)
    if not src:
        sys.exit("SQLite 마이그레이션 폴더를 찾지 못했다. --src 로 준다")
    ov = json.load(open(a.overrides, encoding="utf-8"))
    con, files, digest = load_sqlite(src)
    g = Gen(con, ov)
    g.read()
    g.resolve_types()
    v1, dec = io.StringIO(), io.StringIO()
    g.emit(v1, files, digest)
    g.check_overrides_used()
    g.emit_decisions(dec, files, digest)
    results = [(a.out, v1.getvalue()), (a.decisions, dec.getvalue())]
    if a.check:
        # 윈도우 체크아웃(CRLF)이어도 내용이 같으면 같다고 본다.
        bad = [p for p, text in results
               if not os.path.exists(p) or open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n") != text]
        for p in bad:
            print("다름: %s" % p)
        sys.exit(1 if bad else 0)
    for p, text in results:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("썼다: %s" % os.path.relpath(p))
    print("표 %d · 인덱스 %d · 원천 %d개" % (len(g.tables), len(g.indexes), len(files)))


if __name__ == "__main__":
    main()
