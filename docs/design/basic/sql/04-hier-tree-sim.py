# -*- coding: utf-8 -*-
"""계층 칸(lvl1-lvl5) 표본: 콤보 단계 쿼리, 트리 만들기, 저장 검사.

04 「계층과 다목적 분류」·「판정 참고 구현 > 계층 콤보와 트리」, 05 「구조 > 계층」의 규칙을
SQLite 메모리 DB에서 실행해 확인한다(결정 2026-09-08).

모델
- 행은 최종 코드(고를 수 있는 것)만 둔다. 그룹(중간 노드)은 행이 아니라 lvl 칸의 값이다.
- 깊이는 행마다 다르다. 그룹 값은 마루 코드 안에서 유일하다(KS → KS-3 → KS-3-CGCH).
- 코드이자 그룹인 노드는 그 코드의 행 + 자손 행의 칸 값으로 표현한다. 같은 문자열은 같은 노드다.
- 표시 순서는 앱이 정한다. 노드 안에서 코드 먼저(seq 순), 그다음 그룹(값 순).
- 저장 검사 둘: (1) 중간 칸이 비면 거부 (2) 같은 값의 앞 칸이 다른 행이 있으면 거부.

실행: python3 sql/04-hier-tree-sim.py
"""
import sqlite3

LV = ["lvl1", "lvl2", "lvl3", "lvl4", "lvl5"]

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE MD_CODE_ITEM (
  maru_code_id TEXT, code TEXT, name TEXT, seq INT,
  lvl1 TEXT, lvl2 TEXT, lvl3 TEXT, lvl4 TEXT, lvl5 TEXT,
  PRIMARY KEY (maru_code_id, code));
INSERT INTO MD_CODE_ITEM VALUES
 ('STEEL_STD','KS-9',          '규격 외 KS',  9, 'KS', NULL,    NULL,        NULL, NULL),
 ('STEEL_STD','KS-3-CGCC',     'CGCC',       1, 'KS', 'KS-3',  NULL,        NULL, NULL),
 ('STEEL_STD','KS-3-CGCD',     'CGCD',       2, 'KS', 'KS-3',  NULL,        NULL, NULL),
 ('STEEL_STD','KS-3-CGCH',     'CGCH(기본)', 3, 'KS', 'KS-3',  NULL,        NULL, NULL),
 ('STEEL_STD','KS-3-CGCH-Z12', 'CGCH Z12',   1, 'KS', 'KS-3',  'KS-3-CGCH', NULL, NULL),
 ('STEEL_STD','KS-3-CGCH-Z27', 'CGCH Z27',   2, 'KS', 'KS-3',  'KS-3-CGCH', NULL, NULL),
 ('STEEL_STD','JIS-3-CGCC',    'CGCC(JIS)',  1, 'JIS','JIS-3', NULL,        NULL, NULL),
 ('STEEL_STD','JIS-4-SPCC',    'SPCC',       1, 'JIS','JIS-4', NULL,        NULL, NULL);

CREATE TABLE MD_DATA_ITEM (
  maru_data_id TEXT, code TEXT, name TEXT, seq INT, closed_at TEXT,
  lvl1 TEXT, lvl2 TEXT, lvl3 TEXT, lvl4 TEXT, lvl5 TEXT,
  PRIMARY KEY (maru_data_id, code));
INSERT INTO MD_DATA_ITEM VALUES
 ('ORG','HQ-PLN',   '기획팀',        1, NULL, 'HQ', NULL,   NULL, NULL, NULL),
 ('ORG','PH-B',     'B공장',         1, NULL, 'PH', NULL,   NULL, NULL, NULL),
 ('ORG','PH-A',     'A공장',         2, NULL, 'PH', NULL,   NULL, NULL, NULL),
 ('ORG','PH-A-PRD', 'A공장 생산팀',  1, NULL, 'PH', 'PH-A', NULL, NULL, NULL),
 ('ORG','PH-A-MNT', 'A공장 정비팀',  2, NULL, 'PH', 'PH-A', NULL, NULL, NULL);
""")


class Spec:
    """표 이름과 칸 이름. 04는 MD_CODE_ITEM, 05는 MD_DATA_ITEM. 키 칸 code와 순서 칸 seq는 두 표가 같다(결정 2026-09-09)."""
    def __init__(self, table, idcol, keycol, seqcol, extra_where=""):
        self.table, self.idcol, self.keycol, self.seqcol, self.extra = table, idcol, keycol, seqcol, extra_where
        # 04는 여기에 버전 V의 유효 행 조건이, 05는 closed_at IS NULL 조건이 붙는다.

CODE = Spec("MD_CODE_ITEM", "maru_code_id", "code", "seq")
DATA = Spec("MD_DATA_ITEM", "maru_data_id", "code", "seq", "AND closed_at IS NULL")


def combo(sp, mid, last=None, depth=0):
    """다음 단계 콤보 항목. last = 마지막에 고른 그룹 값(없으면 1단계), depth = 고른 값의 칸 번호(1부터)."""
    col = LV[depth]                                   # 다음 칸
    cond = f"{LV[depth-1]} = ?" if last else "1=1"     # 그룹 값이 유일하므로 마지막 값 하나가 조건이다
    params = [mid, last] if last else [mid]
    sql = f"""
      SELECT value, MAX(is_group) AS is_group, MAX(is_code) AS is_code, MAX(name) AS name
        FROM (
          SELECT {col} AS value, 1 AS is_group, 0 AS is_code, NULL AS name
            FROM {sp.table} WHERE {sp.idcol} = ? {sp.extra} AND {cond} AND {col} IS NOT NULL
          UNION ALL
          SELECT {sp.keycol}, 0, 1, name
            FROM {sp.table} WHERE {sp.idcol} = ? {sp.extra} AND {cond} AND {col} IS NULL
        ) v GROUP BY value ORDER BY is_code DESC, value"""
    rows = db.execute(sql, params + params).fetchall()
    return [(v, ("그룹+" if g else "") + ("코드" if c else "그룹") if not (g and not c) else "그룹", n) for v, g, c, n in rows]


def tree(sp, mid):
    """쿼리 한 번으로 읽어 트리를 만든다. 정렬은 앱이 한다."""
    seq = f"{sp.seqcol}," if sp.seqcol else ""
    rows = db.execute(f"""
      SELECT lvl1, lvl2, lvl3, lvl4, lvl5, {sp.keycol}, name, {sp.seqcol or 'NULL'}
        FROM {sp.table} WHERE {sp.idcol} = ? {sp.extra}
       ORDER BY {seq} {sp.keycol}""", (mid,)).fetchall()
    nodes, roots = {}, []

    def node(v, parent):
        if v not in nodes:
            nodes[v] = {"parent": parent, "kids": [], "self": None, "seq": None}
            (nodes[parent]["kids"] if parent else roots).append(v)
        return nodes[v]

    for *lv, key, name, sq in rows:
        parent = None
        for v in lv:
            if v is None:
                break
            node(v, parent)
            parent = v
        n = node(key, parent)                 # 코드도 노드. 그룹과 같은 값이면 같은 노드가 된다
        n["self"], n["seq"] = name, sq

    def order(kids):                          # 코드 먼저(seq, 값 순), 그다음 그룹(값 순)
        codes = sorted([k for k in kids if nodes[k]["self"]], key=lambda k: (nodes[k]["seq"] or 0, k))
        groups = sorted([k for k in kids if not nodes[k]["self"]])
        return codes + groups

    lines = []

    def show(v, ind=""):
        n = nodes[v]
        mark = ("▸" if n["kids"] else " ") + ("·" if n["self"] else " ")
        lines.append(f"{ind}{mark} {v}" + (f"  ({n['self']})" if n["self"] else ""))
        for k in order(n["kids"]):
            show(k, ind + "   ")

    for r in order(roots):
        show(r)
    return lines


def check(sp, mid, new):
    """저장 검사 둘. new = (키, lvl1..lvl5). 닫힌 행도 비교 대상에 넣는다(05)."""
    key, lv = new[0], list(new[1:])
    seen_null = False
    for v in lv:
        if v is None:
            seen_null = True
        elif seen_null:
            return "거부: 중간 칸이 비었다"
    path = [v for v in lv if v is not None]
    cols = [*LV, sp.keycol]                                 # 값이 나타날 수 있는 칸 여섯 개
    # 같은 문자열(그룹 값이든 키든)이 어느 칸에든 이미 있으면, 그 행에서 그 칸 앞의 lvl 값들이 내 앞 칸과 같아야 한다
    for n, v in enumerate([*path, key]):
        mine = tuple(path[:n])
        for m, col in enumerate(cols):
            before = ", ".join(LV[:m]) or "NULL"
            hit = db.execute(f"SELECT {before} FROM {sp.table} WHERE {sp.idcol} = ? AND {col} = ? LIMIT 1", (mid, v)).fetchone()
            if hit is None:
                continue
            found = tuple(x for x in (hit if m else ()) if x is not None)
            if found != mine:
                return f"거부: {v}는 이미 {' > '.join(found) or '(뿌리)'} 아래에 있다"
    return "통과"


if __name__ == "__main__":
    print("== STEEL_STD 콤보 (코드 먼저, 그다음 그룹)")
    steps = [(None, 0), ("KS", 1), ("KS-3", 2), ("KS-3-CGCH", 3), ("JIS", 1)]
    got = {}
    for last, d in steps:
        got[last] = combo(CODE, "STEEL_STD", last, d)
        print(f"  고른 값 {last or '(없음)':10s} → " + ", ".join(f"{v}({k}{', ' + n if n else ''})" for v, k, n in got[last]))
    assert [v for v, _, _ in got[None]] == ["JIS", "KS"]
    assert [(v, k) for v, k, _ in got["KS"]] == [("KS-9", "코드"), ("KS-3", "그룹")]
    assert [(v, k) for v, k, _ in got["KS-3"]] == [("KS-3-CGCC", "코드"), ("KS-3-CGCD", "코드"), ("KS-3-CGCH", "그룹+코드")]
    assert [v for v, _, _ in got["KS-3-CGCH"]] == ["KS-3-CGCH-Z12", "KS-3-CGCH-Z27"]

    print("\n== STEEL_STD 트리")
    t = tree(CODE, "STEEL_STD")
    print("\n".join("  " + l for l in t))
    assert t[0].strip().startswith("▸  JIS") and any("▸· KS-3-CGCH" in l for l in t)

    print("\n== ORG 콤보·트리 (05, closed_at IS NULL 행만. 항목은 seq 순)")
    for last, d in [(None, 0), ("PH", 1), ("PH-A", 2)]:
        print(f"  고른 값 {last or '(없음)':6s} → " + ", ".join(f"{v}({k})" for v, k, _ in combo(DATA, "ORG", last, d)))
    print("\n".join("  " + l for l in tree(DATA, "ORG")))

    print("\n== 저장 검사")
    cases = [
        ("X-1", "KS", None, "KS-3-CGCH", None, None),   # 중간 칸 NULL
        ("X-2", "JIS", "KS-3", None, None, None),        # KS-3은 KS 아래에 있다
        ("KS-3-CGCH-Z50", "KS", "KS-3", "KS-3-CGCH", None, None),
        ("KS-3", "JIS", None, None, None, None),         # 그룹 값 KS-3을 JIS 아래 코드로 쓰려 함
    ]
    for c in cases:
        r = check(CODE, "STEEL_STD", c)
        print(f"  {str(c[1:4]):40s} {c[0]:16s} → {r}")
    assert check(CODE, "STEEL_STD", cases[0]).startswith("거부") and check(CODE, "STEEL_STD", cases[1]).startswith("거부")
    assert check(CODE, "STEEL_STD", cases[2]) == "통과" and check(CODE, "STEEL_STD", cases[3]).startswith("거부")
    print("\n모든 확인 통과")
