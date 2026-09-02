#!/usr/bin/env python3
"""migration_tool.py 자체 검증.

임시 픽스처에 방언 비대칭(한쪽에만 있는 번호)을 심어 채번이 실제로 충돌을
피하는지 확인한다. 실 저장소는 건드리지 않는다.

사용: python3 selftest.py
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE / "migration_tool.py"
REL = "src/backend/aps-core/src/main/resources/db/migration"


def build_fixture(root: Path, mssql_versions, sqlite_versions):
    for d, versions in (("mssql", mssql_versions), ("sqlite", sqlite_versions)):
        p = root / REL / d
        p.mkdir(parents=True, exist_ok=True)
        for v in versions:
            (p / f"V{v}__fixture_{v}.sql").write_text("-- fixture\n", encoding="utf-8")
    (root / ".git").mkdir(exist_ok=True)


def run(root: Path, *args):
    r = subprocess.run(
        [sys.executable, str(TOOL), *args, "--root", str(root)],
        capture_output=True,
        text=True,
    )
    return r.stdout + r.stderr, r.returncode


def main():
    failures = []

    # --- 1) 채번: 방언별 max 가 다를 때 합집합 기준이어야 한다 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        # 실 저장소와 같은 모양: mssql 이 90 까지, sqlite 는 88 까지
        build_fixture(root, [1, 22, 88, 89, 90], [1, 22, 61, 88])
        out, code = run(root, "status")
        if "다음 안전 번호: V91" not in out:
            failures.append(f"채번 오류: V91 이 아님\n{out}")
        else:
            print("[OK] 채번  합집합 max+1 = V91 (sqlite max+1=89 함정 회피)")
        if "충돌한다" not in out:
            failures.append("방언별 채번 충돌 경고가 없다")
        else:
            print("[OK] 경고  방언별 채번 시 충돌 경고 노출")

    # --- 2) scaffold both: 같은 번호로 양쪽 생성 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, [1, 22, 88, 89, 90], [1, 22, 61, 88])
        out, code = run(root, "scaffold", "--slug", "add_foo_column")
        m = root / REL / "mssql" / "V91__add_foo_column.sql"
        s = root / REL / "sqlite" / "V91__add_foo_column.sql"
        if not (m.exists() and s.exists()):
            failures.append(f"scaffold both 가 양쪽을 만들지 않았다\n{out}")
        else:
            print("[OK] 쌍생성  V91 이 mssql·sqlite 양쪽에 생성")
        if m.exists() and "대응: sqlite/V91" not in m.read_text(encoding="utf-8"):
            failures.append("쌍 헤더에 반대쪽 참조가 없다")
        else:
            print("[OK] 헤더    쌍 파일 헤더에 반대쪽 대응 명시")

    # --- 3) scaffold 단일 방언: 결번 3 곳 등재 안내가 떠야 한다 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, [1, 22, 88, 89, 90], [1, 22, 61, 88])
        out, code = run(root, "scaffold", "--slug", "mssql_only_fix", "--dialect", "mssql")
        if (root / REL / "sqlite" / "V91__mssql_only_fix.sql").exists():
            failures.append("단일 방언인데 반대쪽에도 파일을 만들었다")
        elif not (root / REL / "mssql" / "V91__mssql_only_fix.sql").exists():
            failures.append(f"단일 방언 파일이 생성되지 않았다\n{out}")
        else:
            print("[OK] 단일    지정 방언에만 생성")
        for token in ("결번 대장", "KNOWN_GAP_LEDGER", "no-op"):
            if token not in out:
                failures.append(f"단일 방언 안내에 {token!r} 누락")
        if all(t in out for t in ("결번 대장", "KNOWN_GAP_LEDGER", "no-op")):
            print("[OK] 안내    결번 3 곳 등재 + no-op 금지 안내 노출")

    # --- 4) 기존 번호 덮어쓰기 거부 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, [1, 91], [1, 91])
        out, code = run(root, "scaffold", "--slug", "collide")
        # V91 이 이미 있으므로 다음 안전 번호는 V92 여야 하고 충돌하지 않는다
        if not (root / REL / "mssql" / "V92__collide.sql").exists():
            failures.append(f"기존 V91 을 피해 V92 로 가지 않았다\n{out}")
        else:
            print("[OK] 회피    기존 번호를 건너뛰고 V92 채번")

    # --- 5) 잘못된 slug 거부 ---
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        build_fixture(root, [1], [1])
        out, code = run(root, "scaffold", "--slug", "Bad-Slug")
        if code == 0:
            failures.append("잘못된 slug 를 받아들였다")
        else:
            print("[OK] 검증    잘못된 slug 거부")

    print()
    if failures:
        print(f"자체검증 실패 {len(failures)} 건:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("자체검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
